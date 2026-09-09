import { useEffect, useMemo, useRef, useState } from 'react';
import { InfoCircle, Save01 as Save } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';
import { t } from '@/i18n/translate';
import { addonOrdersApi, type AddonOrderDocumentDto } from '@/lib/api/addonOrders';
import { myOrdersApi } from '@/lib/api/billing';
import { parsePaymentStages, paymentStagesValid, type PaymentStage } from '@/lib/paymentSchedule';
import { usePageBackTarget } from '@/lib/backNav';
import type { MyOrderDto } from '@/types/billing';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import { UnsavedChangesPopup } from '@/pages/sales/detail/popups/UnsavedChangesPopup';
import { parseDiscountList, type TenderDiscountEntry } from '@/pages/sales/detail/utils/tenderDiscounts.utils';
import { InvoiceField, InvoicePageHeader, InvoiceStepFoot } from '@/pages/sales/invoices/components/InvoiceFormBits';
import { DotRingPanel } from '@/components/ui-shared/Loader';
import { PopupCard } from '@/components/ui-shared/PopupKit';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { apiError, FIELD_INPUT_CLASS, fmtMoney, isoToday, round2 } from '@/pages/sales/invoices/invoiceShared';
import { DocumentWorkspace } from '@/components/sales-document/DocumentWorkspace';
import { documentLineStarted, documentLineValid, documentNumber, emptyDocumentLine, type DocumentLine } from '@/components/sales-document/documentLines';
import type { AddonEditorParent } from './addonEditorRoute';

const loadedLines = (doc: AddonOrderDocumentDto): DocumentLine[] => [
    ...doc.lines.materials.filter((line) => line.own).map((line) => ({
        ...emptyDocumentLine(), id: line.id, articleId: line.article?.id ?? null,
        description: line.documentLine?.description ?? line.article?.name ?? '', longDescription: line.description || '',
        unit: line.documentLine?.unit ?? line.article?.unit ?? '',
        quantity: String(line.documentLine?.quantity ?? line.quantity), unitPrice: String(line.documentLine?.unitPrice ?? line.unitPrice),
        discounts: line.documentLine?.discounts ?? [], sortOrder: line.documentLine?.sortOrder ?? 0,
    })),
    ...doc.lines.expenses.filter((line) => line.own).map((line) => ({
        ...emptyDocumentLine(), id: line.id, description: line.expenseType, longDescription: line.description || '',
        unit: line.documentLine?.unit ?? '', quantity: String(line.documentLine?.quantity ?? 1),
        unitPrice: String(line.documentLine?.unitPrice ?? line.amount), discounts: line.documentLine?.discounts ?? [],
        sortOrder: line.documentLine?.sortOrder ?? 0,
    })),
].sort((a, b) => a.sortOrder - b.sortOrder);

export function AddonOrderEditor({ addonId, parent, returnTo, onClose, onSaved }: {
    addonId?: string; parent?: AddonEditorParent | null; returnTo: string; onClose: () => void;
    /** Die Fläche, die die Erfassung zeigt, lädt danach ihre Zahlen neu. */
    onSaved?: () => void | Promise<void>;
}) {
    usePageBackTarget({ to: returnTo });
    const [doc, setDoc] = useState<AddonOrderDocumentDto | null>(null);
    const [parents, setParents] = useState<MyOrderDto[]>([]);
    const [parentId, setParentId] = useState(parent?.id || '');
    const [date, setDate] = useState(isoToday);
    const [note, setNote] = useState(() => t('crm.addon.introDefault', { order: parent?.orderNumber || '' }));
    const [lines, setLines] = useState<DocumentLine[]>([]);
    const [stages, setStages] = useState<PaymentStage[]>([]);
    const [discounts, setDiscounts] = useState<TenderDiscountEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    // Nummer und Datum stehen nicht mehr als Überschrift und Felder in der
    // Fläche, sondern hinter EINEM Knopf rechts (Vorgabe Samet 05.09.2026).
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const savedId = useRef(addonId);
    const snapshot = JSON.stringify({ parentId, date, note, lines, stages, discounts });
    const [baseline, setBaseline] = useState(snapshot);
    const guard = useUnsavedChangesGuard(!loading && !loadFailed && snapshot !== baseline);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                if (addonId) {
                    const loaded = await addonOrdersApi.document(addonId);
                    if (cancelled) return;
                    const values = { parentId: loaded.parentSalesOrder?.id || '', date: String(loaded.orderDate || loaded.createdAt).slice(0, 10),
                        note: loaded.confirmationNote ?? t('crm.addon.introDefault', { order: loaded.parentSalesOrder?.orderNumber || '' }),
                        lines: loadedLines(loaded), stages: parsePaymentStages(loaded.paymentStages) ?? [], discounts: parseDiscountList(loaded.addonDiscounts) };
                    setDoc(loaded); setParentId(values.parentId); setDate(values.date); setNote(values.note);
                    setLines(values.lines); setStages(values.stages); setDiscounts(values.discounts); setBaseline(JSON.stringify(values));
                } else if (!parent?.id) {
                    const orders = await myOrdersApi.list();
                    if (!cancelled) setParents(orders.filter((order) => Boolean(order.project?.id) && order.orderType !== 'INVOICE'));
                }
            } catch (error) {
                if (!cancelled) { setLoadFailed(true); toast.error(apiError(error, t('crm.addon.saveFailed'))); }
            } finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [addonId, parent?.id]);

    const inheritedTotal = useMemo(() => !doc ? 0 : round2(
        doc.lines.materials.filter((line) => !line.own).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
        + doc.lines.expenses.filter((line) => !line.own).reduce((sum, line) => sum + line.amount, 0)
        + doc.lines.overtime.reduce((sum, line) => sum + line.overtimeCost, 0)
    ), [doc]);
    // Die Belegfläche rechnet ihre Summe selbst — hier wird nichts mehr addiert.
    const frozen = Boolean(doc?.invoiced);

    // One transaction saves every row, the cover letter, discounts and payment plan.
    const save = async (close = false) => {
        if (savingRef.current || frozen || loadFailed) return false;
        const filled = lines.filter(documentLineStarted);
        if (!parentId || (!filled.length && inheritedTotal <= 0) || !filled.every(documentLineValid)) {
            toast.error(t(!parentId ? 'crm.addon.pickParent' : 'documentEditor.invalidLines')); return false;
        }
        if (stages.length && !paymentStagesValid(stages)) { toast.error(t('crm.addon.paymentIncompleteShort')); return false; }
        savingRef.current = true; setSaving(true);
        try {
            const payload = { orderDate: date, note: note.trim() || null, paymentStages: stages.length ? stages : null, discounts,
                lines: filled.map((line) => ({ id: line.id ?? null, kind: line.articleId ? 'PRODUCT' as const : 'TEXT' as const,
                    articleId: line.articleId, description: line.description.trim(), longDescription: line.longDescription,
                    unit: line.unit, quantity: documentNumber(line.quantity), unitPrice: documentNumber(line.unitPrice), discounts: line.discounts })) };
            const response = savedId.current
                ? await addonOrdersApi.replaceLines(savedId.current, payload)
                : await addonOrdersApi.create({ ...payload, parentSalesOrderId: parentId });
            savedId.current = response.salesOrder.id;
            // Reload IDs before another bulk save, so existing stock rows are updated once.
            const saved = await addonOrdersApi.document(response.salesOrder.id);
            const nextLines = loadedLines(saved);
            setDoc(saved); setLines(nextLines);
            setBaseline(JSON.stringify({ parentId, date, note, lines: nextLines, stages, discounts }));
            toast.success(t('crm.addon.saved'));
            await onSaved?.();
            if (close) onClose();
            return true;
        } catch (error) { toast.error(apiError(error, t('crm.addon.saveFailed'))); return false; }
        finally { savingRef.current = false; setSaving(false); }
    };

    /* ── DAS KLEID DER RECHNUNG ──────────────────────────────────────────
       Vorgabe Samet (05.09.2026): «für den Zusatzauftrag genau dasselbe
       Rechnungsformat — er soll viel sauberer aussehen, wie eine Rechnung.»
       Also derselbe Rahmen wie die Direktrechnung: der Seitenkopf mit dem
       Titel, EIN Kasten (`SectionCard`) mit den Angaben und der Belegfläche,
       und derselbe Fusssteg mit «Abbrechen» links und der Tat rechts. */
    // Der Nachtrag trägt KEINE Überschrift mehr («Neuer Zusatzauftrag» /
    // «Zusatzauftrag bearbeiten» sind weg, Vorgabe 05.09.2026); rechts steht
    // ein Knopf, der Nummer, Hauptauftrag und Datum zeigt — die Nummer klein
    // darin, damit sie den Knopf nicht zur Überschrift macht.
    const detailsButton = (
        <span className="ofi-invp-headbar">
            {doc && <StatusChip variant="info">{t('projects.addonOrder')}</StatusChip>}
            <button type="button" className="ofi-invp-details" onClick={() => setDetailsOpen(true)}>
                <InfoCircle size={14} />
                <span className="ofi-invp-details__text">
                    {t('crm.addon.detailsTitle')}
                    {doc?.orderNumber && <span className="ofi-invp-details__no">{doc.orderNumber}</span>}
                </span>
            </button>
        </span>
    );

    return <div className="ofi-invp-page" aria-busy={loading || saving}>
        <InvoicePageHeader title="" actions={detailsButton} />
        {/* Solange der Nachtrag geholt wird, dreht der Punktekranz in der
            Mitte der Fläche (Vorlage Samet, 05.09.2026). */}
        {loading ? <DotRingPanel /> : loadFailed ? <p role="alert">{t('documentEditor.loadFailed')}</p> : <SectionCard>
            <DocumentWorkspace lines={lines} onChange={setLines} coverLetter={note} onCoverLetterChange={setNote} stages={stages} onStagesChange={setStages} discounts={discounts} onDiscountsChange={setDiscounts} formatMoney={fmtMoney} readOnly={saving || frozen} />
            {inheritedTotal > 0 && <p className="document-help">{t('documentEditor.inherited', { amount: fmtMoney(inheritedTotal) })}</p>}
            <InvoiceStepFoot
                stepIndex={0}
                stepCount={1}
                /* «Zurück», nicht «Abbrechen»: die Maske steht IM Rechteck
                   und der Knopf führt an genau dieselbe Stelle zurück. */
                backLabel={t('common.back')}
                onBack={() => guard.attempt(onClose)}
                onNext={() => undefined}
                finalLabel={t('common.save')}
                finalIcon={<Save size={14} />}
                finalDisabled={saving || frozen || loadFailed}
                onFinal={() => void save(true)}
            />
        </SectionCard>}
        {/* Auftragsdetails: Hauptauftrag und Datum — die Angaben, die vorher
            oben in der Fläche standen. */}
        {detailsOpen && (
            <PopupCard
                open
                onClose={() => setDetailsOpen(false)}
                title={t('crm.addon.detailsTitle')}
                subtitle={doc?.orderNumber || undefined}
                width={440}
            >
                <fieldset disabled={saving || frozen} className="contents">
                    <div className="ofi-invp-grid">
                        <InvoiceField label={t('crm.addon.parentOrder')}>
                            {doc || parent?.id ? <div className="ofi-invp-input is-static">{doc?.parentSalesOrder?.orderNumber || parent?.orderNumber}</div> : <select className={FIELD_INPUT_CLASS} value={parentId} onChange={(event) => {
                                const order = parents.find((row) => row.id === event.target.value);
                                const previous = t('crm.addon.introDefault', { order: parents.find((row) => row.id === parentId)?.orderNumber || '' });
                                setParentId(event.target.value);
                                if (note === previous) setNote(t('crm.addon.introDefault', { order: order?.orderNumber || '' }));
                            }}><option value="">{t('crm.addon.pickParent')}</option>{parents.map((order) => <option key={order.id} value={order.id}>{order.orderNumber}</option>)}</select>}
                        </InvoiceField>
                        {/* Es ist das Datum des NACHTRAGS, nicht das einer Rechnung. */}
                        <InvoiceField label={t('crm.addon.dateLabel')}><input type="date" className={FIELD_INPUT_CLASS} value={date} onChange={(event) => setDate(event.target.value)} /></InvoiceField>
                    </div>
                </fieldset>
            </PopupCard>
        )}
        <UnsavedChangesPopup open={guard.isOpen} saving={saving} onCancel={guard.cancel} onDiscard={guard.proceed} onSave={() => void save().then((saved) => { if (saved) guard.proceed(); })} />
    </div>;
}
