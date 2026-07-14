import dayjs from 'dayjs';

import { t } from '@/i18n/translate';

/** Trim any value to a clean string. */
export const cleanText = (value: unknown) => String(value ?? '').trim();

/** Strip leading/trailing separators (`: . -`) from a translated label. */
export const cleanLabel = (value: string) => value.replace(/^[\s:.\-]+|[\s:.\-]+$/g, '').trim();

/** `DD.MM.YYYY`, or `-` when empty/invalid. */
export const dateFmt = (value?: string | null) => {
    if (!value) return '-';
    const date = dayjs(value);
    return date.isValid() ? date.format('DD.MM.YYYY') : '-';
};

/** `HH:mm`, or `-` when empty/invalid. */
export const timeFmt = (value?: string | null) => {
    if (!value) return '-';
    const date = dayjs(value);
    return date.isValid() ? date.format('HH:mm') : '-';
};

/** Whole minutes between two ISO timestamps (never negative). */
export const minutesBetweenValues = (start?: string | null, end?: string | null) => {
    if (!start || !end) return 0;
    const started = dayjs(start);
    const ended = dayjs(end);
    if (!started.isValid() || !ended.isValid()) return 0;
    return Math.max(0, ended.diff(started, 'minute'));
};

/** Human duration, e.g. `2 h 15 min`. */
export const durationFmt = (minutes?: number | null) => {
    const total = Math.max(0, Math.round(Number(minutes || 0)));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return `${hours} ${t('common.hours')} ${mins} ${t('common.minutes')}`;
    if (hours) return `${hours} ${t('common.hours')}`;
    return `${mins} ${t('common.minutes')}`;
};

/** Full name (or email fallback) for a person-like record. */
export const personName = (person?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) =>
    cleanText([person?.firstName, person?.lastName].filter(Boolean).join(' ')) || cleanText(person?.email) || '-';
