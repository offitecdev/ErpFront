import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import {
    Building02 as Building2,
    ChevronDown,
    Save01 as Save,
    X as XIcon,
} from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { apiClient } from '../../../lib/axios';
import { Button } from '../../../components/ui-shared/Button';
import { AddressFields, AddressLines } from '../../../components/ui-shared/AddressFields';
import {
    CUSTOMER_CONTROL_CLASS,
    CUSTOMER_EDITABLE_CLASS,
    CUSTOMER_LABEL_CLASS,
    CUSTOMER_READONLY_CLASS,
    toCustomerInfoValue,
} from './customerDetail.constants';
import type { CustomerInfoSource, CustomerInfoValue } from './customerDetail.constants';
import {
    CUSTOMER_LANGUAGE_OPTIONS,
    CUSTOMER_STATUS_OPTIONS,
    CUSTOMER_TYPE_OPTIONS,
    getCustomerLanguageLabel,
    getCustomerStatusLabel,
    getCustomerTypeLabel,
} from '../customerType';

/**
 * Stammdaten des Kunden als Zeilenband — dieselbe Optik wie die Kundenkarte der
 * Angebotsdetailseite (`TenderCustomerCard`): Label links, Wert rechts, eine
 * Zeile pro Feld.
 *
 * Bearbeitet wird direkt in der Zeile: ein Klick auf einen Wert macht ihn zum
 * Eingabefeld, danach erscheint unten die Speichern-Leiste. Mehrere Felder
 * lassen sich vor dem Speichern ändern — es geht genau EIN PATCH raus.
 */

type FieldKey = keyof CustomerInfoValue | 'responsible' | 'address';

const COLLAPSE_STORAGE_KEY = 'offitec:customer-detail:info-card-collapsed';

/** Eine Beschriftungs-/Wertzeile; `control` ersetzt im Bearbeitungsmodus den Wert. */
const InfoFieldRow = ({
    label,
    children,
}: {
    label: ReactNode;
    children: ReactNode;
}) => (
    <div className="grid min-w-0 grid-cols-[104px_minmax(0,1fr)] items-start gap-2.5 border-b border-slate-100 py-1.5 last:border-b-0 dark:border-white/10">
        <span className={`${CUSTOMER_LABEL_CLASS} pt-2`}>{label}</span>
        <div className="min-w-0">{children}</div>
    </div>
);

export const CustomerInfoCard = ({
    customerId,
    source,
    onSaved,
}: {
    customerId: string;
    source: CustomerInfoSource;
    onSaved: () => void | Promise<void>;
}) => {
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    });
    const [draft, setDraft] = useState<CustomerInfoValue>(() => toCustomerInfoValue(source));
    const [openFields, setOpenFields] = useState<Set<FieldKey>>(new Set());
    const [saving, setSaving] = useState(false);
    const [syncedSource, setSyncedSource] = useState(source);

    const saved = useMemo(() => toCustomerInfoValue(source), [source]);

    // Ein Neuladen von aussen (stiller Abgleich nach einer anderen Aktion) darf
    // gerade getippte Werte NICHT überschreiben: übernommen wird nur, solange
    // keine Zeile offen ist. Zustandsangleich während des Renderns statt im
    // Effekt — so gibt es keinen Zwischenrender mit veralteten Werten.
    if (source !== syncedSource) {
        setSyncedSource(source);
        if (openFields.size === 0) setDraft(toCustomerInfoValue(source));
    }

    const dirty = useMemo(
        () => (Object.keys(saved) as Array<keyof CustomerInfoValue>).some((key) => saved[key] !== draft[key]),
        [saved, draft],
    );

    const openField = (key: FieldKey) => setOpenFields((current) => new Set(current).add(key));
    const isOpen = (key: FieldKey) => openFields.has(key);
    const set = (patch: Partial<CustomerInfoValue>) => setDraft((current) => ({ ...current, ...patch }));

    const toggleCollapsed = () => {
        setCollapsed((current) => {
            const next = !current;
            try {
                window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
            } catch {
                /* Speicher gesperrt (Privatmodus) — der Zustand bleibt dann nur für diese Sitzung. */
            }
            return next;
        });
    };

    const cancel = () => {
        setDraft(saved);
        setOpenFields(new Set());
    };

    const save = async () => {
        if (!draft.companyName.trim()) {
            toast.error(i18nT('crm.customers.companyNameRequired'));
            return;
        }
        try {
            setSaving(true);
            await apiClient.patch(`/customers/${customerId}`, draft);
            setOpenFields(new Set());
            toast.success(i18nT('crm.customer_updated'));
            await onSaved();
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : i18nT('crm.customer_update_error'));
        } finally {
            setSaving(false);
        }
    };

    /** Klickbarer Wert: sieht wie Text aus, wird beim Klick zum Eingabefeld. */
    const readValue = (key: FieldKey, text: string | null | undefined) => (
        <button type="button" onClick={() => openField(key)} className={CUSTOMER_EDITABLE_CLASS}>
            <span className="min-w-0 truncate">
                {text || <span className="text-slate-400 dark:text-white/40">{i18nT('common.empty')}</span>}
            </span>
        </button>
    );

    const textField = (key: keyof CustomerInfoValue, label: string, type = 'text') => (
        <InfoFieldRow key={key} label={label}>
            {isOpen(key) ? (
                <input
                    autoFocus
                    type={type}
                    value={draft[key]}
                    onChange={(event) => set({ [key]: event.target.value } as Partial<CustomerInfoValue>)}
                    className={CUSTOMER_CONTROL_CLASS}
                />
            ) : (
                readValue(key, draft[key])
            )}
        </InfoFieldRow>
    );

    const selectField = (
        key: keyof CustomerInfoValue,
        label: string,
        options: ReadonlyArray<{ value: string; labelKey: string }>,
        display: string,
        withBlank = false,
    ) => (
        <InfoFieldRow key={key} label={label}>
            {isOpen(key) ? (
                <select
                    autoFocus
                    value={draft[key]}
                    onChange={(event) => set({ [key]: event.target.value } as Partial<CustomerInfoValue>)}
                    className={CUSTOMER_CONTROL_CLASS}
                >
                    {withBlank && <option value="">{i18nT('common.select')}</option>}
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>{i18nT(option.labelKey)}</option>
                    ))}
                </select>
            ) : (
                readValue(key, display)
            )}
        </InfoFieldRow>
    );

    const responsibleName = [draft.responsibleFirstName, draft.responsibleLastName].filter(Boolean).join(' ');

    return (
        <section data-ui-card className="relative z-10 mb-2 overflow-hidden rounded-[2px] border border-slate-300 bg-white dark:border-white/15 dark:bg-transparent">
            <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={!collapsed}
                className="flex w-full items-center gap-2.5 border-b border-slate-200 bg-[#f1f5fd] px-3 py-1.5 text-left transition-colors hover:bg-[#e9effb] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-[2px] bg-[#1f2654] text-white">
                    <Building2 size={12} />
                </span>
                <span className="text-[13px] font-semibold tracking-[0.01em] text-[#1f2654] dark:text-white">
                    {i18nT('crm.customer_profili')}
                </span>
                {collapsed && (
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600 dark:text-white/60">
                        {draft.companyName}
                    </span>
                )}
                <span className={`flex h-5 w-5 items-center justify-center rounded-[2px] text-slate-400 ${collapsed ? '' : 'ml-auto'}`}>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
                </span>
            </button>

            {!collapsed && (
                <>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3">
                        <div className="min-w-0 px-3 py-2">
                            <span className="mb-1.5 block text-[12px] font-semibold text-[#1f2654] dark:text-white/80">
                                {i18nT('crm.customers.customerType')}
                            </span>
                            {textField('companyName', i18nT('crm.customers.companyName'))}
                            {selectField('customerType', i18nT('crm.customers.customerType'), CUSTOMER_TYPE_OPTIONS, getCustomerTypeLabel(draft.customerType))}
                            {selectField('status', i18nT('common.status'), CUSTOMER_STATUS_OPTIONS, getCustomerStatusLabel(draft.status))}
                            {textField('vatNumber', i18nT('crm.customers.vatNumber'))}
                        </div>

                        <div className="min-w-0 border-t border-slate-200 px-3 py-2 md:border-l md:border-t-0 dark:border-white/10">
                            <span className="mb-1.5 block text-[12px] font-semibold text-[#1f2654] dark:text-white/80">
                                {i18nT('crm.customers.contactData')}
                            </span>
                            {textField('mainEmail', i18nT('common.email'), 'email')}
                            {textField('mainPhone', i18nT('common.phone'))}
                            {textField('mobilePhone', i18nT('crm.customers.mobilePhone'))}
                            {textField('website', i18nT('crm.customers.website'))}
                            {selectField('language', i18nT('crm.customers.language'), CUSTOMER_LANGUAGE_OPTIONS, getCustomerLanguageLabel(draft.language) ?? '', true)}
                        </div>

                        <div className="min-w-0 border-t border-slate-200 px-3 py-2 md:border-l lg:border-t-0 dark:border-white/10">
                            <span className="mb-1.5 block text-[12px] font-semibold text-[#1f2654] dark:text-white/80">
                                {i18nT('crm.locationPrimary')}
                            </span>
                            {textField('addressName', i18nT('crm.locationName'))}
                            <InfoFieldRow label={i18nT('address.sectionTitle')}>
                                {isOpen('address') ? (
                                    // Eingabe in getrennten Feldern, Anzeige in zwei Zeilen —
                                    // dieselbe Regel wie überall sonst in der Anwendung.
                                    <div className="py-1">
                                        <AddressFields
                                            value={draft}
                                            onChange={(next) => set(next)}
                                            inputClassName={CUSTOMER_CONTROL_CLASS}
                                        />
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => openField('address')} className={`${CUSTOMER_EDITABLE_CLASS} min-h-8 py-1`}>
                                        <AddressLines value={draft} maxChars={40} emptyText={i18nT('address.empty')} />
                                    </button>
                                )}
                            </InfoFieldRow>
                            <InfoFieldRow label={i18nT('crm.customers.responsibleEmployee')}>
                                {isOpen('responsible') ? (
                                    <div className="flex gap-2">
                                        <input
                                            autoFocus
                                            value={draft.responsibleFirstName}
                                            onChange={(event) => set({ responsibleFirstName: event.target.value })}
                                            placeholder={i18nT('crm.customers.responsibleFirstName')}
                                            className={CUSTOMER_CONTROL_CLASS}
                                        />
                                        <input
                                            value={draft.responsibleLastName}
                                            onChange={(event) => set({ responsibleLastName: event.target.value })}
                                            placeholder={i18nT('crm.customers.responsibleLastName')}
                                            className={CUSTOMER_CONTROL_CLASS}
                                        />
                                    </div>
                                ) : (
                                    readValue('responsible', responsibleName)
                                )}
                            </InfoFieldRow>
                        </div>
                    </div>

                    {/* Speichern-Leiste erscheint erst, wenn wirklich etwas offen oder geändert ist. */}
                    {(openFields.size > 0 || dirty) && (
                        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                            <span className={`mr-auto ${CUSTOMER_READONLY_CLASS} w-auto border-0 bg-transparent px-0 text-[12px] font-normal text-slate-500`}>
                                {dirty ? i18nT('crm.unsavedChanges') : ''}
                            </span>
                            <Button variant="secondary" size="sm" icon={<XIcon size={12} />} onClick={cancel}>
                                {i18nT('common.cancel')}
                            </Button>
                            <Button variant="primary" size="sm" loading={saving} disabled={!dirty} icon={<Save size={12} />} onClick={() => void save()}>
                                {i18nT('common.save')}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
};
