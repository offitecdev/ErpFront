import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { buildQrBillPayload, formatIban, formatReference } from './swissQrBill';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';

// Arial yerine metrik olarak özdeş, Türkçe karakter destekli Arimo gömülür.
import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import arialItalicUrl from '../../assets/fonts/ARIALI.ttf?url';
import defaultLetterheadUrl from '../../assets/docs/sablon.pdf?url';

export interface TenderPdfData {
    tenderNumber: string;
    version: number;
    createdAt: string;
    validUntil?: string | null;
    customerName: string;
    customerAddress?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerTaxNumber?: string | null;
    createdByName?: string | null;
    /** Kommission / Komisyon referansı (varsa kapak kutusunda gösterilir) */
    commission?: string | null;
    activities?: Array<{ activityType: string; description?: string | null; activityDate: string; employeeName?: string | null }>;
    positions: Array<{
        rowKey?: string;
        shortDescription: string;
        longDescription?: string | null;
        rowType?: string;
        quantity?: number;
        unit?: string | null;
        npkCode?: string | null;
        imageUrl?: string | null;
        unitPrice?: number;
        discount?: number;
        taxRate?: number;
        lineTotal?: number;
        total?: number;
        isParent?: boolean;
        isTopLevel?: boolean;
        hierarchyLevel?: number;
        isSectionSubtotal?: boolean;
        isGroupEnd?: boolean;
        articles?: Array<{ name: string; imageUrl?: string | null; qty: number; price: number }>;
    }>;
    grandTotal: number;
    referenceNumber?: string;
    qrBillEnabled?: boolean;
    /** PDF dili (indirmeden önce seçilir). Varsayılan: Almanca. */
    lang?: PdfLang;
}

// ── PDF dilleri (Türkçe / Almanca / İngilizce) ───────────────────────────────
export type PdfLang = 'tr' | 'de' | 'en';

interface PdfStrings {
    offerNumber: string;
    kommission: string;
    offerDate: string;
    validUntil: string;
    seller: string;
    offerTitle: string;
    greeting: string;
    intro: string;
    colPos: string;
    colDesc: string;
    colQty: string;
    colUnitPrice: string;
    colDiscount: string;
    colTax: string;
    colPrice: string;
    subtotal: string;
    net: string;
    vat: string;
    grandTotal: string;
    paymentTerms: string;
    // Swiss QR-Bill etiketleri (yasal olarak DE/FR/IT/EN; TR seçiminde EN kullanılır)
    qrReceipt: string;
    qrPaymentPart: string;
    qrAccountPayableTo: string;
    qrCurrency: string;
    qrAmount: string;
    qrReference: string;
}

const I18N: Record<PdfLang, PdfStrings> = {
    tr: {
        offerNumber: 'Teklif Numarası :',
        kommission: 'Komisyon:',
        offerDate: 'Teklif Tarihi:',
        validUntil: 'Teklif Bitiş Tarihi:',
        seller: 'Satıcı:',
        offerTitle: 'Teklif',
        greeting: 'Sayın Yetkili,',
        intro: 'Talebiniz için teşekkür ederiz. Aşağıda teklifimizi memnuniyetle sunarız. Pozisyonların ayrıntılı dökümünü ilerleyen sayfalarda bulabilirsiniz.',
        colPos: 'Pos',
        colDesc: 'Açıklama',
        colQty: 'Miktar',
        colUnitPrice: 'B. Fiyat',
        colDiscount: 'İndirim',
        colTax: 'Vergi',
        colPrice: 'Fiyat',
        subtotal: 'Ara Toplam',
        net: 'Net Tutar',
        vat: 'KDV',
        grandTotal: 'TOPLAM',
        paymentTerms: 'Ödeme Koşulları',
        // Swiss QR-Bill Türkçeyi desteklemediği için İngilizce etiketler kullanılır
        qrReceipt: 'Receipt',
        qrPaymentPart: 'Payment part',
        qrAccountPayableTo: 'Account / Payable to',
        qrCurrency: 'Currency',
        qrAmount: 'Amount',
        qrReference: 'Reference',
    },
    de: {
        offerNumber: 'Offert-Nr. :',
        kommission: 'Kommission:',
        offerDate: 'Offertdatum:',
        validUntil: 'Gültig bis:',
        seller: 'Verkäufer:',
        offerTitle: 'Offerte',
        greeting: 'Sehr geehrte Damen und Herren',
        intro: 'Vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen nachfolgend unser Angebot. Eine detaillierte Aufstellung der Positionen finden Sie auf den folgenden Seiten.',
        colPos: 'Pos',
        colDesc: 'Beschreibung',
        colQty: 'Menge',
        colUnitPrice: 'E. Preis',
        colDiscount: 'Rabatt',
        colTax: 'MwSt.',
        colPrice: 'Preis',
        subtotal: 'Zwischensumme',
        net: 'Nettobetrag',
        vat: 'MwSt.',
        grandTotal: 'GESAMT',
        paymentTerms: 'Zahlungsbedingungen',
        qrReceipt: 'Empfangsschein',
        qrPaymentPart: 'Zahlteil',
        qrAccountPayableTo: 'Konto / Zahlbar an',
        qrCurrency: 'Währung',
        qrAmount: 'Betrag',
        qrReference: 'Referenz',
    },
    en: {
        offerNumber: 'Offer No. :',
        kommission: 'Commission:',
        offerDate: 'Offer Date:',
        validUntil: 'Valid Until:',
        seller: 'Salesperson:',
        offerTitle: 'Offer',
        greeting: 'Dear Sir or Madam,',
        intro: 'Thank you for your enquiry. We are pleased to submit our offer below. A detailed breakdown of the positions can be found on the following pages.',
        colPos: 'Pos',
        colDesc: 'Description',
        colQty: 'Quantity',
        colUnitPrice: 'U. Price',
        colDiscount: 'Discount',
        colTax: 'VAT',
        colPrice: 'Price',
        subtotal: 'Subtotal',
        net: 'Net Amount',
        vat: 'VAT',
        grandTotal: 'TOTAL',
        paymentTerms: 'Payment Terms',
        qrReceipt: 'Receipt',
        qrPaymentPart: 'Payment part',
        qrAccountPayableTo: 'Account / Payable to',
        qrCurrency: 'Currency',
        qrAmount: 'Amount',
        qrReference: 'Reference',
    },
};

// ── Page geometry (A4 in mm) ─────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;

const HEADER_RESERVED_TOP_FIRST = 48;
const HEADER_RESERVED_TOP_REST = 40;
const FOOTER_RESERVED_BOTTOM = 24;

// ── Tablo geometrisi (sablon.pdf'e oturan İsviçre/Türkçe ızgara) ──────────────
// Sütun sınır çizgilerinin X konumları (mm)
const T_X0 = 20;       // Pos sol kenarı
const T_POS = 34;      // Pos | Açıklama sınırı
const T_DESC = 106;    // Açıklama | Miktar sınırı
const T_MENGE = 124;   // Miktar | Birim Fiyat sınırı
const T_PREIS = 140;   // Birim Fiyat | İndirim sınırı
const T_RABATT = 152;  // İndirim | Vergi sınırı
const T_STEUER = 163;  // Vergi | Fiyat sınırı
const T_X1 = 195;      // Fiyat sağ kenarı
const T_COLS = [T_X0, T_POS, T_DESC, T_MENGE, T_PREIS, T_RABATT, T_STEUER, T_X1] as const;

const CELL_PAD = 2;            // Hücre içi sağ/sol boşluk
const HEAD_H = 8.5;            // Tablo başlık satırı yüksekliği
const ROW_PADDING = 2.4;
const ROW_MIN_HEIGHT = 9;
const TEXT_LINE_HEIGHT = 4.6;

// ── Yazı tipi boyutları (puan) ───────────────────────────────────────────────
// Pozisyon numaraları ve bağlantılar 11 pt; ürün başlıkları kalın 10 pt;
// tablodaki diğer her şey (başlıklar, sayısal hücreler, açıklamalar) 10 pt.
const FS_BASE = 9;      // Tüm hücreler ve gövde metni
const FS_TITLE = 10;    // Ürün başlıkları (kalın)
const FS_POS = 11;      // Pozisyon numaraları ve bağlantılar
const FS_LONG_DESC = 9;
const FS_HEADER = 9;    // Tablo başlık satırı
const LH_TITLE = 4.7;   // Başlık satır yüksekliği (10 pt)
const LH_BODY = 4.4;    // Gövde/açıklama satır yüksekliği (10 pt)
const UNIT_GAP = 4.2;   // Miktar değeri ile birim etiketi arası dikey boşluk
const IMG_SIZE = 20;
const TITLE_IMAGE_GAP = 1.2;
const IMAGE_DESCRIPTION_GAP = 4.0;
const TITLE_DESCRIPTION_GAP = 1.8;

// ── Renk paleti (Offitec lacivert + ince gri ızgara) ─────────────────────────
const COLOR_TEXT = [25, 25, 25] as const;
const COLOR_MUTED = [110, 110, 110] as const;
const COLOR_GRID = [205, 205, 205] as const;   // İnce tablo ızgarası
const COLOR_NAVY = [27, 42, 85] as const;      // Başlık şeritleri (lacivert)
const COLOR_WHITE = [255, 255, 255] as const;
const COLOR_ALT_ROW = [245, 245, 247] as const;

// ── Fontlar (Türkçe karakter desteği için OpenSans gömülür) ──────────────────
const FONT = 'Arial';
let fontFiles: { regular: string; bold: string; italic: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
};

async function registerFonts(doc: jsPDF) {
    if (!fontFiles) {
        const [regular, bold, italic] = await Promise.all([
            fetch(arialRegularUrl).then((r) => r.arrayBuffer()),
            fetch(arialBoldUrl).then((r) => r.arrayBuffer()),
            fetch(arialItalicUrl).then((r) => r.arrayBuffer()),
        ]);
        fontFiles = {
            regular: bufferToBase64(regular),
            bold: bufferToBase64(bold),
            italic: bufferToBase64(italic),
        };
    }
    doc.addFileToVFS('Arial-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('Arial-Bold.ttf', fontFiles.bold);
    doc.addFileToVFS('Arial-Italic.ttf', fontFiles.italic);
    doc.addFont('Arial-Regular.ttf', FONT, 'normal');
    doc.addFont('Arial-Bold.ttf', FONT, 'bold');
    doc.addFont('Arial-Italic.ttf', FONT, 'italic');
    doc.setFont(FONT, 'normal');
}

// ── Sayı / tarih biçimleyiciler (icerik.pdf ile birebir) ─────────────────────
// Para: "CHF 11.034,07"  (binlik nokta, ondalık virgül)
const fmtMoneyForCurrency = (currency: string) => (v: number) =>
    `${currency} ${new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(v || 0)}`;

// Birim fiyat: "1.000,714"
const fmtUnitPrice = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v || 0);

// Miktar: "12,00"
const fmtQty = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

// İndirim: "155%"
const fmtDiscount = (v: number) =>
    `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(v)}%`;

// Vergi: "8.1%"
const fmtVatRate = (v: number) =>
    `${new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;

// Tarih: "26-06-15"  (YY-MM-DD)
const fmtDateShort = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

export async function buildTenderPdfBytes(
    data: TenderPdfData,
    settings: PdfCompanySettings
): Promise<Uint8Array> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const fmt = fmtMoneyForCurrency(settings.currency);
    const L = I18N[data.lang ?? 'de'];

    // ── SAYFA 1: Kapak & Giriş ───────────────────────────────────────────────
    drawCoverPage(doc, data, settings, L);

    // ── SAYFA 2+: Ürünler & Tablo ───────────────────────────────────────────
    doc.addPage();
    let y = HEADER_RESERVED_TOP_REST;
    y = drawTableHeader(doc, y, L);

    let rowIndex = 0;
    for (const pos of data.positions) {
        const rowHeight = measureRow(doc, pos);
        if (y + rowHeight > PAGE_H - FOOTER_RESERVED_BOTTOM) {
            doc.addPage();
            y = HEADER_RESERVED_TOP_REST;
            y = drawTableHeader(doc, y, L);
            rowIndex = 0;
        }
        y = drawRow(doc, pos, y, fmt, L, rowIndex);
        rowIndex++;
    }

    // ── Toplamlar ───────────────────────────────────────────────────────────
    const totalsBlockHeight = 45;
    if (y + totalsBlockHeight > PAGE_H - FOOTER_RESERVED_BOTTOM) {
        doc.addPage();
        y = HEADER_RESERVED_TOP_REST + 5;
    } else {
        y += 8;
    }
    drawTotals(doc, y, data, settings, fmt, L);

    // ── QR Fatura (Swiss QR-Bill) ───────────────────────────────────────────
    if (data.qrBillEnabled === true) {
        await appendQrBillPage(doc, data, settings, L);
    }

    const contentBytes = new Uint8Array(doc.output('arraybuffer'));
    let finalBytes: Uint8Array;

    try {
        const bgBytes = await resolveBackgroundBytes(settings);
        if (bgBytes) {
            finalBytes = await applyPdfBackground(contentBytes, bgBytes);
        } else {
            finalBytes = contentBytes;
        }
    } catch (err) {
        console.error('PDF background merge failed:', err);
        finalBytes = contentBytes;
    }

    return finalBytes;
}

export async function exportTenderPdf(
    data: TenderPdfData,
    settings: PdfCompanySettings
): Promise<void> {
    const finalBytes = await buildTenderPdfBytes(data, settings);
    downloadPdf(finalBytes, `${data.tenderNumber}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 1 — Kapak / Giriş (sol bilgi kutusu + sağ gönderici/alıcı)
// ─────────────────────────────────────────────────────────────────────────────

function drawCoverPage(doc: jsPDF, data: TenderPdfData, s: PdfCompanySettings, L: PdfStrings) {
    // ── Sol bilgi kutusu (lacivert başlık + bilgi satırları) ─────────────────
    const boxX = 20;
    const boxW = 88;
    const boxRight = boxX + boxW;
    const boxY = HEADER_RESERVED_TOP_FIRST - 2;
    const barH = 8;
    const lineH = 7.5;

    // Başlık şeridi: "Teklif Numarası : <no>"
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(boxX, boxY, boxW, barH, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_WHITE);
    doc.text(L.offerNumber, boxX + CELL_PAD + 1, boxY + 5.4);
    doc.text(data.tenderNumber, boxRight - CELL_PAD - 1, boxY + 5.4, { align: 'right' });

    const infoRows: [string, string][] = [
        [L.kommission, data.commission || ''],
        [L.offerDate, fmtDateShort(data.createdAt)],
        [L.validUntil, fmtDateShort(data.validUntil)],
        [L.seller, data.createdByName || ''],
    ];

    let ry = boxY + barH;
    doc.setFontSize(9);
    for (const [label, value] of infoRows) {
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...COLOR_TEXT);
        doc.text(label, boxX + CELL_PAD + 1, ry + 5);
        doc.setFont(FONT, 'normal');
        doc.text(value, boxRight - CELL_PAD - 1, ry + 5, { align: 'right' });
        ry += lineH;
        doc.setDrawColor(...COLOR_GRID);
        doc.setLineWidth(0.1);
        if (ry < boxY + barH + infoRows.length * lineH - 0.01) {
            doc.line(boxX, ry, boxRight, ry);
        }
    }

    // Kutu dış çerçevesi
    const boxBottom = boxY + barH + infoRows.length * lineH;
    doc.setDrawColor(...COLOR_NAVY);
    doc.setLineWidth(0.3);
    doc.rect(boxX, boxY, boxW, boxBottom - boxY);

    // ── Sağ kolon: gönderici (kalın lacivert) + alıcı ────────────────────────
    const rX = 118;
    const rW = T_X1 - rX;
    let rYy = boxY + 2;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_NAVY);
    const sender = `${s.companyName} - ${s.addressLine1} ${s.addressLine2}, ${s.postalCode} ${s.city}`.replace(/\s+/g, ' ').trim();
    const senderLines = doc.splitTextToSize(sender, rW);
    doc.text(senderLines, rX, rYy + 3);
    rYy += senderLines.length * 4.6 + 5;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXT);
    if (data.customerName) {
        doc.text(doc.splitTextToSize(data.customerName, rW), rX, rYy);
        rYy += 4.8;
    }
    if (data.customerAddress) {
        const addr = doc.splitTextToSize(data.customerAddress, rW);
        doc.text(addr, rX, rYy);
        rYy += addr.length * 4.8;
    }
    if (data.customerEmail || data.customerPhone) {
        doc.setFontSize(9);
        doc.setTextColor(...COLOR_MUTED);
        const contact = [data.customerPhone, data.customerEmail].filter(Boolean).join(' Â· ');
        doc.text(contact, rX, rYy + 1);
        doc.setTextColor(...COLOR_TEXT);
    }

    // ── Başlık + giriş metni ─────────────────────────────────────────────────
    let yTitle = Math.max(boxBottom, rYy) + 18;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(`${L.offerTitle} ${data.tenderNumber}`, 22, yTitle);

    yTitle += 11;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.text(L.greeting, 22, yTitle);
    yTitle += 6;

    const intro = L.intro;
    const introLines = doc.splitTextToSize(intro, 168);
    doc.text(introLines, 22, yTitle);

    if (s.footerNote) {
        doc.setFontSize(8.5);
        doc.setTextColor(...COLOR_MUTED);
        const note = doc.splitTextToSize(s.footerNote, 168);
        doc.text(note, 22, PAGE_H - FOOTER_RESERVED_BOTTOM - 6 - note.length * 4);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 2+ — Tablo başlığı, satırlar, ızgara
// ─────────────────────────────────────────────────────────────────────────────

// Başlık hücresi: nominal 10 pt; dar sütunlarda taşmayı önlemek için gerekirse küçültülür.
function headerCell(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    _innerW: number,
    align: 'left' | 'center' | 'right'
) {
    doc.setFontSize(FS_HEADER);
    doc.text(text, x, y, { align });
}

function drawTableHeader(doc: jsPDF, y: number, L: PdfStrings): number {
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(T_X0, y, T_X1 - T_X0, HEAD_H, 'F');

    doc.setFont(FONT, 'bold');
    doc.setTextColor(...COLOR_WHITE);

    const ty = y + HEAD_H / 2 + 1.4;
    headerCell(doc, L.colPos,       T_X0 + CELL_PAD,      ty, T_POS - T_X0 - CELL_PAD,      'left');
    headerCell(doc, L.colDesc,      T_POS + CELL_PAD,     ty, T_DESC - T_POS - CELL_PAD,    'left');
    headerCell(doc, L.colQty,       T_MENGE - CELL_PAD,   ty, T_MENGE - T_DESC - CELL_PAD,  'right');
    headerCell(doc, L.colUnitPrice, T_PREIS - CELL_PAD,   ty, T_PREIS - T_MENGE - CELL_PAD, 'right');
    headerCell(doc, L.colDiscount,  T_RABATT - CELL_PAD,  ty, T_RABATT - T_PREIS - CELL_PAD,'right');
    headerCell(doc, L.colTax,       T_STEUER - CELL_PAD,  ty, T_STEUER - T_RABATT - CELL_PAD,'right');
    headerCell(doc, L.colPrice,     T_X1 - CELL_PAD,      ty, T_X1 - T_STEUER - CELL_PAD,  'right');

    return y + HEAD_H;
}

function drawGrid(doc: jsPDF, top: number, bottom: number) {
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.1);
    for (const cx of T_COLS) doc.line(cx, top, cx, bottom);
    doc.line(T_X0, bottom, T_X1, bottom);
}

/** "1.1 TCL 5484 Klima" → { pos: "1.1", text: "TCL 5484 Klima" } */
function splitPosLabel(short: string): { pos: string; text: string } {
    const m = (short || '').match(/^(\d+(?:\.\d+)*)\s+([\s\S]*)$/);
    if (m) return { pos: m[1], text: m[2] };
    return { pos: '', text: short || '' };
}

function rowVisualMeta(pos: TenderPdfData['positions'][number]) {
    const rowType = (pos.rowType || 'SECTION').toUpperCase();
    const rawLevel = pos.hierarchyLevel ?? (pos.isTopLevel ? 1 : 2);
    const level = Math.max(0, rawLevel - 1);
    const indent = Math.min(level * 4, 16);

    if (rowType === 'TITLE' || (pos.isParent && rowType !== 'DESCRIPTION')) {
        return {
            rowType,
            indent,
            titleFontSize: FS_TITLE,
            titleLineHeight: LH_TITLE,
            titleStyle: 'bold' as const,
            longFontSize: FS_LONG_DESC,
        };
    }

    if (rowType === 'DESCRIPTION') {
        return {
            rowType,
            indent,
            titleFontSize: FS_BASE,
            titleLineHeight: LH_BODY,
            titleStyle: 'normal' as const,
            longFontSize: FS_LONG_DESC,
        };
    }

    return {
        rowType,
        indent,
        titleFontSize: FS_TITLE,
        titleLineHeight: TEXT_LINE_HEIGHT,
        titleStyle: 'bold' as const,
        longFontSize: FS_BASE,
    };
}

function measureRow(doc: jsPDF, pos: TenderPdfData['positions'][number]): number {
    if (pos.isSectionSubtotal) return 8;

    const meta = rowVisualMeta(pos);
    const descX = T_POS + CELL_PAD + meta.indent;
    const descW = T_DESC - CELL_PAD - descX;

    const { text: titleText } = splitPosLabel(pos.shortDescription || '');
    doc.setFont(FONT, meta.titleStyle);
    doc.setFontSize(meta.titleFontSize);
    const shortLines = doc.splitTextToSize(normalizePdfText(titleText), descW);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(meta.longFontSize);
    const plainLong = pos.longDescription
        ? normalizePdfText(pos.longDescription)
            .split(/\r?\n/)
            .map(plainMarkdownLine)
            .join('\n')
        : '';
    const longLines = plainLong ? doc.splitTextToSize(plainLong, descW) : [];

    const titleHeight = shortLines.length * meta.titleLineHeight;
    const imageBlockHeight = pos.imageUrl ? TITLE_IMAGE_GAP + IMG_SIZE : 0;
    const descriptionGap = longLines.length > 0 ? (pos.imageUrl ? IMAGE_DESCRIPTION_GAP : TITLE_DESCRIPTION_GAP) : 0;
    const descriptionHeight = longLines.length > 0 ? longLines.length * LH_BODY : 0;
    const contentHeight = titleHeight + imageBlockHeight + descriptionGap + descriptionHeight;

    return Math.max(pos.isParent ? ROW_MIN_HEIGHT : ROW_MIN_HEIGHT, contentHeight) + ROW_PADDING * 2;
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'AUTO' {
    if (dataUrl.startsWith('data:image/png')) return 'PNG';
    if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
    return 'AUTO' as any;
}

function normalizeTrackedLetters(line: string): string {
    return line
        .split(/(\s{2,})/)
        .map((part) => {
            if (/^\s+$/.test(part)) return ' ';
            return /^(?:\p{L}\s){3,}\p{L}$/u.test(part.trim())
                ? part.replace(/\s+/g, '')
                : part;
        })
        .join('')
        .replace(/\s{2,}/g, ' ');
}

function looksLikeCatalogCode(line: string): boolean {
    const text = line.trim();
    if (!text || text.length > 36 || /\s{2,}/.test(text)) return false;
    if (!/[0-9]/.test(text)) return false;
    if (/[a-zäöüéèàç]/.test(text)) return false;
    return /^[A-Z0-9][A-Z0-9._/\\#:-]*$/.test(text);
}

function normalizePdfText(text: string): string {
    return text
        .replace(/ /g, ' ')
        .replace(/[‐‑‒–—−]/g, '-')
        .replace(/­/g, '')
        .split(/\r?\n/)
        .map((line) => normalizeTrackedLetters(line))
        .filter((line) => !looksLikeCatalogCode(line))
        .join('\n')
        .trim();
}

function plainMarkdownLine(line: string): string {
    return line
        .trimStart()
        .replace(/^#{1,2}\s+/, '')
        .replace(/^- /, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/_(.+?)_/g, '$1');
}

function drawMarkdownText(
    doc: jsPDF,
    rawText: string,
    x: number,
    startY: number,
    maxW: number,
    fontSize: number,
    lineHeight: number,
    textColor: readonly [number, number, number]
): number {
    doc.setFontSize(fontSize);
    doc.setTextColor(...textColor);

    let cy = startY;
    for (const rawLine of normalizePdfText(rawText).split(/\r?\n/)) {
        if (!rawLine.trim()) { cy += lineHeight * 0.5; continue; }

        const trimmed = rawLine.trimStart();
        const heading = trimmed.match(/^(#{1,2})\s+(.*)$/);
        const headingLevel = heading ? (heading[1]?.length === 1 ? 1 : 2) : 0;
        const isBullet = trimmed.startsWith('- ');
        const cleaned = heading ? plainMarkdownLine(heading[2] ?? '') : plainMarkdownLine(trimmed);
        const text = `${isBullet ? '• ' : ''}${cleaned}`;

        doc.setFont(FONT, headingLevel > 0 ? 'bold' : 'normal');
        doc.setFontSize(headingLevel === 1 ? fontSize + 1.4 : headingLevel === 2 ? fontSize + 0.8 : fontSize);
        const lines = doc.splitTextToSize(text, maxW - (isBullet ? 2 : 0));
        doc.text(lines, x + (isBullet ? 2 : 0), cy);
        cy += Math.max(1, lines.length) * (headingLevel > 0 ? lineHeight + 0.5 : lineHeight);
    }
    doc.setFont(FONT, 'normal');
    doc.setFontSize(fontSize);
    return cy;
}

function drawRow(
    doc: jsPDF,
    pos: TenderPdfData['positions'][number],
    y: number,
    fmt: (v: number) => string,
    L: PdfStrings,
    rowIndex: number
): number {
    if (pos.isSectionSubtotal) {
        return drawSectionSubtotal(doc, y, pos.total ?? 0, fmt, L, rowIndex);
    }

    const rowH = measureRow(doc, pos);
    if (rowIndex % 2 === 1) {
        doc.setFillColor(...COLOR_ALT_ROW);
        doc.rect(T_X0, y, T_X1 - T_X0, rowH, 'F');
    }
    const rowEnd = y + rowH;
    const textY = y + ROW_PADDING + 2.5;

    const meta = rowVisualMeta(pos);
    const descX = T_POS + CELL_PAD + meta.indent;
    const descW = T_DESC - CELL_PAD - descX;
    const { pos: posLabel, text: titleText } = splitPosLabel(pos.shortDescription || '');

    // Pos sütunu
    if (posLabel) {
        doc.setFont(FONT, pos.isParent ? 'bold' : 'normal');
        doc.setFontSize(FS_POS);
        doc.setTextColor(...COLOR_TEXT);
        doc.text(posLabel, (T_X0 + T_POS) / 2, textY, { align: 'center' });
    }

    // Açıklama: başlık
    doc.setFont(FONT, meta.titleStyle);
    doc.setFontSize(meta.titleFontSize);
    doc.setTextColor(...COLOR_TEXT);
    const shortLines = doc.splitTextToSize(normalizePdfText(titleText), descW);
    doc.text(shortLines, descX, textY);
    let descCursor = textY + shortLines.length * meta.titleLineHeight;

    // Açıklama: görsel
    if (pos.imageUrl) {
        descCursor += TITLE_IMAGE_GAP;
        try {
            const imgFmt = detectImageFormat(pos.imageUrl);
            doc.addImage(pos.imageUrl, imgFmt as any, descX, descCursor, IMG_SIZE, IMG_SIZE);
            descCursor += IMG_SIZE;
        } catch { /* ignore */ }
    }

    // Açıklama: uzun metin (markdown / madde işaretleri)
    if (pos.longDescription) {
        descCursor += pos.imageUrl ? IMAGE_DESCRIPTION_GAP : TITLE_DESCRIPTION_GAP;
        descCursor = drawMarkdownText(doc, pos.longDescription, descX, descCursor, descW, meta.longFontSize, LH_BODY, COLOR_TEXT);
    }

    // ── Sayısal sütunlar (yalnızca kendi tutarı olan satırlar) ───────────────
    const qty = pos.quantity || 0;
    const unit = pos.unit || '';
    const unitPrice = pos.unitPrice ?? 0;
    const discount = pos.discount ?? 0;
    const taxRate = pos.taxRate ?? 0;
    const fallbackLineTotal = qty * unitPrice * (1 - discount / 100) * (1 + (taxRate || 8.1) / 100);
    const hasOwnAmount = (pos.lineTotal ?? 0) > 0 || (qty > 0 && unitPrice > 0);
    const total = pos.lineTotal ?? (!pos.isParent ? (pos.total ?? fallbackLineTotal) : 0);

    if (hasOwnAmount) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_TEXT);

        // Miktar: "12,00" üstte, birim ("Stück") altında
        if (qty > 0) {
            doc.text(fmtQty(qty), T_MENGE - CELL_PAD, textY, { align: 'right' });
            if (unit) doc.text(unit, T_MENGE - CELL_PAD, textY + UNIT_GAP, { align: 'right' });
        } else {
            doc.text('—', T_MENGE - CELL_PAD, textY, { align: 'right' });
        }

        doc.text(unitPrice > 0 ? fmtUnitPrice(unitPrice) : '—', T_PREIS - CELL_PAD, textY, { align: 'right' });
        doc.text(discount > 0 ? fmtDiscount(discount) : '', T_RABATT - CELL_PAD, textY, { align: 'right' });
        doc.text(fmtVatRate(taxRate || 8.1), T_STEUER - CELL_PAD, textY, { align: 'right' });

        if (total > 0) {
            doc.text(fmt(total), T_X1 - CELL_PAD, textY, { align: 'right' });
        }
    }

    drawGrid(doc, y, rowEnd);
    return rowEnd;
}

function drawSectionSubtotal(
    doc: jsPDF,
    y: number,
    total: number,
    fmt: (v: number) => string,
    L: PdfStrings,
    rowIndex: number
): number {
    const rowEnd = y + 8;
    if (rowIndex % 2 === 1) {
        doc.setFillColor(...COLOR_ALT_ROW);
        doc.rect(T_X0, y, T_X1 - T_X0, 8, 'F');
    }
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(L.subtotal, T_PREIS - CELL_PAD, y + 5.2, { align: 'right' });
    doc.text(fmt(total), T_X1 - CELL_PAD, y + 5.2, { align: 'right' });
    doc.setFont(FONT, 'normal');
    drawGrid(doc, y, rowEnd);
    return rowEnd;
}

function drawTotals(
    doc: jsPDF,
    y: number,
    data: TenderPdfData,
    s: PdfCompanySettings,
    fmt: (v: number) => string,
    L: PdfStrings
) {
    const grand = data.grandTotal;
    const net = s.vatRate > 0 ? grand / (1 + s.vatRate / 100) : grand;
    const vat = grand - net;

    const labelX = 120;
    const valueX = T_X1 - CELL_PAD;
    const lineLeft = 118;
    const lineRight = T_X1;

    const totalRow = (label: string, value: string, opts?: { bold?: boolean; size?: number }) => {
        doc.setDrawColor(...COLOR_GRID);
        doc.setLineWidth(0.15);
        doc.line(lineLeft, y, lineRight, y);
        y += 5;
        doc.setFont(FONT, opts?.bold ? 'bold' : 'normal');
        doc.setFontSize(opts?.size ?? FS_BASE);
        doc.setTextColor(...COLOR_TEXT);
        doc.text(label, labelX, y);
        doc.text(value, valueX, y, { align: 'right' });
        y += 2.5;
    };

    totalRow(L.net, fmt(net), { bold: true });
    totalRow(`${L.vat} ${fmtVatRate(s.vatRate)}`, fmt(vat), { bold: true });
    totalRow(L.grandTotal, fmt(grand), { bold: true });

    doc.setDrawColor(...COLOR_NAVY);
    doc.setLineWidth(0.4);
    doc.line(lineLeft, y, lineRight, y);

    y += 12;
    const terms = s.paymentTerms ? `${L.paymentTerms}: ${s.paymentTerms}` : '';
    if (terms) {
        doc.setFont(FONT, 'italic');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_MUTED);
        const lines = doc.splitTextToSize(terms, 165);
        doc.text(lines, 22, y);
        doc.setFont(FONT, 'normal');
    }
}

async function appendQrBillPage(doc: jsPDF, data: TenderPdfData, s: PdfCompanySettings, L: PdfStrings) {
    doc.addPage();

    const yTop = PAGE_H - 105;

    doc.setDrawColor(180, 180, 180);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(0, yTop, PAGE_W, yTop);
    doc.line(62, yTop, 62, PAGE_H);
    doc.setLineDashPattern([], 0);

    const amount = data.grandTotal;
    const payload = buildQrBillPayload({
        iban: s.iban,
        creditorName: s.companyName,
        creditorAddressLine1: s.addressLine1,
        creditorAddressLine2: s.addressLine2,
        creditorPostalCode: s.postalCode,
        creditorCity: s.city,
        creditorCountry: s.country,
        amount,
        currency: s.currency,
        debtorName: data.customerName,
        debtorAddressLine1: data.customerAddress || '',
        debtorAddressLine2: '',
        debtorPostalCode: '',
        debtorCity: '',
        debtorCountry: 'CH',
        referenceType: data.referenceNumber ? 'SCOR' : 'NON',
        reference: data.referenceNumber || '',
        unstructuredMessage: `${L.offerTitle} ${data.tenderNumber}`,
    });

    try {
        const qrDataUrl = await QRCode.toDataURL(payload, {
            errorCorrectionLevel: 'M',
            margin: 0,
            width: 200,
        });
        doc.addImage(qrDataUrl, 'PNG', 67, yTop + 11, 46, 46);
    } catch {
        doc.setDrawColor(0);
        doc.rect(67, yTop + 11, 46, 46);
    }

    doc.setFont(FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(L.qrReceipt, 5, yTop + 7);
    doc.text(L.qrPaymentPart, 67, yTop + 7);

    const writeBlock = (x: number, yy: number) => {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(6);
        doc.text(L.qrAccountPayableTo, x, yy);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(8);
        doc.text(formatIban(s.iban), x, yy + 3);
        doc.text(s.companyName, x, yy + 7);
        doc.text(`${s.addressLine1} ${s.addressLine2}`, x, yy + 10.5);
        doc.text(`${s.postalCode} ${s.city}`, x, yy + 14);
    };
    writeBlock(5, yTop + 12);
    writeBlock(118, yTop + 12);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(6);
    doc.text(L.qrCurrency, 67, yTop + 70);
    doc.text(L.qrAmount, 87, yTop + 70);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    doc.text(s.currency, 67, yTop + 74);
    doc.text(amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 87, yTop + 74);

    if (data.referenceNumber) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(6);
        doc.text(L.qrReference, 118, yTop + 40);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(8);
        doc.text(formatReference(data.referenceNumber), 118, yTop + 43);
    }
}

async function resolveBackgroundBytes(s: PdfCompanySettings): Promise<Uint8Array | null> {
    if (s.letterheadBackgroundPdf) {
        return base64ToBytes(s.letterheadBackgroundPdf);
    }
    if (s.useBundledLetterhead !== false) {
        try {
            const res = await fetch(defaultLetterheadUrl);
            const buf = await res.arrayBuffer();
            return new Uint8Array(buf);
        } catch (e) {
            console.warn('Bundled letterhead not available:', e);
        }
    }
    return null;
}

async function applyPdfBackground(
    contentBytes: Uint8Array,
    bgBytes: Uint8Array
): Promise<Uint8Array> {
    const contentPdf = await PDFDocument.load(contentBytes);
    const bgPdf = await PDFDocument.load(bgBytes);

    const newDoc = await PDFDocument.create();
    const bgPages = await newDoc.embedPdf(bgPdf, bgPdf.getPageIndices());
    const contentPageCount = contentPdf.getPageCount();
    const contentEmbeds = await newDoc.embedPdf(contentPdf, contentPdf.getPageIndices());

    const A4_W = 595.28;
    const A4_H = 841.89;

    for (let i = 0; i < contentPageCount; i++) {
        const page = newDoc.addPage([A4_W, A4_H]);

        const bgIdx = bgPages.length === 1
            ? 0
            : i === 0
                ? 0
                : Math.min(1, bgPages.length - 1);

        page.drawPage(bgPages[bgIdx], { x: 0, y: 0, width: A4_W, height: A4_H });
        page.drawPage(contentEmbeds[i], { x: 0, y: 0, width: A4_W, height: A4_H });
    }

    return await newDoc.save();
}

function base64ToBytes(base64: string): Uint8Array {
    const cleaned = base64.startsWith('data:') ? base64.split(',')[1] : base64;
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function downloadPdf(bytes: Uint8Array, filename: string) {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
