import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import tr from './locales/tr.json';
import en from './locales/en.json';
import de from './locales/de.json';
import { autoTranslations } from './autoTranslations';
import { formatMissingTranslationKey } from './autoFallback';
import { manualTranslations, type TranslationTree } from './manualTranslations';

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

const withTranslations = (resource: TranslationResource, manual: TranslationTree, auto: Record<string, string>) => {
    const merged = mergeTranslations(resource, manual);
    return {
        ...merged,
        auto: {
            ...auto,
            ...(merged.auto ?? {}),
        },
    };
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            tr: { translation: withTranslations(tr, manualTranslations.tr, autoTranslations.tr) },
            en: { translation: withTranslations(en, manualTranslations.en, autoTranslations.en) },
            de: { translation: withTranslations(de, manualTranslations.de, autoTranslations.de) },
        },
        fallbackLng: 'tr',
        supportedLngs: ['tr', 'en', 'de'],
        // Map region-specific browser locales onto the base language so
        // de-DE/de-CH -> de, en-US/en-GB -> en, tr-TR -> tr.
        load: 'languageOnly',
        nonExplicitSupportedLngs: true,
        interpolation: { escapeValue: false },
        returnEmptyString: false,
        parseMissingKeyHandler: (key, defaultValue) =>
            defaultValue || formatMissingTranslationKey(key, i18n.resolvedLanguage || i18n.language),
        detection: {
            // No stored choice yet -> fall back to the browser's language.
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'offitec:lang',
        },
    });

export default i18n;
