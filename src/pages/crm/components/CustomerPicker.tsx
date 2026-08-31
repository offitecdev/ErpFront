import { useState } from 'react';
import { ChevronDown, X as XIcon } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { CustomerPickerModal } from './CustomerPickerModal';
import type { CrmContactOption, CrmCustomerOption, CrmCustomerPick } from '../types/crm.types';

/**
 * Kundenauswahl — sieht aus wie ein Auswahlfeld (Menü), nicht wie ein Knopf,
 * und öffnet mit EINEM Klick das Auswahlfenster. Das Fenster ist dasselbe
 * Muster wie beim Hinzufügen einer Produktzeile im Angebot.
 *
 * Mit `withContact` schliesst die Wahl den Ansprechpartner ein: das Feld
 * zeigt dann "Kunde · Ansprechpartner" (Vorgabe 15.08.2026, wie in der
 * Kundenakte). Filterfelder bleiben beim Kunden allein.
 *
 * Bewusst kein Tippfeld an dieser Stelle: gesucht wird im Fenster, hier steht
 * nur, wer gewählt ist. Damit gibt es keinen halb getippten Zwischenzustand,
 * der beim Verlassen des Feldes verloren geht.
 */
export const CustomerPicker = ({
    value,
    contact = null,
    onPick,
    placeholder,
    clearable = true,
    withContact = false,
    className = '',
    z,
}: {
    value: CrmCustomerOption | null;
    contact?: CrmContactOption | null;
    onPick: (pick: CrmCustomerPick | null) => void;
    placeholder?: string;
    /** Filterfelder dürfen geleert werden; ein Pflichtfeld im Formular nicht. */
    clearable?: boolean;
    withContact?: boolean;
    /** Zusätzliche Klassen für den Knopf (Höhe/Schrift des Formulars). */
    className?: string;
    /** Stapelhöhe des Fensters, wenn das Feld selbst in einem Fenster steht. */
    z?: number;
}) => {
    const [open, setOpen] = useState(false);
    const contactName = contact ? `${contact.firstName} ${contact.lastName}`.trim() : '';

    return (
        <>
            <div className="relative flex w-full items-center">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg bg-primary px-3 text-left text-sm shadow-xs ring-1 ring-primary transition duration-100 ease-linear ring-inset hover:ring-2 hover:ring-brand focus:outline-hidden focus:ring-2 focus:ring-brand ${value ? '' : 'text-placeholder'} ${className}`}
                >
                    <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate">{value ? value.companyName : (placeholder ?? t('crm.quick.customerSelect'))}</span>
                        {value && contactName && (
                            <span className="truncate text-[12px] text-slate-500 dark:text-white/60">· {contactName}</span>
                        )}
                    </span>
                    <ChevronDown size={14} className="shrink-0 text-slate-400" />
                </button>
                {value && clearable && (
                    <button
                        type="button"
                        onClick={() => onPick(null)}
                        aria-label={t('common.clear')}
                        title={t('common.clear')}
                        className="absolute right-8 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        <XIcon size={12} />
                    </button>
                )}
            </div>

            <CustomerPickerModal open={open} onClose={() => setOpen(false)} onSelect={onPick} withContact={withContact} z={z} />
        </>
    );
};
