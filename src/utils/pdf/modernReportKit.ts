/**
 * ── MODERN RAPOR PDF KİTİ ────────────────────────────────────────────────────
 * Saha raporu (Montage-Rapport), genel rapor (Gesamtrapport) ve teslim raporu
 * (Schlussrapport) üreticilerinin PAYLAŞTIĞI tasarım dili. `tenderPdfModern.ts`
 * ile aynı görsel kimliği taşır:
 *  - Antet (logo + dalga şeridi + iletişim satırı) ve alt bilgi (BIC / MwSt /
 *    IBAN bandı) kod ile çizilir — sablon.pdf arka plan birleştirmesi YOKTUR.
 *  - Ferah tablolar: dikey ızgara yok, yumuşak başlık bandı, ince ayraçlar ve
 *    çok hafif zebra tonlaması.
 *  - Bölüm başlıklarında ALT ÇİZGİ YOKTUR (kırmızı vurgu yalnızca belge
 *    başlığındadır — kullanıcı isteği).
 *  - İmza kartı YALNIZCA müşteri içindir; kenarlıklıdır ama iç zemini BEYAZDIR
 *    (kullanıcı isteği).
 * Üç üretici de buradan beslenir; tasarım değişiklikleri TEK yerden yapılır.
 */
import { jsPDF } from 'jspdf';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { FixedTranslator } from '../../i18n/reportLanguage';
import { companySenderLine, drawFittedSingleLine } from './addressBlock';

import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import arialItalicUrl from '../../assets/fonts/ARIALI.ttf?url';
import offitecLogoUrl from '../../assets/images/offitec.png?url';
import headerWaveUrl from '../../assets/images/header-wave.svg?url';

// ── Sayfa geometrisi (A4, mm) — tenderPdfModern ile birebir ──────────────────
export const ML = 14;
export const MR = 196;
export const CONTENT_W = MR - ML;

const LOGO_X = ML;
const LOGO_Y = 10;
const LOGO_H = 14;
const LOGO_MAX_W = 50;

export const CONTENT_TOP_FIRST = 44;
export const CONTENT_TOP_REST = 38;
// Alt bilgi bandı 272.5 mm'de başlar; içerik ASLA bu sınırı geçemez.
export const CONTENT_BOTTOM = 266;

export const FS_BASE = 9;
export const FS_HEADER = 8.4;
export const LH_BODY = 4.4;

// ── Renk paleti ──────────────────────────────────────────────────────────────
export const COLOR_TEXT = [30, 32, 40] as const;
export const COLOR_MUTED = [120, 126, 140] as const;
export const COLOR_LABEL = [88, 95, 114] as const;
export const COLOR_NAVY = [31, 42, 84] as const;
export const COLOR_RED = [211, 32, 38] as const;
export const COLOR_NAVY_SOFT = [104, 116, 158] as const;
export const COLOR_HAIRLINE = [226, 229, 237] as const;
export const COLOR_HEAD_BG = [238, 241, 247] as const;
export const COLOR_ZEBRA = [249, 250, 252] as const;
export const COLOR_BAND_BG = [244, 246, 250] as const;
export const COLOR_CARD_BG = [248, 249, 252] as const;
export const COLOR_CARD_BORDER = [226, 230, 238] as const;

// ── Marka sabitleri (antet & alt bilgi) — tender/order PDF'leriyle aynı ──────
const CONTACT_PHONE = '+41 56 556 24 68';
const CONTACT_EMAIL = 'info@offitec.ch';
const CONTACT_WEB = 'www.offitec.ch';
const FOOTER_BIC = 'RAIFCH22XXX';
const FOOTER_VAT = 'CHE-201.098.592';
const FOOTER_IBAN = 'CH50 8080 8005 5315 3585 1';

// ── Fontlar ──────────────────────────────────────────────────────────────────
export const FONT = 'Arial';
let fontFiles: { regular: string; bold: string; italic: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
};

export async function registerFonts(doc: jsPDF) {
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

// ── Logo ─────────────────────────────────────────────────────────────────────
let logoDataUrl: string | null = null;

export async function loadLogo(doc: jsPDF): Promise<{ dataUrl: string; w: number; h: number } | null> {
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

// ── Antet dalgası — SVG bir kez hedef ölçüde rasterleştirilip gömülür ────────
const WAVE_W = 146;
const WAVE_H = 28;
const WAVE_CENTER_Y = LOGO_Y + LOGO_H / 2 - 3;
const WAVE_RASTER_DPI = 400;
const WAVE_VIEW = '0 0 1460 280';

let wavePngCache: { key: string; dataUrl: string } | null = null;

export async function loadHeaderWave(): Promise<string | null> {
    const key = `${WAVE_W}x${WAVE_H}`;
    if (wavePngCache?.key === key) return wavePngCache.dataUrl;

    try {
        const pxW = Math.round((WAVE_W / 25.4) * WAVE_RASTER_DPI);
        const pxH = Math.round((WAVE_H / 25.4) * WAVE_RASTER_DPI);

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

// ── Antet & alt bilgi ────────────────────────────────────────────────────────
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

export type BrandAssets = {
    logo: { dataUrl: string; w: number; h: number } | null;
    wave: string | null;
};

export async function loadBrandAssets(doc: jsPDF): Promise<BrandAssets> {
    return { logo: await loadLogo(doc), wave: await loadHeaderWave() };
}

function drawPageHeader(doc: jsPDF, assets: BrandAssets, s: PdfCompanySettings) {
    if (assets.logo) {
        try {
            doc.addImage(assets.logo.dataUrl, 'PNG', LOGO_X, LOGO_Y, assets.logo.w, assets.logo.h, 'offitec-logo', 'FAST');
        } catch { /* logo yüklenemezse antet metin-only kalır */ }
    } else {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(15);
        doc.setTextColor(...COLOR_NAVY);
        doc.text(s.companyName, ML, 19);
    }

    if (assets.wave) {
        try {
            doc.addImage(assets.wave, 'PNG', MR - WAVE_W, WAVE_CENTER_Y - WAVE_H / 2, WAVE_W, WAVE_H, 'offitec-header-wave', 'FAST');
        } catch { /* şerit çizilemezse antet logo + iletişim satırı olarak kalır */ }
    }

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

function drawPageFooter(doc: jsPDF, page: number, total: number, t: FixedTranslator) {
    const textY = 274.5;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_NAVY);
    const details = `BIC: ${FOOTER_BIC}     ${t('projects.field.pdf.vatIdLabel')}: ${FOOTER_VAT}     IBAN: ${FOOTER_IBAN}`;
    doc.text(details, ML, textY);

    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_NAVY_SOFT);
    doc.text(`${t('projects.field.pdf.pageWord')} ${page} ${t('projects.field.pdf.pageOf')} ${total}`, MR, textY, { align: 'right' });

    doc.setFillColor(...COLOR_NAVY);
    doc.rect(ML, 278.5 - 0.2, CONTENT_W, 0.4, 'F');
}

/** Antet & alt bilgiyi TÜM sayfalara basar — içerik bittikten sonra çağrılır. */
export function decoratePages(doc: jsPDF, assets: BrandAssets, settings: PdfCompanySettings, t: FixedTranslator) {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i);
        drawPageHeader(doc, assets, settings);
        drawPageFooter(doc, i, pageCount, t);
    }
}

// ── Biçimleyiciler ───────────────────────────────────────────────────────────
export const EMPTY = '—';
export const clean = (value: unknown) => String(value ?? '').trim();

export const dateFmt = (value?: string | Date | null, locale = 'de-CH') => {
    if (!value) return EMPTY;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return EMPTY;
    return d.toLocaleDateString(locale);
};

// Kısa tarih: "26-06-15" (YY-MM-DD) — kapak kartı ve dosya adı.
export const dateShort = (value?: string | Date | null) => {
    if (!value) return EMPTY;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return EMPTY;
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

export const timeFmt = (value?: string | Date | null, locale = 'de-CH') => {
    if (!value) return EMPTY;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return EMPTY;
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
};

export const minutesBetween = (start?: string | null, end?: string | null) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
};

// Süre metinleri tüm rapor türlerinde ortak `projects.field.pdf.duration*`
// anahtarlarından gelir.
export const durationFmt = (minutes: number | null | undefined, t: FixedTranslator) => {
    const total = Math.max(0, Math.round(Number(minutes || 0)));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return t('projects.field.pdf.durationHm', { h: hours, m: mins });
    if (hours) return t('projects.field.pdf.durationH', { h: hours });
    return t('projects.field.pdf.durationM', { m: mins });
};

// ── Sayfa akışı ──────────────────────────────────────────────────────────────
export const ensureSpace = (doc: jsPDF, y: number, needed: number) => {
    if (y + needed <= CONTENT_BOTTOM) return y;
    doc.addPage();
    return CONTENT_TOP_REST;
};

export function fitFontSize(doc: jsPDF, text: string, maxW: number, base: number, min = 6.4): number {
    let size = base;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > maxW) {
        size -= 0.2;
        doc.setFontSize(size);
    }
    return size;
}

/**
 * Bölüm başlığı: lacivert bold metin — ALT ÇİZGİSİZ (kullanıcı isteği).
 * Başlığın üstünde belirgin bir nefes payı bırakılır ki bölümler sıkışık
 * durmasın; sayfa başında (taze sayfada) bu pay otomatik düşer.
 */
export function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
    const before = ensureSpace(doc, y, 30);
    const topGap = before === y ? 4.5 : 0;
    y = before;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10.4);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(title, ML, y + topGap + 4.6);
    return y + topGap + 10.5;
}

/** Belge başlığı: büyük lacivert başlık + kısa kırmızı vurgu (yalnızca burada). */
export function drawDocTitle(doc: jsPDF, title: string, y: number): number {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(16.5);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(title, ML, y);
    doc.setDrawColor(...COLOR_RED);
    doc.setLineWidth(0.8);
    doc.line(ML, y + 2.6, ML + 14, y + 2.6);
    return y + 10;
}

// ── Modern tablo (dikey ızgarasız; yumuşak başlık bandı + zebra + ayraçlar) ──
export interface ModernColumn {
    header: string;
    /** Sütun genişliği (mm). Toplam CONTENT_W'yi doldurmalıdır. */
    w: number;
    align?: 'left' | 'right' | 'center';
    bold?: boolean;
}

export const TBL_HEAD_H = 7.4;
export const TBL_PAD_X = 2.5;

/**
 * Hücre genişliğini aşan TEK parça sözcükler (uzun Almanca bileşikler, seri
 * numaraları) kesilmiş görünmesin diye sığan parçalara bölünür — böylece
 * `splitTextToSize` onları normal satır sonlarında sarar. Çağıran, ölçümün
 * doğru olması için fontu ÖNCE ayarlamalıdır.
 */
export function breakLongWords(doc: jsPDF, text: string, maxW: number): string {
    return String(text)
        .split(/(\s+)/)
        .map((part) => {
            if (/^\s+$/.test(part) || doc.getTextWidth(part) <= maxW) return part;
            const chunks: string[] = [];
            let chunk = '';
            for (const ch of part) {
                if (chunk && doc.getTextWidth(chunk + ch) > maxW) { chunks.push(chunk); chunk = ch; }
                else chunk += ch;
            }
            if (chunk) chunks.push(chunk);
            return chunks.join(' ');
        })
        .join('');
}

export function drawModernTableHeader(doc: jsPDF, columns: ModernColumn[], y: number): number {
    doc.setFillColor(...COLOR_HEAD_BG);
    doc.rect(ML, y, CONTENT_W, TBL_HEAD_H, 'F');
    doc.setFillColor(...COLOR_NAVY_SOFT);
    doc.rect(ML, y + TBL_HEAD_H - 0.35, CONTENT_W, 0.35, 'F');

    doc.setFont(FONT, 'bold');
    doc.setTextColor(...COLOR_NAVY);
    const ty = y + TBL_HEAD_H / 2 + 1.2;
    let x = ML;
    for (const col of columns) {
        fitFontSize(doc, col.header, col.w - TBL_PAD_X * 2, FS_HEADER, 5.8);
        if (col.align === 'right') doc.text(col.header, x + col.w - TBL_PAD_X, ty, { align: 'right' });
        else if (col.align === 'center') doc.text(col.header, x + col.w / 2, ty, { align: 'center' });
        else doc.text(col.header, x + TBL_PAD_X, ty);
        x += col.w;
    }
    doc.setFontSize(FS_BASE);
    return y + TBL_HEAD_H + 1.6;
}

/**
 * `mergeFirstColumn`: ardışık satırların İLK hücresi aynıysa etiket yalnızca
 * grubun ilk satırına yazılır ve aradaki yatay çizgi ilk sütunda ÇİZİLMEZ —
 * böylece o sütun tek, birleşmiş bir hücre gibi görünür ve satırlar onun
 * yanında tek tek listelenir (kullanıcı isteği: saha raporunda malzemeler).
 */
export function drawModernTable(
    doc: jsPDF,
    columns: ModernColumn[],
    rows: string[][],
    y: number,
    opts?: { mergeFirstColumn?: boolean },
): number {
    y = ensureSpace(doc, y, TBL_HEAD_H + 14);
    y = drawModernTableHeader(doc, columns, y);

    const merge = Boolean(opts?.mergeFirstColumn);
    // Sayfa kırılması grubu böler; kırılmadan sonra etiket yeniden yazılır.
    let groupLabel: string | null = null;

    rows.forEach((row, index) => {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_BASE);
        // Grubun devamı mı? Öyleyse ilk hücre boş basılır (birleşmiş görünür).
        const continuesGroup = merge && groupLabel !== null && row[0] === groupLabel;
        const printed = merge ? [continuesGroup ? '' : row[0], ...row.slice(1)] : row;
        const cellLines = columns.map((col, ci) => {
            const maxW = col.w - TBL_PAD_X * 2;
            return doc.splitTextToSize(breakLongWords(doc, printed[ci] || EMPTY, maxW), maxW) as string[];
        });
        const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
        const rowH = Math.max(8, maxLines * LH_BODY + 3.8);

        if (y + rowH > CONTENT_BOTTOM) {
            doc.addPage();
            y = drawModernTableHeader(doc, columns, CONTENT_TOP_REST);
            // Yeni sayfada grup etiketi yeniden yazılır.
            if (merge && continuesGroup) {
                cellLines[0] = doc.splitTextToSize(
                    breakLongWords(doc, row[0] || EMPTY, columns[0].w - TBL_PAD_X * 2),
                    columns[0].w - TBL_PAD_X * 2,
                ) as string[];
                groupLabel = null;
            }
        }

        if (index % 2 === 1) {
            doc.setFillColor(...COLOR_ZEBRA);
            doc.rect(ML, y, CONTENT_W, rowH, 'F');
        }

        let x = ML;
        columns.forEach((col, ci) => {
            doc.setFont(FONT, col.bold ? 'bold' : 'normal');
            doc.setFontSize(FS_BASE);
            doc.setTextColor(...COLOR_TEXT);
            if (col.align === 'right') doc.text(cellLines[ci], x + col.w - TBL_PAD_X, y + 5.4, { align: 'right' });
            else if (col.align === 'center') doc.text(cellLines[ci], x + col.w / 2, y + 5.4, { align: 'center' });
            else doc.text(cellLines[ci], x + TBL_PAD_X, y + 5.4);
            x += col.w;
        });

        doc.setDrawColor(...COLOR_HAIRLINE);
        doc.setLineWidth(0.15);
        // Birleşmiş sütunda ara çizgi yok: sıradaki satır aynı gruptaysa çizgi
        // ilk sütunun SAĞINDAN başlar.
        const nextContinues = merge && rows[index + 1]?.[0] === row[0];
        doc.line(nextContinues ? ML + columns[0].w : ML, y + rowH, MR, y + rowH);
        if (merge) groupLabel = row[0];
        y += rowH;
    });

    return y;
}

/** Tablo altına yumuşak vurgu bandı — sola etiket, sağa değer. */
export function drawBandRow(doc: jsPDF, label: string, value: string, y: number, strong = false): number {
    const h = strong ? 11 : 9;
    y = ensureSpace(doc, y, h + 2);
    if (strong) doc.setFillColor(...COLOR_HEAD_BG);
    else doc.setFillColor(...COLOR_BAND_BG);
    doc.rect(ML, y + 0.5, CONTENT_W, h - 1, 'F');
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(ML, y + 0.5, 1.2, h - 1, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(strong ? 10.6 : FS_BASE);
    doc.setTextColor(...COLOR_NAVY);
    // Etiket, değerin soluna sığdırılır — uzun liste adları bandı taşırmaz.
    const valueW = doc.getTextWidth(value);
    fitFontSize(doc, label, CONTENT_W - valueW - 10, strong ? 10.6 : FS_BASE, 6.4);
    doc.text(label, ML + 4, y + h / 2 + 1.4);
    doc.setFontSize(strong ? 10.6 : FS_BASE);
    doc.text(value, MR - TBL_PAD_X, y + h / 2 + 1.4, { align: 'right' });
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    return y + h;
}

// ── Kapak: bilgi kartı (sol) + gönderici/alıcı (sağ) + belge başlığı ─────────
export interface CoverRow {
    label: string;
    value: string;
    emphasize?: boolean;
}

/** Kart sol kenarındaki kırmızı→lacivert vurgu şeridi. */
function drawAccentStrip(doc: jsPDF, x: number, y: number, h: number) {
    doc.setFillColor(...COLOR_RED);
    doc.rect(x, y, 1.2, h * 0.32, 'F');
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(x, y + h * 0.32, 1.2, h * 0.44, 'F');
    doc.setFillColor(...COLOR_NAVY_SOFT);
    doc.rect(x, y + h * 0.76, 1.2, h * 0.24, 'F');
}

export interface CoverOptions {
    rows: CoverRow[];
    settings: PdfCompanySettings;
    recipientName?: string | null;
    /** Alıcı adres satırları — satırlar BÖLÜNMEZ, sığmayan satır küçülür. */
    recipientLines?: string[];
    title: string;
    subtitle?: string | null;
}

/** Ortak kapak düzeni. Dönen değer: içerik akışının başlayacağı Y. */
export function drawCover(doc: jsPDF, opts: CoverOptions): number {
    const y0 = CONTENT_TOP_FIRST;

    // ── Sol: bilgi kartı — boş satırlar HİÇ çizilmez ─────────────────────────
    const cardX = ML;
    const cardW = 78;
    const rowH = 5.6;
    const rows = opts.rows.filter((row) => row.value.trim().length > 0 && row.value !== EMPTY);
    const cardY = y0 - 4;
    const cardH = rows.length * rowH + 2.4;

    doc.setFillColor(...COLOR_CARD_BG);
    doc.setDrawColor(...COLOR_CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(cardX, cardY, cardW, cardH, 'FD');
    drawAccentStrip(doc, cardX, cardY, cardH);

    let ry = cardY + 1.2;
    rows.forEach((row, idx) => {
        const base = ry + rowH / 2 + 1.15;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_LABEL);
        doc.text(row.label, cardX + 3.5, base);
        doc.setFont(FONT, 'bold');
        const labelW = doc.getTextWidth(row.label);
        const valueMaxW = cardW - 7 - labelW - 2;
        fitFontSize(doc, row.value, valueMaxW, row.emphasize ? 8.6 : 7.8, 5.6);
        if (row.emphasize) doc.setTextColor(...COLOR_NAVY);
        else doc.setTextColor(...COLOR_TEXT);
        doc.text(row.value, cardX + cardW - 3.5, base, { align: 'right' });
        ry += rowH;
        if (idx < rows.length - 1) {
            doc.setDrawColor(...COLOR_HAIRLINE);
            doc.setLineWidth(0.12);
            doc.line(cardX + 3.5, ry + 0.3, cardX + cardW - 3.5, ry + 0.3);
        }
    });

    // ── Sağ: tek satır gönderici + alıcı adres bloğu ─────────────────────────
    const addrX = 112;
    const addrW = MR - addrX;
    const sender = companySenderLine(opts.settings);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLOR_MUTED);
    drawFittedSingleLine(doc, sender, addrX, y0, addrW, 7.5, 5.8);
    doc.setDrawColor(...COLOR_HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(addrX, y0 + 1.6, MR, y0 + 1.6);

    let addrY = y0 + 8;
    doc.setTextColor(...COLOR_TEXT);
    const recipientName = clean(opts.recipientName);
    if (recipientName) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(10.5);
        const nameLines = doc.splitTextToSize(recipientName, addrW) as string[];
        doc.text(nameLines, addrX, addrY);
        addrY += nameLines.length * 5;
    }
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    for (const line of (opts.recipientLines || []).slice(0, 4)) {
        drawFittedSingleLine(doc, line, addrX, addrY, addrW, 10, 7);
        addrY += 4.9;
    }

    // ── Belge başlığı (+ opsiyonel alt başlık) ───────────────────────────────
    let y = Math.max(addrY, cardY + cardH) + 14;
    y = drawDocTitle(doc, opts.title, y);
    if (clean(opts.subtitle)) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(clean(opts.subtitle), ML, y);
        y += 6;
    }

    return y + 2;
}

/** Serbest metin adresi blok satırlarına çevirir (en çok 4 satır). */
export function addressLines(address?: string | null): string[] {
    const raw = clean(address);
    if (!raw) return [];
    const byNewline = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // Tek satırlık serbest metin adresler virgülden bölünerek blok hâline gelir.
    return (byNewline.length > 1 ? byNewline : raw.split(',').map((l) => l.trim()).filter(Boolean)).slice(0, 4);
}

// ── Yapılan işler listesi: numaralı, ayraçlı ─────────────────────────────────
export interface JobItem {
    title: string;
    body: string;
    note?: string;
}

export function drawJobList(
    doc: jsPDF,
    jobs: JobItem[],
    y: number,
    noteLabel: string
): number {
    const numW = 9;
    const textX = ML + numW;
    const textW = MR - textX;

    jobs.forEach((job, index) => {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(9.4);
        const titleLines = doc.splitTextToSize(job.title, textW) as string[];
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_BASE);
        const showBody = job.body && job.body !== job.title;
        const bodyLines = showBody ? (doc.splitTextToSize(job.body, textW) as string[]) : [];

        // En azından başlık + ilk gövde satırı aynı sayfada başlasın.
        y = ensureSpace(doc, y, titleLines.length * 4.6 + 8);

        doc.setFont(FONT, 'bold');
        doc.setFontSize(9.4);
        doc.setTextColor(...COLOR_NAVY);
        doc.text(`${index + 1}.`, ML + 1, y + 4.6);
        doc.setTextColor(...COLOR_TEXT);
        let cy = y + 4.6;
        for (const line of titleLines) {
            if (cy > CONTENT_BOTTOM - 1.5) {
                doc.addPage();
                cy = CONTENT_TOP_REST + 4.6;
                doc.setFont(FONT, 'bold');
                doc.setFontSize(9.4);
                doc.setTextColor(...COLOR_TEXT);
            }
            doc.text(line, textX, cy);
            cy += 4.6;
        }

        if (bodyLines.length > 0) {
            cy += 0.6;
            doc.setFont(FONT, 'normal');
            doc.setFontSize(FS_BASE);
            doc.setTextColor(...COLOR_LABEL);
            for (const line of bodyLines) {
                if (cy > CONTENT_BOTTOM - 1.5) {
                    doc.addPage();
                    cy = CONTENT_TOP_REST + 4.6;
                    doc.setFont(FONT, 'normal');
                    doc.setFontSize(FS_BASE);
                    doc.setTextColor(...COLOR_LABEL);
                }
                doc.text(line, textX, cy);
                cy += LH_BODY;
            }
            doc.setTextColor(...COLOR_TEXT);
        }

        if (clean(job.note)) {
            cy += 0.8;
            doc.setFont(FONT, 'italic');
            doc.setFontSize(8.4);
            doc.setTextColor(...COLOR_MUTED);
            const noteLines = doc.splitTextToSize(`${noteLabel}: ${clean(job.note)}`, textW) as string[];
            for (const line of noteLines) {
                if (cy > CONTENT_BOTTOM - 1.5) {
                    doc.addPage();
                    cy = CONTENT_TOP_REST + 4.6;
                    doc.setFont(FONT, 'italic');
                    doc.setFontSize(8.4);
                    doc.setTextColor(...COLOR_MUTED);
                }
                doc.text(line, textX, cy);
                cy += 4;
            }
            doc.setFont(FONT, 'normal');
            doc.setTextColor(...COLOR_TEXT);
        }

        cy += 1.6;
        doc.setDrawColor(...COLOR_HAIRLINE);
        doc.setLineWidth(0.15);
        if (cy <= CONTENT_BOTTOM) doc.line(ML, cy, MR, cy);
        y = cy + 2.4;
    });

    return y;
}

// ── Görsel ızgarası: 3 sütun, oranı korunarak hücreye sığdırılır ─────────────
export const detectImageFormat = (dataUrl: string): 'PNG' | 'JPEG' => {
    if (/^data:image\/(jpeg|jpg)/i.test(dataUrl)) return 'JPEG';
    return 'PNG';
};

export function drawImagesGrid(doc: jsPDF, images: string[], y: number): number {
    const cols = 3;
    const gap = 4;
    const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.72;

    images.forEach((src, index) => {
        const col = index % cols;
        if (col === 0) y = ensureSpace(doc, y, cellH + gap);
        const x = ML + col * (cellW + gap);
        doc.setDrawColor(...COLOR_HAIRLINE);
        doc.setLineWidth(0.2);
        doc.rect(x, y, cellW, cellH);
        try {
            const props = doc.getImageProperties(src);
            const ratio = Math.min((cellW - 1) / props.width, (cellH - 1) / props.height);
            const w = props.width * ratio;
            const h = props.height * ratio;
            doc.addImage(src, detectImageFormat(src), x + (cellW - w) / 2, y + (cellH - h) / 2, w, h, undefined, 'FAST');
        } catch {
            try {
                doc.addImage(src, detectImageFormat(src), x + 0.5, y + 0.5, cellW - 1, cellH - 1, undefined, 'FAST');
            } catch { /* geçersiz görsel atlanır */ }
        }
        if (col === cols - 1 || index === images.length - 1) y += cellH + gap;
    });

    return y + 4;
}

// ── Onay bölümü: metin + YALNIZCA müşteri imza kartı ─────────────────────────
export interface ApprovalOptions {
    title: string;
    confirmText: string;
    roleLabel: string;
    customerName: string;
    dateLabel: string;
    dateText: string;
    signatureLabel: string;
    signatureData?: string | null;
}

/**
 * Onay metni + sağa yaslı müşteri imza kartı. Kart kenarlıklıdır ama iç zemini
 * BEYAZDIR (kullanıcı isteği); sol kenarda kırmızı→lacivert vurgu şeridi durur.
 */
export function drawApprovalSection(doc: jsPDF, opts: ApprovalOptions, y: number): number {
    const cardW = 80;
    const cardH = 46;

    y = ensureSpace(doc, y, 14 + cardH + 14);
    y = drawSectionTitle(doc, opts.title, y);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    const confirmLines = doc.splitTextToSize(opts.confirmText, CONTENT_W) as string[];
    doc.text(confirmLines, ML, y + 3.6);
    y += confirmLines.length * 4.6 + 5;

    const cardX = MR - cardW;
    y = ensureSpace(doc, y, cardH + 4);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COLOR_CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(cardX, y, cardW, cardH, 'FD');
    drawAccentStrip(doc, cardX, y, cardH);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_LABEL);
    doc.text(opts.roleLabel, cardX + 4.5, y + 5.4);
    doc.text(`${opts.dateLabel}: ${opts.dateText}`, cardX + cardW - 3.5, y + 5.4, { align: 'right' });

    const customerName = clean(opts.customerName) || EMPTY;
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...COLOR_NAVY);
    fitFontSize(doc, customerName, cardW - 9, 9.4, 6.4);
    doc.text(customerName, cardX + 4.5, y + 10.6);

    // İmza alanı: yakalanmış imza görseli varsa gömülür; yoksa elle imza için
    // boş kalır. Altında ince çizgi + imza etiketi.
    const sigTop = y + 13.5;
    const sigLineY = y + cardH - 8;
    if (opts.signatureData) {
        try {
            const sig = String(opts.signatureData);
            const fmt = sig.includes('image/png') ? 'PNG' : 'JPEG';
            const boxW = cardW - 16;
            const boxH = sigLineY - sigTop - 1.5;
            const props = doc.getImageProperties(sig);
            const ratio = Math.min(boxW / props.width, boxH / props.height);
            const w = props.width * ratio;
            const h = props.height * ratio;
            doc.addImage(sig, fmt, cardX + (cardW - w) / 2, sigTop + (boxH - h) / 2, w, h, undefined, 'FAST');
        } catch { /* bozuk imza verisi kartı düşürmesin */ }
    }

    doc.setDrawColor(...COLOR_NAVY_SOFT);
    doc.setLineWidth(0.3);
    doc.line(cardX + 4.5, sigLineY, cardX + cardW - 4.5, sigLineY);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_LABEL);
    doc.text(opts.signatureLabel, cardX + 4.5, sigLineY + 3.8);
    doc.setTextColor(...COLOR_TEXT);

    return y + cardH + 6;
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
