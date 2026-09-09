import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LuLink2, LuTrash2, LuUsers } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { tenderApi } from '@/lib/api/tender';
import type { TenderListItem } from '@/types/tender';
import type { CrmCustomerOption } from '../../types/crm.types';
import { apiErrorMessage } from '../ui';
import { CustomerSearchField } from './CustomerSearchField';
import { CustomerSelectModal } from './CustomerSelectModal';
import { OfferDropdown } from './OfferDropdown';

/**
 * ── VERKNÜPFEN: KUNDE + ANGEBOT(E) ──────────────────────────────────────────
 * Das Fenster vor dem Ausfüllen — seit dem 02.09.2026 ein zentriertes
 * Fenster im App-Bausatz (PopupDialog) statt des grossen Untenfensters, und
 * mit zwei Änderungen, die Samet bestellt hat:
 *
 *   1. Das Angebot ist OPTIONAL. Eine Zeile mit Kunde und ohne Angebot ist
 *      eine gültige Verknüpfung (die Checkliste erscheint dann in der
 *      Kundenakte). Vorher musste je Kunde ein Angebot gewählt sein.
 *   2. Die Angebote stehen in einer AUFKLAPPLISTE neben dem Kunden
 *      (`OfferDropdown`) — mit zwei Wegen: ein bestehendes ankreuzen oder
 *      «Neues Angebot erstellen», das sofort ein leeres Angebot anlegt und
 *      verknüpft.
 *
 * Es bleibt bei der Regel vom 16.08.2026: ALLE Zeilen ergeben EINE Checkliste
 * mit vielen Verknüpfungen, nicht eine Checkliste je Kunde. `initial` bringt
 * beim Ändern die bestehenden Verknüpfungen mit; was hier steht, ERSETZT sie.
 */
export interface ChecklistTarget {
    customerId: string;
    /** Seit dem 02.09.2026 optional — null = nur am Kunden verknüpft. */
    tenderId: string | null;
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
    /** Angebotsnummern aus der Vorbelegung — vor dem Laden ist nichts bekannt. */
    labels: Record<string, string>;
    loaded: boolean;
    /** Die Angebote werden geladen, sobald die Zeile ihre Liste aufklappt. */
    wanted: boolean;
    creating: boolean;
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
    wanted: false,
    creating: false,
});

const rowHasCustomer = (row: LinkRow) => Boolean(row.customerId);

export const ChecklistLinkDialog = ({
    open,
    onClose,
    onSubmit,
    initial,
    busy = false,
    submitLabel,
    z = 750,
}: {
    open: boolean;
    onClose: () => void;
    onSubmit: (targets: ChecklistTarget[]) => void;
    /** Bestehende Verknüpfungen beim Ändern — eine Zeile je Kunde. */
    initial?: ChecklistLinkPreset[] | null;
    busy?: boolean;
    submitLabel?: string;
    /** Stapelhöhe — über dem Checklisten-Fenster (z 120) reicht die Vorgabe. */
    z?: number;
}) => {
    const start = (): LinkRow[] => {
        if (!initial?.length) return [emptyRow()];
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
    const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

    // Bei jedem Öffnen frisch — Zustand beim RENDERN zurücksetzen, kein Effekt.
    const [seenOpen, setSeenOpen] = useState(open);
    if (seenOpen !== open) {
        setSeenOpen(open);
        setRows(start());
    }

    /** Zeile ändern und — falls die unterste gerade einen Kunden bekam — eine leere anhängen. */
    const patchRow = (key: string, patch: Partial<LinkRow> | ((row: LinkRow) => Partial<LinkRow>)) => setRows((current) => {
        const next = current.map((row) => (row.key === key ? { ...row, ...(typeof patch === 'function' ? patch(row) : patch) } : row));
        const last = next[next.length - 1];
        return last && rowHasCustomer(last) ? [...next, emptyRow()] : next;
    });

    /* Welche Zeilen gerade laden. OHNE diesen Merker holte jede Änderung an
       IRGENDEINER Zeile (ein getippter Buchstabe nebenan) die Angebote einer
       noch ladenden Zeile ein zweites Mal: der Effekt hängt an `rows`. */
    const loadingRows = useRef(new Set<string>());

    // Die Angebote einer Zeile werden geholt, sobald sie gewünscht sind
    // (Aufklappen, oder ein neues Angebot) — je Zeile einmal.
    useEffect(() => {
        if (!open) return;
        const pending = rows.filter((row) => row.wanted && !row.loaded && row.customerId && !loadingRows.current.has(row.key));
        if (!pending.length) return;
        let cancelled = false;
        for (const row of pending) {
            loadingRows.current.add(row.key);
            tenderApi.list({ customerId: row.customerId!, fields: 'list', pageSize: 50 })
                .catch(() => [] as TenderListItem[])
                .then((list) => {
                    loadingRows.current.delete(row.key);
                    if (cancelled) return;
                    setRows((current) => current.map((candidate) => (candidate.key === row.key && candidate.customerId === row.customerId
                        ? {
                            ...candidate,
                            // Was die Zeile inzwischen selbst angelegt hat, steht schon drin.
                            tenders: [...candidate.tenders.filter((own) => !list.some((tender) => tender.id === own.id)), ...list],
                            loaded: true,
                            // Nur was es wirklich nicht (mehr) gibt, fällt weg; eine
                            // bestehende Verknüpfung bleibt auch ohne Treffer stehen.
                            tenderIds: candidate.tenderIds.filter((id) => list.some((tender) => tender.id === id) || candidate.labels[id] || candidate.tenders.some((own) => own.id === id)),
                        }
                        : candidate)));
                });
        }
        return () => { cancelled = true; };
        // `rows` als Abhängigkeit ist Absicht: neue Wünsche stehen darin.
    }, [open, rows]);

    const pickCustomer = (key: string, customer: CrmCustomerOption) => {
        // Eine noch laufende Ladung gehört dem ALTEN Kunden — der Merker muss
        // frei werden, sonst holt die Zeile die Angebote des neuen nie.
        loadingRows.current.delete(key);
        patchRow(key, { customerId: customer.id, customerName: customer.companyName, tenderIds: [], tenders: [], labels: {}, loaded: false, wanted: false });
    };

    // Tippen löst die Bindung — der blosse Text zählt nicht.
    const typeCustomer = (key: string, text: string) => {
        loadingRows.current.delete(key);
        patchRow(key, { customerName: text, customerId: null, tenderIds: [], tenders: [], labels: {}, loaded: false, wanted: false });
    };

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

    const toggleTender = (key: string, tenderId: string) => patchRow(key, (row) => ({
        tenderIds: row.tenderIds.includes(tenderId) ? row.tenderIds.filter((id) => id !== tenderId) : [...row.tenderIds, tenderId],
    }));

    /**
     * «Neues Angebot erstellen»: ein leeres Angebot (Entwurf, SIA451 wie in der
     * Verkaufsmaske) für den Kunden der Zeile — sofort angekreuzt. Die Nummer
     * vergibt der Server.
     */
    const createOffer = async (key: string) => {
        const row = rows.find((candidate) => candidate.key === key);
        if (!row?.customerId || row.creating) return;
        patchRow(key, { creating: true, wanted: true });
        try {
            const created = await tenderApi.createManual({ customerId: row.customerId, format: 'SIA451' });
            patchRow(key, (current) => ({
                creating: false,
                tenders: [created, ...current.tenders.filter((tender) => tender.id !== created.id)],
                tenderIds: [...current.tenderIds, created.id],
                labels: { ...current.labels, [created.id]: created.tenderNumber },
            }));
            toast.success(t('forms.link.offerCreated', { number: created.tenderNumber }));
        } catch (error) {
            patchRow(key, { creating: false });
            toast.error(apiErrorMessage(error, t('forms.link.offerCreateFailed')));
        }
    };

    /**
     * Alle Verknüpfungen: je Kunde entweder seine gewählten Angebote — oder,
     * ohne Angebot, der Kunde allein. Alles gehört zu EINER Checkliste.
     */
    const targets: ChecklistTarget[] = rows
        .filter(rowHasCustomer)
        .flatMap((row): ChecklistTarget[] => (row.tenderIds.length
            ? row.tenderIds.map((tenderId) => ({ customerId: row.customerId!, tenderId }))
            : [{ customerId: row.customerId!, tenderId: null }]));

    const customerCount = new Set(targets.map((target) => target.customerId)).size;
    const offerCount = targets.filter((target) => target.tenderId).length;
    const anyCreating = rows.some((row) => row.creating);

    return (
        <>
            <PopupDialog
                open={open}
                onClose={onClose}
                title={t('forms.link.title')}
                subtitle={t('forms.link.subtitle')}
                icon={<LuLink2 size={18} />}
                width={860}
                z={z}
                closeOnBackdrop={false}
                bodyClassName="ofi-chk ofi-chk-dialog"
                headerActions={(
                    <button type="button" className="ofi-cal-btn" onClick={() => setCustomerPickerOpen(true)}>
                        <LuUsers size={14} />{t('forms.link.selectCustomers')}
                    </button>
                )}
                footer={(
                    <div className="ofi-tp-actions">
                        <div className="ofi-tp-actions__start">
                            {targets.length > 0
                                ? (
                                    <span className="ofi-chk-summary">
                                        <strong>{t('forms.link.customerCountShort', { count: customerCount })}</strong>
                                        <span aria-hidden>·</span>
                                        <span>{offerCount ? t('forms.link.tenderCount', { count: offerCount }) : t('forms.link.noOffer')}</span>
                                    </span>
                                )
                                : t('forms.link.pickCustomerFirst')}
                        </div>
                        <div className="ofi-tp-actions__end">
                            <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                            <PopupButton variant="primary" loading={busy} disabled={targets.length === 0 || anyCreating} onClick={() => onSubmit(targets)}>
                                {submitLabel || t('forms.link.continue')}
                            </PopupButton>
                        </div>
                    </div>
                )}
            >
                <p className="ofi-chk-lead">{t('forms.link.tenderHint')}</p>

                <section className="ofi-chk-group">
                    <div className="ofi-ios-group__title">{t('forms.link.rows')}</div>
                    <div className="ofi-chk-card">
                        <div className="ofi-chk-linkhead" aria-hidden>
                            <span>{t('forms.links.customer')}</span>
                            <span>{t('forms.link.colOffers')} <em>({t('forms.link.offerOptional').toLowerCase()})</em></span>
                            <span />
                        </div>
                        {rows.map((row, index) => {
                            const isSpare = !row.customerId && !row.customerName.trim() && index === rows.length - 1;
                            return (
                                <div key={row.key} className={`ofi-chk-linkrow ${isSpare ? 'is-spare' : ''}`}>
                                    <CustomerSearchField
                                        value={row.customerName}
                                        linked={Boolean(row.customerId)}
                                        onChange={(next) => typeCustomer(row.key, next)}
                                        onPick={(customer) => pickCustomer(row.key, customer)}
                                        z={z + 50}
                                    />
                                    <OfferDropdown
                                        disabled={!row.customerId}
                                        tenders={row.tenders}
                                        loaded={row.loaded}
                                        selectedIds={row.tenderIds}
                                        labels={row.labels}
                                        creating={row.creating}
                                        onOpen={() => { if (!row.wanted) patchRow(row.key, { wanted: true }); }}
                                        onToggle={(tenderId) => toggleTender(row.key, tenderId)}
                                        onCreate={() => void createOffer(row.key)}
                                    />
                                    <button
                                        type="button"
                                        className="ofi-chk-iconbtn is-danger"
                                        title={t('common.delete')}
                                        aria-label={t('common.delete')}
                                        disabled={isSpare}
                                        onClick={() => removeRow(row.key)}
                                    >
                                        <LuTrash2 size={16} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="ofi-ios-group__footer">{t('forms.link.stepHint')}</div>
                </section>
            </PopupDialog>

            {/* «Kunden wählen»: die grosse Liste, 15 je Seite, mehrere auf einmal. */}
            <CustomerSelectModal
                open={customerPickerOpen}
                onClose={() => setCustomerPickerOpen(false)}
                onSelect={addCustomers}
                excludeIds={rows.map((row) => row.customerId).filter(Boolean) as string[]}
                z={z + 50}
            />
        </>
    );
};
