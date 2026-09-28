import { lazy, Suspense, useRef, useState } from 'react';

import { Edit01, Eye, Plus, Trash01, Truck01, XClose } from '@/components/icons/antIconCompat';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { DocumentProductCell } from '@/components/sales-document/DocumentProductCell';
import { DateField } from '@/components/ui-shared/DateField';
import { PopupActions, PopupButton, PopupDialog, PopupEmpty, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import {
    deliveryNotesApi,
    type DeliveryNoteDto,
    type DeliveryNoteLineDto,
    type DeliverySiteKind,
} from '@/lib/api/deliveryNotes';
import { tenderApi } from '@/lib/api/tender';
import { deliveredByPosition, draftLinesFromPositions, openAfterNote, roundQty } from '@/lib/deliveryNoteDraft';
import { lazyToast as toast } from '@/lib/lazyToast';
import { useTenderProductPicker } from '@/pages/sales/detail/hooks/useTenderProductPicker';
import { addressesEqual, selectedSiteAddress } from '@/pages/sales/detail/utils/tenderAddress.utils';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { ArticleQuickPick } from '@/types/inventory';
import '@/styles/modules/deliveryNote.css';

// Der grosse Produktwähler der Offerte — «Mehr suchen …» öffnet ihn.
const LazyProductPickerPopup = lazy(() =>
    import('@/pages/sales/detail/popups/ProductPickerPopup').then((module) => ({ default: module.ProductPickerPopup })),
);

/** Der Auftrag, so wie ihn der Lieferschein braucht. */
export interface DeliveryNoteTarget {
    id: string;
    orderNumber: string;
    tenderId?: string | null;
    cancelledAt?: string | null;
}

type SiteChoice = DeliverySiteKind | 'NONE';

type EditorLine = DeliveryNoteLineDto & {
    key: string;
    /** Schon auf früheren Lieferscheinen geliefert. */
    before: number;
    /** Die Eingabe «Geliefert», wie getippt. */
    qtyText: string;
};

type OrderAddresses = {
    customerName: string;
    customerAddress: string;
    customerReference: string;
    /** Nur die Anschriften, die von der Hauptadresse abweichen. */
    sites: Partial<Record<DeliverySiteKind, string>>;
    /** Die auf der Offerte gewählte — Vorgabe für einen neuen Lieferschein. */
    chosen: SiteChoice;
};

const EMPTY_ADDRESSES: OrderAddresses = {
    customerName: '',
    customerAddress: '',
    customerReference: '',
    sites: {},
    chosen: 'NONE',
};

const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const fmtQty = (value: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 3 }).format(Number(value) || 0);

/** «1,5», «1.5», «1'000» — Schweizer Schreibweisen werden alle verstanden. */
const parseQty = (text: string): number => {
    const cleaned = String(text || '').replace(/['’\s]/g, '').replace(',', '.');
    const value = Number(cleaned);
    return Number.isFinite(value) && value > 0 ? roundQty(value) : 0;
};

const qtyInput = (value: number) => (value > 0 ? String(roundQty(value)) : '0');

const fmtDay = (value?: string | null) => {
    const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    return day ? `${day[3]}.${day[2]}.${day[1]}` : '';
};

/** Die Meldung des Servers, sonst die eigene — ohne `any`. */
const serverError = (error: unknown): string | null => {
    const response = (error as { response?: { data?: { error?: unknown } } } | null)?.response;
    const message = response?.data?.error;
    return typeof message === 'string' && message ? message : null;
};

let keySeed = 0;
const nextKey = () => {
    keySeed += 1;
    return `ls-${Date.now().toString(36)}-${keySeed}`;
};

/**
 * ── LIEFERSCHEIN (Vorgabe Samet 28.09.2026) ──────────────────────────────────
 * «Projede nerede gerekiyorsa bu irsaliyeyi uygula ve en uygun yere at.» Der
 * Lieferschein ist ein Beleg des AUFTRAGS — darum steht sein Knopf dort, wo
 * auch die Auftragsbestätigung steht: auf der Auftragskarte der
 * Projektübersicht und in der Auftragsansicht, direkt neben dem Verkaufs-PDF.
 *
 * Das Fenster:
 *  • zeigt die Lieferscheine des Auftrags (PDF, Bearbeiten, Löschen) — hat der
 *    Auftrag noch keinen, öffnet es direkt einen neuen;
 *  • schlägt für einen neuen Lieferschein die Positionen der AB vor, mit der
 *    Menge, die noch OFFEN ist (bestellt minus frühere Lieferscheine);
 *  • nimmt die Anschrift von der Offerte: Kunde plus GENAU EINE Zusatzanschrift,
 *    die dort gewählte Projekt- ODER Lieferadresse;
 *  • lässt weitere Positionen über dieselbe Produktliste ergänzen wie die
 *    Offerte (Odoo-Liste mit «Mehr suchen …»);
 *  • «Speichern & PDF» sichert und zeigt sofort das PDF.
 */
export const DeliveryNoteButton = ({ order, fallbackTenderId, projectNumber, className }: {
    order: DeliveryNoteTarget | null;
    /** Hat der Auftrag keine eigene Offerte, gilt die des Projekts. */
    fallbackTenderId?: string | null;
    /** PR-2026-… — steht auf der Belegkarte. */
    projectNumber?: string | null;
    className?: string;
}) => {
    const settings = usePdfSettings();
    // Synthetische «project-main-*» Aufträge sind keine Zeile in der Datenbank.
    const orderId = order && !order.id.startsWith('project-main-') ? order.id : null;
    const tenderId = order?.tenderId || fallbackTenderId || null;
    const cancelled = Boolean(order?.cancelledAt);

    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState<'list' | 'edit'>('list');
    const [notes, setNotes] = useState<DeliveryNoteDto[]>([]);
    const [draftBase, setDraftBase] = useState<DeliveryNoteLineDto[]>([]);
    const [addresses, setAddresses] = useState<OrderAddresses>(EMPTY_ADDRESSES);
    const [nextNumber, setNextNumber] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // ── Erfassung ────────────────────────────────────────────────────────────
    const [editingId, setEditingId] = useState<string | null>(null);
    const [date, setDate] = useState(today());
    const [reference, setReference] = useState('');
    const [site, setSite] = useState<SiteChoice>('NONE');
    const [siteText, setSiteText] = useState('');
    const [noteText, setNoteText] = useState('');
    const [lines, setLines] = useState<EditorLine[]>([]);
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const [pickerRowKey, setPickerRowKey] = useState<string | null>(null);
    const picker = useTenderProductPicker();

    // ── PDF-Vorschau ─────────────────────────────────────────────────────────
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewTitle, setPreviewTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const [blob, setBlob] = useState<Blob | null>(null);
    const saveRef = useRef<(() => void) | null>(null);

    // Auftragswechsel: Liste und Vorschau gehören dem Auftrag — beim Rendern
    // übernommen («adjust state when props change»), ohne Effekt.
    const [shownOrderId, setShownOrderId] = useState(orderId);
    if (shownOrderId !== orderId) {
        setShownOrderId(orderId);
        setOpen(false);
        setPreviewOpen(false);
        setBlob(null);
        setNotes([]);
    }

    const startNew = (list: DeliveryNoteDto[], draft: DeliveryNoteLineDto[], addr: OrderAddresses) => {
        const before = deliveredByPosition(list);
        const proposed = draft
            .map((line): EditorLine => {
                const done = roundQty(before.get(line.sourcePositionId || '') || 0);
                return { ...line, key: nextKey(), before: done, qtyText: qtyInput(Math.max(0, line.orderedQty - done)) };
            })
            // Was schon ganz geliefert ist, kommt nicht noch einmal.
            .filter((line) => parseQty(line.qtyText) > 0);
        setEditingId(null);
        setDate(today());
        setReference(addr.customerReference);
        setSite(addr.chosen);
        setSiteText(addr.chosen === 'NONE' ? '' : addr.sites[addr.chosen] || '');
        setNoteText('');
        setLines(proposed);
        setFocusKey(null);
        setView('edit');
    };

    const startEdit = (note: DeliveryNoteDto) => {
        const before = deliveredByPosition(notes, note.id);
        setEditingId(note.id);
        setDate(note.deliveryDate || today());
        setReference(note.customerReference || '');
        setSite(note.siteAddressKind ?? 'NONE');
        setSiteText(note.siteAddress || '');
        setNoteText(note.note || '');
        setLines(note.lines.map((line) => ({
            ...line,
            key: nextKey(),
            before: roundQty(before.get(line.sourcePositionId || '') || 0),
            qtyText: qtyInput(line.deliveredQty),
        })));
        setFocusKey(null);
        setConfirmDeleteId(null);
        setView('edit');
    };

    const openDialog = () => {
        if (!orderId) return;
        setOpen(true);
        setView('list');
        setConfirmDeleteId(null);
        setLoading(true);
        void (async () => {
            try {
                const [list, detail, number] = await Promise.all([
                    deliveryNotesApi.list(orderId),
                    tenderId
                        ? tenderApi.getById(tenderId, { includeActivities: false, deferOrderPdfContent: true }).catch(() => null)
                        : Promise.resolve(null),
                    deliveryNotesApi.nextNumber().catch(() => null),
                ]);
                const draft = detail ? draftLinesFromPositions(detail.positions || []) : [];
                const ids = draft.map((line) => line.articleId || '').filter(Boolean);
                const codes = ids.length ? await deliveryNotesApi.articleCodes(ids).catch(() => ({} as Record<string, string>)) : {};
                draft.forEach((line) => {
                    if (line.articleId && codes[line.articleId]) line.articleCode = codes[line.articleId];
                });

                const tender = detail?.tender;
                const main = String(tender?.customerAddress ?? '').trim();
                const sites: Partial<Record<DeliverySiteKind, string>> = {};
                const install = String(tender?.installationAddress ?? '').trim();
                const deliver = String(tender?.deliveryAddress ?? '').trim();
                if (install && !addressesEqual(install, main)) sites.INSTALLATION = install;
                if (deliver && !addressesEqual(deliver, main)) sites.DELIVERY = deliver;
                const chosen = tender ? selectedSiteAddress(tender)?.kind ?? 'NONE' : 'NONE';
                const addr: OrderAddresses = {
                    customerName: String(tender?.customerName ?? '').trim(),
                    customerAddress: main,
                    customerReference: String(tender?.customerReference ?? '').trim(),
                    sites,
                    chosen,
                };

                setNotes(list);
                setDraftBase(draft);
                setAddresses(addr);
                setNextNumber(number);
                if (list.length === 0) startNew(list, draft, addr);
            } catch (error) {
                toast.error(serverError(error) || t('deliveryNote.loadError'));
                setOpen(false);
            } finally {
                setLoading(false);
            }
        })();
    };

    const closeDialog = () => {
        if (saving) return;
        picker.setProductPickerOpen(false);
        setOpen(false);
    };

    // ── Zeilen ───────────────────────────────────────────────────────────────
    const patchLine = (key: string, patch: Partial<EditorLine>) =>
        setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

    const pickArticle = (key: string, article: ArticleQuickPick) => patchLine(key, {
        articleId: article.id,
        articleCode: article.articleCode ?? null,
        description: article.name,
        unit: article.unit || null,
    });

    const addLine = () => {
        const key = nextKey();
        setLines((current) => [...current, {
            key,
            sourcePositionId: null,
            articleId: null,
            positionNumber: null,
            articleCode: null,
            description: '',
            unit: null,
            orderedQty: 0,
            deliveredQty: 0,
            before: 0,
            qtyText: '1',
        }]);
        setFocusKey(key);
    };

    const removeLine = (key: string) => setLines((current) => current.filter((line) => line.key !== key));

    const chooseSite = (choice: SiteChoice) => {
        setSite(choice);
        setSiteText(choice === 'NONE' ? '' : addresses.sites[choice] || '');
    };

    // ── PDF ──────────────────────────────────────────────────────────────────
    const showPdf = async (note: DeliveryNoteDto, allNotes: DeliveryNoteDto[]) => {
        saveRef.current = null;
        setBlob(null);
        setPreviewTitle(note.noteNumber);
        setPreviewOpen(true);
        setBusy(true);
        try {
            const module = await import('@/utils/pdf/deliveryNotePdf');
            const opens = openAfterNote(note, allNotes);
            const doc = await module.buildDeliveryNotePdf({
                noteNumber: note.noteNumber,
                deliveryDate: note.deliveryDate,
                orderNumber: order?.orderNumber || null,
                projectNumber: projectNumber || null,
                customerReference: note.customerReference,
                customerName: note.customerName,
                customerAddress: note.customerAddress,
                siteAddress: note.siteAddressKind && note.siteAddress
                    ? { kind: note.siteAddressKind, address: note.siteAddress }
                    : null,
                note: note.note,
                lines: note.lines.map((line, index) => ({
                    positionNumber: line.positionNumber,
                    articleCode: line.articleCode,
                    description: line.description,
                    unit: line.unit,
                    orderedQty: line.orderedQty,
                    deliveredQty: line.deliveredQty,
                    openQty: opens[index] ?? null,
                })),
            }, settings);
            saveRef.current = () => module.saveDeliveryNotePdf(doc);
            setBlob(doc.blob);
        } catch (error) {
            toast.error((error instanceof Error && error.message) || t('services.toastPdfError'));
            setPreviewOpen(false);
        } finally {
            setBusy(false);
        }
    };

    // ── Speichern ────────────────────────────────────────────────────────────
    const save = async () => {
        if (!orderId) return;
        const payloadLines = lines
            .map((line) => ({
                sourcePositionId: line.sourcePositionId,
                articleId: line.articleId,
                positionNumber: line.positionNumber,
                articleCode: line.articleCode,
                description: String(line.description || '').trim(),
                unit: line.unit,
                orderedQty: line.orderedQty,
                deliveredQty: parseQty(line.qtyText),
            }))
            .filter((line) => line.description && line.deliveredQty > 0);
        if (payloadLines.length === 0) {
            toast.error(t('deliveryNote.needLine'));
            return;
        }
        const siteKind = site === 'NONE' ? null : site;
        const common = {
            deliveryDate: date || today(),
            siteAddressKind: siteKind,
            siteAddress: siteKind ? siteText.trim() || null : null,
            customerReference: reference.trim() || null,
            note: noteText.trim() || null,
            lines: payloadLines,
        };
        setSaving(true);
        try {
            const saved = editingId
                ? await deliveryNotesApi.update(editingId, common)
                : await deliveryNotesApi.create({
                    ...common,
                    salesOrderId: orderId,
                    customerName: addresses.customerName || null,
                    customerAddress: addresses.customerAddress || null,
                });
            const nextNotes = editingId
                ? notes.map((note) => (note.id === saved.id ? saved : note))
                : [...notes, saved];
            setNotes(nextNotes);
            setView('list');
            if (!editingId) setNextNumber(null);
            toast.success(t('deliveryNote.saved', { number: saved.noteNumber }));
            void showPdf(saved, nextNotes);
        } catch (error) {
            toast.error(serverError(error) || t('deliveryNote.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (note: DeliveryNoteDto) => {
        setSaving(true);
        try {
            await deliveryNotesApi.remove(note.id);
            const rest = notes.filter((entry) => entry.id !== note.id);
            setNotes(rest);
            setConfirmDeleteId(null);
            toast.success(t('deliveryNote.deleted', { number: note.noteNumber }));
        } catch (error) {
            toast.error(serverError(error) || t('deliveryNote.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const disabled = !orderId || cancelled;
    const siteOptions = (['INSTALLATION', 'DELIVERY'] as DeliverySiteKind[]).filter((kind) => addresses.sites[kind]);
    const siteLabel = (kind: DeliverySiteKind) =>
        kind === 'INSTALLATION' ? t('deliveryNote.siteInstallation') : t('deliveryNote.siteDelivery');
    const editingNote = editingId ? notes.find((note) => note.id === editingId) : null;
    const allDelivered = view === 'edit' && !editingId && lines.length === 0 && draftBase.length > 0;

    // ── Liste der Lieferscheine ──────────────────────────────────────────────
    const listBody = notes.length === 0 ? (
        <PopupEmpty>{t('deliveryNote.listEmpty')}</PopupEmpty>
    ) : (
        <div className="ofi-ls-tablewrap">
            {/* Eigenes Kleid: die Tabellenhaut der Dialoge (index.css) bleibt aussen vor. */}
            <table className="ofi-ls-table" data-unstyled-table>
                <thead>
                    <tr>
                        <th>{t('deliveryNote.number')}</th>
                        <th>{t('deliveryNote.date')}</th>
                        <th>{t('deliveryNote.address')}</th>
                        <th className="ofi-ls-num">{t('deliveryNote.positions')}</th>
                        <th aria-label={t('deliveryNote.actions')} />
                    </tr>
                </thead>
                <tbody>
                    {notes.map((note) => (
                        <tr key={note.id}>
                            <td className="ofi-ls-strong">{note.noteNumber}</td>
                            <td>{fmtDay(note.deliveryDate)}</td>
                            <td className="ofi-ls-muted">
                                {note.siteAddressKind ? siteLabel(note.siteAddressKind) : t('deliveryNote.customerOnly')}
                            </td>
                            <td className="ofi-ls-num">{note.lines.length}</td>
                            <td className="ofi-ls-actions">
                                {confirmDeleteId === note.id ? (
                                    <span className="ofi-ls-confirm">
                                        <span>{t('deliveryNote.deleteConfirm')}</span>
                                        <PopupButton variant="danger" loading={saving} onClick={() => { void remove(note); }}>
                                            {t('common.delete')}
                                        </PopupButton>
                                        <PopupButton disabled={saving} onClick={() => setConfirmDeleteId(null)}>
                                            {t('common.cancel')}
                                        </PopupButton>
                                    </span>
                                ) : (
                                    <>
                                        <button type="button" className="ofi-ls-iconbtn" title={t('deliveryNote.showPdf')} aria-label={t('deliveryNote.showPdf')} onClick={() => { void showPdf(note, notes); }}>
                                            <Eye size={15} />
                                        </button>
                                        <button type="button" className="ofi-ls-iconbtn" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => startEdit(note)}>
                                            <Edit01 size={15} />
                                        </button>
                                        <button type="button" className="ofi-ls-iconbtn is-danger" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => setConfirmDeleteId(note.id)}>
                                            <Trash01 size={15} />
                                        </button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    // ── Erfassung ────────────────────────────────────────────────────────────
    const editBody = (
        <div className="ofi-ls">
            <div className="ofi-ls-grid">
                <PopupField label={t('deliveryNote.date')}>
                    <DateField value={date} onChange={setDate} ariaLabel={t('deliveryNote.date')} className="w-full" />
                </PopupField>
                <PopupField label={t('deliveryNote.reference')}>
                    <input
                        className="ofi-cal-input w-full"
                        value={reference}
                        maxLength={191}
                        onChange={(event) => setReference(event.target.value)}
                        aria-label={t('deliveryNote.reference')}
                    />
                </PopupField>
                <PopupField label={t('deliveryNote.number')}>
                    <div className="ofi-ls-numberbox">
                        {editingNote
                            ? editingNote.noteNumber
                            : (nextNumber ? t('deliveryNote.numberPreview', { number: nextNumber }) : t('deliveryNote.numberOnSave'))}
                    </div>
                </PopupField>
            </div>

            <div className="ofi-ls-addr">
                <div className="ofi-ls-addr__box">
                    <div className="ofi-ls-addr__label">{t('deliveryNote.recipient')}</div>
                    {(editingNote ? editingNote.customerName : addresses.customerName) || '—'}
                    {(editingNote ? editingNote.customerAddress : addresses.customerAddress)
                        ? <div>{editingNote ? editingNote.customerAddress : addresses.customerAddress}</div>
                        : null}
                </div>
                <div className="ofi-ls-addr__box">
                    <div className="ofi-ls-addr__label">
                        {site === 'NONE' ? t('deliveryNote.siteAddress') : siteLabel(site)}
                    </div>
                    {siteOptions.length > 1 && (
                        <div className="ofi-ls-seg" role="radiogroup" aria-label={t('deliveryNote.siteAddress')}>
                            {siteOptions.map((kind) => (
                                <button
                                    key={kind}
                                    type="button"
                                    role="radio"
                                    aria-checked={site === kind}
                                    className={`ofi-ls-seg__item ${site === kind ? 'is-active' : ''}`}
                                    onClick={() => chooseSite(kind)}
                                >
                                    {siteLabel(kind)}
                                </button>
                            ))}
                        </div>
                    )}
                    {site !== 'NONE' && siteText
                        ? <div>{siteText}</div>
                        : <div className="ofi-ls-muted">{t('deliveryNote.customerOnly')}</div>}
                    <div className="ofi-ls-hint">{t('deliveryNote.siteHint')}</div>
                </div>
            </div>

            {allDelivered && <PopupNote>{t('deliveryNote.allDelivered')}</PopupNote>}
            {!tenderId && !editingId && <PopupNote>{t('deliveryNote.noTender')}</PopupNote>}

            <div className="ofi-ls-tablewrap">
                <table className="ofi-ls-table is-edit" data-unstyled-table>
                    <thead>
                        <tr>
                            <th className="ofi-ls-col-pos">{t('deliveryNote.colPos')}</th>
                            <th className="ofi-ls-col-code">{t('deliveryNote.colCode')}</th>
                            <th>{t('deliveryNote.colDescription')}</th>
                            <th className="ofi-ls-num">{t('deliveryNote.colOrdered')}</th>
                            <th className="ofi-ls-num">{t('deliveryNote.colBefore')}</th>
                            <th className="ofi-ls-num">{t('deliveryNote.colDelivered')}</th>
                            <th>{t('deliveryNote.colUnit')}</th>
                            <th aria-label={t('deliveryNote.removeLine')} />
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line) => {
                            const fromOrder = Boolean(line.sourcePositionId);
                            const open = fromOrder ? Math.max(0, roundQty(line.orderedQty - line.before)) : null;
                            const typed = parseQty(line.qtyText);
                            const over = open !== null && typed > open;
                            return (
                                <tr key={line.key}>
                                    <td className="ofi-ls-muted">{line.positionNumber || ''}</td>
                                    <td className="ofi-ls-muted ofi-ls-code">{line.articleCode || ''}</td>
                                    <td className="ofi-ls-desc">
                                        {fromOrder ? (
                                            <span className="ofi-ls-desc__text">{line.description}</span>
                                        ) : (
                                            <DocumentProductCell
                                                value={line.description}
                                                hasArticle={Boolean(line.articleId)}
                                                autoFocus={focusKey === line.key}
                                                onPickArticle={(article) => pickArticle(line.key, article)}
                                                onCommitText={(next) => patchLine(line.key, next
                                                    ? { description: next }
                                                    : { description: '', articleId: null, articleCode: null })}
                                                onOpenAllProducts={(search) => {
                                                    setPickerRowKey(line.key);
                                                    picker.setProductSearch(search);
                                                    picker.setProductPickerOpen(true);
                                                }}
                                            />
                                        )}
                                    </td>
                                    <td className="ofi-ls-num">{fromOrder ? fmtQty(line.orderedQty) : '–'}</td>
                                    <td className="ofi-ls-num ofi-ls-muted">{fromOrder ? fmtQty(line.before) : '–'}</td>
                                    <td className="ofi-ls-num">
                                        <input
                                            className={`ofi-ls-qty ${over ? 'is-over' : ''}`}
                                            value={line.qtyText}
                                            inputMode="decimal"
                                            aria-label={t('deliveryNote.colDelivered')}
                                            title={over ? t('deliveryNote.overHint', { open: fmtQty(open ?? 0) }) : undefined}
                                            onChange={(event) => patchLine(line.key, { qtyText: event.target.value })}
                                            onFocus={(event) => event.target.select()}
                                        />
                                    </td>
                                    <td>
                                        {fromOrder ? (
                                            <span className="ofi-ls-muted">{line.unit || ''}</span>
                                        ) : (
                                            <input
                                                className="ofi-ls-unit"
                                                value={line.unit || ''}
                                                maxLength={24}
                                                aria-label={t('deliveryNote.colUnit')}
                                                onChange={(event) => patchLine(line.key, { unit: event.target.value || null })}
                                            />
                                        )}
                                    </td>
                                    <td className="ofi-ls-actions">
                                        <button
                                            type="button"
                                            className="ofi-ls-iconbtn"
                                            title={t('deliveryNote.removeLine')}
                                            aria-label={t('deliveryNote.removeLine')}
                                            onClick={() => removeLine(line.key)}
                                        >
                                            <XClose size={15} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <button type="button" className="ofi-ls-addline" onClick={addLine}>
                    <Plus size={14} />
                    {t('deliveryNote.addLine')}
                </button>
            </div>

            <PopupField label={t('deliveryNote.note')}>
                <textarea
                    className="ofi-cal-input w-full"
                    rows={2}
                    value={noteText}
                    maxLength={2000}
                    placeholder={t('deliveryNote.notePlaceholder')}
                    onChange={(event) => setNoteText(event.target.value)}
                />
            </PopupField>
        </div>
    );

    return (
        <>
            <button
                type="button"
                onClick={openDialog}
                disabled={disabled}
                title={cancelled ? t('deliveryNote.cancelledOrder') : t('deliveryNote.buttonTitle')}
                className={`ofi-ls-btn ${className || ''}`}
            >
                <Truck01 size={14} />
                <span>{t('deliveryNote.button')}</span>
            </button>

            <PopupDialog
                open={open}
                title={t('deliveryNote.title')}
                subtitle={order?.orderNumber || undefined}
                icon={<Truck01 size={20} />}
                width={view === 'edit' ? 1000 : 720}
                onClose={closeDialog}
                /* Beim Erfassen schliesst weder ein Klick daneben noch Escape
                   das Fenster: Escape gehört dort der Produktliste der Zelle,
                   und getippte Mengen gingen sonst verloren. */
                closeOnBackdrop={!saving && !picker.productPickerOpen && view !== 'edit'}
                closeOnEscape={!saving && !picker.productPickerOpen && view !== 'edit'}
                footer={loading ? undefined : view === 'edit' ? (
                    <PopupActions>
                        <PopupButton
                            disabled={saving}
                            onClick={() => (notes.length > 0 ? setView('list') : closeDialog())}
                        >
                            {notes.length > 0 ? t('common.back') : t('common.cancel')}
                        </PopupButton>
                        <PopupButton variant="primary" loading={saving} onClick={() => { void save(); }}>
                            {t('deliveryNote.saveAndPdf')}
                        </PopupButton>
                    </PopupActions>
                ) : (
                    <PopupActions>
                        <PopupButton onClick={closeDialog}>{t('common.close')}</PopupButton>
                        <PopupButton
                            variant="primary"
                            icon={<Plus size={14} />}
                            onClick={() => startNew(notes, draftBase, addresses)}
                        >
                            {t('deliveryNote.new')}
                        </PopupButton>
                    </PopupActions>
                )}
            >
                {loading
                    ? <PopupEmpty>{t('common.loading')}</PopupEmpty>
                    : view === 'edit' ? editBody : listBody}
            </PopupDialog>

            {picker.productPickerOpen && (
                <Suspense fallback={null}>
                    <LazyProductPickerPopup
                        open={picker.productPickerOpen}
                        onClose={() => {
                            picker.setProductPickerOpen(false);
                            setPickerRowKey(null);
                        }}
                        productSearch={picker.productSearch}
                        onSearchChange={picker.setProductSearch}
                        loading={picker.pickerLoading}
                        items={picker.pickerItems}
                        total={picker.pickerTotal}
                        currentPage={picker.productPickerPage}
                        onPageChange={picker.setProductPickerPage}
                        z={900}
                        onSelectArticle={(article) => {
                            if (pickerRowKey) pickArticle(pickerRowKey, article);
                            picker.setProductPickerOpen(false);
                            setPickerRowKey(null);
                        }}
                    />
                </Suspense>
            )}

            <PdfPreviewSheet
                open={previewOpen}
                title={t('deliveryNote.title')}
                subtitle={previewTitle || undefined}
                blob={blob}
                loading={busy}
                loadingLabel={t('tenders.pdf_olusturuluyor')}
                emptyText={t('services.toastPdfError')}
                downloadLabel={t('common.download')}
                onClose={() => setPreviewOpen(false)}
                onDownload={() => {
                    saveRef.current?.();
                    toast.success(t('tenders.pdf_indirildi'));
                }}
            />
        </>
    );
};
