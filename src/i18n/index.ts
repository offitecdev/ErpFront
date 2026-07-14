import i18n from 'i18next';
import type { BackendModule, ReadCallback } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { formatMissingTranslationKey } from './autoFallback';
import { loadResource, SUPPORTED_LANGUAGES, type SupportedLanguage } from './loadResources';

// Custom i18next backend that resolves each language from its own lazily
// imported chunk (see loadResources). i18next only asks for the active language
// and the `tr` fallback on startup, and fetches any other language the first
// time the user switches to it — so we no longer parse/execute all three
// translation tables up front.
const lazyBackend: BackendModule = {
    type: 'backend',
    init: () => undefined,
    read: (language: string, _namespace: string, callback: ReadCallback) => {
        if (!SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
            callback(null, {});
            return;
        }
        loadResource(language as SupportedLanguage).then(
            (resource) => callback(null, resource),
            (error) => callback(error as Error, null),
        );
    },
};

// Keeps the browser tab title in sync with the active language. Called once init
// resolves and again on every language switch, so the tab reads e.g. "Offitec
// Management Panel" / "Offitec Verwaltungspanel" / "Offitec Yönetim Paneli".
const syncDocumentTitle = (): void => {
    if (typeof document !== 'undefined') {
        document.title = i18n.t('common.appTitle');
    }
};

let initPromise: Promise<unknown> | null = null;

// Kicks off i18next initialisation and returns a promise that resolves once the
// active language (and its fallback) are loaded. main.tsx awaits this before the
// first render so there is no missing-translation flash. Safe to call repeatedly.
export const initI18n = (): Promise<unknown> => {
    if (!initPromise) {
        initPromise = i18n
            .use(lazyBackend)
            .use(LanguageDetector)
            .use(initReactI18next)
            .init({
                fallbackLng: 'tr',
                supportedLngs: [...SUPPORTED_LANGUAGES],
                // Map region-specific browser locales onto the base language so
                // de-DE/de-CH -> de, en-US/en-GB -> en, tr-TR -> tr.
                load: 'languageOnly',
                nonExplicitSupportedLngs: true,
                interpolation: { escapeValue: false },
                returnEmptyString: false,
                // Resources load asynchronously via the backend; disabling Suspense
                // keeps rendering behaviour identical to the old eager setup (no
                // Suspense boundary is relied upon during a language switch).
                react: { useSuspense: false },
                parseMissingKeyHandler: (key, defaultValue) =>
                    defaultValue || formatMissingTranslationKey(key, i18n.resolvedLanguage || i18n.language),
                detection: {
                    // No stored choice yet -> fall back to the browser's language.
                    order: ['localStorage', 'navigator'],
                    caches: ['localStorage'],
                    lookupLocalStorage: 'offitec:lang',
                },
            })
            .then(() => {
                syncDocumentTitle();
                i18n.on('languageChanged', syncDocumentTitle);
            });
    }
    return initPromise;
};

export default i18n;
