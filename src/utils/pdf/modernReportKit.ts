/**
 * ── MODERN RAPOR PDF KİTİ ────────────────────────────────────────────────────
 * Saha raporu (Montage-Rapport), genel rapor (Gesamtrapport) ve teslim raporu
 * (Schlussrapport) üreticilerinin PAYLAŞTIĞI tasarım dili. `tenderPdfModern.ts`
 * ile aynı görsel kimliği taşır:
 *  - Antet (logo + dalga şeridi + iletişim satırı) ve alt bilgi (BIC / MwSt /
 *    IBAN bandı) kod ile çizilir — sablon.pdf arka plan birleştirmesi YOKTUR.
 *  - Ferah tablolar: dikey ızgara yok, yumuşak başlık bandı, ince ayraçlar ve
 *    çok hafif zebra tonlaması.
 *  - İmza kartları: solda TEKNİSYEN, sağda MÜŞTERİ (kullanıcı isteği
 *    19.08.2026); kenarlıklıdır ama iç zeminleri BEYAZDIR.
 * Üç üretici de buradan beslenir; tasarım değişiklikleri TEK yerden yapılır.
 *
 * ── BAŞLIK BASAMAKLARI (kullanıcı isteği 19.08.2026) ─────────────────────────
 * "Hangi başlık hangisi" sorusu kalmasın diye belgede YALNIZCA dört basamak
 * vardır; her basamak boyut + renk + biçim olarak diğerlerinden açıkça ayrılır:
 *   1. `drawDocTitle`     — belge adı. 17 pt lacivert, TEK kırmızı vurgu.
 *                           Sayfa 1'de bir kez; rapor numarası kapak kartında.
 *   2. `drawSectionTitle` — NUMARALI bölüm başlığı ("1  Arbeitszeiten").
 *                           11.5 pt lacivert + içerik genişliğinde ince ayraç.
 *   3. `drawSubTitle`     — bölüm içi grup başlığı (checklist adı, montaj günü).
 *                           8.8 pt gri-mavi, zeminsiz — asla toplam bandı gibi
 *                           görünmez.
 *   4. Tablo başlığı      — gri bant, 8.4 pt (`drawModernTableHeader`).
 * `drawBandRow` artık YALNIZCA toplam satırıdır (tablonun altında, üst çizgili).
 *
 * ── RENK DİSİPLİNİ ───────────────────────────────────────────────────────────
 * Kart kenarlarındaki üç renkli şerit KALDIRILDI (kullanıcı isteği): tüm
 * kartlar tek lacivert kenar taşır. Belgede kırmızı SADECE belge başlığındadır.
 * Dolgu olarak yalnızca iki gri kullanılır: tablo başlığı/toplam (COLOR_HEAD_BG)
 * ve zebra/not kartı (COLOR_ZEBRA). Kartların içi BEYAZ kalır.
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
// Tek renk ailesi: lacivert (+ açık tonu) ve griler. Kırmızı yalnızca belge
// başlığında kullanılır; başka hiçbir yerde ikinci bir vurgu rengi yoktur.
export const COLOR_TEXT = [30, 32, 40] as const;
export const COLOR_MUTED = [120, 126, 140] as const;
export const COLOR_LABEL = [88, 95, 114] as const;
export const COLOR_NAVY = [31, 42, 84] as const;
export const COLOR_RED = [211, 32, 38] as const;
export const COLOR_NAVY_SOFT = [104, 116, 158] as const;
export const COLOR_HAIRLINE = [226, 229, 237] as const;
/** Tek gri dolgu #1 — tablo başlığı ve toplam satırı. */
export const COLOR_HEAD_BG = [238, 241, 247] as const;
/** Tek gri dolgu #2 — zebra satırı ve not kartı. */
export const COLOR_ZEBRA = [249, 250, 252] as const;
/** Yalnızca personel raporunun rakam kutucukları içindir — rapor gövdesinde
 *  kartların içi BEYAZDIR. */
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

/**
 * Tarihler belgelerde HER YERDE "19.08.2026" biçiminde basılır (kullanıcı
 * isteği 19.08.2026 — teklif/fatura PDF'leriyle aynı okunuş). `toLocaleDateString`
 * de-CH'de "19.8.2026" üretiyordu; gün/ay sıfırla doldurulur.
 */
const dotted = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
};

export const dateFmt = (value?: string | Date | null, locale = 'de-CH') => {
    if (!value) return EMPTY;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return EMPTY;
    // Türkçe/İngilizce yazışmalarda da noktalı biçim okunaklıdır; locale yalnız
    // saat biçimlendirmesinde ayrışır.
    return locale.startsWith('en') ? d.toLocaleDateString('en-GB') : dotted(d);
};

// Kapak kartı tarihi — belge boyunca aynı okunuş: "19.08.2026".
export const dateShort = (value?: string | Date | null) => {
    if (!value) return EMPTY;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return EMPTY;
    return dotted(d);
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

// ── Başlık basamakları ───────────────────────────────────────────────────────
/**
 * Bölüm sayacı. Numaralandırma BELGE BAŞINA açılır: `drawCover`a
 * `numberedSections: true` veren belgeler ("1 Arbeitszeiten", "2 …") numara
 * alır. Tek başlıklı belgeler (personel raporunun "Absenzen" bölümü gibi)
 * numarasız kalır — orada "1" olmayan bir sıralamayı ima ederdi.
 */
let sectionNumber = 0;
let sectionNumbering = false;

export const resetSectionNumbering = (enabled = false) => {
    sectionNumber = 0;
    sectionNumbering = enabled;
};

/**
 * Bir bölüm başlığının kapladığı toplam yükseklik (üst nefes payı dâhil).
 * Yer ayıran çağrılar bunu kullanır — sabiti elle tekrar etmek, imza kartlarının
 * başlığından koparak boş bir sayfaya düşmesine yol açmıştı.
 */
export const SECTION_TITLE_H = 18.5;

/**
 * BASAMAK 2 — bölüm başlığı. Numaralıdır ("1  Arbeitszeiten"): okuyucu hem
 * hangi basamakta olduğunu hem de raporun kaç bölümden oluştuğunu tek bakışta
 * görür (kullanıcı isteği 19.08.2026 — "hangi başlık hangisi anlaşılmıyor").
 * Numara lacivertin açık tonunda, başlık koyu lacivert; altında içerik
 * genişliğinde İNCE GRİ ayraç — kırmızı çizgi YOKTUR.
 */
export function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
    const before = ensureSpace(doc, y, 30);
    // Bölümler arasında belirgin nefes payı; taze sayfada pay otomatik düşer.
    const topGap = before === y ? SECTION_TITLE_H - 11.5 : 0;
    y = before;
    sectionNumber += 1;

    const baseline = y + topGap + 5;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11.5);
    let numW = 0;
    if (sectionNumbering) {
        const label = String(sectionNumber);
        doc.setTextColor(...COLOR_NAVY_SOFT);
        doc.text(label, ML, baseline);
        numW = doc.getTextWidth(label) + 3.6;
    }
    doc.setTextColor(...COLOR_NAVY);
    fitFontSize(doc, title, CONTENT_W - numW, 11.5, 8);
    doc.text(title, ML + numW, baseline);
    doc.setFontSize(FS_BASE);

    doc.setDrawColor(...COLOR_HAIRLINE);
    doc.setLineWidth(0.25);
    doc.line(ML, baseline + 2.8, MR, baseline + 2.8);

    return y + topGap + 11.5;
}

/**
 * BASAMAK 3 — bölüm içi grup başlığı (checklist adı, montaj günü, form grubu).
 * Zeminsiz, küçük ve gri-mavi: altındaki gri tablo başlığıyla da, tablonun
 * altındaki toplam bandıyla da karıştırılamaz. Sağdaki `meta` isteğe bağlıdır
 * (tarih, "5/8" gibi).
 */
export function drawSubTitle(doc: jsPDF, title: string, meta: string, y: number): number {
    y = ensureSpace(doc, y, 16);
    const metaText = clean(meta);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(8.2);
    const metaW = metaText ? doc.getTextWidth(metaText) + 6 : 0;

    doc.setFont(FONT, 'bold');
    doc.setTextColor(...COLOR_LABEL);
    fitFontSize(doc, title, CONTENT_W - metaW, 8.8, 6.4);
    doc.text(title, ML, y + 3.9);

    if (metaText) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(metaText, MR, y + 3.9, { align: 'right' });
    }

    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    return y + 6.4;
}

/**
 * BASAMAK 1 — belge başlığı. Sayfa 1'de bir kez; belgedeki TEK kırmızı öge
 * kısa vurgu çizgisidir. Rapor numarası başlığa EKLENMEZ, kapak kartında durur
 * (üç rapor türünde de aynı okunuş).
 */
export function drawDocTitle(doc: jsPDF, title: string, y: number): number {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(17);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(title, ML, y);
    doc.setDrawColor(...COLOR_RED);
    doc.setLineWidth(1);
    doc.line(ML, y + 3, ML + 16, y + 3);
    return y + 11;
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
    /**
     * `reserveAfter`: tablonun hemen ardından gelecek toplam satır(lar)ı için
     * ayrılan yükseklik (mm). Son satır bu payla birlikte sığmıyorsa satır da
     * toplam da yeni sayfaya geçer — toplam, tablosundan kopup boş bir sayfanın
     * tepesinde tek başına kalmaz.
     */
    opts?: { mergeFirstColumn?: boolean; reserveAfter?: number },
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
            // Birleşmiş hücrenin devamı BOŞ kalır — "—" basılırsa sütun
            // birleşmiş değil, verisi eksikmiş gibi görünür.
            const blankByMerge = merge && ci === 0 && continuesGroup;
            const value = blankByMerge ? '' : (printed[ci] || EMPTY);
            return doc.splitTextToSize(breakLongWords(doc, value, maxW), maxW) as string[];
        });
        const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
        const rowH = Math.max(8, maxLines * LH_BODY + 3.8);

        // Son satır, kendisinden sonra gelecek toplam bandıyla BİRLİKTE ölçülür.
        const keepWithNext = index === rows.length - 1 ? Number(opts?.reserveAfter || 0) : 0;
        if (y + rowH + keepWithNext > CONTENT_BOTTOM) {
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

/**
 * TOPLAM SATIRI — yalnızca bir tablonun altındaki ara/genel toplam içindir
 * (kullanıcı isteği 19.08.2026: eskiden aynı bant hem grup başlığı hem toplam
 * olarak kullanılıyordu, bu yüzden hangisinin ne olduğu anlaşılmıyordu; grup
 * başlıkları artık `drawSubTitle`).
 * Gri zemin + ÜST ÇİZGİ: tablonun kapanışı olduğu görülür; değer, tablonun sağ
 * kenarıyla aynı hizada biter. Değer boşsa satır bir "kayıt yok" notu gibi
 * sade basılır.
 */
/** Toplam satırı yükseklikleri — `reserveAfter` hesapları bunları kullanır. */
export const BAND_ROW_H = 9;
export const BAND_ROW_STRONG_H = 10.5;

export function drawBandRow(doc: jsPDF, label: string, value: string, y: number, strong = false): number {
    const text = clean(value);

    if (!text) {
        y = ensureSpace(doc, y, 10);
        doc.setFont(FONT, 'italic');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(label, ML, y + 4.8);
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...COLOR_TEXT);
        return y + 8;
    }

    const h = strong ? BAND_ROW_STRONG_H : BAND_ROW_H;
    const size = strong ? 10.4 : FS_BASE;
    y = ensureSpace(doc, y, h + 2);

    doc.setFillColor(...COLOR_HEAD_BG);
    doc.rect(ML, y, CONTENT_W, h, 'F');
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(ML, y, CONTENT_W, strong ? 0.5 : 0.3, 'F');

    doc.setFont(FONT, 'bold');
    doc.setFontSize(size);
    doc.setTextColor(...COLOR_NAVY);
    const baseline = y + h / 2 + 1.4;
    const valueW = doc.getTextWidth(text);
    // Etiket, değerin soluna sığdırılır — uzun liste adları bandı taşırmaz.
    fitFontSize(doc, label, CONTENT_W - valueW - TBL_PAD_X * 3, size, 6.4);
    doc.text(label, ML + TBL_PAD_X, baseline);
    doc.setFontSize(size);
    doc.text(text, MR - TBL_PAD_X, baseline, { align: 'right' });

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

/**
 * Kart sol kenarı — TEK renk (kullanıcı isteği 19.08.2026). Eskiden kırmızı →
 * lacivert → açık lacivert üç parçalı bir şeritti; sayfada dört-beş kart yan
 * yana gelince belge alacalı görünüyordu.
 */
export function drawCardEdge(doc: jsPDF, x: number, y: number, h: number) {
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(x, y, 1, h, 'F');
}

export interface CoverOptions {
    rows: CoverRow[];
    settings: PdfCompanySettings;
    recipientName?: string | null;
    /** Alıcı adres satırları — satırlar BÖLÜNMEZ, sığmayan satır küçülür. */
    recipientLines?: string[];
    title: string;
    subtitle?: string | null;
    /** Bölüm başlıkları numaralansın mı ("1 Arbeitszeiten")? Bkz. drawSectionTitle. */
    numberedSections?: boolean;
}

/** Ortak kapak düzeni. Dönen değer: içerik akışının başlayacağı Y. */
export function drawCover(doc: jsPDF, opts: CoverOptions): number {
    // Her belge kapakla başlar; bölüm sayacı burada sıfırlanır.
    resetSectionNumbering(Boolean(opts.numberedSections));
    const y0 = CONTENT_TOP_FIRST;

    // ── Sol: bilgi kartı — boş satırlar HİÇ çizilmez ─────────────────────────
    const cardX = ML;
    const cardW = 78;
    const rowH = 5.6;
    const rows = opts.rows.filter((row) => row.value.trim().length > 0 && row.value !== EMPTY);
    const cardY = y0 - 4;
    const cardH = rows.length * rowH + 2.4;

    // Kart içi BEYAZ: belgede gri dolgu yalnızca tablolara ayrılmıştır.
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COLOR_CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(cardX, cardY, cardW, cardH, 'FD');
    drawCardEdge(doc, cardX, cardY, cardH);

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

// ── Not kartı: yumuşak zeminli, vurgu şeritli serbest metin bloğu ───────────
/**
 * Serbest metni (not / bemerkung) çıplak satırlar yerine yumuşak bir karta
 * koyar: kenarlık + sol vurgu şeridi + hafif zemin. Belge "sunulabilir"
 * görünsün diye (kullanıcı isteği 19.08.2026) notlar artık hep böyle çizilir.
 */
export function drawNoteBlock(doc: jsPDF, text: string, y: number): number {
    const body = clean(text);
    if (!body) return y;

    const padX = 5;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    const lines = doc.splitTextToSize(body, CONTENT_W - padX * 2) as string[];
    const boxH = lines.length * (LH_BODY + 0.2) + 7;

    y = ensureSpace(doc, y, boxH + 3);
    doc.setFillColor(...COLOR_ZEBRA);
    doc.setDrawColor(...COLOR_CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(ML, y, CONTENT_W, boxH, 'FD');
    drawCardEdge(doc, ML, y, boxH);

    doc.setTextColor(...COLOR_TEXT);
    doc.text(lines, ML + padX, y + 5.4);
    return y + boxH + 4;
}

// ── Onay bölümü: metin + imza kartları (Techniker / Kunde) ──────────────────
/** Ein Unterzeichner = eine Karte. */
export interface ApprovalSigner {
    roleLabel: string;
    name: string;
    dateLabel: string;
    dateText: string;
    signatureLabel: string;
    signatureData?: string | null;
}

export interface ApprovalOptions {
    title: string;
    confirmText: string;
    /**
     * Ein oder ZWEI Karten. Zwei stehen nebeneinander (links Techniker, rechts
     * Kunde), eine bleibt rechtsbündig wie bisher. Karten ohne Namen UND ohne
     * Unterschrift werden weggelassen — leere Kästen sind kein Dokument.
     */
    signers: ApprovalSigner[];
}

/** Eine Unterschriftenkarte: weisser Innenraum, Rahmen, EIN Akzentstreifen. */
function drawSignatureCard(doc: jsPDF, signer: ApprovalSigner, x: number, y: number, w: number, h: number) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COLOR_CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(x, y, w, h, 'FD');
    drawCardEdge(doc, x, y, h);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_LABEL);
    doc.text(signer.roleLabel, x + 4.5, y + 5.4);
    if (clean(signer.dateText)) {
        doc.text(`${signer.dateLabel}: ${signer.dateText}`, x + w - 3.5, y + 5.4, { align: 'right' });
    }

    const name = clean(signer.name) || EMPTY;
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...COLOR_NAVY);
    fitFontSize(doc, name, w - 9, 9.4, 6.4);
    doc.text(name, x + 4.5, y + 10.6);

    // İmza alanı: yakalanmış imza görseli varsa gömülür; yoksa elle imza için
    // boş kalır. Altında ince çizgi + imza etiketi.
    const sigTop = y + 13.5;
    const sigLineY = y + h - 8;
    if (signer.signatureData) {
        try {
            const sig = String(signer.signatureData);
            const fmt = sig.includes('image/png') ? 'PNG' : 'JPEG';
            const boxW = w - 16;
            const boxH = sigLineY - sigTop - 1.5;
            const props = doc.getImageProperties(sig);
            const ratio = Math.min(boxW / props.width, boxH / props.height);
            const iw = props.width * ratio;
            const ih = props.height * ratio;
            doc.addImage(sig, fmt, x + (w - iw) / 2, sigTop + (boxH - ih) / 2, iw, ih, undefined, 'FAST');
        } catch { /* bozuk imza verisi kartı düşürmesin */ }
    }

    doc.setDrawColor(...COLOR_NAVY_SOFT);
    doc.setLineWidth(0.3);
    doc.line(x + 4.5, sigLineY, x + w - 4.5, sigLineY);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_LABEL);
    doc.text(signer.signatureLabel, x + 4.5, sigLineY + 3.8);
    doc.setTextColor(...COLOR_TEXT);
}

/**
 * Onay metni + imza kartları. Rapor artık İKİ imza taşır (kullanıcı isteği
 * 19.08.2026): solda işi yapan TEKNİSYEN, sağda MÜŞTERİ. Tek imzacı verilirse
 * kart eskisi gibi sağa yaslanır.
 */
export function drawApprovalSection(doc: jsPDF, opts: ApprovalOptions, y: number): number {
    const signers = opts.signers.filter((signer) => clean(signer.name) || signer.signatureData);
    if (signers.length === 0) return y;

    const gap = 8;
    const cardH = 46;
    const cardW = signers.length > 1 ? (CONTENT_W - gap) / 2 : 80;

    // Der Platzbedarf wird GEMESSEN, nicht geschätzt — zu knapp gerechnet
    // landeten Titel und Text unten auf der Seite und die Karten allein auf der
    // nächsten; zu grosszügig schob es alles auf eine fast leere Seite.
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    const confirmLines = doc.splitTextToSize(opts.confirmText, CONTENT_W) as string[];
    y = ensureSpace(doc, y, SECTION_TITLE_H + confirmLines.length * 4.6 + 9 + cardH + 4);
    y = drawSectionTitle(doc, opts.title, y);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(confirmLines, ML, y + 3.6);
    y += confirmLines.length * 4.6 + 5;

    y = ensureSpace(doc, y, cardH + 4);
    // Bir kart sağa yaslanır; iki kart içerik genişliğini paylaşır.
    const firstX = signers.length > 1 ? ML : MR - cardW;
    signers.forEach((signer, index) => {
        drawSignatureCard(doc, signer, firstX + index * (cardW + gap), y, cardW, cardH);
    });

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
