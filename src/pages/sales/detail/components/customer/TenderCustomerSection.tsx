import { useState } from 'react';
import { Edit01, Plus, User01, XClose } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { QUOTE_CONTROL_CLASS } from '../../utils/quoteField.constants';
import { AnchoredPopup } from '../common/AnchoredPopup';
import type { CustomerOption } from '../../types/tenderDetail.types';

type TenderCustomerSectionProps = {
    query: string;
    onQueryChange: (value: string) => void;
    onOpenChange: (open: boolean) => void;
    loading: boolean;
    loadingFlashLabel: string;
    dropdownVisible: boolean;
    customers: CustomerOption[];
    /** Der Name, den die Offerte HEUTE trägt — ein unveränderter Text beim
        Verlassen des Feldes wird nicht erneut als freie Erfassung gebucht. */
    committedName: string;
    onSelectCustomer: (customer: CustomerOption) => void;
    onClearCustomer: () => void;
    onAddCustomer: () => void;
    /** Übernimmt den eingetippten Namen als Kundschaft NUR dieser Offerte. */
    onUseManualCustomer: (name: string) => void;
    /** Öffnet die Kundenangaben der Offerte (Name / E-Mail / Adresse). */
    onEditCustomerData: () => void;
    /** Öffnet die Kunden-/CC-Karte; fehlt, solange keine Kundschaft gewählt ist. */
    onOpenInfo?: () => void;
};

/**
 * Customer picker: a search field whose results are a plain list of company
 * names. Address and contact columns used to sit beside each name; they made
 * every row three fields wide for a choice that is only ever made on the name,
 * and the extra text pushed the list past the fold.
 *
 * The list is portalled (AnchoredPopup) rather than absolutely positioned inside
 * the field, so it floats over the card instead of being clipped by it.
 *
 * FREIE ERFASSUNG (Benutzerwunsch): Das Feld IST die freie Eingabe. Was
 * getippt dasteht, wird beim Verlassen des Feldes (oder mit Enter) direkt der
 * Name der Kundschaft DIESER Offerte — ohne eigenen "«…» frei übernehmen"-
 * Eintrag in der Liste und ohne dass im CRM irgendetwas angelegt wird. Die
 * Liste zeigt weiterhin die CRM-Treffer; ein Klick darauf verknüpft wie bisher
 * den bestehenden Kunden.
 */
export const TenderCustomerSection = ({
    query,
    onQueryChange,
    onOpenChange,
    loading,
    loadingFlashLabel,
    dropdownVisible,
    customers,
    committedName,
    onSelectCustomer,
    onClearCustomer,
    onAddCustomer,
    onUseManualCustomer,
    onEditCustomerData,
    onOpenInfo,
}: TenderCustomerSectionProps) => {
    const [fieldEl, setFieldEl] = useState<HTMLDivElement | null>(null);
    const typed = query.trim();
    // Der getippte Text wird direkt zum Namen der Offerte — aber nur, wenn er
    // sich wirklich geändert hat: ein unverändertes Feld darf einen verknüpften
    // CRM-Kunden nicht stillschweigend in eine freie Erfassung verwandeln.
    const commitTyped = () => {
        if (!typed || typed === committedName.trim()) return;
        onUseManualCustomer(typed);
    };

    return (
        <div className="flex items-start gap-1.5">
            <div ref={setFieldEl} className="relative flex-1">
                <input
                    type="text"
                    value={query}
                    onChange={(event) => {
                        onQueryChange(event.target.value);
                        onOpenChange(true);
                    }}
                    onFocus={() => onOpenChange(true)}
                    // Also open on click so a single tap reopens the list even when
                    // the input already holds focus (e.g. right after selecting a
                    // customer) — onFocus alone wouldn't fire again in that case.
                    onClick={() => onOpenChange(true)}
                    // Verlassen des Feldes = freie Übernahme des Getippten. Das
                    // Übernehmen passiert SOFORT (nicht im Timeout), damit ein
                    // direkt folgender Klick auf "Speichern" den Namen noch
                    // mitnimmt; nur das Schliessen der Liste wartet, damit ein
                    // Klick auf einen Treffer nicht ins Leere geht.
                    onBlur={() => {
                        commitTyped();
                        window.setTimeout(() => onOpenChange(false), 120);
                    }}
                    // Eingabe bestätigen = den getippten Namen frei übernehmen.
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        commitTyped();
                        onOpenChange(false);
                    }}
                    placeholder={loading ? t('tenders.musteriler_loading') : t('tenders.customer_adi_yazin')}
                    // Don't disable on metaSaving: changing an address / date must not
                    // make the customer field look like it is reloading. Re-selecting a
                    // customer mid-save is still guarded in handleSelectTenderCustomer.
                    disabled={loading}
                    className={`${QUOTE_CONTROL_CLASS} pr-8`}
                />
                {/* Round clear icon pinned at the end of the box; clicking it
                    unlinks the whole customer. */}
                {!loading && query && (
                    <button
                        type="button"
                        aria-label={t('common.clear')}
                        title={t('common.clear')}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={onClearCustomer}
                        className="absolute right-2 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full bg-slate-300 text-white transition-colors hover:bg-slate-400"
                    >
                        <XClose size={11} />
                    </button>
                )}
                {loading && (
                    <span
                        role="status"
                        aria-label={t('common.loading')}
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-pulse text-[11px] font-medium text-[#1f2654]"
                    >
                        {loadingFlashLabel}
                    </span>
                )}
            </div>
            {dropdownVisible && fieldEl && (
                <AnchoredPopup
                    anchorEl={fieldEl}
                    onClose={() => onOpenChange(false)}
                    estimatedHeight={260}
                >
                    <ul role="listbox" aria-label={t('tenders.select_customer')} className="max-h-64 overflow-y-auto py-0.5">
                        {customers.map((customer) => (
                            // The whole row is the hit target, and it commits on
                            // pointerdown — before the field's delayed blur closes
                            // the list out from under the cursor.
                            <li
                                key={customer.id}
                                role="option"
                                aria-selected={false}
                                title={customer.companyName}
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    onSelectCustomer(customer);
                                }}
                                className="ofi-option-row cursor-pointer truncate px-2.5 py-1.5 text-[13px] text-slate-800 transition-colors"
                            >
                                {customer.companyName}
                            </li>
                        ))}
                    </ul>
                </AnchoredPopup>
            )}
            {/* Kontaktdaten und CC-Empfänger der Offerte — dieselbe Karte wie im
                Kalender, geöffnet über den Kunden selbst. */}
            {onOpenInfo && (
                <button
                    type="button"
                    onClick={onOpenInfo}
                    title={t('tenders.customer_details')}
                    aria-label={t('tenders.customer_details')}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[3px] border border-slate-300 bg-white text-slate-500 transition-colors hover:border-[#1f2654] hover:bg-slate-50 hover:text-[#1f2654]"
                >
                    <User01 size={13} />
                </button>
            )}
            {/* Name / E-Mail / Adresse DIESER Offerte von Hand — auch für
                Kundschaft, die es im System nicht gibt. */}
            <button
                type="button"
                onClick={onEditCustomerData}
                title={t('tenders.manualCustomer.title')}
                aria-label={t('tenders.manualCustomer.title')}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[3px] border border-slate-300 bg-white text-slate-500 transition-colors hover:border-[#1f2654] hover:bg-slate-50 hover:text-[#1f2654]"
            >
                <Edit01 size={13} />
            </button>
            <button
                type="button"
                onClick={onAddCustomer}
                title={t('crm.customers.newCustomer')}
                aria-label={t('crm.customers.newCustomer')}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[3px] border border-slate-300 bg-white text-slate-500 transition-colors hover:border-[#1f2654] hover:bg-slate-50 hover:text-[#1f2654]"
            >
                <Plus size={13} />
            </button>
        </div>
    );
};
