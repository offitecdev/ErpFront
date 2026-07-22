import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import type { ProjectStatus } from '@/types/project';

// ---------------------------------------------------------------------------
// Money / number / duration formatting used across the project detail screen.
// ---------------------------------------------------------------------------

// Constructing an Intl.NumberFormat is relatively expensive; these formatters are
// called in tight render loops (cost lists, material rows), so keep one shared
// instance each at module scope instead of rebuilding one per call.
const currencyFormatter = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 });
const decimalFormatter = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 });

export const money = (value?: number | null) => currencyFormatter.format(value || 0);

export const numberFmt = (value?: number | null) => decimalFormatter.format(value || 0);

export const durationFmt = (minutes?: number | null) => {
    const total = Math.max(0, Number(minutes || 0));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return `${hours} ${t('common.hours')} ${mins} ${t('common.minutes')}`;
    if (hours) return `${hours} ${t('common.hours')}`;
    return `${mins} ${t('common.minutes')}`;
};

// ---------------------------------------------------------------------------
// Date / time helpers (display-only).
// ---------------------------------------------------------------------------

export const formatDate = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '-');

export const formatDateTime = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '-');

export const formatTime = (value?: string | null) => (value ? dayjs(value).format('HH:mm') : '-');

// Backend stores this exact Turkish sentence when a job is auto-completed at day end; translate it on display.
export const AUTO_DAYEND_OPERATIONS = 'Saha çalışması gün sonunda otomatik olarak tamamlandı.';

export const displayOperationsDone = (text?: string | null) =>
    text === AUTO_DAYEND_OPERATIONS ? t('projects.autoCompletedAtDayEnd') : text || '';

const expenseTypeKeys: Record<string, 'transport' | 'equipmentRental' | 'externalServices' | 'subcontractor' | 'other'> = {
    nakliye: 'transport',
    transport: 'transport',
    'ekipman kiralama': 'equipmentRental',
    'gerätemiete': 'equipmentRental',
    'equipment rental': 'equipmentRental',
    'dış hizmetler': 'externalServices',
    'dÄ±ÅŸ hizmetler': 'externalServices',
    'dis hizmetler': 'externalServices',
    'externe dienstleistungen': 'externalServices',
    'external services': 'externalServices',
    taşeron: 'subcontractor',
    'taÅŸeron': 'subcontractor',
    taseron: 'subcontractor',
    subunternehmer: 'subcontractor',
    subcontractor: 'subcontractor',
    diğer: 'other',
    'diÄŸer': 'other',
    diger: 'other',
    andere: 'other',
    sonstige: 'other',
    other: 'other',
};

export const displayExpenseType = (value?: string | null) => {
    const key = expenseTypeKeys[(value || '').trim().toLowerCase()];
    return key ? t(`projects.expenseTypes.${key}`) : value || '';
};

// ---------------------------------------------------------------------------
// Project status presentation (chip variant + localized label).
// ---------------------------------------------------------------------------

export const STATUS_VARIANT: Record<ProjectStatus, 'warning' | 'active' | 'approved' | 'passive' | 'info' | 'danger'> = {
    AWAITING_APPROVAL: 'warning',
    // ACTIVE renders in brand blue ('approved') so it reads distinctly from the
    // green COMPLETED chip. See ProjectStatusBadge.
    ACTIVE: 'approved',
    ON_HOLD: 'info',
    COMPLETED: 'active',
    SPECIALLY_CLOSED: 'danger',
    CANCELLED: 'passive',
};

export const getStatusLabel = (): Record<ProjectStatus, string> => ({
    AWAITING_APPROVAL: t('projects.statusPending'),
    ACTIVE: t('common.active'),
    ON_HOLD: t('projects.statusOnHold'),
    COMPLETED: t('common.completed'),
    SPECIALLY_CLOSED: t('projects.specialClosure.status'),
    CANCELLED: t('common.cancel'),
});
