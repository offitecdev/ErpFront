import 'dayjs/locale/de';
import 'dayjs/locale/tr';
import i18n from '@/i18n';

/**
 * Locale tag for dayjs, taken from the language the user actually picked.
 *
 * Used PER INSTANCE (`date.locale(dayjsLocaleTag()).format('MMM')`) rather than
 * through the global `dayjs.locale()`, so a page that wants a translated month
 * or weekday cannot silently re-format dates everywhere else. Without it
 * `format('MMM')`/`format('ddd')` fall back to English inside a German screen —
 * see the "one language on screen" rule.
 */
export const dayjsLocaleTag = (): string => {
    const lang = (i18n.resolvedLanguage || i18n.language || 'de').split('-')[0];
    return lang === 'de' ? 'de' : lang === 'tr' ? 'tr' : 'en';
};
