import { t } from '@/i18n/translate';
import type { EnquiryPriority, EnquirySource, EnquiryStatus } from '@/lib/api/enquiries';

/* Gemeinsame Beschriftungen und Farben der Anfragen — EINE Stelle, damit
   Liste, Fenster und Zeitleiste dieselben Wörter benutzen. */

/** Die Reihenfolge der Reiter über der Liste. */
export const ENQUIRY_STATUSES: EnquiryStatus[] = [
    'NEW', 'IN_PROGRESS', 'ANSWERED', 'CONVERTED', 'CLOSED', 'SPAM',
];

export const ENQUIRY_SOURCES: EnquirySource[] = ['FORM', 'MAIL', 'MANUAL'];
export const ENQUIRY_PRIORITIES: EnquiryPriority[] = ['LOW', 'NORMAL', 'HIGH'];

export const statusLabel = (status: EnquiryStatus): string => t(`crm.enquiry.status.${status}`);
export const sourceLabel = (source: EnquirySource): string => t(`crm.enquiry.source.${source}`);
export const priorityLabel = (priority: EnquiryPriority): string => t(`crm.enquiry.priority.${priority}`);

/**
 * Der PUNKT vor dem Stand. Bewusst gedeckt: die Zeile soll ruhig bleiben, der
 * Punkt nur einordnen. Die Werte sind die der Kalenderkarten, damit im ganzen
 * Programm dieselben Farben dasselbe bedeuten.
 */
export const statusDot: Record<EnquiryStatus, string> = {
    NEW: '#039be5',          // Peacock — frisch hereingekommen
    IN_PROGRESS: '#f6bf26',  // Banana — jemand ist dran
    ANSWERED: '#33b679',     // Basil — beantwortet
    CONVERTED: '#0b8043',    // dunkles Grün — daraus wurde ein Kunde
    CLOSED: '#9aa0a6',       // grau — erledigt
    SPAM: '#c4c7cc',         // fast unsichtbar — es soll nicht auffallen
};

/** Namenszeile einer Anfrage: Firma, sonst Person, sonst die Adresse. */
export const enquiryWho = (row: {
    companyName: string | null;
    contactName: string | null;
    email: string | null;
}): string => row.companyName || row.contactName || row.email || t('crm.enquiry.unknownSender');

/** «vor 3 Min.» / «14:22» / «12. Sep.» — dieselbe Staffelung wie im Postfach. */
export const shortWhen = (iso: string, locale: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString(locale, sameYear
        ? { day: '2-digit', month: 'short' }
        : { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Volles Datum mit Uhrzeit — im Fenster, wo Platz ist. */
export const fullWhen = (iso: string | null, locale: string): string => {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(locale, {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
};

/** Tagesüberschrift der Zeitleiste — «Heute», «Gestern» oder das Datum. */
export const dayHeading = (iso: string, locale: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return t('common.today');
    if (date.toDateString() === yesterday.toDateString()) return t('crm.activity.yesterday');
    return date.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long' });
};

/** Der Schlüssel, an dem die Zeitleiste einen Tagesblock erkennt. */
export const dayKey = (iso: string): string => iso.slice(0, 10);

/** Fehlertext einer abgewiesenen Anfrage an den Server. */
export const enquiryError = (error: unknown, fallbackKey: string): string => {
    const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
    return message || t(fallbackKey);
};
