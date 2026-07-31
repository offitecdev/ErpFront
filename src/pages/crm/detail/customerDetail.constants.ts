/**
 * ── KUNDENDETAIL: gemeinsame Klassen und Optionen ───────────────────────────
 *
 * Die Kundenübersicht übernimmt die Zeilen-Optik der Angebotsdetailseite
 * (`pages/tender/detail/utils/quoteField.constants.ts`): Label links in einer
 * festen Spalte, Wert rechts, eine Zeile pro Feld — keine Kartenraster.
 * Die Klassen sind hier gespiegelt statt importiert, damit das CRM-Modul nicht
 * am Angebotsmodul hängt; die Werte müssen mit jenen im Gleichschritt bleiben.
 */

import { toAddressForm } from '../../../components/ui-shared/addressForm';
import type { AddressFormValue } from '../../../components/ui-shared/addressForm';
import { DEFAULT_CUSTOMER_STATUS, DEFAULT_CUSTOMER_TYPE } from '../customerType';

export const CUSTOMER_LABEL_CLASS = 'block text-[12px] font-medium leading-[1.35] text-slate-500 dark:text-white/55';

export const CUSTOMER_READONLY_CLASS =
    'flex min-h-8 w-full items-center rounded-[2px] border border-slate-200 bg-slate-50 px-2.5 text-left text-[13px] font-medium leading-[1.35] text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-white/85';

/** Ruhezustand einer klickbaren Zelle — sieht wie Text aus, verrät sich beim Hover. */
export const CUSTOMER_EDITABLE_CLASS =
    'flex min-h-8 w-full cursor-text items-center rounded-[2px] border border-transparent px-2.5 text-left text-[13px] font-medium leading-[1.35] text-slate-800 transition-colors hover:border-slate-300 hover:bg-white dark:text-white/85 dark:hover:border-white/20 dark:hover:bg-white/5';

export const CUSTOMER_CONTROL_CLASS =
    'h-8 w-full rounded-[2px] border border-slate-300 bg-white px-2.5 text-[13px] leading-[1.35] text-slate-800 outline-none transition-colors focus:border-[#1f2654] focus:ring-1 focus:ring-[#1f2654]/20 dark:border-white/20 dark:bg-white/5 dark:text-white';

/** Marken-Navy — Schriftfarbe der zurückhaltenden Aktionen (z. B. "Verrechnen"). */
export const CUSTOMER_NAVY = '#1f2654';

/**
 * Adressarten einer Kundenadresse (`CustomerLocation.kind`). Die Hauptadresse
 * ist KEIN Standort-Datensatz — sie liegt als flache Spalten auf `Customer` und
 * wird in der Tabelle als erste, graue Zeile geführt.
 *
 * INSTALLATION heisst in der Oberfläche jetzt "Projektadresse" (vorher
 * "Montageadresse"); der gespeicherte Wert bleibt INSTALLATION, damit
 * bestehende Datensätze und die Angebotsseite unberührt bleiben.
 */
export const ADDRESS_KIND_OPTIONS = [
    { value: 'INSTALLATION', labelKey: 'crm.addressKindProject' },
    { value: 'BILLING', labelKey: 'crm.addressKindBilling' },
    { value: 'DELIVERY', labelKey: 'crm.addressKindDelivery' },
] as const;

export type AddressKind = (typeof ADDRESS_KIND_OPTIONS)[number]['value'];

export const DEFAULT_ADDRESS_KIND: AddressKind = 'INSTALLATION';

/** Unbekannte/leere Arten fallen auf INSTALLATION zurück — so war der DB-Default. */
export const normalizeAddressKind = (kind?: string | null): AddressKind =>
    ADDRESS_KIND_OPTIONS.some((option) => option.value === kind) ? (kind as AddressKind) : DEFAULT_ADDRESS_KIND;

/* ─────────────────── Stammdaten-Formular der Übersicht ─────────────────── */

/** Die Felder, die die Übersichtskarte bearbeitet — Adresse in Bestandteilen. */
export interface CustomerInfoValue extends AddressFormValue {
    companyName: string;
    customerType: string;
    vatNumber: string;
    mainEmail: string;
    mainPhone: string;
    mobilePhone: string;
    website: string;
    language: string;
    responsibleFirstName: string;
    responsibleLastName: string;
    addressName: string;
    status: string;
}

export type CustomerInfoSource = Partial<Record<keyof CustomerInfoValue, string | null | undefined>>;

/** Datensatz → Formular: fehlende/leere Felder werden zu leerem Text. */
export const toCustomerInfoValue = (source: CustomerInfoSource): CustomerInfoValue => ({
    companyName: source.companyName ?? '',
    customerType: source.customerType ?? DEFAULT_CUSTOMER_TYPE,
    vatNumber: source.vatNumber ?? '',
    mainEmail: source.mainEmail ?? '',
    mainPhone: source.mainPhone ?? '',
    mobilePhone: source.mobilePhone ?? '',
    website: source.website ?? '',
    language: source.language ?? '',
    responsibleFirstName: source.responsibleFirstName ?? '',
    responsibleLastName: source.responsibleLastName ?? '',
    addressName: source.addressName ?? '',
    ...toAddressForm(source),
    status: source.status ?? DEFAULT_CUSTOMER_STATUS,
});
