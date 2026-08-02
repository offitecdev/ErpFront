/**
 * ── MODERN TEKLİF PDF ŞABLONU ────────────────────────────────────────────────
 * `tenderPdf.ts`'in (klasik, sablon.pdf antetli sürüm) yerine geçen modern
 * şablon. Klasik dosya olduğu gibi korunur; geri dönmek için modallardaki
 * import satırlarını değiştirmek yeterlidir.
 *
 * Klasikten farkları:
 *  - Antet (logo + iletişim satırı) ve alt bilgi (BIC / MwSt / IBAN bandı)
 *    kod ile çizilir — sablon.pdf arka plan birleştirmesi YOKTUR.
 *  - Ferah tablo: dikey ızgara çizgisi yok, ince ayraç çizgileri ve çok hafif
 *    zemin tonlaması var; blok renkler yerine yumuşak dolgular kullanılır.
 *  - Uzun satırlar sayfa sonunda BÖLÜNEREK akmaya devam eder (satır bir üst
 *    sayfaya itilmez) ve içerik hiçbir zaman alt bilgi bölgesine taşmaz.
 */
import { jsPDF } from 'jspdf';
import { companySenderLine, drawAddressBlockLines, drawFittedSingleLine } from './addressBlock';
import QRCode from 'qrcode';
import { buildQrBillPayload, formatIban, formatReference } from './swissQrBill';
import { localizeTenderNumber } from '../tenderNumber';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import { looksLikeRichHtml, richHtmlToPlainText } from '../../pages/tender/detail/utils/markdown.utils';
import { BULLET_INDENT, drawRichText, fontStyleOf, parseRichTextParagraphs, wrapRichParagraph } from './richTextPdf';
import type { RichVisualLine } from './richTextPdf';

// Arial yerine metrik olarak özdeş, Türkçe karakter destekli Arimo gömülür.
import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import arialItalicUrl from '../../assets/fonts/ARIALI.ttf?url';
import offitecLogoUrl from '../../assets/images/offitec.png?url';
import headerWaveUrl from '../../assets/images/header-wave.svg?url';

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
    /** Kommission / Komisyon referansı (varsa kapak bilgi kartında gösterilir) */
    commission?: string | null;
    /** Kundenreferenz — müşterinin verdiği referans (kapak bilgi kartında "Referenz"). */
    customerReference?: string | null;
    activities?: Array<{ activityType: string; description?: string | null; activityDate: string; employeeName?: string | null }>;
    positions: Array<{
        rowKey?: string;
        sourceArticleId?: string | null;
        shortDescription: string;
        longDescription?: string | null;
        rowType?: string;
        quantity?: number;
        unit?: string | null;
        npkCode?: string | null;
        imageUrl?: string | null;
        unitPrice?: number;
        /** Satırın birleşik iskonto yüzdesi (İndirim sütununda gösterilir). */
        discount?: number;
        /**
         * Satırın yığılmış iskontoları. Doluysa İndirim sütununda her iskonto
         * AYRI SATIR olarak yazılır ve birleşik yüzde (`discount`) gizlenir.
         */
        discounts?: TenderPdfDiscount[];
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
    /** Belge düzeyi (toplu) indirim özeti — ekrandaki fiyat özetiyle birebir. */
    totals?: TenderPdfTotals | null;
    referenceNumber?: string;
    qrBillEnabled?: boolean;
    /** PDF dili (indirmeden önce seçilir). Varsayılan: Almanca. */
    lang?: PdfLang;
    /** Opsiyonel içerik blokları — boş olanlar atlanır. */
    coverLetter?: string | null;
    closingNote?: string | null;
    closingImages?: string[] | null;
}

/** Tek bir iskonto satırı — adı, oranı ve para karşılığı. */
export interface TenderPdfDiscount {
    /** Kullanıcının verdiği ad ya da varsayılan ("Rabatt 1"). */
    name: string;
    /** Yüzde mi sabit tutar mı girildiği — sütunda hangi değerin yazılacağını belirler. */
    kind?: 'PERCENT' | 'AMOUNT';
    /** Kendi tabanına göre etkin yüzde (tutar tipindekiler için de doludur). */
    percent?: number;
    amount: number;
}

/** İndirim uygulanmış toplam özeti (ekrandaki `TenderPricingSummary` ile aynı). */
export interface TenderPdfTotals {
    /** İskontolardan ÖNCEKİ net toplam — iskonto varsa ara toplam satırı olur. */
    subtotal?: number;
    /**
     * Belge düzeyi iskontolar, uygulandıkları SIRAYLA. Her biri bir öncekinin
     * bıraktığı tutar üzerinden hesaplanır ve KDV'den ÖNCE listelenir.
     */
    discounts?: TenderPdfDiscount[];
    /** Tüm iskontoların birleşik etkisi (net üzerinden). */
    totalDiscountAmount?: number;
    combinedDiscountPercent?: number;
    netTotal: number;
    vatTotal: number;
    grossTotal: number;
}

export type PdfLang = 'tr' | 'de' | 'en';
export { localizeTenderNumber };

interface PdfStrings {
    offerNumber: string;
    kommission: string;
    referenz: string;
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
    discount: string;
    totalDiscount: string;
    grandTotal: string;
    paymentTerms: string;
    vatIdLabel: string;
    pageWord: string;
    pageOf: string;
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
        referenz: 'Referans:',
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
        discount: 'İndirim',
        totalDiscount: 'Toplam İndirim',
        grandTotal: 'TOPLAM',
        paymentTerms: 'Ödeme Koşulları',
        vatIdLabel: 'Vergi No',
        pageWord: 'Sayfa',
        pageOf: '/',
        qrReceipt: 'Receipt',
        qrPaymentPart: 'Payment part',
        qrAccountPayableTo: 'Account / Payable to',
        qrCurrency: 'Currency',
        qrAmount: 'Amount',
        qrReference: 'Reference',
    },
    de: {
        offerNumber: 'Angebots-Nr. :',
        kommission: 'Kommission:',
        referenz: 'Referenz:',
        offerDate: 'Angebotsdatum:',
        validUntil: 'Gültig bis:',
        seller: 'Verkäufer:',
        offerTitle: 'Angebot',
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
        discount: 'Rabatt',
        totalDiscount: 'Gesamtrabatt',
        grandTotal: 'GESAMT',
        paymentTerms: 'Zahlungsbedingungen',
        vatIdLabel: 'MwSt-Nr.',
        pageWord: 'Seite',
        pageOf: 'von',
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
        referenz: 'Reference:',
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
        discount: 'Discount',
        totalDiscount: 'Total Discount',
        grandTotal: 'TOTAL',
        paymentTerms: 'Payment Terms',
        vatIdLabel: 'VAT No.',
        pageWord: 'Page',
        pageOf: 'of',
        qrReceipt: 'Receipt',
        qrPaymentPart: 'Payment part',
        qrAccountPayableTo: 'Account / Payable to',
        qrCurrency: 'Currency',
        qrAmount: 'Amount',
        qrReference: 'Reference',
    },
};

// ── Sayfa geometrisi (A4, mm) ────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;

// Kenar boşlukları biraz daraltıldı: içerik 14–196 mm bandında akar; böylece
// tablo genişler ve sayısal sütunlardaki metinler rahat sığar.
const ML = 14;
const MR = 196;
const CONTENT_W = MR - ML;

// Antet: logo + iletişim satırı + iki tonlu çizgi (~10–30 mm bandı).
// Logo kutusu — antetteki marka hatları da bu kutuya göre konumlanır.
const LOGO_X = ML;
const LOGO_Y = 10;
const LOGO_H = 14;
const LOGO_MAX_W = 50;

const CONTENT_TOP_FIRST = 44;   // Kapak sayfası içerik başlangıcı
const CONTENT_TOP_REST = 38;    // Devam sayfaları içerik başlangıcı
// Alt bilgi bandı 272.5 mm'de başlar; içerik ASLA bu sınırı geçemez.
const CONTENT_BOTTOM = 266;

// ── Tablo sütunları (dikey ızgara yok; hizalama noktaları) ───────────────────
const C_POS_X = ML + 1.5; // Pos metni başlangıcı (sütun dar tutulur)
const C_DESC = 25;        // Açıklama sol kenarı (Pos'a 8.5 mm kalır: "1.2.10" sığar)
const C_DESC_END = 97;    // Açıklama sağ sınırı (biraz daraltıldı)
const C_QTY_R = 117;      // Miktar (sağa hizalı)
const C_UP_R = 139;       // Birim fiyat (sağa hizalı) — ~22 mm alan
const C_DISC_R = 154;     // İndirim (sağa hizalı)
const C_VAT_R = 167;      // Vergi (sağa hizalı)
const C_PRICE_R = MR - 1; // Tutar (sağa hizalı) — ~28 mm alan, taşma yok

const HEAD_H = 9;             // Tablo başlık bandı yüksekliği
const HEAD_GAP = 2;           // Başlık bandı ile ilk satır arası nefes payı
const ROW_PAD = 3;            // Satır üst/alt iç boşluğu (ferah görünüm)
const FIRST_BASELINE = 5.8;   // Satır üstünden ilk metin taban çizgisine
const ROW_MIN_H = 11;
const MIN_ROW_START = 16;     // Bir satıra başlamak için sayfada gereken asgari yer

// ── Yazı tipi boyutları (puan) ───────────────────────────────────────────────
const FS_BASE = 9;
const FS_TITLE = 10;
const FS_POS = 8.2;       // Pos numarası küçültüldü — sayısal sütunlara yer açar
const FS_LONG_DESC = 9;
const FS_HEADER = 8.4;
const LH_TITLE = 4.7;
const LH_BODY = 4.4;
const UNIT_GAP = 4.2;
const IMG_SIZE = 24;      // Ürün görseli — 20 mm küçüktü, 28 mm satırı fazla yükseltti
// Satır içeriği HER ZAMAN başlık → paragraf → görsel sırasıyla dizilir; üç blok
// arasındaki boşluk tek bir değerden gelir. Ölçü, metin bloklarında SATIR
// ARALIĞINA eklenir (dolayısıyla gözle görülen aralık ~2.8 mm'dir).
const ROW_BLOCK_GAP = 1.4;
// Görselin üstünde/altında aynı optik aralığı tutturmak için iki düzeltme:
//  • ÜSTTE metin bloğu bittiğinde imleç son taban çizgisinin bir SATIR
//    altındadır; bu pay tek başına fazla geldiği için bir tık geri alınır.
//  • ALTTA böyle bir pay hiç yoktur; bu sabit olmadan görsel satır ayracına
//    yapışır.
const IMAGE_TOP_GAP = -0.9;
const IMAGE_BOTTOM_GAP = 2.6;

// ── Renk paleti (Offitec lacivert + marka kırmızısı + yumuşak griler) ────────
const COLOR_TEXT = [30, 32, 40] as const;
const COLOR_MUTED = [120, 126, 140] as const;
const COLOR_LABEL = [88, 95, 114] as const;      // Etiketler — muted'tan okunaklı
const COLOR_NAVY = [31, 42, 84] as const;       // Logo laciverti
const COLOR_RED = [211, 32, 38] as const;       // Logo kırmızısı (vurgu)
// Antet / alt bilgi şeridinin açık tonları — düz blok yerine incelerek biten,
// sakin bir marka bandı oluştururlar.
const COLOR_NAVY_SOFT = [104, 116, 158] as const;
const COLOR_HAIRLINE = [226, 229, 237] as const; // Satır ayraçları
const COLOR_HEAD_BG = [238, 241, 247] as const;  // Tablo başlığı (hafif lacivert ton)
const COLOR_ZEBRA = [249, 250, 252] as const;    // Çok hafif satır tonlaması
const COLOR_BAND_BG = [244, 246, 250] as const;  // Ara toplam / genel toplam bandı
const COLOR_CARD_BG = [248, 249, 252] as const;  // Kapak bilgi kartı & alt bilgi kutusu
const COLOR_CARD_BORDER = [226, 230, 238] as const;

// ── Marka sabitleri (antet & alt bilgi) ──────────────────────────────────────
const CONTACT_PHONE = '+41 56 556 24 68';
const CONTACT_EMAIL = 'info@offitec.ch';
const CONTACT_WEB = 'www.offitec.ch';
const FOOTER_BIC = 'RAIFCH22XXX';
const FOOTER_VAT = 'CHE-201.098.592';
const FOOTER_IBAN = 'CH50 8080 8005 5315 3585 1';

// ── Fontlar (Türkçe karakter desteği için Arimo gömülür) ─────────────────────
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

// ── Logo (bir kez indirilir, oranı korunarak antete yerleştirilir) ───────────
let logoDataUrl: string | null = null;

async function loadLogo(doc: jsPDF): Promise<{ dataUrl: string; w: number; h: number } | null> {
    try {
        if (!logoDataUrl) {
            const buf = await fetch(offitecLogoUrl).then((r) => r.arrayBuffer());
            logoDataUrl = `data:image/png;base64,${bufferToBase64(buf)}`;
        }
        const props = doc.getImageProperties(logoDataUrl);
        const h = LOGO_H;
        const w = Math.min(LOGO_MAX_W, h * (props.width / props.height));
        return { dataUrl: logoDataUrl, w, h };
    } catch (e) {
        console.warn('Offitec logo could not be loaded for the PDF header:', e);
        return null;
    }
}

// ── Antet dalgası (logodan sağa uzanan şerit) ────────────────────────────────
// SVG'nin kendisi vektör; jsPDF gradient/mask desteklemediği için şeridi bir kez
// hedef ölçüsünde rasterleştirip PNG olarak gömüyoruz. Aynı takma adla
// eklendiğinden jsPDF görseli tek sefer saklar, her sayfada yeniden yazmaz.
let wavePngCache: { key: string; dataUrl: string } | null = null;

async function loadHeaderWave(wMm: number, hMm: number): Promise<string | null> {
    const key = `${wMm.toFixed(2)}x${hMm.toFixed(2)}`;
    if (wavePngCache?.key === key) return wavePngCache.dataUrl;

    try {
        // Şeridi hedef en/boy oranında rasterleştir: SVG kendi oranından
        // (1460×280) esnetilir, ama vektör olduğu için kenarlar keskin kalır.
        const pxW = Math.round((wMm / 25.4) * WAVE_RASTER_DPI);
        const pxH = Math.round((hMm / 25.4) * WAVE_RASTER_DPI);

        const svgText = await fetch(headerWaveUrl).then((r) => r.text());
        // Yalnızca kök <svg> çerçevesi değişir; yollar, gradyan ve maske olduğu
        // gibi kalır. viewBox şeridin canlı alanına kırpılır (bkz. WAVE_VIEW) ve
        // preserveAspectRatio="none" ile banda tam oturur — varsayılan "meet"
        // olsaydı şerit bandın ortasına sığdırılıp iki yana boşluk bırakırdı.
        const sized = svgText.replace(/<svg\b[^>]*>/, (tag) =>
            tag
                .replace(/\swidth="[^"]*"/, ` width="${pxW}"`)
                .replace(/\sheight="[^"]*"/, ` height="${pxH}"`)
                .replace(/\sviewBox="[^"]*"/, ` viewBox="${WAVE_VIEW}"`)
                .replace(/\s*>$/, ' preserveAspectRatio="none">')
        );

        const img = new Image();
        img.decoding = 'sync';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('wave svg decode failed'));
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
        });

        const canvas = document.createElement('canvas');
        canvas.width = pxW;
        canvas.height = pxH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, pxW, pxH);

        const dataUrl = canvas.toDataURL('image/png');
        wavePngCache = { key, dataUrl };
        return dataUrl;
    } catch (e) {
        console.warn('Header wave could not be rendered for the PDF header:', e);
        return null;
    }
}

// ── Sayı / tarih biçimleyiciler (klasik şablon ile birebir) ──────────────────
const fmtMoneyForCurrency = (currency: string) => (v: number) =>
    `${currency} ${new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(v || 0)}`;

const fmtUnitPrice = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v || 0);

const fmtQty = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

const fmtDiscount = (v: number) =>
    `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(v)}%`;

const fmtVatRate = (v: number) =>
    `${new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;

const fmtDateShort = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

/** Live status of the PDF pipeline, for download-progress UIs. */
export type TenderPdfProgress =
    | { stage: 'positions'; done: number; total: number }
    | { stage: 'finalize' }
    | { stage: 'download' };

/** True once the rich HTML holds something other than empty markup. */
const hasRichContent = (value?: string | null) =>
    Boolean(value && value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());

const drawRichTextFlow = (doc: jsPDF, html: string, startY: number): number =>
    drawRichText(doc, parseRichTextParagraphs(html), {
        x: ML,
        y: startY,
        maxWidth: CONTENT_W,
        fontFamily: FONT,
        fontSize: FS_BASE + 0.5,
        lineHeight: LH_BODY + 0.6,
        defaultColor: COLOR_TEXT,
        maxY: CONTENT_BOTTOM,
        onOverflow: () => {
            doc.addPage();
            return CONTENT_TOP_REST;
        },
    });

const appendClosingBlocks = async (doc: jsPDF, data: TenderPdfData, contentY: number) => {
    const hasNote = hasRichContent(data.closingNote);
    const images = data.closingImages ?? [];
    if (!hasNote && images.length === 0) return;

    let y = contentY;
    if (y + 24 > CONTENT_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST;
    } else {
        y += 10;
    }

    if (hasNote) {
        y = drawRichTextFlow(doc, data.closingNote as string, y);
        y += 3;
    }

    for (const image of images) {
        try {
            const properties = doc.getImageProperties(image);
            const maxWidth = CONTENT_W;
            const maxHeight = 90;
            const ratio = Math.min(maxWidth / properties.width, maxHeight / properties.height);
            const width = properties.width * ratio;
            const height = properties.height * ratio;
            if (y + height > CONTENT_BOTTOM) {
                doc.addPage();
                y = CONTENT_TOP_REST;
            }
            doc.addImage(image, image.includes('image/png') ? 'PNG' : 'JPEG', ML, y, width, height, undefined, 'FAST');
            y += height + 4;
        } catch (err) {
            console.error('Closing image could not be embedded:', err);
        }
    }
};

export async function buildTenderPdfBytes(
    data: TenderPdfData,
    settings: PdfCompanySettings,
    onProgress?: (p: TenderPdfProgress) => void
): Promise<Uint8Array> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const logo = await loadLogo(doc);
    const wave = await loadHeaderWave(WAVE_W, WAVE_H);
    const fmt = fmtMoneyForCurrency(settings.currency);
    const L = I18N[data.lang ?? 'de'];
    data = { ...data, tenderNumber: localizeTenderNumber(data.tenderNumber, data.lang ?? 'de') };

    // ── SAYFA 1: Kapak & giriş ───────────────────────────────────────────────
    // Einleitungstext (Anschreiben) artık AYRI SAYFA DEĞİL: başlığın hemen
    // altında akar, taşarsa kapak devam sayfalarına geçer (kapak içinde çizilir).
    drawCoverPage(doc, data, settings, L);

    // ── SAYFA 2+: Pozisyon tablosu ───────────────────────────────────────────
    doc.addPage();
    const st: TableState = { y: 0, rowIdx: 0 };
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, L);

    let drawn = 0;
    for (const pos of data.positions) {
        if (pos.isSectionSubtotal) {
            if (st.y + 10 > CONTENT_BOTTOM) newTablePage(doc, st, L);
            st.y = drawSectionSubtotal(doc, st.y, pos.total ?? 0, fmt, L);
            st.rowIdx++;
        } else {
            const h = measureRow(doc, pos);
            if (st.y + h <= CONTENT_BOTTOM) {
                st.y = drawRowAtomic(doc, pos, st.y, h, fmt, st.rowIdx);
                st.rowIdx++;
            } else if (CONTENT_BOTTOM - st.y < MIN_ROW_START) {
                // Kalan yer bir satıra başlamaya bile yetmiyor → yeni sayfa.
                newTablePage(doc, st, L);
                if (st.y + h <= CONTENT_BOTTOM) {
                    st.y = drawRowAtomic(doc, pos, st.y, h, fmt, st.rowIdx);
                    st.rowIdx++;
                } else {
                    drawRowFlowing(doc, pos, fmt, L, st);
                }
            } else {
                // Uzun satır: bir sonraki sayfaya İTİLMEZ — kaldığı yerden
                // bölünerek akmaya devam eder (kullanıcı isteği).
                drawRowFlowing(doc, pos, fmt, L, st);
            }
        }
        drawn++;
        if (onProgress) {
            onProgress({ stage: 'positions', done: drawn, total: data.positions.length });
            if (drawn % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    onProgress?.({ stage: 'finalize' });

    // ── Toplamlar ────────────────────────────────────────────────────────────
    // İskonto listesi + ara toplam satırı bloğu uzatır; birleşik satır yalnızca
    // birden fazla iskonto varsa çizilir. Toplam bandı 12 mm.
    const discountRowCount = (data.totals?.discounts ?? []).filter((entry) => (entry?.amount ?? 0) > 0).length;
    const totalsBlockHeight = 50
        + (discountRowCount > 0 ? 8 : 0)
        + discountRowCount * 8
        + (discountRowCount > 1 ? 8 : 0);
    let y = st.y;
    if (y + totalsBlockHeight > CONTENT_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST + 4;
    } else {
        y += 9;
    }
    drawTotals(doc, y, data, settings, fmt, L);
    const contentBottomY = y + totalsBlockHeight;

    // ── Opsiyonel: Schlusstext & Schlussbild ─────────────────────────────────
    await appendClosingBlocks(doc, data, contentBottomY);

    // ── Antet & alt bilgi dekorasyonu (QR sayfası hariç tüm sayfalar) ────────
    const contentPageCount = doc.getNumberOfPages();

    // ── QR Fatura (Swiss QR-Bill) — ödeme fişi olduğu için antet almaz ──────
    if (data.qrBillEnabled === true) {
        await appendQrBillPage(doc, data, settings, L);
    }

    for (let i = 1; i <= contentPageCount; i++) {
        doc.setPage(i);
        drawPageHeader(doc, logo, wave, settings);
        drawPageFooter(doc, i, contentPageCount, L);
    }

    return new Uint8Array(doc.output('arraybuffer'));
}

export async function exportTenderPdf(
    data: TenderPdfData,
    settings: PdfCompanySettings,
    onProgress?: (p: TenderPdfProgress) => void
): Promise<void> {
    const finalBytes = await buildTenderPdfBytes(data, settings, onProgress);
    onProgress?.({ stage: 'download' });
    downloadPdf(finalBytes, `${localizeTenderNumber(data.tenderNumber, data.lang ?? 'de')}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTET — logo, iletişim satırı, iki tonlu ayraç çizgisi (her sayfada)
// ─────────────────────────────────────────────────────────────────────────────

type ContactIcon = 'phone' | 'mail' | 'web';

/** Küçük vektör ikonlar (telefon / e-posta / web) — 3 mm kutuya çizilir. */
function drawContactIcon(doc: jsPDF, kind: ContactIcon, x: number, top: number, s: number) {
    doc.setDrawColor(...COLOR_NAVY);
    doc.setFillColor(...COLOR_NAVY);
    doc.setLineWidth(0.26);

    if (kind === 'phone') {
        const w = s * 0.62;
        const bx = x + (s - w) / 2;
        doc.roundedRect(bx, top, w, s, 0.35, 0.35, 'F');
        // Ekran boşluğu — dolu blok yerine gerçek bir ahize silueti verir.
        doc.setFillColor(255, 255, 255);
        doc.rect(bx + 0.22, top + 0.42, w - 0.44, s - 1.2, 'F');
        doc.setFillColor(...COLOR_NAVY);
    } else if (kind === 'mail') {
        const h = s * 0.74;
        const ty = top + (s - h) / 2;
        doc.rect(x, ty, s, h, 'S');
        doc.line(x, ty, x + s / 2, ty + h * 0.55);
        doc.line(x + s, ty, x + s / 2, ty + h * 0.55);
    } else {
        const r = s / 2;
        doc.circle(x + r, top + r, r, 'S');
        doc.ellipse(x + r, top + r, r * 0.44, r, 'S');
        doc.line(x, top + r, x + s, top + r);
    }
}

/**
 * Antetteki marka işareti: sağ marja hizalı dalga şeridi
 * (assets/images/header-wave.svg). Bükülen kurdele: 18 ince şerit aynı sinüs
 * omurgasını kayan faz ve genlikle izler — kesişmeler eğik süpürmeler olur,
 * orta hat bandın biraz altında salınır (dalga aşağıya dolar, lob uçları
 * yuvarlaktır). İki uç da tek noktada TOPLANMAZ: teller kademeli x'lerde
 * serbest biter (açık saç uçları). Renkler logonun laciverti → kırmızısı,
 * sağ uç kırmızı bölgede açık bir yelpazeyle biter. Kompozisyon simetrik
 * 3 lob: kesişme süpürmeleri x=365/1095'te aynalı, iki uç da tam yelpazeyle
 * açılır; omurga sağa doğru hafifçe yükselir (logosuz taraf ~2 mm yukarıda).
 * TÜM teller tuvalin tamamını (x 0→1460) kat eder — uçlar aynı hizada biter,
 * uzun/kısa karışımı yok; İKİ kenarı da maske rampası yumuşatır (sol %15,
 * sağ %85→100), kesik görüntüsü yok. SVG, 146×28 mm bandı için 1460×280 tuvalde
 * birebir tasarlandı (10 birim/mm); sol kenar x=50'de başlar, uzun maske
 * rampası (%15) sayesinde mürekkep ancak x≈66'dan sonra görünür — logoya
 * (mürekkep kenarı ≈47.5) değmez, kesik yok. İletişim satırı bu banda yer
 * açmak için 32 tabanına indirildi.
 */
const WAVE_W = 146;              // Şerit genişliği — sağa hizalı, x 50→196
const WAVE_H = 28;               // Şerit bandının yüksekliği (y 0–28; mürekkep ~5.5–24.5)
const WAVE_CENTER_Y = LOGO_Y + LOGO_H / 2 - 3;  // Logo ortasından 3 mm yukarı
const WAVE_RASTER_DPI = 400;     // Rasterleştirme çözünürlüğü
const WAVE_VIEW = '0 0 1460 280';           // Tuvalin tamamı — kırpma yok

function drawHeaderWave(doc: jsPDF, wave: string | null) {
    if (!wave) return;
    try {
        doc.addImage(
            wave, 'PNG',
            MR - WAVE_W, WAVE_CENTER_Y - WAVE_H / 2, WAVE_W, WAVE_H,
            'offitec-header-wave', 'FAST'
        );
    } catch { /* şerit çizilemezse antet logo + iletişim satırı olarak kalır */ }
}

/** Tek, ince ayraç çizgisi. */
function drawHairline(doc: jsPDF, y: number, tone: readonly [number, number, number], thickness = 0.2) {
    doc.setFillColor(tone[0], tone[1], tone[2]);
    doc.rect(ML, y - thickness / 2, CONTENT_W, thickness, 'F');
}

function drawPageHeader(
    doc: jsPDF,
    logo: { dataUrl: string; w: number; h: number } | null,
    wave: string | null,
    s: PdfCompanySettings
) {
    if (logo) {
        try {
            doc.addImage(logo.dataUrl, 'PNG', LOGO_X, LOGO_Y, logo.w, logo.h, 'offitec-logo', 'FAST');
        } catch { /* logo yüklenemezse antet metin-only kalır */ }
    } else {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(15);
        doc.setTextColor(...COLOR_NAVY);
        doc.text(s.companyName, ML, 19);
    }

    // Sağ marja hizalı, iletişim satırının üzerinde kalan dalga şeridi.
    drawHeaderWave(doc, wave);

    // İletişim bilgileri — her biri kendi ikonuyla, sağa yaslı tek satır.
    // Taban çizgisi 32: dalga bandı (y 6–28) ile içerik (38) arasında kalır.
    const baseline = 32;
    const ICON = 2.9;
    const ICON_GAP = 1.5;
    const ITEM_GAP = 6;
    const items: Array<{ icon: ContactIcon; text: string }> = [
        { icon: 'phone', text: CONTACT_PHONE },
        { icon: 'mail', text: CONTACT_EMAIL },
        { icon: 'web', text: CONTACT_WEB },
    ];

    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    const widths = items.map((it) => ICON + ICON_GAP + doc.getTextWidth(it.text));
    const totalW = widths.reduce((a, b) => a + b, 0) + ITEM_GAP * (items.length - 1);

    let x = MR - totalW;
    items.forEach((it, i) => {
        drawContactIcon(doc, it.icon, x, baseline - 2.6, ICON);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_LABEL);
        doc.text(it.text, x + ICON + ICON_GAP, baseline);
        x += widths[i] + ITEM_GAP;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ALT BİLGİ — lacivert BIC / MwSt / IBAN satırı, altında tek bir çizgi
// ─────────────────────────────────────────────────────────────────────────────

function drawPageFooter(doc: jsPDF, page: number, total: number, L: PdfStrings) {
    const textY = 274.5;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_NAVY);
    const details = `BIC: ${FOOTER_BIC}     ${L.vatIdLabel}: ${FOOTER_VAT}     IBAN: ${FOOTER_IBAN}`;
    doc.text(details, ML, textY);

    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_NAVY_SOFT);
    doc.text(`${L.pageWord} ${page} ${L.pageOf} ${total}`, MR, textY, { align: 'right' });

    // Sayfayı kapatan tek çizgi — alt bilginin altında.
    drawHairline(doc, 278.5, COLOR_NAVY, 0.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 1 — Kapak: gönderici satırı + alıcı (sol), bilgi kartı (sağ)
// ─────────────────────────────────────────────────────────────────────────────

function drawCoverPage(doc: jsPDF, data: TenderPdfData, s: PdfCompanySettings, L: PdfStrings) {
    const y0 = CONTENT_TOP_FIRST;

    // ── Sol: teklif bilgi kartı (köşe yuvarlatması yok, net kenarlar) ────────
    const cardX = ML;
    const cardW = 78;
    // Enge Zeilen: die Karte soll wie eine kompakte Tabelle wirken, nicht wie
    // eine Liste mit Luft dazwischen.
    const rowH = 5.6;
    // Referenz steht DIREKT ÜBER dem Verkäufer — beide gehören zur "wer/woher"
    // Angabe und werden zusammen gelesen.
    const rows: Array<[string, string, boolean]> = ([
        [L.offerNumber.replace(/\s*:\s*$/, ''), data.tenderNumber, true],
        [L.kommission.replace(/\s*:\s*$/, ''), data.commission || '', false],
        [L.offerDate.replace(/\s*:\s*$/, ''), fmtDateShort(data.createdAt), false],
        [L.validUntil.replace(/\s*:\s*$/, ''), fmtDateShort(data.validUntil), false],
        [L.referenz.replace(/\s*:\s*$/, ''), data.customerReference || '', false],
        [L.seller.replace(/\s*:\s*$/, ''), data.createdByName || '', false],
    ] as Array<[string, string, boolean]>).filter(([, value]) => value.trim().length > 0);
    const cardY = y0 - 4;
    const cardH = rows.length * rowH + 2.4;

    doc.setFillColor(...COLOR_CARD_BG);
    doc.setDrawColor(...COLOR_CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(cardX, cardY, cardW, cardH, 'FD');

    // Sol kenarda antetteki bandın dikey yankısı: kırmızı başlangıç, lacivert gövde.
    doc.setFillColor(...COLOR_RED);
    doc.rect(cardX, cardY, 1.2, cardH * 0.32, 'F');
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(cardX, cardY + cardH * 0.32, 1.2, cardH * 0.44, 'F');
    doc.setFillColor(...COLOR_NAVY_SOFT);
    doc.rect(cardX, cardY + cardH * 0.76, 1.2, cardH * 0.24, 'F');

    let ry = cardY + 1.2;
    rows.forEach(([label, value, emphasize], idx) => {
        const base = ry + rowH / 2 + 1.15;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_LABEL);
        doc.text(label, cardX + 3.5, base);
        doc.setFont(FONT, 'bold');
        // Der Wert wird bei Bedarf verkleinert, damit er in der schmaleren
        // Karte nicht mit der Beschriftung kollidiert.
        const labelW = doc.getTextWidth(label);
        const valueMaxW = cardW - 7 - labelW - 2;
        doc.setFontSize(emphasize ? 8.6 : 7.8);
        fitFontSize(doc, value, valueMaxW, emphasize ? 8.6 : 7.8, 5.6);
        if (emphasize) doc.setTextColor(...COLOR_NAVY);
        else doc.setTextColor(...COLOR_TEXT);
        doc.text(value, cardX + cardW - 3.5, base, { align: 'right' });
        ry += rowH;
        if (idx < rows.length - 1) {
            doc.setDrawColor(...COLOR_HAIRLINE);
            doc.setLineWidth(0.12);
            doc.line(cardX + 3.5, ry + 0.3, cardX + cardW - 3.5, ry + 0.3);
        }
    });

    // ── Sağ: tek satır gönderici + montaj/alıcı adresi ───────────────────────
    // "OffiTec Heating & Cooling, Cores Tower - Hohenrainstrasse 24, 4133 Pratteln"
    // — küçük punto, TEK satır (sığmazsa punto küçülür, satır bölünmez); hemen
    // altında müşterinin (montaj yerinin) adresi.
    const addrX = 112;
    const addrW = MR - addrX;
    const sender = companySenderLine(s);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLOR_MUTED);
    drawFittedSingleLine(doc, sender, addrX, y0, addrW, 7.5, 5.8);
    doc.setDrawColor(...COLOR_HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(addrX, y0 + 1.6, MR, y0 + 1.6);

    let addrY = y0 + 8;
    doc.setTextColor(...COLOR_TEXT);
    if (data.customerName) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(10.5);
        const nameLines = doc.splitTextToSize(data.customerName, addrW);
        doc.text(nameLines, addrX, addrY);
        addrY += nameLines.length * 5;
    }
    if (data.customerAddress) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(10);
        // Name / Strasse / "PLZ Ort" — jede Zeile bleibt GANZ (schrumpft statt
        // umzubrechen), damit PLZ und Ort immer auf derselben Zeile stehen.
        addrY = drawAddressBlockLines(doc, data.customerAddress, addrX, addrY, addrW, 10, 4.9);
    }
    // Müşteri e-postası / telefonu bilinçli olarak PDF'e yazılmaz.

    // ── Başlık + kısa kırmızı vurgu + giriş metni ────────────────────────────
    let yTitle = Math.max(addrY, cardY + cardH) + 16;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(16.5);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(`${L.offerTitle} ${data.tenderNumber}`, ML, yTitle);
    doc.setDrawColor(...COLOR_RED);
    doc.setLineWidth(0.8);
    doc.line(ML, yTitle + 2.6, ML + 14, yTitle + 2.6);

    // Ayar notu ÖNCE çizilir: sayfa 1'in altına sabittir; giriş metni taşıp
    // yeni sayfa açarsa not yine kapak sayfasında kalır.
    if (s.footerNote) {
        doc.setFont(FONT, 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(...COLOR_MUTED);
        const note = doc.splitTextToSize(s.footerNote, CONTENT_W);
        doc.text(note, ML, CONTENT_BOTTOM - 4 - note.length * 4);
        doc.setFont(FONT, 'normal');
    }

    yTitle += 12;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXT);

    if (hasRichContent(data.coverLetter)) {
        // Kullanıcının (şablondan gelen) giriş metni — "Sehr geehrte …" dahil
        // metnin kendisidir, bu yüzden kalıp selamlama/giriş cümlesi atlanır.
        drawRichTextFlow(doc, data.coverLetter as string, yTitle);
    } else {
        doc.text(L.greeting, ML, yTitle);
        yTitle += 6.4;
        const introLines = doc.splitTextToSize(L.intro, CONTENT_W);
        doc.text(introLines, ML, yTitle, { lineHeightFactor: 1.35 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 2+ — Tablo başlığı, satırlar (ızgarasız, ferah düzen)
// ─────────────────────────────────────────────────────────────────────────────

interface TableState { y: number; rowIdx: number }

function newTablePage(doc: jsPDF, st: TableState, L: PdfStrings) {
    doc.addPage();
    st.rowIdx = 0;
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, L);
}

function drawTableHeader(doc: jsPDF, y: number, L: PdfStrings): number {
    // Sert lacivert blok yerine hafif tonlu bant — köşeler net (yuvarlatma yok).
    doc.setFillColor(...COLOR_HEAD_BG);
    doc.rect(ML, y, CONTENT_W, HEAD_H, 'F');
    // Bandın altında ince lacivert hat: tablonun başladığını net gösterir.
    doc.setFillColor(...COLOR_NAVY_SOFT);
    doc.rect(ML, y + HEAD_H - 0.35, CONTENT_W, 0.35, 'F');

    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_HEADER);
    doc.setTextColor(...COLOR_NAVY);

    // Başlıklar da sütun genişliğine sığdırılır — hiçbir dilde taşma olmaz.
    const ty = y + HEAD_H / 2 + 1.3;
    fitFontSize(doc, L.colPos, C_DESC - C_POS_X - 1, FS_HEADER, 5.8);
    doc.text(L.colPos, C_POS_X, ty);
    doc.setFontSize(FS_HEADER);
    doc.text(L.colDesc, C_DESC, ty);

    const headCells: Array<[string, number, number]> = [
        [L.colQty, C_QTY_R, W_QTY],
        [L.colUnitPrice, C_UP_R, W_UP],
        [L.colDiscount, C_DISC_R, W_DISC],
        [L.colTax, C_VAT_R, W_VAT],
        [L.colPrice, C_PRICE_R, W_PRICE],
    ];
    for (const [label, rightX, maxW] of headCells) {
        fitFontSize(doc, label, maxW, FS_HEADER, 5.8);
        doc.text(label, rightX, ty, { align: 'right' });
    }
    doc.setFontSize(FS_HEADER);

    return y + HEAD_H + HEAD_GAP;
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
        return { rowType, indent, titleFontSize: FS_TITLE, titleLineHeight: LH_TITLE, titleStyle: 'bold' as const, longFontSize: FS_LONG_DESC };
    }
    if (rowType === 'DESCRIPTION') {
        return { rowType, indent, titleFontSize: FS_BASE, titleLineHeight: LH_BODY, titleStyle: 'normal' as const, longFontSize: FS_LONG_DESC };
    }
    return { rowType, indent, titleFontSize: FS_TITLE, titleLineHeight: LH_TITLE, titleStyle: 'bold' as const, longFontSize: FS_BASE };
}

// ── Satır içeriği "atom" listesi olarak kurulur ───────────────────────────────
// Atomlar hem ölçüm hem çizim için tek kaynak: uzun satırlar sayfa sınırında
// atom (satır/görsel) bazında bölünebilir.
type RowAtom =
    | { kind: 'lines'; lines: string[]; font: 'normal' | 'bold'; size: number; lineH: number; indent: number }
    // Zengin metin paragrafı: kalın/italik/renk KORUNUR, madde imleri desteklenir.
    | { kind: 'rich'; lines: RichVisualLine[]; bullet: boolean; size: number; lineH: number }
    | { kind: 'image'; url: string; alias?: string; h: number }
    | { kind: 'gap'; h: number };

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

/**
 * `dropCatalogCodes` yalnızca BAŞLIK için açıktır: içe aktarılan tekliflerde
 * ürün adının altında tek başına duran katalog kodu satırı temizlenir.
 *
 * Açıklama metninde ASLA satır atılmaz. Bu filtre "büyük harf + rakam, boşluksuz"
 * her satırı kod sanıyordu; stoktan gelen açıklamaların "G4G4", "230V", "IP54"
 * gibi satırları — hatta tamamı böyle olan kısa açıklamalar — bu yüzden PDF'e
 * hiç yazılmıyordu. Editörden gelen zengin metin zaten bu yoldan geçmediği için
 * kayıp sadece stoktan/dışa aktarımdan gelen düz metinde görünüyordu.
 */
function normalizePdfText(text: string, options?: { dropCatalogCodes?: boolean }): string {
    if (looksLikeRichHtml(text)) text = richHtmlToPlainText(text);
    const lines = text
        .replace(/ /g, ' ')
        .replace(/[‐‑‒–—−]/g, '-')
        .replace(/­/g, '')
        .split(/\r?\n/)
        .map((line) => normalizeTrackedLetters(line));
    return (options?.dropCatalogCodes ? lines.filter((line) => !looksLikeCatalogCode(line)) : lines)
        .join('\n')
        .trim();
}

function plainMarkdownLine(line: string): string {
    return line
        .trimStart()
        .replace(/^#{1,2}\s+/, '')
        .replace(/^[-•] /, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/_(.+?)_/g, '$1');
}

/** Markdown-vari uzun açıklamayı stillendirilmiş satır atomlarına çevirir. */
function buildMarkdownAtoms(doc: jsPDF, rawText: string, maxW: number, fontSize: number, lineHeight: number): RowAtom[] {
    const atoms: RowAtom[] = [];
    for (const rawLine of normalizePdfText(rawText).split(/\r?\n/)) {
        if (!rawLine.trim()) { atoms.push({ kind: 'gap', h: lineHeight * 0.5 }); continue; }

        const trimmed = rawLine.trimStart();
        const heading = trimmed.match(/^(#{1,2})\s+(.*)$/);
        const headingLevel = heading ? (heading[1]?.length === 1 ? 1 : 2) : 0;
        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
        const cleaned = heading ? plainMarkdownLine(heading[2] ?? '') : plainMarkdownLine(trimmed);
        const text = `${isBullet ? '• ' : ''}${cleaned}`;
        const size = headingLevel === 1 ? fontSize + 1.4 : headingLevel === 2 ? fontSize + 0.8 : fontSize;
        const lineH = headingLevel > 0 ? lineHeight + 0.5 : lineHeight;

        doc.setFont(FONT, headingLevel > 0 ? 'bold' : 'normal');
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, maxW - (isBullet ? 2 : 0));
        atoms.push({ kind: 'lines', lines, font: headingLevel > 0 ? 'bold' : 'normal', size, lineH, indent: isBullet ? 2 : 0 });
    }
    return atoms;
}

/**
 * Zengin HTML açıklamayı stilli satır atomlarına çevirir: kalın/italik/renk
 * korunur, `<li>` maddeleri imli girintiyle yazılır. Başlıklar (H1–H4) parser
 * tarafından kalın koşuya çevrilir ve GÖVDE puntosunda kalır — başlık ile metin
 * arasında yalnızca satır aralığı vardır (istenen "minimal spacing").
 */
function buildRichAtoms(doc: jsPDF, rawHtml: string, maxW: number, fontSize: number, lineHeight: number): RowAtom[] {
    const atoms: RowAtom[] = [];
    for (const paragraph of parseRichTextParagraphs(rawHtml)) {
        if (paragraph.runs.length === 0) { atoms.push({ kind: 'gap', h: lineHeight * 0.5 }); continue; }
        const runs = paragraph.runs.map((run) => ({
            ...run,
            // PDF fontunda sorun çıkaran karakterler ekran HTML'inden gelebilir.
            text: run.text.replace(/ /g, ' ').replace(/[‐‑‒–—−]/g, '-').replace(/­/g, ''),
        }));
        const indent = paragraph.bullet ? BULLET_INDENT : 0;
        const lines = wrapRichParagraph(doc, runs, maxW - indent, FONT, fontSize);
        atoms.push({ kind: 'rich', lines, bullet: paragraph.bullet, size: fontSize, lineH: lineHeight });
    }
    return atoms;
}

function buildRowAtoms(doc: jsPDF, pos: TenderPdfData['positions'][number]): { atoms: RowAtom[]; descX: number; descW: number } {
    const meta = rowVisualMeta(pos);
    const descX = C_DESC + meta.indent;
    const descW = C_DESC_END - descX;
    const atoms: RowAtom[] = [];

    const { text: titleText } = splitPosLabel(pos.shortDescription || '');
    doc.setFont(FONT, meta.titleStyle);
    doc.setFontSize(meta.titleFontSize);
    const titleLines = doc.splitTextToSize(normalizePdfText(titleText, { dropCatalogCodes: true }), descW);
    atoms.push({ kind: 'lines', lines: titleLines, font: meta.titleStyle, size: meta.titleFontSize, lineH: meta.titleLineHeight, indent: 0 });

    if (pos.longDescription) {
        atoms.push({ kind: 'gap', h: ROW_BLOCK_GAP });
        // Editörden gelen zengin HTML stiliyle çizilir; içe aktarılmış düz /
        // markdown-vari metin eski yalın yoldan geçer.
        if (looksLikeRichHtml(pos.longDescription)) {
            atoms.push(...buildRichAtoms(doc, pos.longDescription, descW, meta.longFontSize, LH_BODY));
        } else {
            atoms.push(...buildMarkdownAtoms(doc, pos.longDescription, descW, meta.longFontSize, LH_BODY));
        }
    }

    // Görsel satırın EN SONUNDA durur: başlık → paragraf → görsel. Üstündeki ve
    // altındaki boşluk, başlık ile paragraf arasındakiyle aynı görünür.
    if (pos.imageUrl) {
        atoms.push({ kind: 'gap', h: IMAGE_TOP_GAP });
        atoms.push({
            kind: 'image',
            url: pos.imageUrl,
            alias: pos.sourceArticleId ? `art-${pos.sourceArticleId}` : undefined,
            h: IMG_SIZE,
        });
        atoms.push({ kind: 'gap', h: IMAGE_BOTTOM_GAP });
    }

    return { atoms, descX, descW };
}

const atomHeight = (a: RowAtom) =>
    (a.kind === 'lines' || a.kind === 'rich' ? a.lines.length * a.lineH : a.h);

function measureRow(doc: jsPDF, pos: TenderPdfData['positions'][number]): number {
    const { atoms } = buildRowAtoms(doc, pos);
    const contentH = atoms.reduce((sum, a) => sum + atomHeight(a), 0);
    // The numeric columns can also run past the first baseline: the unit sits
    // under the quantity, and a discount STACK adds a line per entry. Whichever
    // of the two goes deepest decides how much room the numerics need.
    const unitDrop = (pos.quantity || 0) > 0 && pos.unit ? UNIT_GAP : 0;
    const discountDrop = Math.max(0, discountColumnLines(pos).length - 1) * DISC_LINE_H;
    const numericsH = FIRST_BASELINE - 2 + Math.max(unitDrop, discountDrop);
    return Math.max(ROW_MIN_H, Math.max(contentH, numericsH) + ROW_PAD * 2);
}

/**
 * Metni sütununa sığdırır: gerekiyorsa punto kademeli küçültülür. Böylece
 * uzun tutarlar (ör. "CHF 123.456,78") komşu sütuna taşamaz.
 */
function fitFontSize(doc: jsPDF, text: string, maxW: number, base: number, min = 6.4): number {
    let size = base;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > maxW) {
        size -= 0.2;
        doc.setFontSize(size);
    }
    return size;
}

/** Sağa hizalı, sütun genişliğine sığdırılmış sayısal hücre. */
function drawFittedRight(
    doc: jsPDF,
    text: string,
    rightX: number,
    maxW: number,
    baseY: number,
    style: 'normal' | 'bold',
    base = FS_BASE
) {
    doc.setFont(FONT, style);
    fitFontSize(doc, text, maxW, base);
    doc.text(text, rightX, baseY, { align: 'right' });
    doc.setFontSize(FS_BASE);
}

/** Pos numarası dar sütuna sığdırılarak yazılır (açıklamaya taşmaz). */
function drawPosLabel(doc: jsPDF, label: string, baseY: number, isParent: boolean) {
    if (!label) return;
    doc.setFont(FONT, isParent ? 'bold' : 'normal');
    fitFontSize(doc, label, C_DESC - C_POS_X - 1, FS_POS, 5.8);
    if (isParent) doc.setTextColor(...COLOR_NAVY);
    else doc.setTextColor(...COLOR_TEXT);
    doc.text(label, C_POS_X, baseY, { baseline: 'alphabetic' });
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
}

// Sayısal sütunların kullanılabilir genişlikleri (komşuya 2 mm nefes payı).
const W_QTY = C_QTY_R - C_DESC_END - 2;
const W_UP = C_UP_R - C_QTY_R - 2;
const W_DISC = C_DISC_R - C_UP_R - 2;
const W_VAT = C_VAT_R - C_DISC_R - 2;
const W_PRICE = C_PRICE_R - C_VAT_R - 2;

// Yığılmış iskontolar İndirim sütununda ALT ALTA yazılır; satırlar arası boşluk.
const DISC_LINE_H = 4.0;

/**
 * İndirim sütununun içeriği: satırda iskonto yığını varsa her iskonto AYRI BİR
 * SATIR olarak (ör. "12%", "16%"), yoksa tek bir birleşik yüzde. Birleşik yüzde
 * (ör. %26,1) yığın varken YAZILMAZ — okuyucunun gördüğü, gerçekten pazarlık
 * edilen oranlardır.
 *
 * Sabit tutarlı iskontolar para birimi ön eki olmadan yazılır: 13 mm'lik sütun
 * "CHF 300.00" taşımaz, "300,00" ise rahat sığar ve yüzdelerden ayırt edilir.
 */
function discountColumnLines(pos: TenderPdfData['positions'][number]): string[] {
    const stacked = (pos.discounts ?? []).filter((entry) => (entry?.amount ?? 0) > 0);
    if (stacked.length > 0) {
        return stacked.map((entry) => (entry.kind === 'AMOUNT'
            ? fmtUnitPrice(entry.amount)
            : fmtDiscount(entry.percent ?? 0)));
    }
    const discount = pos.discount ?? 0;
    return discount > 0 ? [fmtDiscount(discount)] : [];
}

/** Sayısal sütunlar — yalnızca kendi tutarı olan satırlarda çizilir. */
function drawNumerics(doc: jsPDF, pos: TenderPdfData['positions'][number], baseY: number, fmt: (v: number) => string) {
    const qty = pos.quantity || 0;
    const unit = pos.unit || '';
    const unitPrice = pos.unitPrice ?? 0;
    const discount = pos.discount ?? 0;
    const taxRate = pos.taxRate ?? 0;
    const fallbackLineTotal = qty * unitPrice * (1 - discount / 100) * (1 + (taxRate || 8.1) / 100);
    const hasOwnAmount = (pos.lineTotal ?? 0) > 0 || (qty > 0 && unitPrice > 0);
    const total = pos.lineTotal ?? (!pos.isParent ? (pos.total ?? fallbackLineTotal) : 0);
    if (!hasOwnAmount) return;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);

    if (qty > 0) {
        drawFittedRight(doc, fmtQty(qty), C_QTY_R, W_QTY, baseY, 'normal');
        if (unit) {
            doc.setTextColor(...COLOR_LABEL);
            drawFittedRight(doc, unit, C_QTY_R, W_QTY, baseY + UNIT_GAP, 'normal', FS_BASE - 0.4);
            doc.setTextColor(...COLOR_TEXT);
        }
    } else {
        drawFittedRight(doc, '—', C_QTY_R, W_QTY, baseY, 'normal');
    }

    drawFittedRight(doc, unitPrice > 0 ? fmtUnitPrice(unitPrice) : '—', C_UP_R, W_UP, baseY, 'normal');
    discountColumnLines(pos).forEach((line, index) => {
        drawFittedRight(doc, line, C_DISC_R, W_DISC, baseY + index * DISC_LINE_H, 'normal');
    });
    doc.setTextColor(...COLOR_LABEL);
    drawFittedRight(doc, fmtVatRate(taxRate || 8.1), C_VAT_R, W_VAT, baseY, 'normal');
    doc.setTextColor(...COLOR_TEXT);
    if (total > 0) {
        drawFittedRight(doc, fmt(total), C_PRICE_R, W_PRICE, baseY, 'bold');
        doc.setFont(FONT, 'normal');
    }
}

function drawAtomLines(doc: jsPDF, atom: Extract<RowAtom, { kind: 'lines' }>, x: number, startBaseY: number): number {
    doc.setFont(FONT, atom.font);
    doc.setFontSize(atom.size);
    doc.setTextColor(...COLOR_TEXT);
    let cy = startBaseY;
    for (const line of atom.lines) {
        doc.text(line, x + atom.indent, cy);
        cy += atom.lineH;
    }
    return cy;
}

/** Zengin metin atomunun TEK görsel satırını çizer (stil koşu koşu uygulanır). */
function drawRichAtomLine(
    doc: jsPDF,
    atom: Extract<RowAtom, { kind: 'rich' }>,
    lineIdx: number,
    x: number,
    baseY: number,
) {
    doc.setFontSize(atom.size);
    if (atom.bullet && lineIdx === 0) {
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...COLOR_TEXT);
        doc.text('•', x, baseY);
    }
    let cursorX = x + (atom.bullet ? BULLET_INDENT : 0);
    for (const { run, text } of atom.lines[lineIdx] ?? []) {
        doc.setFont(FONT, fontStyleOf(run));
        const [r, g, b] = run.color ?? COLOR_TEXT;
        doc.setTextColor(r, g, b);
        doc.text(text, cursorX, baseY);
        cursorX += doc.getTextWidth(text);
    }
    doc.setTextColor(...COLOR_TEXT);
}

function drawRowHairline(doc: jsPDF, y: number) {
    doc.setDrawColor(...COLOR_HAIRLINE);
    doc.setLineWidth(0.15);
    doc.line(ML, y, MR, y);
}

/** Sayfaya sığan satır: hafif zebra zemin + tek parça çizim. */
function drawRowAtomic(
    doc: jsPDF,
    pos: TenderPdfData['positions'][number],
    y: number,
    rowH: number,
    fmt: (v: number) => string,
    rowIdx: number
): number {
    if (rowIdx % 2 === 1) {
        doc.setFillColor(...COLOR_ZEBRA);
        doc.rect(ML, y, CONTENT_W, rowH, 'F');
    }

    const { atoms, descX } = buildRowAtoms(doc, pos);
    const { pos: posLabel } = splitPosLabel(pos.shortDescription || '');
    const baseY = y + FIRST_BASELINE;

    drawPosLabel(doc, posLabel, baseY, Boolean(pos.isParent));

    let cy = baseY;
    for (const atom of atoms) {
        if (atom.kind === 'gap') { cy += atom.h; continue; }
        if (atom.kind === 'image') {
            try {
                doc.addImage(atom.url, detectImageFormat(atom.url) as any, descX, cy, IMG_SIZE, IMG_SIZE, atom.alias, 'NONE');
            } catch { /* bozuk görsel satırı düşürmesin */ }
            cy += atom.h;
            continue;
        }
        if (atom.kind === 'rich') {
            for (let i = 0; i < atom.lines.length; i++) {
                drawRichAtomLine(doc, atom, i, descX, cy);
                cy += atom.lineH;
            }
            continue;
        }
        cy = drawAtomLines(doc, atom, descX, cy);
    }

    drawNumerics(doc, pos, baseY, fmt);
    drawRowHairline(doc, y + rowH);
    return y + rowH;
}

/**
 * Sayfaya sığmayan uzun satır: bir üst sayfaya itilmek yerine kaldığı yerden
 * satır satır akar; sayfa dolunca yeni sayfada tablo başlığıyla devam eder.
 * İçerik hiçbir koşulda CONTENT_BOTTOM sınırını (alt bilgi bölgesini) geçmez.
 */
function drawRowFlowing(
    doc: jsPDF,
    pos: TenderPdfData['positions'][number],
    fmt: (v: number) => string,
    L: PdfStrings,
    st: TableState
) {
    const { atoms, descX } = buildRowAtoms(doc, pos);
    const { pos: posLabel } = splitPosLabel(pos.shortDescription || '');

    let baseY = st.y + FIRST_BASELINE;
    const breakPage = () => {
        newTablePage(doc, st, L);
        baseY = st.y + FIRST_BASELINE;
        return baseY;
    };

    drawPosLabel(doc, posLabel, baseY, Boolean(pos.isParent));
    drawNumerics(doc, pos, baseY, fmt);

    let cy = baseY;
    for (const atom of atoms) {
        if (atom.kind === 'gap') { cy += atom.h; continue; }
        if (atom.kind === 'image') {
            if (cy - 3 + atom.h > CONTENT_BOTTOM) cy = breakPage();
            try {
                doc.addImage(atom.url, detectImageFormat(atom.url) as any, descX, cy, IMG_SIZE, IMG_SIZE, atom.alias, 'NONE');
            } catch { /* bozuk görsel satırı düşürmesin */ }
            cy += atom.h;
            continue;
        }
        if (atom.kind === 'rich') {
            for (let i = 0; i < atom.lines.length; i++) {
                if (cy > CONTENT_BOTTOM - 1.5) cy = breakPage();
                drawRichAtomLine(doc, atom, i, descX, cy);
                cy += atom.lineH;
            }
            continue;
        }
        doc.setFont(FONT, atom.font);
        doc.setFontSize(atom.size);
        doc.setTextColor(...COLOR_TEXT);
        for (const line of atom.lines) {
            if (cy > CONTENT_BOTTOM - 1.5) {
                cy = breakPage();
                // Sayfa kırılınca font durumu tablo başlığından kalır — geri yükle.
                doc.setFont(FONT, atom.font);
                doc.setFontSize(atom.size);
                doc.setTextColor(...COLOR_TEXT);
            }
            doc.text(line, descX + atom.indent, cy);
            cy += atom.lineH;
        }
    }

    st.y = Math.min(cy + ROW_PAD - 3, CONTENT_BOTTOM);
    drawRowHairline(doc, st.y);
    st.rowIdx++;
}

function drawSectionSubtotal(
    doc: jsPDF,
    y: number,
    total: number,
    fmt: (v: number) => string,
    L: PdfStrings
): number {
    const h = 9;
    doc.setFillColor(...COLOR_BAND_BG);
    doc.rect(ML, y + 0.5, CONTENT_W, h - 1, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(L.subtotal, C_VAT_R, y + 5.6, { align: 'right' });
    doc.text(fmt(total), C_PRICE_R, y + 5.6, { align: 'right' });
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLOR_TEXT);
    return y + h;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPLAMLAR — sağa yaslı, ince ayraçlı blok; genel toplam yumuşak bantta
// ─────────────────────────────────────────────────────────────────────────────

function drawTotals(
    doc: jsPDF,
    y: number,
    data: TenderPdfData,
    s: PdfCompanySettings,
    fmt: (v: number) => string,
    L: PdfStrings
) {
    const p = data.totals ?? null;
    const net = p ? p.netTotal : (s.vatRate > 0 ? data.grandTotal / (1 + s.vatRate / 100) : data.grandTotal);
    const vat = p ? p.vatTotal : data.grandTotal - net;
    const grand = p ? p.grossTotal : data.grandTotal;
    const discounts = (p?.discounts ?? []).filter((entry) => (entry?.amount ?? 0) > 0);
    const subtotal = p?.subtotal ?? net;

    const blockX = 116;
    const labelX = blockX + 4;
    const valueX = C_PRICE_R;

    // Etiket kullanıcının yazdığı iskonto adı olabilir (80 karaktere kadar), bu
    // yüzden tutarın soluna kalan boşluğa sığdırılır: önce punto küçültülür,
    // hâlâ taşıyorsa kırpılır. Aksi hâlde ad tutarın üstüne biner.
    const totalRow = (label: string, value: string) => {
        doc.setDrawColor(...COLOR_HAIRLINE);
        doc.setLineWidth(0.15);
        doc.line(blockX, y, MR, y);
        y += 5.4;
        doc.setFont(FONT, 'bold');
        doc.setFontSize(FS_BASE);
        const labelMaxW = Math.max(14, valueX - doc.getTextWidth(value) - labelX - 3);
        doc.setFont(FONT, 'normal');
        fitFontSize(doc, label, labelMaxW, FS_BASE, 6.4);
        let text = label;
        if (doc.getTextWidth(text) > labelMaxW) {
            const lines = doc.splitTextToSize(text, labelMaxW) as string[];
            text = `${(lines[0] ?? text).trim()}…`;
        }
        doc.setTextColor(...COLOR_LABEL);
        doc.text(text, labelX, y);
        doc.setFontSize(FS_BASE);
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...COLOR_TEXT);
        doc.text(value, valueX, y, { align: 'right' });
        y += 2.8;
    };

    // İskontolar KDV'DEN ÖNCE, her biri KENDİ ADIYLA ve uygulandıkları sırayla
    // listelenir; her satır bir öncekinin bıraktığı tutar üzerinden hesaplanmıştır.
    // Hiç iskonto yoksa blok eskisi gibi net + KDV olarak kalır.
    if (discounts.length > 0) {
        totalRow(L.subtotal, fmt(subtotal));
        discounts.forEach((entry) => {
            const name = (entry.name || '').trim() || L.discount;
            const label = (entry.percent ?? 0) > 0 ? `${name} ${fmtDiscount(entry.percent!)}` : name;
            totalRow(label, `− ${fmt(entry.amount)}`);
        });
        // Birleşik iskonto ("Gesamtrabatt %X − CHF Y") özet satırı BİLİNÇLİ OLARAK
        // yazılmaz: her iskonto zaten kendi satırında, kendi adıyla listeleniyor;
        // toplamı ayrıca yazmak aynı indirimi iki kez veriyormuş gibi okunuyordu.
    }
    totalRow(L.net, fmt(net));
    totalRow(`${L.vat} ${fmtVatRate(s.vatRate)}`, fmt(vat));

    // Genel toplam: sert blok yerine yumuşak tonlu bant + lacivert vurgu.
    // Bant, ekrandaki büyütülmüş toplam satırıyla uyumlu olsun diye eskisinden
    // daha yüksek ve daha büyük puntolu.
    y += 1;
    const bandH = 12;
    doc.setFillColor(...COLOR_HEAD_BG);
    doc.rect(blockX, y, MR - blockX, bandH, 'F');
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(blockX, y, 1.2, bandH, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(L.grandTotal, labelX, y + bandH / 2 + 1.8);
    doc.text(fmt(grand), valueX, y + bandH / 2 + 1.8, { align: 'right' });
    y += bandH;

    y += 10;
    const terms = s.paymentTerms ? `${L.paymentTerms}: ${s.paymentTerms}` : '';
    if (terms && y < CONTENT_BOTTOM - 4) {
        doc.setFont(FONT, 'italic');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_MUTED);
        const lines = doc.splitTextToSize(terms, CONTENT_W - 10);
        doc.text(lines, ML, y);
        doc.setFont(FONT, 'normal');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// QR Fatura (Swiss QR-Bill) — klasik şablonla birebir; antet/alt bilgi almaz
// ─────────────────────────────────────────────────────────────────────────────

async function appendQrBillPage(doc: jsPDF, data: TenderPdfData, s: PdfCompanySettings, L: PdfStrings) {
    doc.addPage();

    const yTop = PAGE_H - 105;

    doc.setDrawColor(180, 180, 180);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(0, yTop, PAGE_W, yTop);
    doc.line(62, yTop, 62, PAGE_H);
    doc.setLineDashPattern([], 0);

    const amount = data.grandTotal;
    // İsviçre QR faturası yalnızca CHF/EUR için geçerlidir; diğer para
    // birimlerinde QR kısmı CHF'ye düşer ki kod taranabilir kalsın.
    const qrCurrency: 'CHF' | 'EUR' = s.currency === 'EUR' ? 'EUR' : 'CHF';
    const payload = buildQrBillPayload({
        iban: s.iban,
        creditorName: s.companyName,
        creditorAddressLine1: s.addressLine1,
        creditorAddressLine2: s.addressLine2,
        creditorPostalCode: s.postalCode,
        creditorCity: s.city,
        creditorCountry: s.country,
        amount,
        currency: qrCurrency,
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
        doc.text(`${s.addressLine1} ${s.addressLine2}`.replace(/\s+/g, ' ').trim(), x, yy + 10.5);
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
    doc.text(qrCurrency, 67, yTop + 74);
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
