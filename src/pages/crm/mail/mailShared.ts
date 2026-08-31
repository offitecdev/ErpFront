import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import type { MailCategoryDto, MailMessageDetail, MailMessageRow, MailParty } from '@/lib/api/mail';

/* Kleine Helfer der Postfach-Seite: Anzeigenamen, Datumskurzform, Farbe der
   Initiale, Zitat für Antworten.

   Die Filterleiste (Bereich/Kunden/Personal/Zeitraum) ist ABGESCHAFFT
   (Vorgabe 08.09.2026) — geordnet wird über KATEGORIEN in der Leiste links. */

export type MailFolderKey = 'inbox' | 'sent' | 'bin';

/** Anzeigename einer Kategorie — «Anfragen» kommt aus der Sprache, nicht aus
    der Datenbank (der gespeicherte Name ist nur der Rückfall). */
export const categoryLabel = (category: MailCategoryDto): string =>
    (category.kind === 'REQUESTS' ? t('mail.categories.requests') : category.name);

const lang = () => (i18n.language || 'de').slice(0, 2);

/** Gegenstelle einer Nachricht — Absender (IN) bzw. erster Empfänger (OUT). */
export const counterpartOf = (row: Pick<MailMessageRow, 'direction' | 'fromName' | 'fromAddress' | 'toRecipients'>): MailParty => {
    if (row.direction === 'IN') return { name: row.fromName, address: row.fromAddress || '' };
    const first = row.toRecipients?.[0];
    return first ? { name: first.name, address: first.address } : { name: null, address: '' };
};

export const partyLabel = (party: MailParty | null | undefined): string => {
    if (!party) return '';
    return party.name?.trim() || party.address || '';
};

export const partyFull = (party: MailParty | null | undefined): string => {
    if (!party) return '';
    const name = party.name?.trim();
    return name && name !== party.address ? `${name} <${party.address}>` : (party.address || '');
};

export const initialOf = (label: string): string => {
    const clean = label.replace(/[<>"']/g, '').trim();
    if (!clean) return '?';
    const at = clean.indexOf('@');
    const source = at > 0 ? clean.slice(0, at) : clean;
    return source.trim().charAt(0).toUpperCase() || '?';
};

/* Die Farbtöne der Referenz-Kalenderkarten (Google-Palette), aus dem Namen
   abgeleitet — dieselbe Adresse bekommt immer dieselbe Farbe. */
const AVATAR_COLORS = ['#039be5', '#3f51b5', '#0b8043', '#33b679', '#8e24aa', '#f4511e', '#e67c73', '#7986cb', '#616161', '#f6bf26'];
export const avatarColor = (seed: string): string => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
};

/** Listenkurzform: heute → Uhrzeit, dieses Jahr → "17. Aug.", sonst Datum. */
export const shortDate = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return new Intl.DateTimeFormat(lang(), { hour: '2-digit', minute: '2-digit' }).format(date);
    if (date.getFullYear() === now.getFullYear()) return new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short' }).format(date);
    return new Intl.DateTimeFormat(lang(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export const longDate = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(lang(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};

/** Zitat für Antwort/Weiterleitung — schlicht, mit ">"-Präfix. */
export const quoteMessage = (detail: MailMessageDetail, header: string): string => {
    const lines = String(detail.bodyText || detail.bodyPreview || '').split('\n').map((line) => `> ${line}`);
    return `\n\n${header}\n${lines.join('\n')}`;
};

export const replySubject = (subject: string | null) => {
    const clean = (subject || '').trim();
    return /^(re|aw|antw|wg)\s*:/i.test(clean) ? clean : `Re: ${clean}`;
};
export const forwardSubject = (subject: string | null) => {
    const clean = (subject || '').trim();
    return /^(fwd?|wg|tr)\s*:/i.test(clean) ? clean : `Fwd: ${clean}`;
};

export const formatBytes = (bytes: number | null | undefined) => {
    if (!bytes) return '';
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
