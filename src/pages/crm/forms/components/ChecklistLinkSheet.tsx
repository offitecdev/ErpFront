import { Fragment, useEffect, useState } from 'react';
import { LuFileText } from 'react-icons/lu';
import { Check, ChevronDown, Trash01, User01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { BottomSheet } from '@/pages/inventory/components/BottomSheet';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { tenderApi } from '@/lib/api/tender';
import type { TenderListItem } from '@/types/tender';
import { CustomerComboCell } from '../../components/CustomerComboCell';
import { CustomerSelectModal } from './CustomerSelectModal';
import type { CrmCustomerOption } from '../../types/crm.types';
import { BTN_PRIMARY, BTN_SECONDARY, fmtDate } from '../ui';

/**
 * Verknüpfen als TABELLE im grossen Untenfenster — der Schritt vor dem
 * Ausfüllen.
 *
 * Eine Zeile je Kunde: die Kundenzelle ist das Suchfeld (wie in der
 * Schnellerfassung), daneben stehen die gewählten Angebote als EINE Zeile
 * ("AN-2026-00012, AN-2026-00015 …"). Ein Klick darauf klappt darunter die
 * Angebotstabelle des Kunden auf, in der mehrere angekreuzt werden können.
 * Die UNTERSTE Zeile ist immer leer: sobald sie einen Kunden bekommt, wächst
 * eine neue leere nach.
 *
 * WICHTIG (Vorgabe 16.08.2026): Es entsteht KEINE Checkliste je Kunde. Fünf
 * Kunden mit je vier Angeboten ergeben EINE Checkliste mit zwanzig
 * Verknüpfungen — einmal ausgefüllt, bei allen sichtbar. Dieselbe Tabelle
 * dient dem nachträglichen Ändern: `initial` bringt die bestehenden
 * Verknüpfungen mit, und was hier steht, ersetzt sie.
 */
export interface ChecklistTarget {
    customerId: string;
    /** Eine Verknüpfung hängt IMMER an einem Angebot (Vorgabe 16.08.2026). */
    tenderId: string;
}

/** Vorbelegung einer Zeile beim Ändern (Nummern, damit nichts nachgeladen werden muss). */
export interface ChecklistLinkPreset {
    customer: CrmCustomerOption;
    tenders: Array<{ id: string; tenderNumber: string | null }>;
}

interface LinkRow {
    key: string;
    customerId: string | null;
    customerName: string;
    tenderIds: string[];
    tenders: TenderListItem[];
    /** Angebotsnummern aus der Vorbelegung — vor dem Aufklappen ist nichts geladen. */
    labels: Record<string, string>;
    loaded: boolean;
}

let rowSeed = 0;
const emptyRow = (): LinkRow => ({
    key: `link-${(rowSeed += 1)}`,
    customerId: null,
    customerName: '',
    tenderIds: [],
    tenders: [],
    labels: {},
    loaded: false,
});

const rowHasCustomer = (row: LinkRow) => Boolean(row.customerId);

export const ChecklistLinkSheet = ({
    open,
    onClose,
    onSubmit,
    initial,
    busy = false,
    submitLabel,
    z = 120,
}: {
    open: boolean;
    onClose: () => void;
    onSubmit: (targets: ChecklistTarget[]) => void;
    /** Bestehende Verknüpfungen beim Ändern — eine Zeile je Kunde. */
    initial?: ChecklistLinkPreset[] | null;
    busy?: boolean;
    submitLabel?: string;
    /** Stapelhöhe — im Checklisten-Editor liegt das Blatt ÜBER dessen Fenster. */
    z?: number;
}) => {
    const start = (): LinkRow[] => {
        if (!initial?.length) return [emptyRow()];
        // Beim Ändern steht unten trotzdem eine freie Zeile: weitere Kunden
        // kommen einfach dazu.
        return [
            ...initial.map((preset) => ({
                ...emptyRow(),
                customerId: preset.customer.id,
                customerName: preset.customer.companyName,
                tenderIds: preset.tenders.map((tender) => tender.id),
                labels: Object.fromEntries(preset.tenders.map((tender) => [tender.id, tender.tenderNumber || tender.id])),
            })),
            emptyRow(),
        ];
    };

    const [rows, setRows] = useState<LinkRow[]>(start);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

    // Bei jedem Öffnen frisch: Zustand beim RENDERN zurücksetzen (Prop-Wechsel),
    // der Effekt lädt nur.
    const [seenOpen, setSeenOpen] = useState(open);
    if (seenOpen !== open) {
        setSeenOpen(open);
        const fresh = start();
        setRows(fresh);
        // Beim Ändern EINER Verknüpfung steht deren Zeile gleich offen.
        setExpanded(initial?.length === 1 ? fresh[0].key : null);
    }

    // Die Angebote einer Zeile werden geholt, wenn sie AUFGEKLAPPT wird.
    useEffect(() => {
        if (!open || !expanded) return;
        const row = rows.find((candidate) => candidate.key === expanded);
        if (!row || !row.customerId || row.loaded) return;
        let cancelled = false;
        tenderApi.list({ customerId: row.customerId, fields: 'list', pageSize: 50 })
            .catch(() => [] as TenderListItem[])
            .then((list) => {
                if (cancelled) return;
                setRows((current) => current.map((candidate) => (candidate.key === row.key
                    ? {
                        ...candidate,
                        tenders: list,
                        loaded: true,
                        // Nur was es wirklich nicht (mehr) gibt, fällt weg. Eine
                        // schon bestehende Verknüpfung bleibt auch dann stehen,
                        // wenn ihr Angebot nicht auf der ersten Seite steht —
                        // sonst verlöre blosses Aufklappen eine Verknüpfung.
                        tenderIds: candidate.tenderIds.filter((id) => list.some((tender) => tender.id === id) || candidate.labels[id]),
                    }
                    : candidate)));
            });
        return () => { cancelled = true; };
    }, [open, expanded, rows]);

    /** Zeile ändern und — falls die unterste gerade einen Kunden bekam — eine leere anhängen. */
    const patchRow = (key: string, patch: Partial<LinkRow>) => setRows((current) => {
        const next = current.map((row) => (row.key === key ? { ...row, ...patch } : row));
        const last = next[next.length - 1];
        return last && rowHasCustomer(last) ? [...next, emptyRow()] : next;
    });

    const pickCustomer = (key: string, customer: CrmCustomerOption) => {
        patchRow(key, { customerId: customer.id, customerName: customer.companyName, tenderIds: [], tenders: [], labels: {}, loaded: false });
        setExpanded(key);
    };

    // Tippen löst die Bindung — der blosse Text zählt nicht.
    const typeCustomer = (key: string, text: string) =>
        patchRow(key, { customerName: text, customerId: null, tenderIds: [], tenders: [], labels: {}, loaded: false });

    /** Aus dem grossen Fenster: jeder gewählte Kunde wird eine Zeile. */
    const addCustomers = (customers: CrmCustomerOption[]) => setRows((current) => {
        const known = new Set(current.map((row) => row.customerId).filter(Boolean) as string[]);
        const fresh = customers.filter((customer) => !known.has(customer.id));
        if (!fresh.length) return current;
        const next = [...current];
        for (const customer of fresh) {
            const free = next.findIndex((row) => !row.customerId && !row.customerName.trim());
            const filled: LinkRow = { ...emptyRow(), customerId: customer.id, customerName: customer.companyName };
            if (free >= 0) next[free] = { ...filled, key: next[free].key }; else next.push(filled);
        }
        return rowHasCustomer(next[next.length - 1]) ? [...next, emptyRow()] : next;
    });

    // Unten steht IMMER eine freie Zeile — auch nachdem eine gelöscht wurde.
    const removeRow = (key: string) => setRows((current) => {
        const next = current.filter((row) => row.key !== key);
        if (!next.length) return [emptyRow()];
        return rowHasCustomer(next[next.length - 1]) ? [...next, emptyRow()] : next;
    });

    const toggleTender = (key: string, tenderId: string) => setRows((current) => current.map((row) => {
        if (row.key !== key) return row;
        return {
            ...row,
            tenderIds: row.tenderIds.includes(tenderId)
                ? row.tenderIds.filter((id) => id !== tenderId)
                : [...row.tenderIds, tenderId],
        };
    }));

    /**
     * Alle Paare (Kunde, Angebot) — sie gehören zu EINER Checkliste. Eine Zeile
     * OHNE Angebot zählt nicht: ohne Angebot gäbe es nichts, woran die
     * Checkliste im Auftrag, im Projekt oder im Rapport hängen könnte.
     */
    const targets: ChecklistTarget[] = rows
        .filter(rowHasCustomer)
        .flatMap((row): ChecklistTarget[] => row.tenderIds.map((tenderId) => ({ customerId: row.customerId!, tenderId })));

    const customerCount = new Set(targets.map((target) => target.customerId)).size;
    const missingOffers = rows.some((row) => rowHasCustomer(row) && row.tenderIds.length === 0);

    if (!open) return null;

    return (
        <BottomSheet
            open
            title={t('forms.link.title')}
            subtitle={t('forms.link.subtitle')}
            onClose={onClose}
            width={1100}
            height={760}
            zIndex={z}
            footer={(
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] text-slate-500 dark:text-white/60">
                        {targets.length > 0
                            ? t('forms.link.willLink', { customers: customerCount, count: targets.length })
                            : missingOffers ? t('forms.link.tenderRequired') : t('forms.link.pickCustomerFirst')}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button type="button" className={BTN_SECONDARY} onClick={onClose}>{t('common.cancel')}</button>
                        <button type="button" className={BTN_PRIMARY} disabled={targets.length === 0 || busy} onClick={() => onSubmit(targets)}>
                            {submitLabel || t('forms.link.continue')}
                        </button>
                    </div>
                </div>
            )}
        >
            <div className="p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <p className="m-0 max-w-3xl text-[12px] text-slate-500 dark:text-white/60">{t('forms.link.tenderHint')}</p>
                    <button type="button" className={BTN_SECONDARY} onClick={() => setCustomerPickerOpen(true)}>
                        <User01 size={14} />{t('forms.link.selectCustomers')}
                    </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/15">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            <col style={{ width: 44 }} />
                            <col style={{ width: '38%' }} />
                            <col />
                            <col style={{ width: 60 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-right">#</th>
                                <th className="text-left">{t('forms.links.customer')}</th>
                                <th className="text-left">{t('forms.link.colOffers')}</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => {
                                const isOpen = expanded === row.key;
                                const chosen = row.tenderIds
                                    .map((id) => row.tenders.find((tender) => tender.id === id)?.tenderNumber || row.labels[id])
                                    .filter(Boolean) as string[];
                                return (
                                    <Fragment key={row.key}>
                                        <tr>
                                            <td className="text-right font-mono text-[11.5px] text-slate-400">{index + 1}</td>
                                            <td>
                                                <CustomerComboCell
                                                    value={row.customerName}
                                                    linked={Boolean(row.customerId)}
                                                    onChange={(next) => typeCustomer(row.key, next)}
                                                    onPick={(customer) => pickCustomer(row.key, customer)}
                                                    pickerZ={z + 20}
                                                />
                                            </td>
                                            <td className="!p-0">
                                                {/* EINE Zeile: die gewählten Angebote, gekürzt. Klick klappt auf. */}
                                                <button
                                                    type="button"
                                                    disabled={!row.customerId}
                                                    onClick={() => setExpanded(isOpen ? null : row.key)}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/5"
                                                >
                                                    <span className={`min-w-0 flex-1 truncate text-[12.5px] ${chosen.length || row.tenderIds.length
                                                        ? 'font-semibold text-slate-800 dark:text-white'
                                                        : 'text-slate-400'}`}
                                                    >
                                                        {chosen.length
                                                            ? chosen.join(', ')
                                                            : row.tenderIds.length
                                                                ? t('forms.link.tenderCount', { count: row.tenderIds.length })
                                                                : t('forms.link.pickOffers')}
                                                    </span>
                                                    {row.tenderIds.length > 1 && (
                                                        <span className="shrink-0 rounded bg-[#eef2fb] px-1.5 py-0.5 text-[11px] font-semibold text-[#1f2654] dark:bg-white/10 dark:text-white/80">
                                                            {row.tenderIds.length}
                                                        </span>
                                                    )}
                                                    <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                            </td>
                                            <td>
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRow(row.key)}
                                                        title={t('common.delete')}
                                                        className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                                                    >
                                                        <Trash01 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {isOpen && row.customerId && (
                                            <tr>
                                                <td colSpan={4} className="!p-0">
                                                    <OfferTable row={row} onToggle={(tenderId) => toggleTender(row.key, tenderId)} />
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* "Kunden wählen": die grosse Liste, 15 je Seite. */}
            <CustomerSelectModal
                open={customerPickerOpen}
                onClose={() => setCustomerPickerOpen(false)}
                onSelect={addCustomers}
                excludeIds={rows.map((row) => row.customerId).filter(Boolean) as string[]}
                z={z + 40}
            />
        </BottomSheet>
    );
};

/** Die aufgeklappte Angebotstabelle EINER Zeile. */
const OfferTable = ({
    row,
    onToggle,
}: {
    row: LinkRow;
    onToggle: (tenderId: string) => void;
}) => {
    if (!row.loaded) return <div className="bg-slate-50/70 p-4 dark:bg-white/5"><InlineLoading /></div>;

    return (
        <div className="border-t border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
            <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                {t('forms.link.offersOf', { name: row.customerName })}
            </div>

            {row.tenders.length === 0 ? (
                <div className="px-2 py-4 text-center text-[12.5px] text-slate-400">{t('forms.link.tenderEmpty')}</div>
            ) : (
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 40 }} />
                        <col style={{ width: '30%' }} />
                        <col />
                        <col style={{ width: 110 }} />
                    </colgroup>
                    <tbody>
                        {row.tenders.map((tender) => {
                            const active = row.tenderIds.includes(tender.id);
                            return (
                                <tr
                                    key={tender.id}
                                    onClick={() => onToggle(tender.id)}
                                    className={`cursor-pointer transition-colors ${active ? 'bg-[#eef2fb] dark:bg-white/10' : 'hover:bg-white dark:hover:bg-white/5'}`}
                                >
                                    <td>
                                        <span className={`grid size-5 place-items-center rounded border ${active
                                            ? 'border-[#272f67] bg-[#272f67] text-white'
                                            : 'border-slate-300 bg-white dark:border-white/20 dark:bg-transparent'}`}
                                        >
                                            {active && <Check size={12} />}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-white">
                                            <LuFileText size={13} className="text-slate-400" />{tender.tenderNumber}
                                        </span>
                                    </td>
                                    <td className="truncate text-[12px] text-slate-500 dark:text-white/60">
                                        {[tender.salesOrder?.orderNumber, tender.commissionNumber, tender.customerReference].filter(Boolean).join(' · ') || '—'}
                                    </td>
                                    <td className="whitespace-nowrap text-[12px] text-slate-500 dark:text-white/60">{fmtDate(tender.createdAt)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
};
