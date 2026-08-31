/**
 * ── PERSONALMODUL: ANZEIGEFORMATE ────────────────────────────────────────────
 * Alles, was aus einer ISO-Zeichenkette oder einer Sekundenzahl etwas macht,
 * das auf dem Bildschirm oder im PDF steht. Bewusst getrennt von `personnel.ts`:
 * DORT steht die Rechnung (identisch mit dem Server), HIER die Darstellung.
 *
 * Die Datumsformate sind schweizerisch (TT.MM.JJJJ, 24-Stunden-Uhr) — sie sind
 * keine Übersetzung, sondern die Schreibweise des Hauses.
 */
import { t } from '@/i18n/translate';
import { displayLeaveType } from './personnel';
import type { LeaveKind, LeaveStatus, LeaveTypeKey, StaffRole, TimeEntrySource, WorkLocation } from '../types/personnel';

export const EMPTY_CELL = '—';

const pad = (value: number) => String(value).padStart(2, '0');

const asDate = (value: string | Date | null | undefined): Date | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** TT.MM.JJJJ */
export const formatDate = (value: string | Date | null | undefined): string => {
    const date = asDate(value);
    if (!date) return EMPTY_CELL;
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

/** HH:MM */
export const formatTime = (value: string | Date | null | undefined): string => {
    const date = asDate(value);
    if (!date) return EMPTY_CELL;
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatDateTime = (value: string | Date | null | undefined): string => {
    const date = asDate(value);
    if (!date) return EMPTY_CELL;
    return `${formatDate(date)} ${formatTime(date)}`;
};

/** "YYYY-MM-DD" für `<input type="date">`. */
export const toInputDate = (value: string | Date | null | undefined): string => {
    const date = asDate(value);
    if (!date) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** "YYYY-MM-DDTHH:MM" für `<input type="datetime-local">`. */
export const toInputDateTime = (value: string | Date | null | undefined): string => {
    const date = asDate(value);
    if (!date) return '';
    return `${toInputDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};


/**
 * Sekunden als STUNDEN UND MINUTEN ausgeschrieben — „8 Std. 15 Min." (Vorgabe
 * 16.08.2026 für den Detailbericht). Unter einer Stunde bleiben nur die
 * Minuten stehen; die Einheiten kommen aus den hausweiten Schlüsseln
 * `common.hm` / `common.mOnly`, damit sie in jeder Sprache stimmen.
 */
export const formatHoursMinutes = (seconds: number | null | undefined): string => {
    if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return t('common.mOnly', { m: 0 });
    const minutes = Math.round(seconds / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? t('common.hm', { h, m }) : t('common.mOnly', { m });
};

/** Stundenzahl mit zwei Nachkommastellen — die Sprache setzt das Trennzeichen. */
export const formatHours = (hours: number | null | undefined): string => {
    if (hours == null || !Number.isFinite(hours)) return '0.00';
    return hours.toFixed(2);
};

/** Tageszahl: ganze Tage ohne Nachkomma, sonst zwei Stellen. */
export const formatDays = (days: number | null | undefined): string => {
    if (days == null || !Number.isFinite(days) || days === 0) return '0';
    return Number.isInteger(days) ? String(days) : days.toFixed(2);
};

export const isoWeekdayLabel = (isoWeekday: number): string =>
    t(`personnel.weekday.${isoWeekday}`);

export const isoWeekdayShort = (isoWeekday: number): string =>
    t(`personnel.weekdayShort.${isoWeekday}`);

/**
 * Die Urlaubsart, wie sie auf dem Bildschirm und im PDF steht.
 *
 * Bei „Sonstiger Urlaub" gewinnt der FREITEXT: die antragstellende Person hat
 * die Art dort selbst benannt ("Jahresurlaub", "unbezahlter Urlaub" …), und
 * genau dieser Text ist das, was die Buchhaltung lesen will — „Sonstiger
 * Urlaub" allein sagte ihr nichts. Ohne Text bleibt es bei der Kategorie.
 */
export const leaveTypeLabel = (key: LeaveTypeKey | string, customLabel?: string | null): string =>
    displayLeaveType(key, customLabel, t(`personnel.leaveType.${key}`));

export const leaveStatusLabel = (status: LeaveStatus | string): string =>
    t(`personnel.leaveStatus.${status}`);

export const leaveKindLabel = (kind: LeaveKind | string): string =>
    t(`personnel.leaveKind.${kind}`);

export const staffRoleLabel = (role: StaffRole | string): string =>
    t(`personnel.staffRole.${role}`);

export const workLocationLabel = (location: WorkLocation | string): string =>
    t(`personnel.workLocation.${location}`);

export const sourceLabel = (source: TimeEntrySource | string): string =>
    t(`personnel.source.${source}`);

/**
 * Farbschlüssel eines Antragsstands. Rückgabe ist eine Klassenkette, damit die
 * Chips in Liste, Postfach und Buchhaltung IDENTISCH aussehen — ein Stand darf
 * nicht je nach Seite eine andere Farbe tragen.
 */
export const leaveStatusChipClass = (status: LeaveStatus | string): string => {
    switch (status) {
        case 'APPROVED':
            return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30';
        case 'REJECTED':
            return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30';
        case 'PENDING_ACCOUNTING':
            return 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30';
        default:
            return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30';
    }
};

export const appointmentStatusLabel = (status: string): string =>
    t(`personnel.person.apptStatus.${status}`);

/** Farbschlüssel eines Montagetermins — dieselbe Lesart wie im Kalender. */
export const appointmentStatusChipClass = (status: string): string => {
    switch (status) {
        case 'COMPLETED':
            return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30';
        case 'CANCELLED':
            return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30';
        case 'AVAILABLE':
            return 'bg-slate-50 text-slate-500 ring-slate-200 dark:bg-white/5 dark:text-white/55 dark:ring-white/10';
        default:
            return 'bg-[#eef2fb] text-[#1f2654] ring-[#c9d5f0] dark:bg-white/10 dark:text-white/80 dark:ring-white/15';
    }
};

/**
 * Die Mitarbeiter-Nr., wie sie im Bericht steht.
 *
 * Sie zählt ab 1 und wird AUTOMATISCH vergeben (Vorgabe): normalerweise ist es
 * die gespeicherte Personalnummer, und wo noch keine vergeben wurde, springt
 * die laufende Nummer der Auswertung ein. So steht dort nie ein Strich, auch
 * nicht bei Personen, die über einen älteren Weg angelegt wurden.
 */
export const staffNumberDisplay = (
    staffNumber: number | null | undefined,
    ordinal?: number,
): string => String(staffNumber ?? ordinal ?? EMPTY_CELL);

/**
 * Laufende Nummern je Person, in der Reihenfolge des ersten Auftretens. Der
 * Detailbericht führt eine Person in vielen Zeilen — sie muss in allen dieselbe
 * Nummer tragen, sonst wäre die Spalte eine Zeilennummer.
 */
export const buildStaffOrdinals = (employeeIds: readonly string[]): Map<string, number> => {
    const ordinals = new Map<string, number>();
    for (const id of employeeIds) {
        if (!ordinals.has(id)) ordinals.set(id, ordinals.size + 1);
    }
    return ordinals;
};

export const fullName = (person: { firstName?: string; lastName?: string } | null | undefined): string =>
    [person?.firstName, person?.lastName].filter(Boolean).join(' ').trim() || EMPTY_CELL;

/** Erster Tag des laufenden Monats als "YYYY-MM-DD". */
export const firstDayOfMonth = (reference = new Date()): string =>
    toInputDate(new Date(reference.getFullYear(), reference.getMonth(), 1));

/** Letzter Tag des laufenden Monats als "YYYY-MM-DD". */
export const lastDayOfMonth = (reference = new Date()): string =>
    toInputDate(new Date(reference.getFullYear(), reference.getMonth() + 1, 0));

/* ── ANTRAGSARTEN UND ABWESENHEITEN (26.08.2026) ─────────────────────────────── */

/**
 * Die Antragsart, wie sie auf dem Reiter, im Filter und auf der Karte steht.
 * Bei «Sonstiges» gewinnt der FREITEXT, in dem die Person die Art selbst
 * benannt hat — dieselbe Regel wie bei `leaveTypeLabel`.
 */
export const requestTypeLabel = (requestType: string, customLabel?: string | null): string => {
    const custom = String(customLabel ?? '').trim();
    if (requestType === 'OTHER' && custom) return custom;
    return t(`personnel.requestType.${requestType}`);
};

/**
 * Die Farbe einer Antragsart. Sie ist überall dieselbe — Reiter, Karte,
 * Kalenderpunkt —, weil die Farbe beim Überfliegen die Art trägt und nicht
 * je Seite etwas anderes bedeuten darf.
 */
export const requestTypeChipClass = (requestType: string): string => {
    switch (requestType) {
        case 'VACATION':
            return 'bg-[#eef2fb] text-[#1f2654] ring-[#c9d5f0] dark:bg-white/10 dark:text-white/85 dark:ring-white/15';
        case 'REMOTE':
            return 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30';
        case 'SICK':
            return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30';
        default:
            return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/15';
    }
};

export const absenceKindLabel = (kind: string, customLabel?: string | null): string => {
    const custom = String(customLabel ?? '').trim();
    if (kind === 'OTHER' && custom) return custom;
    return t(`personnel.absence.${kind}`);
};

/** Der unerklärte Fehltag ist der einzige, der ROT steht — er ist die Frage. */
export const absenceKindChipClass = (kind: string): string => {
    switch (kind) {
        case 'ABSENT':
            return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30';
        case 'VACATION':
            return 'bg-[#eef2fb] text-[#1f2654] ring-[#c9d5f0] dark:bg-white/10 dark:text-white/85 dark:ring-white/15';
        case 'SICK':
            return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30';
        case 'REMOTE':
            return 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30';
        default:
            return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/15';
    }
};

/** Dateigrösse in KB/MB — die Unterlagen der Personalakte. */
export const formatFileSize = (bytes: number | null | undefined): string => {
    if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return EMPTY_CELL;
    if (bytes < 1024) return t('personnel.doc.bytes', { count: bytes });
    if (bytes < 1024 * 1024) return t('personnel.doc.kilobytes', { count: Math.round(bytes / 1024) });
    return t('personnel.doc.megabytes', { count: (bytes / (1024 * 1024)).toFixed(1) });
};

/** Tageszahl eines Urlaubskontos: halbe Tage bleiben halb, ganze bleiben ganz. */
export const formatLeaveDays = (days: number | null | undefined): string => {
    if (days == null || !Number.isFinite(days)) return '0';
    return Number.isInteger(days) ? String(days) : days.toFixed(1);
};
