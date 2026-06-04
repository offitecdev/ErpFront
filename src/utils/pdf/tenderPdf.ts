import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { buildQrBillPayload, formatIban, formatReference } from './swissQrBill';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';

import defaultLetterheadUrl from '../../assets/docs/offitec-letterhead.pdf?url';

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
    activities?: Array<{ activityType: string; description?: string | null; activityDate: string; employeeName?: string | null }>;
    positions: Array<{
        positionNumber: string;
        shortDescription: string;
        longDescription?: string | null;
        quantity: number;
        unit?: string | null;
        npkCode?: string | null;
        imageUrl?: string | null;
        unitPrice?: number;
        discount?: number;
        taxRate?: number;
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
}

// ── Page geometry (A4 in mm) ─────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;

const HEADER_RESERVED_TOP_FIRST = 48;
const HEADER_RESERVED_TOP_REST = 38;
const FOOTER_RESERVED_BOTTOM = 22;

// Tablo Kolonları (Tanımlar daha geniş, rakamlar sıkı ve sağa dayalı)
const COL = {
    descLeft: 20,
    descRight: 114, 
    menge: 122,
    stueck: 148,
    rabatt: 164,
    steuern: 178,
    preis: 195,
};

// ── Ultra-Sıkı İsviçre Modern Tasarım Ayarları ───────────────────────────────
const ROW_PADDING = 2.4;      // İçerik ile ayırıcılar arasında daha ferah boşluk
const ROW_MIN_HEIGHT = 7;     // Satırların minimum yüksekliği modern görünüm için genişletildi
const TEXT_LINE_HEIGHT = 4.2; // Satır arası yüksekliği okunabilir tutuldu
const ROW_GAP = 2.8;          // Ürünler/pozisyonlar arasında net boşluk
const IMG_SIZE = 20;          // İmaj boyutu optimize edildi
const TITLE_IMAGE_GAP = 2.6;
const IMAGE_DESCRIPTION_GAP = 4.0;
const TITLE_DESCRIPTION_GAP = 1.8;

// Renk Paleti (Daha profesyonel, keskin İsviçre tarzı)
const COLOR_TEXT = [25, 25, 25] as const;      // Neredeyse siyah, tam okunaklı
const COLOR_MUTED = [110, 110, 110] as const;  // İkincil yazılar için zarif gri
const COLOR_BORDER = [225, 225, 225] as const; // Sadece çok ince ve hafif ayırıcı çizgiler
const COLOR_ACCENT = [0, 0, 0] as const;       // Toplam çizgileri için kontrast

const fmtMoneyForCurrency = (currency: string) => (v: number) =>
    new Intl.NumberFormat('de-CH', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(v);

const fmtNumber = (v: number, digits = 2) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: digits }).format(v);

const fmtVatRate = (v: number) =>
    `${new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;

export async function buildTenderPdfBytes(
    data: TenderPdfData,
    settings: PdfCompanySettings
): Promise<Uint8Array> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const fmt = fmtMoneyForCurrency(settings.currency);

    // ── SAYFA 1: Kapak & Giriş ───────────────────────────────────────────────
    drawCoverPage(doc, data, settings);

    // ── SAYFA 2+: Ürünler & Tablo ───────────────────────────────────────────
    doc.addPage();
    let y = HEADER_RESERVED_TOP_REST;

    drawTableHeader(doc, y);
    y += 7; // Başlık altı minik boşluk

    for (const pos of data.positions) {
        const rowHeight = measureRow(doc, pos);
        if (y + rowHeight > PAGE_H - FOOTER_RESERVED_BOTTOM) {
            doc.addPage();
            y = HEADER_RESERVED_TOP_REST;
            drawTableHeader(doc, y);
            y += 7;
        }
        y = drawRow(doc, pos, y, fmt);
    }

    // ── Toplamlar ───────────────────────────────────────────────────────────
    const totalsBlockHeight = 45;
    if (y + totalsBlockHeight > PAGE_H - FOOTER_RESERVED_BOTTOM) {
        doc.addPage();
        y = HEADER_RESERVED_TOP_REST + 5;
    } else {
        y += 6; // Tablo bittikten hemen sonra toplamlara geçiş
    }
    drawTotals(doc, y, data, settings, fmt);

    // ── QR Fatura (Swiss QR-Bill) ───────────────────────────────────────────
    if (data.qrBillEnabled === true) {
        await appendQrBillPage(doc, data, settings);
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
// SAYFA 1 — Kapak / Giriş Alanı (Temiz İsviçre Düzeni)
// ─────────────────────────────────────────────────────────────────────────────

function drawCoverPage(doc: jsPDF, data: TenderPdfData, s: PdfCompanySettings) {
    let yLeft = HEADER_RESERVED_TOP_FIRST + 10;
    
    // Müşteri Bilgileri
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(data.customerName, 22, yLeft);
    doc.setFont('helvetica', 'normal');
    yLeft += 4.5;
    
    if (data.customerAddress) {
        const lines = doc.splitTextToSize(data.customerAddress, 85);
        doc.text(lines, 22, yLeft);
        yLeft += lines.length * 4.5;
    }
    if (data.customerEmail || data.customerPhone) {
        doc.setFontSize(9);
        doc.setTextColor(...COLOR_MUTED);
        const contact = [data.customerPhone, data.customerEmail].filter(Boolean).join(' · ');
        doc.text(contact, 22, yLeft + 1);
        doc.setFontSize(10);
        doc.setTextColor(...COLOR_TEXT);
    }

    // Sağ Meta Bilgileri
    doc.setFontSize(9);
    const labelX = 135;
    const valueX = 165;
    let yRight = HEADER_RESERVED_TOP_FIRST + 10;
    const rows: [string, string][] = [
        ['Datum', new Date(data.createdAt).toLocaleDateString('de-CH')],
    ];
    if (data.validUntil) {
        rows.push(['Gültig bis', new Date(data.validUntil).toLocaleDateString('de-CH')]);
    }
    if (data.createdByName) {
        rows.push(['Unser Zeichen', data.createdByName]);
    }
    if (data.customerTaxNumber) {
        rows.push(['MwSt-Nr.', data.customerTaxNumber]);
    }
    for (const [k, v] of rows) {
        doc.setTextColor(...COLOR_MUTED);
        doc.text(k, labelX, yRight);
        doc.setTextColor(...COLOR_TEXT);
        doc.text(v, valueX, yRight);
        yRight += 4.5;
    }

    const yPlace = Math.max(yLeft, yRight) + 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${s.city}, ${new Date(data.createdAt).toLocaleDateString('de-CH')}`, 22, yPlace);

    let yTitle = yPlace + 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16); // Daha vurucu başlık
    doc.text(`Offerte ${data.tenderNumber}`, 22, yTitle);

    yTitle += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Sehr geehrte Damen und Herren', 22, yTitle);
    yTitle += 6;

    const intro = 'Vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen nachfolgend unser Angebot. Eine detaillierte Aufstellung der Positionen finden Sie auf den folgenden Seiten.';
    const introLines = doc.splitTextToSize(intro, 165);
    doc.text(introLines, 22, yTitle);

    if (s.footerNote) {
        doc.setFontSize(8.5);
        doc.setTextColor(...COLOR_MUTED);
        const note = doc.splitTextToSize(s.footerNote, 165);
        doc.text(note, 22, PAGE_H - FOOTER_RESERVED_BOTTOM - 6 - note.length * 4);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 2+ — Tablo ve İçerikler
// ─────────────────────────────────────────────────────────────────────────────

function drawTableHeader(doc: jsPDF, y: number) {
    // Modern İsviçre dizaynı: Arka plan yok, sadece keskin bir alt-üst çizgi
    doc.setDrawColor(...COLOR_ACCENT);
    doc.setLineWidth(0.3);
    doc.line(20, y - 4, 195, y - 4); // Üst çizgi

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_TEXT);

    doc.text('Beschreibung', COL.descLeft, y);
    doc.text('Menge', COL.menge, y, { align: 'right' });
    doc.text('Einheitspreis', COL.stueck, y, { align: 'right' });
    doc.text('Rabatt', COL.rabatt, y, { align: 'right' });
    doc.text('MwSt.', COL.steuern, y, { align: 'right' });
    doc.text('Preis', COL.preis, y, { align: 'right' });

    doc.setDrawColor(...COLOR_ACCENT);
    doc.setLineWidth(0.3);
    doc.line(20, y + 2, 195, y + 2); // Alt çizgi
}

function measureRow(doc: jsPDF, pos: TenderPdfData['positions'][number]): number {
    if (pos.isSectionSubtotal) return 10;

    const descW = COL.descRight - COL.descLeft;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const shortLines = doc.splitTextToSize(normalizePdfText(pos.shortDescription || ''), descW);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const plainLong = pos.longDescription
        ? normalizePdfText(pos.longDescription).replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1')
        : '';
    const longLines = plainLong ? doc.splitTextToSize(plainLong, descW) : [];

    const titleHeight = shortLines.length * TEXT_LINE_HEIGHT;
    const imageBlockHeight = pos.imageUrl ? TITLE_IMAGE_GAP + IMG_SIZE : 0;
    const descriptionGap = longLines.length > 0 ? (pos.imageUrl ? IMAGE_DESCRIPTION_GAP : TITLE_DESCRIPTION_GAP) : 0;
    const descriptionHeight = longLines.length > 0 ? longLines.length * 3.9 : 0;
    const contentHeight = titleHeight + imageBlockHeight + descriptionGap + descriptionHeight;

    return Math.max(pos.isParent ? 6 : ROW_MIN_HEIGHT, contentHeight) + (ROW_PADDING * 2);
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
        .replace(/\u00a0/g, ' ')
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
        .replace(/\u00ad/g, '')
        .split(/\r?\n/)
        .map((line) => normalizeTrackedLetters(line))
        .filter((line) => !looksLikeCatalogCode(line))
        .join('\n')
        .trim();
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
        if (!rawLine.trim()) { cy += lineHeight * 0.5; continue; } // Boş satırlarda sadece yarım boşluk

        const trimmed = rawLine.trimStart();
        const isBullet = trimmed.startsWith('- ');
        const style = /\*\*(.+?)\*\*/.test(rawLine) ? 'bold' : /_(.+?)_/.test(rawLine) ? 'italic' : 'normal';
        
        const cleaned = trimmed.replace(/^- /, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1');
        const text = `${isBullet ? '• ' : ''}${cleaned}`;
        
        doc.setFont('helvetica', style);
        const lines = doc.splitTextToSize(text, maxW - (isBullet ? 2 : 0));
        doc.text(lines, x + (isBullet ? 2 : 0), cy);
        cy += Math.max(1, lines.length) * lineHeight;
    }
    doc.setFont('helvetica', 'normal');
    return cy;
}

function drawRow(
    doc: jsPDF,
    pos: TenderPdfData['positions'][number],
    y: number,
    fmt: (v: number) => string
): number {
    if (pos.isSectionSubtotal) {
        return drawSectionSubtotal(doc, y, pos.total ?? 0, fmt);
    }

    const rowH = measureRow(doc, pos);
    const rowEnd = y + rowH;
    let textY = y + ROW_PADDING + 2.5;

    const descX = COL.descLeft;
    const descW = COL.descRight - descX;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_TEXT);
    const shortText = normalizePdfText(pos.shortDescription || '');
    const shortLines = doc.splitTextToSize(shortText, descW);
    doc.text(shortLines, descX, textY);

    let descCursor = textY + (shortLines.length * TEXT_LINE_HEIGHT);

    if (pos.imageUrl) {
        descCursor += TITLE_IMAGE_GAP;
        try {
            const imgFmt = detectImageFormat(pos.imageUrl);
            doc.addImage(pos.imageUrl, imgFmt as any, COL.descLeft, descCursor, IMG_SIZE, IMG_SIZE);
            descCursor += IMG_SIZE;
        } catch { /* ignore */ }
    }
    
    if (pos.longDescription) {
        descCursor += pos.imageUrl ? IMAGE_DESCRIPTION_GAP : TITLE_DESCRIPTION_GAP;
        descCursor = drawMarkdownText(doc, pos.longDescription, descX, descCursor, descW, 8.5, 3.9, COLOR_TEXT);
    }

    // Rakamların Hizalaması (Açıklamanın ilk satırı ile hizalı)
    const numericY = y + ROW_PADDING + 2.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_TEXT);

    const qty = pos.quantity || 0;
    const unit = pos.unit || '';
    const unitPrice = pos.unitPrice ?? 0;
    const discount = pos.discount ?? 0;
    const taxRate = pos.taxRate ?? 0;
    const total = pos.total ?? qty * unitPrice * (1 - discount / 100);

    const qtyText = pos.isParent ? '' : (qty > 0 ? `${String(Math.round(qty))}${unit ? ' ' + unit : ''}` : '—');
    const unitPriceText = pos.isParent ? '' : (unitPrice > 0 ? fmt(unitPrice) : '—');
    const discountText = pos.isParent ? '' : (discount > 0 ? `${fmtNumber(discount, 1)}%` : '');
    const taxRateText = pos.isParent ? '' : fmtVatRate(taxRate || 8.1);

    doc.text(qtyText, COL.menge, numericY, { align: 'right' });
    doc.text(unitPriceText, COL.stueck, numericY, { align: 'right' });
    doc.text(discountText, COL.rabatt, numericY, { align: 'right' });
    doc.text(taxRateText, COL.steuern, numericY, { align: 'right' });

    if (!pos.isParent && total > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text(fmt(total), COL.preis, numericY, { align: 'right' });
    }
    
    // Satır ayracı: Modern görünüm için ekstra ince ve açık renk (neredeyse görünmez)
    if (!pos.isParent) {
        doc.setDrawColor(...COLOR_BORDER);
        doc.setLineWidth(0.1);
        doc.line(20, rowEnd, 195, rowEnd);
    }

    return rowEnd + ROW_GAP;
}

function drawSectionSubtotal(
    doc: jsPDF,
    y: number,
    total: number,
    fmt: (v: number) => string
): number {
    const lineLeft = 145;
    const lineRight = 195;

    doc.setDrawColor(...COLOR_MUTED);
    doc.setLineWidth(0.15);
    doc.line(lineLeft, y + 1, lineRight, y + 1);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_TEXT);
    doc.text('Zwischensumme', 165, y + 5.5, { align: 'right' });
    doc.text(fmt(total), lineRight, y + 5.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    return y + 8; // Alt toplamlarda da boşluk minimumda
}

function drawTotals(
    doc: jsPDF,
    y: number,
    data: TenderPdfData,
    s: PdfCompanySettings,
    fmt: (v: number) => string
) {
    const grand = data.grandTotal;
    const subtotal = s.vatRate > 0 ? grand / (1 + s.vatRate / 100) : grand;
    const vat = grand - subtotal;

    const boxLeft = 120;
    const boxRight = 195;
    const labelX = 125;

    // Swiss tarzı temiz üst çizgi
    doc.setDrawColor(...COLOR_ACCENT);
    doc.setLineWidth(0.2);
    doc.line(boxLeft, y, boxRight, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_TEXT);
    doc.text('Zwischentotal', labelX, y);
    doc.text(fmt(subtotal), COL.preis, y, { align: 'right' });
    y += 4.5;

    doc.setTextColor(...COLOR_MUTED);
    doc.text(`MwSt. ${fmtVatRate(s.vatRate)}`, labelX, y);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(fmt(vat), COL.preis, y, { align: 'right' });
    y += 5.5;

    // İsviçre faturalarında tipik "Toplam" gösterimi (Çift alt çizgi)
    doc.setDrawColor(...COLOR_ACCENT);
    doc.setLineWidth(0.4);
    doc.line(boxLeft, y - 3.5, boxRight, y - 3.5); // Toplam üstü kalın çizgi

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLOR_TEXT);
    doc.text('Rechnungstotal', labelX, y + 0.5);
    doc.text(fmt(grand), COL.preis, y + 0.5, { align: 'right' });

    // Çift çizgi bitiriş
    doc.setLineWidth(0.15);
    doc.line(boxLeft, y + 2.5, boxRight, y + 2.5);
    doc.line(boxLeft, y + 3.5, boxRight, y + 3.5);

    y += 12;
    if (s.paymentTerms) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...COLOR_MUTED);
        const lines = doc.splitTextToSize(s.paymentTerms, 165);
        doc.text(lines, 22, y);
    }
}

async function appendQrBillPage(doc: jsPDF, data: TenderPdfData, s: PdfCompanySettings) {
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
        unstructuredMessage: `Offerte ${data.tenderNumber}`,
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

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text('Empfangsschein', 5, yTop + 7);
    doc.text('Zahlteil', 67, yTop + 7);

    const writeBlock = (x: number, yy: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.text('Konto / Zahlbar an', x, yy);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(formatIban(s.iban), x, yy + 3);
        doc.text(s.companyName, x, yy + 7);
        doc.text(`${s.addressLine1} ${s.addressLine2}`, x, yy + 10.5);
        doc.text(`${s.postalCode} ${s.city}`, x, yy + 14);
    };
    writeBlock(5, yTop + 12);
    writeBlock(118, yTop + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('Währung', 67, yTop + 70);
    doc.text('Betrag', 87, yTop + 70);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(s.currency, 67, yTop + 74);
    doc.text(amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 87, yTop + 74);

    if (data.referenceNumber) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.text('Referenz', 118, yTop + 40);
        doc.setFont('helvetica', 'normal');
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
