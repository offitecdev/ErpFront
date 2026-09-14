import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import type { LabelColor, ManualTaskStatus, PeopleMap, TaskPriority, TaskStatus } from '@/types/tasksModule';

/**
 * ── ANZEIGE-HILFEN DES GÖREVLER-MODULS ───────────────────────────────────────
 *
 * Alles, was ein Wert auf dem Bildschirm braucht, damit er in der gewählten
 * Sprache steht (Vorgabe: nichts Sichtbares an i18n vorbei): Zustandsnamen,
 * Dauer, Restzeit, Datum, Dateigrösse. Rechnungen gehören dem Server — hier
 * wird nur formatiert.
 */

export const DAY_MS = 86_400_000;

/** Die Einführungsaufgabe (Server: taskOnboarding.ts) bekommt keinen Chat-Raum. */
export const isOnboardingTaskId = (taskId: string): boolean => taskId.startsWith('tasks-welcome-');

export const localeTag = (): string => {
    const language = (i18n.resolvedLanguage || i18n.language || 'de').slice(0, 2);
    if (language === 'tr') return 'tr-TR';
    if (language === 'en') return 'en-GB';
    return 'de-CH';
};

/* ── Zustände ───────────────────────────────────────────────────────────── */

export type StatusTone = 'neutral' | 'progress' | 'review' | 'done' | 'alert';

const STATUS_TONE: Record<TaskStatus, StatusTone> = {
    NOT_STARTED: 'neutral',
    IN_PROGRESS: 'progress',
    REVIEW: 'review',
    PENDING_APPROVAL: 'review',
    COMPLETED: 'done',
    BLOCKED: 'alert',
    REJECTED: 'alert',
};

export const statusTone = (status: TaskStatus): StatusTone => STATUS_TONE[status] ?? 'neutral';
export const statusLabel = (status: TaskStatus): string => t(`tasksModule.status.${status}`);

export const MANUAL_STATUSES: ManualTaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];

export const priorityLabel = (priority: TaskPriority): string => t(`tasksModule.priority.${priority}`);

export const isOpenStatus = (status: TaskStatus): boolean => status !== 'COMPLETED' && status !== 'REJECTED';

/* ── Etiketten ──────────────────────────────────────────────────────────── */

export const LABEL_COLORS: LabelColor[] = ['gray', 'blue', 'green', 'orange', 'red', 'purple'];

export const labelColorName = (color: LabelColor): string => t(`tasksModule.labels.colors.${color}`);

/* ── Personen ───────────────────────────────────────────────────────────── */

export const personName = (people: PeopleMap | undefined, id: string | null | undefined): string => {
    if (!id) return '';
    const person = people?.[id];
    return person?.name || t('tasksModule.common.unknownPerson');
};

/* ── Dauer ──────────────────────────────────────────────────────────────── */

/** Görevly `U.dur`: < 1 min «N sn», < 1 h «M dk», sonst «H sa M dk». */
export const formatDuration = (ms: number | null | undefined): string => {
    const total = Math.max(0, Math.round((ms ?? 0) / 1000));
    if (total < 60) return t('tasksModule.duration.seconds', { count: total });
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return t('tasksModule.duration.minutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest
        ? t('tasksModule.duration.hoursMinutes', { hours, minutes: rest })
        : t('tasksModule.duration.hours', { count: hours });
};

/** Laufende Uhr: hh:mm:ss. */
export const formatClock = (ms: number): string => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

/* ── Restzeit ───────────────────────────────────────────────────────────── */

export interface RemainingInfo {
    text: string;
    tone: 'late' | 'soon' | '';
}

/** Görevly `U.remaining`: «3 gün 4 sa kaldı» / «2 sa gecikti». */
export const remainingInfo = (dueAt: string | null | undefined, nowMs: number): RemainingInfo | null => {
    if (!dueAt) return null;
    const due = Date.parse(dueAt);
    if (!Number.isFinite(due)) return null;
    const diff = due - nowMs;
    const overdue = diff < 0;
    const abs = Math.abs(diff);
    const days = Math.floor(abs / DAY_MS);
    const hours = Math.floor((abs % DAY_MS) / 3_600_000);
    const minutes = Math.floor((abs % 3_600_000) / 60_000);
    let amount: string;
    if (days >= 1) {
        amount = days < 7 && hours
            ? t('tasksModule.remaining.daysHours', { days, hours })
            : t('tasksModule.remaining.days', { count: days });
    } else if (hours >= 1) {
        amount = minutes
            ? t('tasksModule.remaining.hoursMinutes', { hours, minutes })
            : t('tasksModule.remaining.hours', { count: hours });
    } else {
        amount = t('tasksModule.remaining.minutes', { count: Math.max(1, minutes) });
    }
    return {
        text: t(overdue ? 'tasksModule.remaining.overdue' : 'tasksModule.remaining.left', { amount }),
        tone: overdue ? 'late' : abs < DAY_MS ? 'soon' : '',
    };
};

/* ── Datum ──────────────────────────────────────────────────────────────── */

const startOfDay = (ms: number): number => {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

export const endOfDay = (date: Date): Date => {
    const copy = new Date(date);
    copy.setHours(23, 59, 0, 0);
    return copy;
};

export const formatTime = (iso: string): string =>
    new Intl.DateTimeFormat(localeTag(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const formatDay = (iso: string): string =>
    new Intl.DateTimeFormat(localeTag(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));

export const formatDayTime = (iso: string): string => `${formatDay(iso)} ${formatTime(iso)}`;

/** «Heute 14:00» · «Morgen» · «Gestern 09:12» · «12.09.2026». */
export const smartDate = (iso: string | null | undefined, withTime = false, nowMs = Date.now()): string => {
    if (!iso) return '';
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    const dayDiff = Math.round((startOfDay(ms) - startOfDay(nowMs)) / DAY_MS);
    const time = withTime ? ` ${formatTime(iso)}` : '';
    if (dayDiff === 0) return `${t('tasksModule.date.today')}${time}`;
    if (dayDiff === 1) return `${t('tasksModule.date.tomorrow')}${time}`;
    if (dayDiff === -1) return `${t('tasksModule.date.yesterday')}${time}`;
    return `${formatDay(iso)}${time}`;
};

/** «vor 5 Minuten» in der Sprache der Anwendung. */
export const relativeTime = (iso: string | null | undefined, nowMs = Date.now()): string => {
    if (!iso) return '';
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    const seconds = Math.round((ms - nowMs) / 1000);
    const format = new Intl.RelativeTimeFormat(localeTag(), { numeric: 'auto' });
    const abs = Math.abs(seconds);
    if (abs < 60) return format.format(seconds, 'second');
    if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
    if (abs < 86_400) return format.format(Math.round(seconds / 3600), 'hour');
    if (abs < 7 * 86_400) return format.format(Math.round(seconds / 86_400), 'day');
    return formatDay(iso);
};

/** ISO ↔ Felder der Datums-/Zeitauswahl (lokale Zeit). */
export const isoToDateInput = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const isoToTimeInput = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/** Tag «YYYY-MM-DD» + Zeit «HH:mm» (Vorgabe 18:00, wie Görevly) → ISO. */
export const dateTimeInputToIso = (day: string, time: string, fallbackTime = '18:00'): string | null => {
    if (!day) return null;
    const [year, month, date] = day.split('-').map(Number);
    const [hours, minutes] = (time || fallbackTime).split(':').map(Number);
    if (!year || !month || !date) return null;
    const value = new Date(year, month - 1, date, hours || 0, minutes || 0, 0, 0);
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
};

/* ── Dateien ────────────────────────────────────────────────────────────── */

export const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
    return `${Math.round(bytes / (1024 * 104.8576)) / 10} MB`;
};
