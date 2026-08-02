// Yapıştırılan imza HTML'i için renk kurtarma yardımcıları.
//
// İki ayrı renk kaybı yaşanıyordu:
//  1) Kaynak imzanın renkleri <style> bloğunda / sınıflarda tanımlıysa, blok
//     atıldığı anda tüm renkler kayboluyordu (mailde stil sayfası çalışmaz).
//     Bu yüzden blok SİLİNMEDEN önce kuralları satır içi style'a taşınır.
//  2) Koyu temalı bir istemciden kopyalanan imza, satır içinde BEYAZ metin
//     rengi taşır; arkasındaki koyu zemin panoya gelmediği için yazı beyaz
//     kâğıt üzerinde görünmez olur. Arkasında koyu zemin kalmamış beyaz
//     metinlerin rengi düşürülür ki varsayılan koyu renge dönsünler.

/** Geçersiz değerde '' döndürür; geçerliyse tarayıcının normalize ettiği rgb(a). */
const normalizeColor = (raw: string, shorthand = false): string => {
    const probe = document.createElement('span').style;
    if (shorthand) probe.background = raw;
    else probe.color = raw;
    const value = shorthand ? probe.backgroundColor : probe.color;
    return value || '';
};

type Rgba = { r: number; g: number; b: number; a: number };

const toRgba = (raw: string | null | undefined, shorthand = false): Rgba | null => {
    if (!raw || !raw.trim()) return null;
    const parts = /rgba?\(([^)]+)\)/.exec(normalizeColor(raw.trim(), shorthand));
    if (!parts) return null;
    const [r, g, b, a] = parts[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
    return { r, g, b, a: Number.isFinite(a) ? a : 1 };
};

/** 0 (siyah) – 1 (beyaz). */
const luminance = ({ r, g, b }: Rgba) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// ---------------------------------------------------------------------------
// 1) <style> kurallarını satır içine taşı
// ---------------------------------------------------------------------------

/** Yalnızca ekran/tüm medya; baskı ve koyu tema kuralları imzaya taşınmaz. */
const isUsableMedia = (condition: string) => !/print|prefers-color-scheme/i.test(condition);

const collectStyleRules = (css: string): CSSStyleRule[] => {
    // media="not all" → sayfaya hiç uygulanmaz, ama kuralları ayrıştırılır.
    const holder = document.createElement('style');
    holder.media = 'not all';
    holder.textContent = css;
    document.head.appendChild(holder);
    const flat: CSSStyleRule[] = [];
    const walk = (rules: CSSRuleList | undefined) => {
        for (const rule of Array.from(rules || [])) {
            if (rule instanceof CSSStyleRule) flat.push(rule);
            else if (rule instanceof CSSMediaRule && isUsableMedia(rule.conditionText)) walk(rule.cssRules);
        }
    };
    try {
        walk(holder.sheet?.cssRules);
    } catch {
        // Aynı köken dışı / ayrıştırılamayan stil: sessizce atlanır.
    }
    holder.remove();
    return flat;
};

/** Tek tek her öğeye uygulanmasının anlamı olmayan, HTML'i şişiren seçiciler. */
const SKIPPED_SELECTOR_RE = /^\s*(\*|html|body)\s*$/i;

/**
 * <style> bloklarındaki kuralları eşleşen öğelerin `style` özniteliğine yazar.
 * Öğenin kendi satır içi stili en sona konur; böylece kaynaktaki öncelik korunur.
 */
export const inlineStyleBlocks = (doc: Document) => {
    const css = Array.from(doc.querySelectorAll('style')).map((el) => el.textContent || '').join('\n');
    if (!css.trim()) return;

    const original = new Map<Element, string>();
    const collected = new Map<Element, string>();

    for (const rule of collectStyleRules(css)) {
        const declarations = rule.style.cssText;
        if (!declarations) continue;
        for (const selector of rule.selectorText.split(',')) {
            const trimmed = selector.trim();
            if (!trimmed || SKIPPED_SELECTOR_RE.test(trimmed)) continue;
            let matches: Element[];
            try {
                matches = Array.from(doc.body.querySelectorAll(trimmed));
            } catch {
                continue; // Tarayıcının desteklemediği seçici (:hover, ::before, ...).
            }
            for (const el of matches) {
                if (!original.has(el)) original.set(el, el.getAttribute('style') || '');
                collected.set(el, `${collected.get(el) || ''}${declarations};`);
            }
        }
    }

    for (const [el, declarations] of collected) {
        const merged = `${declarations}${original.get(el) || ''}`.replace(/;(?:\s*;)+/g, ';');
        el.setAttribute('style', merged);
    }
};

// ---------------------------------------------------------------------------
// 2) Zeminsiz kalmış beyaz metinleri onar
// ---------------------------------------------------------------------------

/** Beyaz metnin okunabilir kalacağı bir zemin var mı? İlk opak zemin karar verir. */
const hasDarkBackdrop = (start: Element): boolean => {
    for (let el: Element | null = start; el && el.tagName !== 'BODY'; el = el.parentElement) {
        const inline = (el as HTMLElement).style;
        const background =
            toRgba(inline.backgroundColor) ||
            toRgba(inline.background, true) ||
            toRgba(el.getAttribute('bgcolor'));
        // Zemin bir görsel ise mailde taşınmıyor; zemin yok sayılır.
        if (!background || background.a < 0.1) continue;
        return luminance(background) < 0.75;
    }
    return false;
};

const isNearWhite = (color: Rgba) => color.a > 0.1 && luminance(color) >= 0.82;

/**
 * Koyu temadan kopyalanan imzalarda kalan beyaz yazı rengini kaldırır — arkada
 * onu taşıyan koyu bir zemin yoksa metin varsayılan koyu renge döner.
 */
export const repairInvisibleText = (doc: Document) => {
    doc.body.querySelectorAll<HTMLElement>('[style],font[color]').forEach((el) => {
        const inlineColor = toRgba(el.style.color);
        if (inlineColor && isNearWhite(inlineColor) && !hasDarkBackdrop(el)) {
            el.style.removeProperty('color');
            if (!el.getAttribute('style')) el.removeAttribute('style');
        }
        const attrColor = toRgba(el.getAttribute('color'));
        if (attrColor && isNearWhite(attrColor) && !hasDarkBackdrop(el)) el.removeAttribute('color');
    });
};
