// The manual translation overlay data now lives in per-language JSON files
// (`manual.tr.json`, `manual.en.json`, `manual.de.json`) so the bundler can
// split it into one chunk per language and load only the active one on startup.
// This module keeps only the shared types; edit the JSON files to change strings.

export type LocaleCode = 'tr' | 'en' | 'de';

export type TranslationTree = {
    [key: string]: string | TranslationTree;
};
