/**
 * ── SATIN ALMA SİPARİŞİ PDF ŞABLONU ─────────────────────────────────────────
 * `tenderPdfModern.ts`'in sipariş uyarlaması. Antet (logo + dalga + iletişim),
 * alt bilgi bandı, kapak bilgi kartı ve tablo dili teklif şablonuyla birebirdir;
 * içerik farkları:
 *  - Alıcı blok müşteri değil TEDARİKÇİdir; bilgi kartı sipariş no / tarih /
 *    sipariş adı / tedarikçi satırlarını taşır.
 *  - Giriş metni "sipariş detayları" ifadesidir; kapak sayfasının ALT KISMI
 *    BOŞ bırakılır (footerNote yazılmaz — kullanıcı isteği).
 *  - Satırlar düz listedir (hiyerarşi / ara toplam / görsel / QR fatura yok);
 *    kolonlar sipariş tablosuyla (OrderSheet kalem tablosu) aynıdır: Pos,
 *    Açıklama (seri no ikinci satırda), Seri Kod, Miktar, Brüt Fiyat, Net Fiyat,
 *    İndirim, KDV, Tutar. Seri kod / brüt fiyat / indirim / KDV kolonları
 *    YALNIZCA siparişte gerçekten varsa çizilir — yoksa açıklama sütunu o
 *    genişliği kullanır.
 *  - Satırda üç indirim olabilir; hepsi TEK sütunda ALT ALTA yazılır (10% /
 *    5% …) — bileşik oran gösterilmez (kullanıcı isteği).
 *  - Genel toplam en altta bantta gösterilir; KDV ya da ek ücret varsa
 *    net → ek ücretler → KDV → toplam dökümü eklenir.
 *  - EK ÜCRETLER (nakliye, ambalaj…) kalem değildir: toplam bloğunda adıyla ve
 *    tutarıyla tek tek listelenir ve genel toplama net olarak girer.
 */
import { jsPDF } from 'jspdf';
import { fitAddressBlock } from './addressBlock';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { PurchaseOrderRow } from '../../types/inventory';

import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import arialItalicUrl from '../../assets/fonts/ARIALI.ttf?url';
import offitecLogoUrl from '../../assets/images/offitec.png?url';
import headerWaveUrl from '../../assets/images/header-wave.svg?url';

export type OrderPdfLang = 'tr' | 'de' | 'en';

interface OrderPdfStrings {
    docTitle: string;
    orderNumber: string;
    orderDate: string;
    orderedBy: string;
    quoteNumber: string;
    project: string;
    supplier: string;
    greeting: string;
    intro: string;
    colPos: string;
    colDesc: string;
    colCode: string;
    colQty: string;
    colGrossPrice: string;
    colNetPrice: string;
    colPrice: string;
    colDiscount: string;
    colVat: string;
    gross: string;
    discount: string;
    netSubtotal: string;
    vat: string;
    grandTotal: string;
    vatIdLabel: string;
    pageWord: string;
    pageOf: string;
    serialShort: string;
}

const I18N: Record<OrderPdfLang, OrderPdfStrings> = {
    tr: {
        docTitle: 'Sipariş',
        // Sipariş numarasının etiketi tüm dillerde Almanca "Auftrag" kalır
        // (kullanıcı isteği) — numara BE-{yıl}-{sıra} biçimindedir.
        orderNumber: 'Auftrag',
        orderDate: 'Sipariş Tarihi',
        orderedBy: 'Sipariş veren',
        quoteNumber: 'Teklif No',
        project: 'Proje',
        supplier: 'Tedarikçi',
        greeting: 'Sayın Yetkili,',
        intro: 'Sipariş detaylarımızı aşağıda bilgilerinize sunarız. Pozisyonların ayrıntılı dökümünü ilerleyen sayfalarda bulabilirsiniz. Teslimat ve teyit için bu e-postaya yanıt verebilirsiniz.',
        colPos: 'Pos',
        colDesc: 'Ürün / Malzeme',
        colCode: 'Seri Kod',
        colQty: 'Miktar',
        colGrossPrice: 'Brüt Fiyat',
        colNetPrice: 'Net Fiyat',
        colPrice: 'Tutar',
        colDiscount: 'İndirim',
        colVat: 'KDV',
        gross: 'Brüt Tutar',
        discount: 'İndirim',
        netSubtotal: 'Ara Toplam (Net)',
        vat: 'KDV',
        grandTotal: 'TOPLAM',
        vatIdLabel: 'Vergi No',
        pageWord: 'Sayfa',
        pageOf: '/',
        serialShort: 'Seri No',
    },
    de: {
        docTitle: 'Bestellung',
        orderNumber: 'Auftrag',
        orderDate: 'Bestelldatum',
        orderedBy: 'Besteller',
        quoteNumber: 'Angebots-Nr.',
        project: 'Projekt',
        supplier: 'Lieferant',
        greeting: 'Sehr geehrte Damen und Herren',
        intro: 'Hiermit erhalten Sie die Details unserer Bestellung. Eine detaillierte Aufstellung der Positionen finden Sie auf den folgenden Seiten. Für Terminbestätigung und Rückfragen können Sie auf diese Nachricht antworten.',
        colPos: 'Pos',
        colDesc: 'Produkt / Material',
        colCode: 'Seriencode',
        colQty: 'Menge',
        colGrossPrice: 'Bruttopreis',
        colNetPrice: 'Nettopreis',
        colPrice: 'Betrag',
        colDiscount: 'Rabatt',
        colVat: 'MwSt',
        gross: 'Bruttobetrag',
        discount: 'Rabatt',
        netSubtotal: 'Zwischensumme (Netto)',
        vat: 'MwSt',
        grandTotal: 'GESAMT',
        vatIdLabel: 'MwSt-Nr.',
        pageWord: 'Seite',
        pageOf: 'von',
        serialShort: 'Serien-Nr.',
    },
    en: {
        docTitle: 'Purchase Order',
        orderNumber: 'Auftrag',
        orderDate: 'Order Date',
        orderedBy: 'Ordered by',
        quoteNumber: 'Quote No.',
        project: 'Project',
        supplier: 'Supplier',
        greeting: 'Dear Sir or Madam,',
        intro: 'Please find the details of our order below. A detailed breakdown of the positions can be found on the following pages. You may reply to this message for confirmation and delivery questions.',
        colPos: 'Pos',
        colDesc: 'Product / Material',
        colCode: 'Serial Code',
        colQty: 'Quantity',
        colGrossPrice: 'Gross Price',
        colNetPrice: 'Net Price',
        colPrice: 'Amount',
        colDiscount: 'Discount',
        colVat: 'VAT',
        gross: 'Gross Amount',
        discount: 'Discount',
        netSubtotal: 'Subtotal (Net)',
        vat: 'VAT',
        grandTotal: 'TOTAL',
        vatIdLabel: 'VAT No.',
        pageWord: 'Page',
        pageOf: 'of',
        serialShort: 'Serial No.',
    },
};

// ── Sayfa geometrisi (A4, mm) — teklif şablonuyla birebir ────────────────────
const ML = 14;
const MR = 196;
const CONTENT_W = MR - ML;

const LOGO_X = ML;
const LOGO_Y = 10;
const LOGO_H = 14;
const LOGO_MAX_W = 50;

const CONTENT_TOP_FIRST = 44;
const CONTENT_TOP_REST = 38;
const CONTENT_BOTTOM = 266;

// Tablo hizalama noktaları. Pos/açıklama sabit; kalan sütunlar SAĞDAN SOLA
// sabit genişliklerle yerleşir, böylece çizilmeyen bir sütunun (seri kod, brüt
// fiyat, indirim, KDV) genişliği açıklama sütununa kalır.
const C_POS_X = ML + 1.5;
const C_DESC = 25;
const C_PRICE_R = MR - 1;

// Sütun genişlikleri: hepsi çizildiğinde açıklama sütununa ~40 mm kalır
// (uzun ürün adları satır sarar), tipik siparişte (brüt/kod var, KDV yok) ~52 mm.
const COL_W_PRICE = 26;
const COL_W_VAT = 12;
const COL_W_DISC = 14;
const COL_W_NET = 19;
const COL_W_GROSS = 19;
const COL_W_QTY = 16;
const COL_W_CODE = 22;

interface TableLayout {
    descEnd: number;
    /** Seri kod sütununun SOL kenarı (sola yaslı metin); null → çizilmez. */
    codeX: number | null;
    qtyR: number;
    /** null → sütun çizilmez. */
    grossR: number | null;
    netR: number;
    discR: number | null;
    vatR: number | null;
    priceR: number;
    wCode: number;
    wQty: number;
    wGross: number;
    wNet: number;
    wDisc: number;
    wVat: number;
    wPrice: number;
}

/** Komşuya 2 mm nefes payı bırakılır (metin sığdırma genişlikleri). */
const GAP = 2;

const buildTableLayout = (
    hasCode: boolean,
    hasGross: boolean,
    hasDiscount: boolean,
    hasVat: boolean
): TableLayout => {
    // `right` = o an yerleştirilen sütunun sağ kenarı; sağdan sola ilerler.
    let right = C_PRICE_R - COL_W_PRICE;
    const vatR = hasVat ? right : null;
    if (hasVat) right -= COL_W_VAT;
    const discR = hasDiscount ? right : null;
    if (hasDiscount) right -= COL_W_DISC;
    const netR = right;
    right -= COL_W_NET;
    const grossR = hasGross ? right : null;
    if (hasGross) right -= COL_W_GROSS;
    const qtyR = right;
    right -= COL_W_QTY;
    const codeX = hasCode ? right - COL_W_CODE : null;
    return {
        descEnd: (codeX ?? right) - GAP,
        codeX,
        qtyR,
        grossR,
        netR,
        discR,
        vatR,
        priceR: C_PRICE_R,
        wCode: COL_W_CODE - GAP,
        wQty: COL_W_QTY - GAP,
        wGross: COL_W_GROSS - GAP,
        wNet: COL_W_NET - GAP,
        wDisc: COL_W_DISC - GAP,
        wVat: COL_W_VAT - GAP,
        wPrice: COL_W_PRICE - GAP,
    };
};

/** Siparişte hiç seri kod / brüt fiyat / indirim / KDV var mı. */
const orderHasCode = (order: PurchaseOrderRow): boolean =>
    order.items.some((item) => Boolean((item.code || '').trim()));
const orderHasGross = (order: PurchaseOrderRow): boolean =>
    order.items.some((item) => (item.grossPrice || 0) > 0);
const orderHasDiscount = (order: PurchaseOrderRow): boolean =>
    order.items.some((item) => (item.discount || 0) > 0 || (item.discount2 || 0) > 0 || (item.discount3 || 0) > 0);
const orderHasVat = (order: PurchaseOrderRow): boolean =>
    order.items.some((item) => (item.vatRate || 0) > 0);

/**
 * İndirim sütununun satırları: girilmiş her yüzde (indirim / indirim 2 / 3)
 * ALT ALTA yazılır — yüzdeler sırayla uygulandığı için tek bir bileşik oran
 * yerine dökümün kendisi gösterilir (kullanıcı isteği).
 */
const discountLines = (item: PurchaseOrderRow['items'][number]): string[] =>
    [item.discount, item.discount2, item.discount3]
        .filter((value) => (value || 0) > 0)
        .map((value) => fmtPercent(value || 0));

const HEAD_H = 9;
const HEAD_GAP = 2;
const ROW_PAD = 3;
const FIRST_BASELINE = 5.8;
const ROW_MIN_H = 11;
const MIN_ROW_START = 16;

const FS_BASE = 9;
const FS_TITLE = 10;
const FS_POS = 8.2;
const FS_HEADER = 8.4;
const LH_TITLE = 4.7;
const LH_BODY = 4.4;
const UNIT_GAP = 4.2;
/** İndirim sütununda alt alta yazılan yüzdelerin satır aralığı. */
const DISC_LH = 4.2;

const COLOR_TEXT = [30, 32, 40] as const;
const COLOR_MUTED = [120, 126, 140] as const;
const COLOR_LABEL = [88, 95, 114] as const;
const COLOR_NAVY = [31, 42, 84] as const;
const COLOR_RED = [211, 32, 38] as const;
const COLOR_NAVY_SOFT = [104, 116, 158] as const;
const COLOR_HAIRLINE = [226, 229, 237] as const;
const COLOR_HEAD_BG = [238, 241, 247] as const;
const COLOR_ZEBRA = [249, 250, 252] as const;
const COLOR_CARD_BG = [248, 249, 252] as const;
const COLOR_CARD_BORDER = [226, 230, 238] as const;

const CONTACT_PHONE = '+41 56 556 24 68';
const CONTACT_EMAIL = 'info@offitec.ch';
const CONTACT_WEB = 'www.offitec.ch';
const FOOTER_BIC = 'RAIFCH22XXX';
const FOOTER_VAT = 'CHE-201.098.592';
const FOOTER_IBAN = 'CH50 8080 8005 5315 3585 1';

// ── Fontlar / logo / dalga (teklif şablonundaki yükleyicilerle aynı) ─────────
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

const WAVE_W = 146;
const WAVE_H = 28;
const WAVE_CENTER_Y = LOGO_Y + LOGO_H / 2 - 3;
const WAVE_RASTER_DPI = 400;
const WAVE_VIEW = '0 0 1460 280';

let wavePngCache: { key: string; dataUrl: string } | null = null;

async function loadHeaderWave(wMm: number, hMm: number): Promise<string | null> {
    const key = `${wMm.toFixed(2)}x${hMm.toFixed(2)}`;
    if (wavePngCache?.key === key) return wavePngCache.dataUrl;
    try {
        const pxW = Math.round((wMm / 25.4) * WAVE_RASTER_DPI);
        const pxH = Math.round((hMm / 25.4) * WAVE_RASTER_DPI);
        const svgText = await fetch(headerWaveUrl).then((r) => r.text());
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

// ── Biçimleyiciler ───────────────────────────────────────────────────────────
const fmtMoneyForCurrency = (currency: string) => (v: number) =>
    `${currency} ${new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(v || 0)}`;

const fmtUnitPrice = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v || 0);

const fmtQty = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

const fmtPercent = (v: number) =>
    `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(v || 0)}%`;

const fmtDateShort = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// ANA GİRİŞ NOKTALARI
// ─────────────────────────────────────────────────────────────────────────────

export async function buildOrderPdfBytes(
    order: PurchaseOrderRow,
    settings: PdfCompanySettings,
    lang: OrderPdfLang = 'de'
): Promise<Uint8Array> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const logo = await loadLogo(doc);
    const wave = await loadHeaderWave(WAVE_W, WAVE_H);
    const fmt = fmtMoneyForCurrency(order.currency || settings.currency);
    const L = I18N[lang];

    // ── SAYFA 1: Kapak (alt kısmı bilinçli olarak boş bırakılır) ─────────────
    drawCoverPage(doc, order, settings, L);

    // ── SAYFA 2+: Sipariş satırları ──────────────────────────────────────────
    // Kolon düzeni siparişin kendisine göre kurulur: seri kod / brüt fiyat /
    // indirim / KDV yoksa o sütunlar hiç çizilmez.
    const layout = buildTableLayout(
        orderHasCode(order),
        orderHasGross(order),
        orderHasDiscount(order),
        orderHasVat(order)
    );
    doc.addPage();
    const st: TableState = { y: 0, rowIdx: 0 };
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, L, layout);

    order.items.forEach((item, index) => {
        const h = measureRow(doc, item, L, layout);
        if (st.y + h > CONTENT_BOTTOM || CONTENT_BOTTOM - st.y < MIN_ROW_START) {
            newTablePage(doc, st, L, layout);
        }
        st.y = drawRow(doc, item, index, st.y, Math.min(h, CONTENT_BOTTOM - st.y), fmt, st.rowIdx, L, layout);
        st.rowIdx++;
    });

    // ── Toplamlar (en altta) ─────────────────────────────────────────────────
    const hasGrossRow = (order.totalGross || 0) > (order.totalNet || 0) + 0.005;
    const hasVatRow = (order.totalVat || 0) > 0.005;
    // Ek ücretler (nakliye, ambalaj…): her biri toplam bloğunda kendi satırını
    // alır, bu yüzden blok yüksekliğine de girer.
    const fees = (order.additionalFees ?? []).filter((fee) => (fee?.name || '').trim() || fee?.amount);
    const totalsBlockHeight = 24 + (hasGrossRow ? 16 : 0) + (hasVatRow ? 16 : 0) + fees.length * 8.2;
    let y = st.y;
    if (y + totalsBlockHeight > CONTENT_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST + 4;
    } else {
        y += 9;
    }
    drawTotals(doc, y, order, fmt, L, hasGrossRow, hasVatRow, fees);

    // ── Antet & alt bilgi dekorasyonu (tüm sayfalar) ─────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawPageHeader(doc, logo, wave, settings);
        drawPageFooter(doc, i, pageCount, L);
    }

    return new Uint8Array(doc.output('arraybuffer'));
}

export async function exportOrderPdf(
    order: PurchaseOrderRow,
    settings: PdfCompanySettings,
    lang: OrderPdfLang = 'de'
): Promise<void> {
    const bytes = await buildOrderPdfBytes(order, settings, lang);
    downloadPdf(bytes, `${order.referenceNumber}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTET & ALT BİLGİ — teklif şablonuyla birebir
// ─────────────────────────────────────────────────────────────────────────────

type ContactIcon = 'phone' | 'mail' | 'web';

function drawContactIcon(doc: jsPDF, kind: ContactIcon, x: number, top: number, s: number) {
    doc.setDrawColor(...COLOR_NAVY);
    doc.setFillColor(...COLOR_NAVY);
    doc.setLineWidth(0.26);
    if (kind === 'phone') {
        const w = s * 0.62;
        const bx = x + (s - w) / 2;
        doc.roundedRect(bx, top, w, s, 0.35, 0.35, 'F');
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

    drawHeaderWave(doc, wave);

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
        x += (widths[i] ?? 0) + ITEM_GAP;
    });
}

function drawPageFooter(doc: jsPDF, page: number, total: number, L: OrderPdfStrings) {
    const textY = 274.5;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_NAVY);
    const details = `BIC: ${FOOTER_BIC}     ${L.vatIdLabel}: ${FOOTER_VAT}     IBAN: ${FOOTER_IBAN}`;
    doc.text(details, ML, textY);

    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_NAVY_SOFT);
    doc.text(`${L.pageWord} ${page} ${L.pageOf} ${total}`, MR, textY, { align: 'right' });

    drawHairline(doc, 278.5, COLOR_NAVY, 0.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 1 — Kapak: bilgi kartı (sol) + gönderici satırı & tedarikçi (sağ)
// ─────────────────────────────────────────────────────────────────────────────

function drawCoverPage(doc: jsPDF, order: PurchaseOrderRow, s: PdfCompanySettings, L: OrderPdfStrings) {
    const y0 = CONTENT_TOP_FIRST;

    // ── Sol: sipariş bilgi kartı ─────────────────────────────────────────────
    // Değerler etiketin sağında, sağa yaslı tek satırdır ve sütuna sığacak
    // şekilde küçültülür. Proje adı uzun olabildiği için `wrap` ile işaretlenir:
    // punto düşürülür ve gerekirse 2 satıra sarılır — kart yüksekliği ona göre
    // büyür, metin asla karttan taşmaz.
    const cardX = ML;
    const cardW = 88;
    const rowH = 8.8;
    const valueX = cardX + cardW - 4;

    interface CardRow { label: string; value: string; emphasize?: boolean; wrap?: boolean }
    const rows: CardRow[] = ([
        { label: L.orderNumber, value: order.referenceNumber, emphasize: true },
        { label: L.orderedBy, value: order.orderedByName || '' },
        { label: L.orderDate, value: fmtDateShort(order.createdAt) },
        { label: L.quoteNumber, value: order.quoteNumber || '' },
        { label: L.project, value: order.projectName || '', wrap: true },
        { label: L.supplier, value: order.supplierName },
    ] as CardRow[]).filter((row) => row.value.trim().length > 0);

    // Ölçüm: sarılan satırlar için önce satır yüksekliklerini hesapla.
    const LABEL_W = 26;                     // etiket sütunu
    const VALUE_W = cardW - LABEL_W - 8.5;  // değerin kullanabileceği genişlik
    const WRAP_SIZE = 7.6;
    const WRAP_LH = 3.6;
    const measured = rows.map((row) => {
        if (!row.wrap) return { row, lines: [row.value], height: rowH, size: 0 };
        doc.setFont(FONT, 'bold');
        doc.setFontSize(WRAP_SIZE);
        const lines = (doc.splitTextToSize(row.value, VALUE_W) as string[]).slice(0, 2);
        return {
            row,
            lines,
            height: Math.max(rowH, lines.length * WRAP_LH + 5),
            size: WRAP_SIZE,
        };
    });

    const cardY = y0 - 4;
    const cardH = measured.reduce((sum, entry) => sum + entry.height, 0) + 4;

    doc.setFillColor(...COLOR_CARD_BG);
    doc.setDrawColor(...COLOR_CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(cardX, cardY, cardW, cardH, 'FD');

    doc.setFillColor(...COLOR_RED);
    doc.rect(cardX, cardY, 1.2, cardH * 0.32, 'F');
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(cardX, cardY + cardH * 0.32, 1.2, cardH * 0.44, 'F');
    doc.setFillColor(...COLOR_NAVY_SOFT);
    doc.rect(cardX, cardY + cardH * 0.76, 1.2, cardH * 0.24, 'F');

    let ry = cardY + 2;
    measured.forEach((entry, idx) => {
        const { row, lines, height } = entry;
        const base = ry + rowH / 2 + 1.5;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_LABEL);
        doc.text(row.label, cardX + 4.5, base);

        doc.setFont(FONT, 'bold');
        if (row.emphasize) doc.setTextColor(...COLOR_NAVY);
        else doc.setTextColor(...COLOR_TEXT);
        if (row.wrap) {
            doc.setFontSize(WRAP_SIZE);
            lines.forEach((line, lineIdx) => {
                doc.text(line, valueX, base + lineIdx * WRAP_LH, { align: 'right' });
            });
        } else {
            const size = row.emphasize ? 10.2 : 9.4;
            doc.setFontSize(size);
            // Uzun değerler kartı taşırmasın diye sütuna sığdırılır.
            fitFontSize(doc, row.value, VALUE_W, size, 6.4);
            doc.text(row.value, valueX, base, { align: 'right' });
        }

        ry += height;
        if (idx < measured.length - 1) {
            doc.setDrawColor(...COLOR_HAIRLINE);
            doc.setLineWidth(0.15);
            doc.line(cardX + 4.5, ry + 0.4, cardX + cardW - 4, ry + 0.4);
        }
    });

    // ── Sağ: tek satır gönderici + tedarikçi (alıcı) bloğu ───────────────────
    const addrX = 112;
    const addrW = MR - addrX;
    const sender = `${s.companyName} - ${s.addressLine1} ${s.addressLine2}, ${s.postalCode} ${s.city}`
        .replace(/\s+/g, ' ')
        .trim();
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(sender, addrX, y0);
    doc.setDrawColor(...COLOR_HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(addrX, y0 + 1.6, MR, y0 + 1.6);

    let addrY = y0 + 8;
    doc.setTextColor(...COLOR_TEXT);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10.5);
    const nameLines = doc.splitTextToSize(order.supplierName, addrW);
    doc.text(nameLines, addrX, addrY);
    addrY += nameLines.length * 5;
    // Tedarikçi adresi (snapshot) — firma adının hemen altında, mektup bloğu gibi.
    // Snapshot bileşenlerden kurulmuş EN FAZLA 2 satırdır; burada yalnızca blok
    // genişliğine sığdırılır ve taşarsa 3. satıra izin verilir.
    if (order.supplierAddress) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(10);
        const addressLines = fitAddressBlock(doc, order.supplierAddress, addrW);
        doc.text(addressLines, addrX, addrY);
        addrY += addressLines.length * 4.9;
    }
    if (order.supplierEmail) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(10);
        doc.text(order.supplierEmail, addrX, addrY);
        addrY += 4.9;
    }

    // ── Başlık + kısa kırmızı vurgu + resmî hitap + giriş metni ──────────────
    let yTitle = Math.max(addrY, cardY + cardH) + 16;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(16.5);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(`${L.docTitle} ${order.referenceNumber}`, ML, yTitle);
    doc.setDrawColor(...COLOR_RED);
    doc.setLineWidth(0.8);
    doc.line(ML, yTitle + 2.6, ML + 14, yTitle + 2.6);

    yTitle += 12;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(L.greeting, ML, yTitle);
    yTitle += 6.4;

    const introLines = doc.splitTextToSize(L.intro, CONTENT_W);
    doc.text(introLines, ML, yTitle, { lineHeightFactor: 1.35 });

    // Kapak sayfasının alt kısmı bilinçli olarak boş bırakılır (kullanıcı isteği):
    // teklifteki footerNote bloğu burada YOKTUR.
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 2+ — Tablo başlığı & düz satırlar
// ─────────────────────────────────────────────────────────────────────────────

interface TableState { y: number; rowIdx: number }

function newTablePage(doc: jsPDF, st: TableState, L: OrderPdfStrings, layout: TableLayout) {
    doc.addPage();
    st.rowIdx = 0;
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, L, layout);
}

function drawTableHeader(doc: jsPDF, y: number, L: OrderPdfStrings, layout: TableLayout): number {
    doc.setFillColor(...COLOR_HEAD_BG);
    doc.rect(ML, y, CONTENT_W, HEAD_H, 'F');
    doc.setFillColor(...COLOR_NAVY_SOFT);
    doc.rect(ML, y + HEAD_H - 0.35, CONTENT_W, 0.35, 'F');

    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_HEADER);
    doc.setTextColor(...COLOR_NAVY);

    const ty = y + HEAD_H / 2 + 1.3;
    fitFontSize(doc, L.colPos, C_DESC - C_POS_X - 1, FS_HEADER, 5.8);
    doc.text(L.colPos, C_POS_X, ty);
    doc.setFontSize(FS_HEADER);
    fitFontSize(doc, L.colDesc, layout.descEnd - C_DESC, FS_HEADER, 5.8);
    doc.text(L.colDesc, C_DESC, ty);
    // Seri kod başlığı — sütunun kendisi gibi SOLA yaslıdır.
    if (layout.codeX !== null) {
        fitFontSize(doc, L.colCode, layout.wCode, FS_HEADER, 5.8);
        doc.text(L.colCode, layout.codeX, ty);
    }

    const headCells: Array<[string, number, number]> = [
        [L.colQty, layout.qtyR, layout.wQty],
        ...(layout.grossR !== null ? [[L.colGrossPrice, layout.grossR, layout.wGross] as [string, number, number]] : []),
        [L.colNetPrice, layout.netR, layout.wNet],
        ...(layout.discR !== null ? [[L.colDiscount, layout.discR, layout.wDisc] as [string, number, number]] : []),
        ...(layout.vatR !== null ? [[L.colVat, layout.vatR, layout.wVat] as [string, number, number]] : []),
        [L.colPrice, layout.priceR, layout.wPrice],
    ];
    for (const [label, rightX, maxW] of headCells) {
        fitFontSize(doc, label, maxW, FS_HEADER, 5.8);
        doc.text(label, rightX, ty, { align: 'right' });
    }
    doc.setFontSize(FS_HEADER);

    return y + HEAD_H + HEAD_GAP;
}

function fitFontSize(doc: jsPDF, text: string, maxW: number, base: number, min = 6.4): number {
    let size = base;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > maxW) {
        size -= 0.2;
        doc.setFontSize(size);
    }
    return size;
}

/**
 * Metni verilen genişliğe SIĞDIRIR: taşarsa sonundan kırpıp "…" ekler. Punto
 * küçültmek yerine kırpılır, çünkü toplam bloğundaki etiketler aynı puntoda
 * hizalı durmalıdır.
 */
function clampText(doc: jsPDF, text: string, maxW: number, size: number): string {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(size);
    const value = (text || '').trim();
    if (doc.getTextWidth(value) <= maxW) return value;
    let out = value;
    while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxW) out = out.slice(0, -1);
    return `${out}…`;
}

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

type OrderItem = PurchaseOrderRow['items'][number];

/**
 * Açıklama hücresi: ürün adı (kalın) + seri no ikinci satırda (soluk). Seri KOD
 * ve indirim dökümü artık kendi sütunlarında durur (kod sütunu / alt alta
 * yazılan indirim yüzdeleri).
 */
function buildRowLines(doc: jsPDF, item: OrderItem, L: OrderPdfStrings, layout: TableLayout): { title: string[]; meta: string[] } {
    const descW = layout.descEnd - C_DESC;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_TITLE);
    const title = doc.splitTextToSize((item.name || '').trim(), descW) as string[];

    const metaParts = [
        item.serialNumber ? `${L.serialShort}: ${item.serialNumber}` : '',
    ].filter(Boolean);
    let meta: string[] = [];
    if (metaParts.length) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_BASE - 0.4);
        meta = doc.splitTextToSize(metaParts.join('  ·  '), descW) as string[];
    }
    return { title, meta };
}

function measureRow(doc: jsPDF, item: OrderItem, L: OrderPdfStrings, layout: TableLayout): number {
    const { title, meta } = buildRowLines(doc, item, L, layout);
    const contentH = title.length * LH_TITLE + (meta.length ? meta.length * LH_BODY + 1 : 0);
    // Sayısal sütunların yüksekliği: miktarın altındaki birim satırı ve indirim
    // sütununda ALT ALTA yazılan yüzdeler (en fazla üç) satırı büyütebilir.
    const stackedDiscounts = layout.discR === null ? 0 : Math.max(0, discountLines(item).length - 1);
    const numericsH = FIRST_BASELINE - 2
        + Math.max(item.unit ? UNIT_GAP : 0, stackedDiscounts * DISC_LH);
    return Math.max(ROW_MIN_H, Math.max(contentH, numericsH) + ROW_PAD * 2);
}

function drawRow(
    doc: jsPDF,
    item: OrderItem,
    index: number,
    y: number,
    rowH: number,
    fmt: (v: number) => string,
    rowIdx: number,
    L: OrderPdfStrings,
    layout: TableLayout
): number {
    if (rowIdx % 2 === 1) {
        doc.setFillColor(...COLOR_ZEBRA);
        doc.rect(ML, y, CONTENT_W, rowH, 'F');
    }

    const { title, meta } = buildRowLines(doc, item, L, layout);
    const baseY = y + FIRST_BASELINE;

    // Pos numarası: düz sıra numarası (1, 2, 3…).
    doc.setFont(FONT, 'normal');
    fitFontSize(doc, String(index + 1), C_DESC - C_POS_X - 1, FS_POS, 5.8);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(String(index + 1), C_POS_X, baseY);
    doc.setFontSize(FS_BASE);

    let cy = baseY;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_TITLE);
    doc.setTextColor(...COLOR_TEXT);
    for (const line of title) {
        doc.text(line, C_DESC, cy);
        cy += LH_TITLE;
    }
    if (meta.length) {
        cy += 1;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_BASE - 0.4);
        doc.setTextColor(...COLOR_LABEL);
        for (const line of meta) {
            doc.text(line, C_DESC, cy);
            cy += LH_BODY;
        }
        doc.setTextColor(...COLOR_TEXT);
    }

    // Seri kod sütunu (sola yaslı, soluk) — ekrandaki sipariş tablosuyla aynı.
    if (layout.codeX !== null) {
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...COLOR_LABEL);
        fitFontSize(doc, item.code || '—', layout.wCode, FS_BASE - 0.4);
        doc.text(item.code || '—', layout.codeX, baseY);
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_TEXT);
    }

    // Sayısal sütunlar: miktar (+birim), brüt fiyat, net fiyat, indirim(ler),
    // KDV, tutar. Tutar İNDİRİMLİ NET satır tutarıdır (`lineTotal`).
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    drawFittedRight(doc, fmtQty(item.quantity || 0), layout.qtyR, layout.wQty, baseY, 'normal');
    if (item.unit) {
        doc.setTextColor(...COLOR_LABEL);
        drawFittedRight(doc, item.unit, layout.qtyR, layout.wQty, baseY + UNIT_GAP, 'normal', FS_BASE - 0.4);
        doc.setTextColor(...COLOR_TEXT);
    }
    if (layout.grossR !== null) {
        drawFittedRight(doc, (item.grossPrice || 0) > 0 ? fmtUnitPrice(item.grossPrice) : '—', layout.grossR, layout.wGross, baseY, 'normal');
    }
    drawFittedRight(doc, (item.netPrice || 0) > 0 ? fmtUnitPrice(item.netPrice) : '—', layout.netR, layout.wNet, baseY, 'normal');
    // İndirim, İndirim 2 ve İndirim 3 aynı sütunda ALT ALTA yazılır.
    const discR = layout.discR;
    if (discR !== null) {
        const discounts = discountLines(item);
        if (!discounts.length) {
            drawFittedRight(doc, '—', discR, layout.wDisc, baseY, 'normal');
        } else {
            discounts.forEach((line, lineIdx) => {
                drawFittedRight(doc, line, discR, layout.wDisc, baseY + lineIdx * DISC_LH, 'normal');
            });
        }
    }
    if (layout.vatR !== null) {
        drawFittedRight(doc, fmtPercent(item.vatRate || 0), layout.vatR, layout.wVat, baseY, 'normal');
    }
    drawFittedRight(doc, fmt(item.lineTotal || 0), layout.priceR, layout.wPrice, baseY, 'bold');
    doc.setFont(FONT, 'normal');

    doc.setDrawColor(...COLOR_HAIRLINE);
    doc.setLineWidth(0.15);
    doc.line(ML, y + rowH, MR, y + rowH);
    return y + rowH;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPLAMLAR — sağa yaslı blok; genel toplam yumuşak bantta (en altta)
// ─────────────────────────────────────────────────────────────────────────────

function drawTotals(
    doc: jsPDF,
    y: number,
    order: PurchaseOrderRow,
    fmt: (v: number) => string,
    L: OrderPdfStrings,
    hasGrossRow: boolean,
    hasVatRow: boolean,
    fees: Array<{ name: string; amount: number }>
) {
    const blockX = 116;
    const labelX = blockX + 4;
    const valueX = C_PRICE_R;

    const totalRow = (label: string, value: string) => {
        doc.setDrawColor(...COLOR_HAIRLINE);
        doc.setLineWidth(0.15);
        doc.line(blockX, y, MR, y);
        y += 5.4;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_LABEL);
        doc.text(label, labelX, y);
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...COLOR_TEXT);
        doc.text(value, valueX, y, { align: 'right' });
        y += 2.8;
    };

    // Brüt/net farkı varsa indirim dökümünü göster.
    if (hasGrossRow) {
        totalRow(L.gross, fmt(order.totalGross));
        totalRow(L.discount, `− ${fmt(Math.max(0, order.totalGross - order.totalNet))}`);
    }
    // KDV ya da ek ücret varsa net ara toplam yazılır; hiçbiri yoksa şablon
    // eskisi gibi net tutarı doğrudan genel toplam olarak gösterir.
    const feesTotal = Math.round(fees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0) * 100) / 100;
    if (hasVatRow || fees.length) {
        totalRow(L.netSubtotal, fmt(order.totalNet));
    }
    // Ek ücretler: her biri kendi adıyla, net ara toplamın hemen altında.
    // Uzun ad etiket alanına sığdırılır (tutar sütunu asla ezilmez).
    for (const fee of fees) {
        const label = clampText(doc, fee.name, valueX - labelX - 26, FS_BASE);
        totalRow(label, fmt(Number(fee.amount) || 0));
    }
    if (hasVatRow) {
        totalRow(L.vat, fmt(order.totalVat || 0));
    }
    const grandTotal = order.totalNet + feesTotal + (hasVatRow ? (order.totalVat || 0) : 0);

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
    doc.text(fmt(grandTotal), valueX, y + bandH / 2 + 1.8, { align: 'right' });
}

// ─────────────────────────────────────────────────────────────────────────────

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
