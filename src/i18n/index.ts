import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import tr from './locales/tr.json';
import en from './locales/en.json';
import de from './locales/de.json';
import { autoTranslations } from './autoTranslations';
import { formatMissingTranslationKey } from './autoFallback';

type TranslationResource = Record<string, unknown> & {
    auto?: Record<string, string>;
};

const withAutoTranslations = (resource: TranslationResource, auto: Record<string, string>) => ({
    ...resource,
    auto: {
        ...auto,
        ...(resource.auto ?? {}),
    },
});

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            tr: { translation: withAutoTranslations(tr, autoTranslations.tr) },
            en: { translation: withAutoTranslations(en, autoTranslations.en) },
            de: { translation: withAutoTranslations(de, autoTranslations.de) },
        },
        fallbackLng: 'tr',
        supportedLngs: ['tr', 'en', 'de'],
        interpolation: { escapeValue: false },
        returnEmptyString: false,
        parseMissingKeyHandler: (key) => formatMissingTranslationKey(key),
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'offitec:lang',
        },
    });

export default i18n;
