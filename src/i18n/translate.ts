import i18n from './index';
import { formatMissingTranslationKey } from './autoFallback';

export const t = (key: string, options?: Record<string, unknown>): string => {
    const translated = i18n.t(key, options);
    return translated === key ? formatMissingTranslationKey(key) : translated;
};
