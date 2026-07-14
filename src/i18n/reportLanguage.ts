import i18n from './index';
import { formatMissingTranslationKey } from './autoFallback';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './loadResources';

// ─────────────────────────────────────────────────────────────────────────────
// Customer-language reporting helper.
// Field reports (Montage-Rapport) and delivery reports (Schlussrapport) must be
// rendered in the customer's preferred correspondence language — not the active
// UI language of the user generating the PDF. This resolves a stored customer
// language code to a supported i18n language, lazily loads its translation
// bundle, and returns a translator bound to that language.
// ─────────────────────────────────────────────────────────────────────────────

const isSupported = (lng: string): lng is SupportedLanguage =>
    (SUPPORTED_LANGUAGES as readonly string[]).includes(lng);

// Maps a customer's stored language code (e.g. "TR"/"EN"/"DE", any casing) onto
// a supported i18n language. Unknown/empty falls back to the active UI language
// so a report never renders in an unexpected language.
export const resolveCustomerLanguage = (code?: string | null): SupportedLanguage => {
    const wanted = String(code ?? '').trim().toLowerCase();
    if (isSupported(wanted)) return wanted;
    const active = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase();
    return isSupported(active) ? active : 'tr';
};

// BCP-47 locale used for date/time formatting in reports. The company operates
// in Switzerland, so German reports use the Swiss locale.
export const localeForLanguage = (lng: SupportedLanguage): string =>
    lng === 'tr' ? 'tr-TR' : lng === 'en' ? 'en-GB' : 'de-CH';

export type FixedTranslator = (key: string, options?: Record<string, unknown>) => string;

export interface ReportTranslator {
    /** Translate a key in the customer's language. */
    t: FixedTranslator;
    /** The resolved supported language ('tr' | 'en' | 'de'). */
    lng: SupportedLanguage;
    /** BCP-47 locale for Intl date/time formatting. */
    locale: string;
}

// Ensures the customer's language bundle is loaded, then returns a translator
// bound to it. Mirrors the missing-key fallback of the app-wide `t` wrapper.
export const getReportTranslator = async (code?: string | null): Promise<ReportTranslator> => {
    const lng = resolveCustomerLanguage(code);
    await i18n.loadLanguages(lng);
    const fixed = i18n.getFixedT(lng);
    const t: FixedTranslator = (key, options) => {
        const translated = fixed(key, options) as string;
        return translated === key ? formatMissingTranslationKey(key, lng) : translated;
    };
    return { t, lng, locale: localeForLanguage(lng) };
};
