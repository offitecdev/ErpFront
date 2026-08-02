/**
 * ── FİYAT TALEBİ (PREISANFRAGE) PDF ŞABLONU ─────────────────────────────────
 * `orderPdf.ts`'in fiyatsız uyarlaması — fiyat talebi aşamasındaki siparişler
 * (DRAFT / PRICE_REQUEST / AWAITING_CONFIRMATION) için AYRI belge (kullanıcı
 * isteği 2026-08-01). Antet (logo + dalga + iletişim) ve alt bilgi bandı sipariş
 * şablonuyla birebirdir; içerik farkları:
 *  - Belge başlığı "Preisanfrage"dir; tabloda FİYAT SÜTUNU YOKTUR — yalnızca
 *    Pos, Açıklama (seri no ikinci satırda), Seri Kod, Miktar. Toplam bloğu da
 *    yoktur (fiyatlar tedarikçiden İSTENMEKTEDİR).
 *  - Alıcı adresi TEKLİFTEKİ 3 SATIRLI biçimdedir (kullanıcı isteği):
 *        Hofackerstrasse 75
 *        PLZ: 4132
 *        Stadt: Muttenz
 *    Snapshot 2 satırlıdır ("sokak" / "PLZ Şehir"); son satır PLZ + şehir
 *    olarak ayrıştırılıp etiketli iki satıra açılır.
 *  - Gönderici TEK SATIRDIR ("OffiTec Heating & Cooling, Cores Tower -
 *    Hohenrainstrasse 24, 4133 Pratteln") ve kapak KARTI teklif belgesindeki dar
 *    tablodur (78 mm): … / Projekt / EMPFÄNGER / Lieferant. Alıcı adı kartta
 *    durur, adres bloğunda değil; DURUM SATIRI YOKTUR (kullanıcı isteği).
 *    Sipariş şablonuyla birebir aynı — ikisi birlikte güncellenmelidir.
 */
import { jsPDF } from 'jspdf';
import { companySenderLine, drawFittedSingleLine } from './addressBlock';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { PurchaseOrderRow } from '../../types/inventory';

import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import arialItalicUrl from '../../assets/fonts/ARIALI.ttf?url';
import offitecLogoUrl from '../../assets/images/offitec.png?url';
import headerWaveUrl from '../../assets/images/header-wave.svg?url';

export type PriceRequestPdfLang = 'tr' | 'de' | 'en';

interface PriceRequestPdfStrings {
    docTitle: string;
    requestNumber: string;
    requestDate: string;
    orderedBy: string;
    project: string;
    supplier: string;
    greeting: string;
    intro: string;
    colPos: string;
    colDesc: string;
    colCode: string;
    colQty: string;
    plzLabel: string;
    cityLabel: string;
    vatIdLabel: string;
    pageWord: string;
    pageOf: string;
    serialShort: string;
    /** Kapak kartındaki ALICI ADI satırının etiketi (Empfänger). */
    recipient: string;
}

const I18N: Record<PriceRequestPdfLang, PriceRequestPdfStrings> = {
    tr: {
        docTitle: 'Fiyat Talebi',
        // Numaranın etiketi DİLE GÖRE ÇEVRİLİR (sipariş şablonuyla aynı karar,
        // 2026-08-02) — numara AU-{yıl}-{sıra} biçimindedir.
        requestNumber: 'Sipariş No',
        requestDate: 'Talep Tarihi',
        orderedBy: 'Talep eden',
        project: 'Proje',
        supplier: 'Tedarikçi',
        greeting: 'Sayın Yetkili,',
        intro: 'Aşağıda listelenen pozisyonlar için güncel fiyat ve teslim süresi bilgilerinizi rica ederiz. Teklifinizi bu e-postayı yanıtlayarak iletebilirsiniz.',
        colPos: 'Pos',
        colDesc: 'Ürün / Malzeme',
        colCode: 'Seri Kod',
        colQty: 'Miktar',
        plzLabel: 'PLZ',
        cityLabel: 'Şehir',
        vatIdLabel: 'Vergi No',
        pageWord: 'Sayfa',
        pageOf: '/',
        serialShort: 'Seri No',
        recipient: 'Alıcı',
    },
    de: {
        docTitle: 'Preisanfrage',
        requestNumber: 'Auftrag',
        requestDate: 'Anfragedatum',
        orderedBy: 'Besteller',
        project: 'Projekt',
        supplier: 'Lieferant',
        greeting: 'Sehr geehrte Damen und Herren',
        intro: 'Für die unten aufgeführten Positionen bitten wir um Ihre aktuellen Preise und Lieferzeiten. Ihr Angebot können Sie uns als Antwort auf diese Nachricht zukommen lassen.',
        colPos: 'Pos',
        colDesc: 'Produkt / Material',
        colCode: 'Seriencode',
        colQty: 'Menge',
        plzLabel: 'PLZ',
        cityLabel: 'Stadt',
        vatIdLabel: 'MwSt-Nr.',
        pageWord: 'Seite',
        pageOf: 'von',
        serialShort: 'Serien-Nr.',
        recipient: 'Empfänger',
    },
    en: {
        docTitle: 'Price Request',
        requestNumber: 'Order no.',
        requestDate: 'Request Date',
        orderedBy: 'Requested by',
        project: 'Project',
        supplier: 'Supplier',
        greeting: 'Dear Sir or Madam,',
        intro: 'We kindly ask you for your current prices and delivery times for the positions listed below. You may send us your quotation by replying to this message.',
        colPos: 'Pos',
        colDesc: 'Product / Material',
        colCode: 'Serial Code',
        colQty: 'Quantity',
        plzLabel: 'ZIP',
        cityLabel: 'City',
        vatIdLabel: 'VAT No.',
        pageWord: 'Page',
        pageOf: 'of',
        serialShort: 'Serial No.',
        recipient: 'Recipient',
    },
};

// ── Sayfa geometrisi (A4, mm) — sipariş şablonuyla birebir ──────────────────
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
/** Ön yazı satır sınırı — sipariş şablonuyla aynı (kapak sayfası taşmasın). */
const COVER_LETTER_MAX_LINES = 20;

// Fiyatsız tablo: Pos | Açıklama | Seri Kod | Miktar. Kod sütunu yalnızca
// siparişte gerçekten kod varsa çizilir; genişliği açıklamaya kalır.
const C_POS_X = ML + 1.5;
const C_DESC = 25;
const C_QTY_R = MR - 1;
const COL_W_QTY = 20;
const COL_W_CODE = 30;
const GAP = 2;

interface TableLayout {
    descEnd: number;
    codeX: number | null;
    qtyR: number;
    wCode: number;
    wQty: number;
}

const buildTableLayout = (hasCode: boolean): TableLayout => {
    let right = C_QTY_R - COL_W_QTY;
    const codeX = hasCode ? right - COL_W_CODE : null;
    if (hasCode) right -= COL_W_CODE;
    return {
        descEnd: right - GAP,
        codeX,
        qtyR: C_QTY_R,
        wCode: COL_W_CODE - GAP,
        wQty: COL_W_QTY - GAP,
    };
};

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

// ── Fontlar / logo / dalga (sipariş şablonundaki yükleyicilerle aynı) ────────
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
const fmtQty = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

const fmtDateShort = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

/**
 * Tedarikçi adres snapshot'ı ("sokak" \n "PLZ Şehir[, eyalet, ülke]") →
 * teklifteki 3 satırlı biçim: sokak satır(lar)ı + "PLZ: 4132" + "Stadt: Muttenz".
 * Son satırın ilk kelimesi rakam içeriyorsa PLZ kabul edilir; ayrıştırılamayan
 * adres olduğu gibi (etiketsiz) yazılır.
 */
const splitRecipientAddress = (snapshot: string): { streetLines: string[]; plz: string; city: string } => {
    const lines = String(snapshot || '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return { streetLines: [], plz: '', city: '' };
    const last = lines[lines.length - 1];
    const match = /^(\S{2,10})\s+(.+)$/.exec(last);
    if (match && /\d/.test(match[1])) {
        // Eyalet/ülke ekleri şehirle aynı satırda kalır ("Muttenz, BL, Schweiz").
        return { streetLines: lines.slice(0, -1), plz: match[1], city: match[2] };
    }
    return { streetLines: lines, plz: '', city: '' };
};

// ─────────────────────────────────────────────────────────────────────────────
// ANA GİRİŞ NOKTALARI
// ─────────────────────────────────────────────────────────────────────────────

export async function buildPriceRequestPdfBytes(
    order: PurchaseOrderRow,
    settings: PdfCompanySettings,
    lang: PriceRequestPdfLang = 'de'
): Promise<Uint8Array> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const logo = await loadLogo(doc);
    const wave = await loadHeaderWave(WAVE_W, WAVE_H);
    const L = I18N[lang];

    // ── SAYFA 1: Kapak ───────────────────────────────────────────────────────
    drawCoverPage(doc, order, settings, L);

    // ── SAYFA 2+: Pozisyonlar (fiyatsız) ─────────────────────────────────────
    const layout = buildTableLayout(order.items.some((item) => Boolean((item.code || '').trim())));
    doc.addPage();
    const st: TableState = { y: 0, rowIdx: 0 };
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, L, layout);

    order.items.forEach((item, index) => {
        const h = measureRow(doc, item, L, layout);
        if (st.y + h > CONTENT_BOTTOM || CONTENT_BOTTOM - st.y < MIN_ROW_START) {
            newTablePage(doc, st, L, layout);
        }
        st.y = drawRow(doc, item, index, st.y, Math.min(h, CONTENT_BOTTOM - st.y), st.rowIdx, L, layout);
        st.rowIdx++;
    });

    // Toplam bloğu YOKTUR — fiyatlar tedarikçiden istenmektedir.

    // ── Antet & alt bilgi dekorasyonu (tüm sayfalar) ─────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawPageHeader(doc, logo, wave, settings);
        drawPageFooter(doc, i, pageCount, L);
    }

    return new Uint8Array(doc.output('arraybuffer'));
}

export async function exportPriceRequestPdf(
    order: PurchaseOrderRow,
    settings: PdfCompanySettings,
    lang: PriceRequestPdfLang = 'de'
): Promise<void> {
    const bytes = await buildPriceRequestPdfBytes(order, settings, lang);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Preisanfrage-${order.referenceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTET & ALT BİLGİ — sipariş şablonuyla birebir
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

function drawPageFooter(doc: jsPDF, page: number, total: number, L: PriceRequestPdfStrings) {
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
// SAYFA 1 — Kapak: bilgi kartı (sol) + 2 satırlı gönderici & 3 satırlı alıcı (sağ)
// ─────────────────────────────────────────────────────────────────────────────

function drawCoverPage(doc: jsPDF, order: PurchaseOrderRow, s: PdfCompanySettings, L: PriceRequestPdfStrings) {
    const y0 = CONTENT_TOP_FIRST;

    // ── Sol: talep bilgi kartı (tedarikçi adı kartta — kullanıcı isteği) ─────
    const cardX = ML;
    // TEKLİF PDF'İYLE AYNI DAR TABLO (kullanıcı isteği 2026-08-02, son tur) —
    // `tenderPdfModern` ve `orderPdf` ile birebir: 78 mm, 5.6 mm satır, 7 pt
    // etiket. Satırlar sarılmaz; sığmayan değer küçülür. Üçü birlikte değişir.
    const cardW = 78;
    const rowH = 5.6;

    // Kartta ADRES YOKTUR: adlar tek satır olarak girer.
    const oneLine = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

    // ALICI ADI (Empfänger) kartta; DURUM SATIRI YOKTUR (sipariş şablonuyla aynı
    // karar — kullanıcı isteği 2026-08-02).
    const rows: Array<[string, string, boolean]> = ([
        [L.requestNumber, order.referenceNumber, true],
        [L.orderedBy, oneLine(order.orderedByName || ''), false],
        [L.requestDate, fmtDateShort(order.createdAt), false],
        [L.project, oneLine(order.projectName || ''), false],
        [L.recipient, oneLine(order.recipientName || ''), false],
        [L.supplier, oneLine(order.supplierName), false],
    ] as Array<[string, string, boolean]>).filter(([, value]) => value.trim().length > 0);

    const cardY = y0 - 4;
    const cardH = rows.length * rowH + 2.4;

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

    let ry = cardY + 1.2;
    rows.forEach(([label, value, emphasize], idx) => {
        const base = ry + rowH / 2 + 1.15;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_LABEL);
        doc.text(label, cardX + 3.5, base);
        doc.setFont(FONT, 'bold');
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

    // ── Sağ: TEK SATIR gönderici + tedarikçi (alıcı) adres bloğu ─────────────
    const addrX = 112;
    const addrW = MR - addrX;
    // GÖNDERİCİ TEK SATIRDIR (kullanıcı isteği 2026-08-02, son tur — arada üç
    // satıra bölünmüştü, geri alındı): "OffiTec Heating & Cooling, Cores Tower -
    // Hohenrainstrasse 24, 4133 Pratteln". Sipariş şablonuyla aynı.
    const sender = companySenderLine(s);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLOR_MUTED);
    drawFittedSingleLine(doc, sender, addrX, y0, addrW, 7.5, 5.8);
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
    // ALICI ADI BURADA DEĞİL KARTTA durur (sipariş şablonuyla aynı karar):
    // sağ blok yalnızca firma adı + adrestir.
    // Alıcı adresi TEKLİFTEKİ biçimde 3 satırdır: sokak / "PLZ: 4132" /
    // "Stadt: Muttenz" (kullanıcı isteği — snapshot'taki son satır ayrıştırılır).
    if (order.supplierAddress) {
        const { streetLines, plz, city } = splitRecipientAddress(order.supplierAddress);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(10);
        for (const line of streetLines) {
            drawFittedSingleLine(doc, line, addrX, addrY, addrW, 10, 7.5);
            addrY += 4.9;
        }
        if (plz) {
            drawFittedSingleLine(doc, `${L.plzLabel}: ${plz}`, addrX, addrY, addrW, 10, 7.5);
            addrY += 4.9;
        }
        if (city) {
            drawFittedSingleLine(doc, `${L.cityLabel}: ${city}`, addrX, addrY, addrW, 10, 7.5);
            addrY += 4.9;
        }
    }
    // Alıcı bloğunda E-POSTA YOKTUR (sipariş şablonuyla aynı karar, 2026-08-02):
    // firma adının altında yalnızca adres durur.

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
    // ÖN YAZI (Anschreiben) — sipariş şablonuyla birebir aynı kural: siparişe
    // yazılmış metin varsa hitap + giriş metninin yerine o basılır, boşsa
    // buradaki standart metin.
    const coverLetter = (order.coverLetter || '').trim();
    if (coverLetter) {
        const coverLines = coverLetter
            .split('\n')
            .flatMap((line) => (line.trim() ? (doc.splitTextToSize(line, CONTENT_W) as string[]) : ['']))
            .slice(0, COVER_LETTER_MAX_LINES);
        doc.text(coverLines, ML, yTitle, { lineHeightFactor: 1.35 });
    } else {
        doc.text(L.greeting, ML, yTitle);
        yTitle += 6.4;
        const introLines = doc.splitTextToSize(L.intro, CONTENT_W);
        doc.text(introLines, ML, yTitle, { lineHeightFactor: 1.35 });
    }

    // Kapak sayfasının alt kısmı sipariş şablonundaki gibi boş bırakılır.
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 2+ — Tablo başlığı & fiyatsız satırlar
// ─────────────────────────────────────────────────────────────────────────────

interface TableState { y: number; rowIdx: number }

function newTablePage(doc: jsPDF, st: TableState, L: PriceRequestPdfStrings, layout: TableLayout) {
    doc.addPage();
    st.rowIdx = 0;
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, L, layout);
}

function drawTableHeader(doc: jsPDF, y: number, L: PriceRequestPdfStrings, layout: TableLayout): number {
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
    if (layout.codeX !== null) {
        fitFontSize(doc, L.colCode, layout.wCode, FS_HEADER, 5.8);
        doc.text(L.colCode, layout.codeX, ty);
    }
    fitFontSize(doc, L.colQty, layout.wQty, FS_HEADER, 5.8);
    doc.text(L.colQty, layout.qtyR, ty, { align: 'right' });
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

/** Açıklama hücresi: ürün adı (kalın) + seri no ikinci satırda (soluk). */
function buildRowLines(doc: jsPDF, item: OrderItem, L: PriceRequestPdfStrings, layout: TableLayout): { title: string[]; meta: string[] } {
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

function measureRow(doc: jsPDF, item: OrderItem, L: PriceRequestPdfStrings, layout: TableLayout): number {
    const { title, meta } = buildRowLines(doc, item, L, layout);
    const contentH = title.length * LH_TITLE + (meta.length ? meta.length * LH_BODY + 1 : 0);
    const numericsH = FIRST_BASELINE - 2 + (item.unit ? UNIT_GAP : 0);
    return Math.max(ROW_MIN_H, Math.max(contentH, numericsH) + ROW_PAD * 2);
}

function drawRow(
    doc: jsPDF,
    item: OrderItem,
    index: number,
    y: number,
    rowH: number,
    rowIdx: number,
    L: PriceRequestPdfStrings,
    layout: TableLayout
): number {
    if (rowIdx % 2 === 1) {
        doc.setFillColor(...COLOR_ZEBRA);
        doc.rect(ML, y, CONTENT_W, rowH, 'F');
    }

    const { title, meta } = buildRowLines(doc, item, L, layout);
    const baseY = y + FIRST_BASELINE;

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

    if (layout.codeX !== null) {
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...COLOR_LABEL);
        fitFontSize(doc, item.code || '—', layout.wCode, FS_BASE - 0.4);
        doc.text(item.code || '—', layout.codeX, baseY);
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_TEXT);
    }

    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    drawFittedRight(doc, fmtQty(item.quantity || 0), layout.qtyR, layout.wQty, baseY, 'bold');
    if (item.unit) {
        doc.setTextColor(...COLOR_LABEL);
        drawFittedRight(doc, item.unit, layout.qtyR, layout.wQty, baseY + UNIT_GAP, 'normal', FS_BASE - 0.4);
        doc.setTextColor(...COLOR_TEXT);
    }
    doc.setFont(FONT, 'normal');

    doc.setDrawColor(...COLOR_HAIRLINE);
    doc.setLineWidth(0.15);
    doc.line(ML, y + rowH, MR, y + rowH);
    return y + rowH;
}
