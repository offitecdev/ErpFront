import { useEffect, useMemo, useRef, useState } from 'react';
import { Save01 as Save } from '@/components/icons/antIconCompat';
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
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { apiError, FIELD_INPUT_CLASS, fmtMoney, isoToday, round2 } from '@/pages/sales/invoices/invoiceShared';
import { DocumentWorkspace } from '@/components/sales-document/DocumentWorkspace';
import { documentLineAmount, documentLineStarted, documentLineValidAllowMinus, documentNumber, emptyDocumentLine, type DocumentLine } from '@/components/sales-document/documentLines';
import type { AddonEditorParent } from './addonEditorRoute';
import '@/styles/modules/invoicePages.css';
import { MacDatePicker } from '@/components/ui-shared/MacDatePicker';

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
    const parentLabel = doc?.parentSalesOrder?.orderNumber || parent?.orderNumber
        || parents.find((row) => row.id === parentId)?.orderNumber || null;
    // MINDERUNG (16.09.2026): die Artikel des Hauptauftrags mit ihrem
    // Verkaufspreis — ohne gewählten Hauptauftrag gibt es nichts zu mindern.
    const minderung = parentId ? {
        parentLabel,
        loadSources: () => addonOrdersApi.minderungSources(parentId, savedId.current ?? null),
    } : undefined;

    // One transaction saves every row, the cover letter, discounts and payment plan.
    const save = async (close = false) => {
        if (savingRef.current || frozen || loadFailed) return false;
        const filled = lines.filter(documentLineStarted);
        // Minuszeilen (Minderung) sind im Nachtrag gültig — nur Menge 0 nicht.
        if (!parentId || (!filled.length && inheritedTotal === 0) || !filled.every(documentLineValidAllowMinus)) {
            toast.error(t(!parentId ? 'crm.addon.pickParent' : 'documentEditor.invalidLines')); return false;
        }
        // Eine Minderung wird mit dem Hauptauftrag verrechnet: kein eigener Plan.
        const isMinderung = round2(inheritedTotal + filled.reduce((sum, line) => sum + documentLineAmount(line), 0)) < 0;
        if (!isMinderung && stages.length && !paymentStagesValid(stages)) { toast.error(t('crm.addon.paymentIncompleteShort')); return false; }
        savingRef.current = true; setSaving(true);
        try {
            const payload = { orderDate: date, note: note.trim() || null, paymentStages: stages.length && !isMinderung ? stages : null, discounts,
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

    return <div className="ofi-invp-page" aria-busy={loading || saving}>
        <InvoicePageHeader
            title={doc?.orderNumber || t('crm.addon.newTitle')}
            actions={doc ? <StatusChip variant="info">{t('projects.addonOrder')}</StatusChip> : undefined}
        />
        {/* Solange der Nachtrag geholt wird, dreht der Punktekranz in der
            Mitte der Fläche (Vorlage Samet, 05.09.2026). */}
        {loading ? <DotRingPanel /> : loadFailed ? <p role="alert">{t('documentEditor.loadFailed')}</p> : <SectionCard>
            <fieldset disabled={saving || frozen} className="ofi-invp-addon-meta">
                <div className="ofi-invp-grid">
                    <InvoiceField label={t('crm.addon.parentOrder')}>
                        {doc || parent?.id ? <div className="ofi-invp-input is-static">{doc?.parentSalesOrder?.orderNumber || parent?.orderNumber}</div> : <select className={FIELD_INPUT_CLASS} value={parentId} onChange={(event) => {
                            const order = parents.find((row) => row.id === event.target.value);
                            const previous = t('crm.addon.introDefault', { order: parents.find((row) => row.id === parentId)?.orderNumber || '' });
                            setParentId(event.target.value);
                            if (note === previous) setNote(t('crm.addon.introDefault', { order: order?.orderNumber || '' }));
                        }}><option value="">{t('crm.addon.pickParent')}</option>{parents.map((order) => <option key={order.id} value={order.id}>{order.orderNumber}</option>)}</select>}
                    </InvoiceField>
                    <InvoiceField label={t('crm.addon.dateLabel')}>
                        <MacDatePicker value={date} onChange={setDate} className="is-field" ariaLabel={t('crm.addon.dateLabel')} />
                    </InvoiceField>
                </div>
            </fieldset>
            <DocumentWorkspace lines={lines} onChange={setLines} coverLetter={note} onCoverLetterChange={setNote} stages={stages} onStagesChange={setStages} discounts={discounts} onDiscountsChange={setDiscounts} formatMoney={fmtMoney} readOnly={saving || frozen} minderung={minderung} />
            {inheritedTotal !== 0 && <p className="document-help">{t('documentEditor.inherited', { amount: fmtMoney(inheritedTotal) })}</p>}
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
        <UnsavedChangesPopup open={guard.isOpen} saving={saving} onCancel={guard.cancel} onDiscard={guard.proceed} onSave={() => void save().then((saved) => { if (saved) guard.proceed(); })} />
    </div>;
}
