import type { TranslationTree } from './manualTranslations';

export const SUPPORTED_LANGUAGES = ['tr', 'en', 'de'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

type TranslationResource = Record<string, unknown> & {
    auto?: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const mergeTranslations = (base: TranslationResource, overlay: TranslationTree): TranslationResource => {
    const merged: TranslationResource = { ...base };

    Object.entries(overlay).forEach(([key, value]) => {
        const current = merged[key];
        merged[key] = isRecord(current) && isRecord(value)
            ? mergeTranslations(current as TranslationResource, value as TranslationTree)
            : value;
    });

    return merged;
};

// Per-language dynamic imports. Keeping each language behind its own import()
// lets the bundler split the (large) translation data into one chunk per
// language, so only the active language is downloaded and evaluated on startup.
const localeLoaders: Record<SupportedLanguage, () => Promise<{ default: TranslationResource }>> = {
    tr: () => import('./locales/tr.json'),
    en: () => import('./locales/en.json'),
    de: () => import('./locales/de.json'),
};

const manualLoaders: Record<SupportedLanguage, () => Promise<{ default: TranslationTree }>> = {
    tr: () => import('./manual.tr.json'),
    en: () => import('./manual.en.json'),
    de: () => import('./manual.de.json'),
};

// Builds the full `translation` namespace bundle for one language by merging the
// manual overlay over the base locale. Missing `auto.*` entries are formatted
// on demand by i18next's parseMissingKeyHandler, so a large eager key table does
// not need to be downloaded, parsed and expanded on every application start.
export const loadResource = async (language: SupportedLanguage): Promise<TranslationResource> => {
    const [locale, manual] = await Promise.all([localeLoaders[language](), manualLoaders[language]()]);
    return mergeTranslations(locale.default, manual.default);
};
