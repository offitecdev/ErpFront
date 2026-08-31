/**
 * Gemeinsame Klassen des Formular-Moduls — reines Tailwind, KEIN antd
 * (neue Flächen: nur TypeScript + CSS). Die Knopf-Klassen entsprechen denen
 * der CRM-Seiten (Aufgaben/Erinnerungen), damit das Modul nicht anders aussieht.
 */
import type { FormSubmissionLinkDto } from '@/lib/api/forms';
import type { CrmCustomerOption } from '../types/crm.types';
import type { ChecklistLinkPreset } from './components/ChecklistLinkSheet';

export const BTN_PRIMARY =
    'ofi-btn-brand inline-flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-50';
export const BTN_SECONDARY =
    'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-transparent dark:text-white/70 dark:hover:text-white';
export const BTN_DANGER_OUTLINE =
    'inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/40 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10';
export const BTN_SUCCESS =
    'inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';
/** Kleiner Symbolknopf in Tabellenzeilen. */
export const BTN_ICON =
    'inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/70 dark:hover:text-white';
export const BTN_ICON_DANGER =
    'inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:hover:bg-red-500/10';

export const INPUT_CLASS =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13.5px] text-slate-800 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-[#1f2654] focus:outline-none focus:ring-2 focus:ring-[#1f2654]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/15 dark:bg-transparent dark:text-white dark:disabled:bg-white/5';
export const TEXTAREA_CLASS =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] leading-relaxed text-slate-800 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-[#1f2654] focus:outline-none focus:ring-2 focus:ring-[#1f2654]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/15 dark:bg-transparent dark:text-white dark:disabled:bg-white/5';
export const SELECT_CLASS =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13.5px] text-slate-800 transition-colors hover:border-slate-300 focus:border-[#1f2654] focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-white';
export const LABEL_CLASS = 'block text-[12px] font-semibold text-slate-600 dark:text-white/70';

/** Weisse Karte mit dünnem Rand — die Fläche eines Feldes / Abschnitts. */
export const CARD_CLASS = 'rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-white/15 dark:bg-transparent dark:shadow-none';

/**
 * Die Verknüpfungen einer Checkliste als Zeilen für die Verknüpfungstabelle:
 * eine Zeile je Kunde, die Angebote dieses Kunden darin gebündelt. Seit dem
 * 16.08.2026 hängt EINE Checkliste an mehreren Kunden — deshalb wird hier
 * gruppiert statt einfach durchgereicht.
 */
export const presetsFromLinks = (links: FormSubmissionLinkDto[]): ChecklistLinkPreset[] => {
    const byCustomer = new Map<string, ChecklistLinkPreset>();
    for (const link of links) {
        if (!link.customerId) continue;
        const entry = byCustomer.get(link.customerId) ?? {
            customer: { id: link.customerId, companyName: link.customerName || '' } as CrmCustomerOption,
            tenders: [],
        };
        if (link.tenderId && !entry.tenders.some((tender) => tender.id === link.tenderId)) {
            entry.tenders.push({ id: link.tenderId, tenderNumber: link.tenderNumber });
        }
        byCustomer.set(link.customerId, entry);
    }
    return [...byCustomer.values()];
};

/** Alle Kundennamen einer Checkliste als eine Zeile (Liste/Editor). */
export const linkedCustomerLine = (row: { linkedCustomerNames?: string | null; customerName?: string | null }): string =>
    (row.linkedCustomerNames || row.customerName || '').trim();

export const fmtDate = (value?: string | Date | null, locale = 'de-CH'): string => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale);
};

export const fmtDateTime = (value?: string | Date | null, locale = 'de-CH'): string => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '—'
        : `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
};

export const apiErrorMessage = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

/** Datei → Data-URL (für PDF-/Dateianhänge; Fotos werden separat verkleinert). */
export const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
    });

/** Grosse Fotos vor dem Speichern verkleinern (max. 1600 px, JPEG 0.82). */
export const imageFileToScaledDataUrl = (file: File, maxDimension = 1600, quality = 0.82) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const img = new Image();
            img.onerror = () => resolve(dataUrl);
            img.onload = () => {
                const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
                if (scale >= 1) return resolve(dataUrl);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(dataUrl);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });

export const formatBytes = (bytes: number): string => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/** Data-URL als Datei speichern (Anhänge, Zeichnungen). */
export const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};
