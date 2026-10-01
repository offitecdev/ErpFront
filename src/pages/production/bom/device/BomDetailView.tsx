import { useId, useMemo, useState } from 'react';
import {
    CalendarClock,
    CheckCircle2,
    ChevronRight,
    FilePen,
    FileText,
    FolderPlus,
    History,
    LayoutTemplate,
    ListChecks,
    PackageMinus,
    RotateCcw,
    Save,
    Trash2,
    Undo2,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { useAuthStore } from '@/store/authStore';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import type { Bom, BomLine, BomProcurementKind, BomProduct, BomTemplate, BomUnit } from '@/types/productionBom';

import { BomLinesTable, type BomTableMode, type BomTableRow } from '../BomLinesTable';
import { fmtQty, parseQuantityText, quantityToText, shortDate, unitLabel } from '../bomFormat';
import { BomSpinner, CompletionChecks, Note, RevisionPill, StatusPill } from '../bomUi';
import { NavBar, NavLinkRow } from '../NavStack';
import { ProductSearch } from '../ProductSearch';
import { addProduct, insertTemplateLines, type DraftLine } from '../templates/templateDraft';
import { AddSubBomDialog, InsertTemplateDialog } from './BomDialogs';
import { diffDraft, draftOfRevisionLine } from './bomRevision';
import { DiscardRevisionDialog, RevisionApproveDialog, RevisionRejectDialog, StartRevisionDialog } from './BomRevisionDialogs';
import { BomRevisionNotice } from './BomRevisionNotice';
import { BomTabs, type BomTab } from './BomTabs';
import { BomUnsavedDialog } from './BomUnsavedDialog';
import { BomProcessButton } from './BomProcessButton';
import { BomActivityPanel } from './BomActivityPanel';
import { pendingLineIds } from './bomProcess';
import { ProcurementRequestDialog } from './ProcurementRequestDialog';
import { entryOf } from './bomViews';
import type { BomViewContext } from './DeviceBomArea';
import { SubBomTree } from './SubBomTree';

const draftOf = (line: BomLine): DraftLine => ({
    key: line.id,
    productId: line.productId,
    product: line.product,
    erpCode: line.erpCode,
    name: line.name,
    brand: line.brand,
    modelNumber: line.modelNumber,
    quantityText: quantityToText(line.quantity),
    unit: line.unit,
    note: line.note,
});

const rowOf = (line: BomLine): BomTableRow => ({
    key: line.id,
    productId: line.productId,
    erpCode: line.product?.erpCode ?? line.erpCode,
    name: line.product?.name ?? line.name,
    brand: line.product?.brand ?? line.brand,
    modelNumber: line.product?.modelNumber ?? line.modelNumber,
    description: line.product?.description ?? null,
    supplierName: line.product?.supplierName ?? null,
    serialRequired: Boolean(line.product?.serialRequired),
    stock: line.product ? line.product.quantity : null,
    free: line.product ? line.product.free : null,
    minimum: line.product?.minimumOrderQuantity ?? null,
    quantityText: quantityToText(line.quantity),
    quantity: line.quantity,
    consumed: line.consumedQuantity,
    unit: line.unit,
    note: line.note,
    missingProduct: !line.product,
    coverage: line.coverage,
    orders: line.orders,
});

const draftRow = (line: DraftLine): BomTableRow => ({
    key: line.key,
    productId: line.productId,
    erpCode: line.product?.erpCode ?? line.erpCode,
    name: line.product?.name ?? line.name,
    brand: line.product?.brand ?? line.brand,
    modelNumber: line.product?.modelNumber ?? line.modelNumber,
    description: line.product?.description ?? null,
    supplierName: line.product?.supplierName ?? null,
    serialRequired: Boolean(line.product?.serialRequired),
    stock: line.product ? line.product.quantity : null,
    free: line.product ? line.product.free : null,
    minimum: line.product?.minimumOrderQuantity ?? null,
    quantityText: line.quantityText,
    quantity: parseQuantityText(line.quantityText) || 0,
    consumed: 0,
    unit: line.unit,
    note: line.note,
    missingProduct: !line.product,
});

const linesPayload = (lines: DraftLine[]) => lines.map((line) => ({
    productId: line.productId,
    quantity: parseQuantityText(line.quantityText),
    unit: line.unit,
    note: line.note,
}));

const payloadValid = (lines: DraftLine[]): boolean => lines.every((line) => {
    const value = parseQuantityText(line.quantityText);
    return Number.isFinite(value) && value > 0;
});

type Ask = 'delete' | 'consume' | 'reviseStart' | 'reviseApprove' | 'reviseDiscard' | 'reviseReject' | null;

/* Die drei Reiter einer BOM (28.09.2026, Samet: «malzemeler, satın alma talepleri,
   gelen mallar alt alta — en üstte tabler şeklinde olsun, macOS SwiftUI»). Der
   gewählte bleibt je BOM, solange die Seite lebt: zurück aus den Revisionen
   steht man wieder dort, wo man war. */
type BomTabKey = 'lines' | 'requests' | 'goods';
const tabMemory = new Map<string, BomTabKey>();

/**
 * ── EINE BOM: DIE HAUPT-BOM (WURZEL) ODER EINE ALT-BOM (27.09.2026) ─────────
 *
 * Samet: «BOM listede kart kart olmamalı, direkt boş liste açılmalı … kısıtlı
 * sınırlı tablo değil, kenarlığı olmasın … en altında boş satır olsun, oradan
 * da ekleyebileyim ya da en üstten de … en üstteki arama çubuğu dar olsun, +
 * kullanımı daha kolay ve hızlı … şablonlardan direkt satırların altında da
 * ekleme yapabilelim.»
 *
 * Oben die Leiste mit dem, was jetzt dran ist (freigeben · bestellen ·
 * abschliessen · abbuchen; bei der Haupt-BOM dazu «Görevler» und «Alt BOM
 * ekle»), darunter die Stationen und die Bedingungen von «BOM tamamla», dann
 * das Material: randlos, so lang wie es ist, oben ein schmales Suchfeld mit
 * «+» und «Şablondan ekle», unten die leere Zeile. Bei der Haupt-BOM folgen
 * ihre Alt-BOMs als Karten am Baum.
 */
export const BomDetailView = ({ context, bom }: { context: BomViewContext; bom: Bom }) => {
    const { nav, canEdit, data } = context;
    const isMain = bom.kind === 'MAIN';
    const consumed = Boolean(bom.consumedAt);
    const isDraft = bom.status === 'DRAFT' && !consumed;
    /* «Bom onaylanırsa geri dönüş yok, revize olması lazım» (27.09.2026): eine
       freigegebene BOM ändert nur ihre Revision im Entwurf — die Tabelle zeigt
       dann die Arbeitskopie; die BOM gilt unverändert weiter, bis sie freigegeben ist. */
    const draftRevision = consumed ? null : bom.revisionDraft;
    const revising = Boolean(draftRevision);
    /* «BOM revize edilmeden önce onay gerektirsin, admin'e onay düşsün» (30.09.2026):
       freigeben darf nur die Administratorrolle; alle anderen reichen ein. */
    const isAdmin = useAuthStore((state) => state.isSystemAdmin);
    const revisionApproval = draftRevision?.approval ?? null;
    const revisionPending = revisionApproval?.state === 'SUBMITTED';
    const editable = canEdit && (isDraft || revising);

    /* KEIN automatisches Speichern (Samet 27.09.2026: «BOM listede otomatik
       kaydetme olmaması lazım … normal Kaydet butonu olmalı»). Der Entwurf
       bleibt, bis «Kaydet» oder «Geri al» — wer vorher die Stufe, die Ansicht
       oder die Seite wechselt, wird gefragt (useUnsavedChangesGuard). */
    const [local, setLocal] = useState<DraftLine[] | null>(null);
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [ask, setAsk] = useState<Ask>(null);
    const [inserting, setInserting] = useState(false);
    const [addingSub, setAddingSub] = useState(false);
    /* «Bom'da sadece sipariş ve fiyat talep istekleri oluşsun» (27.09.2026 abends):
       die BOM stellt einen Talep an den Einkauf — ohne Lieferant, ohne Preis. */
    const [requesting, setRequesting] = useState<BomProcurementKind | null>(null);
    const [requestKind, setRequestKind] = useState<BomProcurementKind>('PRICE');
    const [requestBusy, setRequestBusy] = useState(false);
    const openRequest = (kind: BomProcurementKind) => {
        setRequestKind(kind);
        setRequesting(kind);
    };
    const closeRequest = () => { if (!requestBusy) setRequesting(null); };
    const [tab, setTabState] = useState<BomTabKey>(() => tabMemory.get(bom.id) ?? 'lines');
    const setTab = (next: BomTabKey) => {
        tabMemory.set(bom.id, next);
        setTabState(next);
    };
    const tabIds = useId();

    const serverLines = useMemo(
        () => (draftRevision ? draftRevision.lines.map(draftOfRevisionLine) : bom.lines.map(draftOf)),
        [bom.lines, draftRevision],
    );
    const lines = local ?? serverLines;
    const dirty = editable && local !== null
        && JSON.stringify(linesPayload(local)) !== JSON.stringify(linesPayload(serverLines));
    const valid = payloadValid(lines);

    const save = async (): Promise<boolean> => {
        if (!local) return true;
        if (!payloadValid(local)) {
            toast.error(t('productionBom.detail.invalidQuantity'));
            return false;
        }
        setSaving(true);
        try {
            const result = await productionBomApi.saveLines(bom.id, linesPayload(local));
            context.applyBom(result.bom);
            setLocal(null);
            toast.success(t('productionBom.detail.saved'));
            return true;
        } catch (error) {
            toast.error(productionBomErrorText(error));
            return false;
        } finally {
            setSaving(false);
        }
    };
    const guard = useUnsavedChangesGuard(dirty && !saving);

    const change = (next: DraftLine[]) => setLocal(next);
    const patchLine = (key: string, patch: Partial<DraftLine>) =>
        change(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    const pick = (product: BomProduct) => {
        const result = addProduct(lines, product);
        change(result.lines);
        if (result.merged) toast.message(t('productionBom.search.already'));
    };
    const factor = data.device.quantity > 0 ? data.device.quantity : 1;
    const insertTemplate = (template: BomTemplate) => {
        const result = insertTemplateLines(lines, template, factor);
        change(result.lines);
        setInserting(false);
        toast.success(t('productionBom.insert.done', { added: result.added, merged: result.merged, name: template.name }));
    };
    const run = async (action: 'approve' | 'complete' | 'reopen' | 'consume', successKey: string) => {
        // Freigegeben wird, was gespeichert ist — ungespeicherte Zeilen zuerst «Kaydet».
        if (busy || dirty) return;
        setBusy(action);
        try {
            const result = await productionBomApi.transition(bom.id, action);
            context.applyBom(result.bom);
            // Die Haupt-BOM bucht ihre Alt-BOMs mit ab — deren Karten neu lesen.
            if (isMain && action === 'consume') context.reload();
            toast.success(t(successKey));
            setAsk(null);
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        setBusy('delete');
        try {
            await productionBomApi.removeBom(bom.id);
            toast.success(t('productionBom.detail.deleted'));
            setAsk(null);
            context.reload();
            nav.reset([entryOf({ kind: 'list' })]);
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(null);
        }
    };

    const mode: BomTableMode = consumed ? 'consumed' : isDraft || revising ? 'draft' : 'active';
    // In der Revision: an jeder Zeile, was sie gegenüber der geltenden Fassung ändert (auch ungespeichert).
    const diff = useMemo(() => (revising ? diffDraft(bom.lines, lines) : null), [revising, bom.lines, lines]);
    // «Mal kabul gelse … bomda yazsa, sadece sayısal»: was bei Eingängen an jede Zeile ging.
    const receivedByLine = new Map<string, number>(Object.entries(bom.activity?.received ?? {}));
    for (const entry of bom.activity ? [] : bom.goodsIn ?? []) {
        if (entry.lineId) receivedByLine.set(entry.lineId, (receivedByLine.get(entry.lineId) ?? 0) + entry.quantity);
    }
    const rows = isDraft || revising
        ? lines.map((line) => ({ ...draftRow(line), change: diff?.marks.get(line.key) ?? null }))
        : bom.lines.map((line) => ({ ...rowOf(line), received: receivedByLine.get(line.id) ?? 0 }));
    /* «Bomda artık sipariş talebi yok, sadece fiyat talebi var» (30.09.2026): auch die
       freigegebene BOM fragt Preise an — jede Zeile genau einmal. Bestellt wird aus dem
       Vergleich der Angebote (Satın alma). */
    const priceRequested = pendingLineIds(bom, 'PRICE');
    const requestablePrice = bom.lines.filter((line) => !priceRequested.has(line.id)).length;
    const subs = isMain ? data.subs.map((sub) => context.bomOf(sub.id) ?? sub) : [];
    const parent = !isMain && bom.parentBomId ? context.bomOf(bom.parentBomId) : null;
    const delivery = data.project.deliveryDate;
    const canAddSub = isMain && canEdit && !consumed && bom.status !== 'COMPLETED';
    // Revidiert wird eine freigegebene BOM mit eigenen Zeilen (die leere Haupt-BOM ist nur die Klammer).
    const canRevise = canEdit && !consumed && !revising && bom.status !== 'DRAFT' && bom.lines.length > 0;
    const showRevision = bom.status !== 'DRAFT' || bom.revision > 0;
    const lastRevision = bom.revisions.length ? bom.revisions[bom.revisions.length - 1] : null;
    const afterRevision = (next: Bom, reload = false) => {
        setAsk(null);
        setLocal(null);
        context.applyBom(next);
        // Nach der Freigabe können sich die Haupt-BOM und die Bestellungen mit geändert haben.
        if (reload) context.reload();
    };
    /* Die Haupt-BOM ohne eigene Zeilen ist die Klammer: gleich ihre Alt-BOMs, keine Tabelle
       (Samet: «ilk başta bu olmasın … alt BOM'lar olsun, üstüne tıkladıkça açılsın»).
       Die Zeilen stehen in den Alt-BOMs; abgeschlossen wird sie, wenn alle es sind. */
    const container = isMain && bom.lines.length === 0;
    const tabs: Array<BomTab<BomTabKey>> = [
        { key: 'lines', label: t('productionBom.detail.tab.lines'), count: rows.length },
        { key: 'requests', label: t('productionBom.detail.tab.requests'), count: bom.activity?.requestsCount ?? bom.procurement?.length ?? 0 },
        { key: 'goods', label: t('productionBom.detail.tab.goods'), count: bom.activity?.goodsCount ?? bom.goodsIn?.length ?? 0 },
    ];
    const notes = (
        <>
            {!canEdit && <Note>{t('productionBom.device.readOnly')}</Note>}
            {consumed && <Note>{t('productionBom.detail.consumedHint')}</Note>}
        </>
    );

    const saveLabel =saving ? t('productionBom.common.saving') : dirty ? t('productionBom.detail.unsaved') : null;

    const tasksButton = isMain && context.tasks ? (
        <button
            type="button"
            className="ofi-bom-btn is-quiet ofi-nosize ofi-bom-tasksbtn"
            onClick={() => context.open({ kind: 'tasks' })}
            title={t('productionBom.tasks.open')}
        >
            <ListChecks />
            {t('productionBom.tasks.title')}
            <i className="ofi-bom-tasksbtn__count">{context.tasks.count}</i>
            {context.tasks.mine > 0 && <i className="ofi-bom-tasksbtn__mine">{t('productionBom.tasks.mine', { count: context.tasks.mine })}</i>}
        </button>
    ) : null;

    return (
        <>
            <NavBar
                nav={requesting ? { ...nav, back: closeRequest, canBack: !requestBusy, canForward: false } : nav}
                backTitle={requesting ? bom.bomNumber : context.backTitle}
                title={<span className="ofi-bom-code is-title">{bom.bomNumber}</span>}
                badge={(
                    <>
                        <StatusPill status={bom.status} consumed={consumed} />
                        {showRevision && <RevisionPill revision={bom.revision} draft={draftRevision?.revision ?? null} />}
                        {/* DER WEG — immer oben, als gläserner Knopf: ein Klick zeigt die Stationen. */}
                        {!requesting && (!container || subs.length > 0) && <BomProcessButton bom={bom} subs={subs} />}
                    </>
                )}
                subtitle={(
                    <span className="ofi-bom-subline">
                        {isMain ? (
                            <>
                                <b>{t('productionBom.device.title')}</b>
                                <span className="ofi-bom-dot">·</span>
                                {t(`productionBom.area.${bom.area}`)}
                                <span className="ofi-bom-dot">·</span>
                                <CalendarClock aria-hidden />
                                {delivery ? t('productionBom.device.delivery', { date: shortDate(delivery) }) : t('productionBom.device.noDelivery')}
                            </>
                        ) : (
                            <>
                                <b>{bom.templateName || t('productionBom.sub.one')}</b>
                                <span className="ofi-bom-dot">·</span>
                                {t('productionBom.sub.one')}
                            </>
                        )}
                        {saveLabel && <><span className="ofi-bom-dot">·</span><span className={dirty ? 'ofi-bom-dirty' : 'ofi-bom-saving'}>{saveLabel}</span></>}
                    </span>
                )}
                actions={!requesting && (
                    <>
                        {tasksButton}
                        {editable && !container && (dirty || saving) && (
                            <>
                                <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" disabled={saving} onClick={() => setLocal(null)}>
                                    <Undo2 />
                                    {t('productionBom.editor.revert')}
                                </button>
                                <button type="button" className="ofi-bom-btn is-primary ofi-nosize" disabled={saving || !valid} onClick={() => void save()}>
                                    {saving ? <BomSpinner small /> : <Save />}
                                    {t('productionBom.common.save')}
                                </button>
                            </>
                        )}
                        {canEdit && !consumed && (
                            <>
                                {canAddSub && (
                                    <button
                                        type="button"
                                        className="ofi-bom-btn is-quiet ofi-nosize"
                                        disabled={subs.length >= data.settings.maxPerArea}
                                        title={subs.length >= data.settings.maxPerArea ? t('productionBom.device.maxReached', { max: data.settings.maxPerArea }) : undefined}
                                        onClick={() => setAddingSub(true)}
                                    >
                                        <FolderPlus />
                                        {t('productionBom.sub.add')}
                                    </button>
                                )}
                                {container && bom.status !== 'COMPLETED' && (
                                    <button
                                        type="button"
                                        className={`ofi-bom-btn ofi-nosize${bom.completion.ready ? ' is-success' : ''}`}
                                        disabled={!bom.completion.ready || busy !== null}
                                        title={bom.completion.ready ? undefined : t('productionBom.detail.mainChecks', { done: bom.completion.subs.completed, total: bom.completion.subs.total })}
                                        onClick={() => void run('complete', 'productionBom.detail.completed')}
                                    >
                                        {busy === 'complete' ? <BomSpinner small /> : <CheckCircle2 />}
                                        {t('productionBom.detail.complete')}
                                    </button>
                                )}
                                {isDraft && !container && (
                                    <>
                                        {!isMain && (
                                            <button type="button" className="ofi-bom-btn is-quiet is-icon is-danger-hover ofi-nosize" title={t('productionBom.detail.delete')} aria-label={t('productionBom.detail.delete')} onClick={() => setAsk('delete')}>
                                                <Trash2 />
                                            </button>
                                        )}
                                        {/* Kein «Fiyat talebi» im Entwurf (30.09.2026, Samet: «BOM liste
                                            onaylanmadan fiyat talep edilemesin») — erst freigeben (mit ERP-Codes). */}
                                        <button
                                            type="button"
                                            className={`ofi-bom-btn ofi-nosize${dirty ? '' : ' is-primary'}`}
                                            disabled={(!lines.length && !isMain) || busy !== null || dirty || saving}
                                            title={dirty ? t('productionBom.detail.saveFirst') : undefined}
                                            onClick={() => void run('approve', 'productionBom.detail.approved')}
                                        >
                                            {busy === 'approve' ? <BomSpinner small /> : <CheckCircle2 />}
                                            {t('productionBom.detail.approve')}
                                        </button>
                                    </>
                                )}
                                {/* DIE REVISION IM ENTWURF — verwerfen, anfragen, freigeben. */}
                                {revising && !container && draftRevision && (
                                    <>
                                        <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" disabled={busy !== null || saving} onClick={() => setAsk('reviseDiscard')}>
                                            <X />
                                            {t('productionBom.revision.discard')}
                                        </button>
                                        {/* Die Freigabe: eingereicht wartet sie auf die Administratorrolle (30.09.2026). */}
                                        {revisionApproval && (
                                            <span
                                                className={`ofi-bom-revstate is-${revisionApproval.state.toLowerCase()}`}
                                                title={revisionApproval.note ?? undefined}
                                            >
                                                {t(revisionPending ? 'productionBom.revision.pendingChip' : 'productionBom.revision.rejectedChip', {
                                                    name: revisionApproval.byName ?? '',
                                                    when: shortDate(revisionApproval.at),
                                                })}
                                            </span>
                                        )}
                                        {isAdmin && revisionPending && (
                                            <button type="button" className="ofi-bom-btn is-danger ofi-nosize" disabled={busy !== null || saving} onClick={() => setAsk('reviseReject')}>
                                                <X />
                                                {t('productionBom.revision.rejectButton')}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={`ofi-bom-btn ofi-nosize${dirty || (!isAdmin && revisionPending) ? '' : ' is-primary'}`}
                                            disabled={busy !== null || dirty || saving || !lines.length || (!isAdmin && revisionPending)}
                                            title={dirty ? t('productionBom.detail.saveFirst') : (!isAdmin ? t('productionBom.revision.submitHint') : undefined)}
                                            onClick={() => setAsk('reviseApprove')}
                                        >
                                            <CheckCircle2 />
                                            {isAdmin
                                                ? t('productionBom.revision.approveButton', { revision: draftRevision.revision })
                                                : t(revisionPending ? 'productionBom.revision.pendingButton' : 'productionBom.revision.submitButton', { revision: draftRevision.revision })}
                                        </button>
                                    </>
                                )}
                                {bom.status === 'APPROVED' && !container && !revising && (
                                    <>
                                        {/* «Onayı geri al» gibt es nicht mehr — geändert wird über eine Revision. */}
                                        {canRevise && (
                                            <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" disabled={busy !== null} onClick={() => setAsk('reviseStart')}>
                                                <FilePen />
                                                {t('productionBom.revision.start')}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={`ofi-bom-btn ofi-nosize${requestablePrice > 0 ? ' is-primary' : ''}`}
                                            disabled={requestablePrice === 0}
                                            title={requestablePrice === 0
                                                ? t('productionBom.procurement.allPriceRequested')
                                                : t('productionBom.procurement.priceButtonTitle')}
                                            onClick={() => openRequest('PRICE')}
                                        >
                                            <FileText />
                                            {t('productionBom.procurement.priceButton')}
                                        </button>
                                        <button
                                            type="button"
                                            className={`ofi-bom-btn ofi-nosize${bom.completion.ready ? ' is-success' : ''}`}
                                            disabled={!bom.completion.ready || busy !== null}
                                            title={bom.completion.ready ? undefined : t('productionBom.err.NOT_READY')}
                                            onClick={() => void run('complete', 'productionBom.detail.completed')}
                                        >
                                            {busy === 'complete' ? <BomSpinner small /> : <CheckCircle2 />}
                                            {t('productionBom.detail.complete')}
                                        </button>
                                    </>
                                )}
                                {bom.status === 'COMPLETED' && !revising && (
                                    <>
                                        {canRevise && (
                                            <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" disabled={busy !== null} onClick={() => setAsk('reviseStart')}>
                                                <FilePen />
                                                {t('productionBom.revision.start')}
                                            </button>
                                        )}
                                        <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" disabled={busy !== null} onClick={() => void run('reopen', 'productionBom.detail.reopened')}>
                                            <RotateCcw />
                                            {t('productionBom.detail.reopen')}
                                        </button>
                                        <button type="button" className="ofi-bom-btn is-danger ofi-nosize" disabled={busy !== null} onClick={() => setAsk('consume')}>
                                            <PackageMinus />
                                            {t('productionBom.detail.consume')}
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            />

            <ProcurementRequestDialog
                key={`${bom.id}:${requestKind}`}
                open={Boolean(requesting)}
                embedded
                bom={bom}
                kind={requestKind}
                onClose={closeRequest}
                onBusyChange={setRequestBusy}
                onDone={(next) => {
                    setRequesting(null);
                    context.applyBom(next);
                    // Der neue Talep steht im Reiter «Satın alma talepleri» — dorthin.
                    setTab('requests');
                }}
            />

            <div className="ofi-bom-body" hidden={Boolean(requesting)} style={requesting ? { display: 'none' } : undefined}>
                {parent && (
                    <nav className="ofi-bom-crumb" aria-label={t('productionBom.sub.path')}>
                        <button type="button" className="ofi-bom-crumb__link ofi-nosize" onClick={() => nav.back()}>
                            <span className="ofi-bom-code">{parent.bomNumber}</span>
                            <small>{t('productionBom.sub.mainOne')}</small>
                        </button>
                        <ChevronRight aria-hidden />
                        <span className="ofi-bom-crumb__here">
                            <span className="ofi-bom-code">{bom.bomNumber}</span>
                            <small>{bom.templateName}</small>
                        </span>
                    </nav>
                )}

                {/* DIE REITER — ganz oben (Samet, 28.09.2026: «en üstte tabler şeklinde,
                    macOS SwiftUI»). Rechts daneben die Revision im Entwurf: erst ein
                    gläsernes Warnfenster, dann klein als gläserne Gedankenblase. */}
                {!container && (
                    <div className="ofi-bom-tabbar">
                        <BomTabs tabs={tabs} value={tab} onChange={setTab} label={t('productionBom.detail.tabs')} idPrefix={tabIds} />
                        {revising && draftRevision && (
                            <BomRevisionNotice
                                key={`${bom.id}:${draftRevision.revision}`}
                                bomId={bom.id}
                                draft={draftRevision}
                                current={bom.revision}
                                counts={diff?.counts ?? null}
                            />
                        )}
                    </div>
                )}

                {container && !consumed && subs.length > 0 && (
                    <div className="ofi-bom-overview is-main">
                        <div className="ofi-bom-overview__checks">
                            <span className="ofi-bom-overview__caption">{t('productionBom.detail.checksTitle')}</span>
                            <ol className="ofi-bom-checks">
                                <li className={bom.completion.subs.completed === bom.completion.subs.total ? 'is-done' : undefined}>
                                    <span className="ofi-bom-checks__mark" aria-hidden>
                                        {bom.completion.subs.completed === bom.completion.subs.total ? <CheckCircle2 /> : 1}
                                    </span>
                                    <span>{t('productionBom.detail.mainChecks', { done: bom.completion.subs.completed, total: bom.completion.subs.total })}</span>
                                </li>
                            </ol>
                        </div>
                    </div>
                )}

                {container && notes}

                {!container && (
                    <div
                        key={tab}
                        id={`${tabIds}-panel`}
                        role="tabpanel"
                        aria-labelledby={`${tabIds}-tab-${tab}`}
                        className="ofi-bom-tabpanel"
                    >
                        {tab === 'lines' && (
                            <>
                                {!isDraft && (
                                    <div className="ofi-bom-overview">
                                        {!consumed && (
                                            <div className="ofi-bom-overview__checks">
                                                <span className="ofi-bom-overview__caption">{t('productionBom.detail.checksTitle')}</span>
                                                <CompletionChecks completion={bom.completion} />
                                            </div>
                                        )}
                                        <div className="ofi-bom-links">
                                            {bom.status === 'APPROVED' && !consumed && (
                                                <NavLinkRow
                                                    icon={<FileText />}
                                                    label={t('productionBom.procurement.priceButton')}
                                                    detail={requestablePrice > 0
                                                        ? t('productionBom.procurement.priceOpenLines', { count: requestablePrice })
                                                        : t('productionBom.procurement.allPriceRequested')}
                                                    tone={requestablePrice > 0 ? 'warn' : 'ok'}
                                                    disabled={requestablePrice === 0 || !canEdit}
                                                    onClick={() => openRequest('PRICE')}
                                                />
                                            )}
                                            {showRevision && (
                                                <NavLinkRow
                                                    icon={<History />}
                                                    label={t('productionBom.revision.history')}
                                                    detail={lastRevision
                                                        ? [
                                                            t('productionBom.revision.label', { revision: lastRevision.revision }),
                                                            lastRevision.approvedAt ? shortDate(lastRevision.approvedAt) : null,
                                                            lastRevision.approvedByName,
                                                        ].filter(Boolean).join(' · ')
                                                        : undefined}
                                                    count={bom.activity ? bom.revision + 1 : bom.revisions.length}
                                                    onClick={() => context.open({ kind: 'revisions', bomId: bom.id })}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {notes}
                                {!isDraft && !revising && !consumed && <p className="ofi-bom-hint">{t('productionBom.detail.priority')}</p>}

                                <section className="ofi-bom-group is-lines">
                                    {/* Titel und Zahl stehen im Reiter — hier nur das schmale Feld und «Şablondan ekle». */}
                                    {editable && (
                                        <div className="ofi-bom-linesbar is-tools">
                                            <div className="ofi-bom-linesbar__tools">
                                                <ProductSearch area={bom.area} onPick={pick} placeholder={t('productionBom.search.short')} />
                                                <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" onClick={() => setInserting(true)}>
                                                    <LayoutTemplate />
                                                    {t('productionBom.insert.button')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {isDraft && !rows.length && editable && <p className="ofi-bom-hint">{t('productionBom.detail.draftHint')}</p>}
                                    <BomLinesTable
                                        plain
                                        rows={rows}
                                        mode={mode}
                                        editable={editable}
                                        emptyText={t(isMain ? 'productionBom.detail.emptyMain' : 'productionBom.detail.empty')}
                                        onQuantity={(key, text) => patchLine(key, { quantityText: text })}
                                        onUnit={(key, unit: BomUnit) => patchLine(key, { unit })}
                                        onNote={(key, note) => patchLine(key, { note })}
                                        onRemove={(key) => change(lines.filter((line) => line.key !== key))}
                                        hideSupplier
                                        numericOnly
                                        footer={editable ? (
                                            <ProductSearch
                                                variant="row"
                                                area={bom.area}
                                                onPick={pick}
                                                placeholder={t('productionBom.detail.addRowPlaceholder')}
                                                trailing={(
                                                    <button
                                                        type="button"
                                                        className="ofi-bom-rowlink ofi-nosize"
                                                        onMouseDown={(event) => event.preventDefault()}
                                                        onClick={() => setInserting(true)}
                                                    >
                                                        <LayoutTemplate />
                                                        {t('productionBom.insert.button')}
                                                    </button>
                                                )}
                                            />
                                        ) : undefined}
                                    />
                                </section>

                                {/* Was die Revision entfernt — mit «Geri al» wieder in die Arbeitskopie. */}
                                {revising && diff && diff.removed.length > 0 && (
                                    <section className="ofi-bom-group ofi-bom-removed">
                                        <h3 className="ofi-bom-group__title">
                                            {t('productionBom.revision.removedTitle')}
                                            <span className="ofi-bom-group__count">{diff.removed.length}</span>
                                        </h3>
                                        <div className="ofi-bom-group__box">
                                            {diff.removed.map((line) => (
                                                <div key={line.id} className="ofi-bom-removed__row">
                                                    <span className="ofi-bom-code">{line.product?.erpCode ?? line.erpCode ?? '—'}</span>
                                                    <span className="ofi-bom-removed__name" title={line.name}>{line.product?.name ?? line.name}</span>
                                                    <span className="ofi-bom-removed__qty"><s>{fmtQty(line.quantity)} {unitLabel(line.unit)}</s></span>
                                                    {line.orders.some((order) => order.kind === 'ORDER') && (
                                                        <span className="ofi-bom-tag">{t('productionBom.revision.removedOrdered')}</span>
                                                    )}
                                                    {editable && (
                                                        <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" onClick={() => change([...lines, draftOf(line)])}>
                                                            <Undo2 />
                                                            {t('productionBom.revision.restore')}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </>
                        )}

                        {/* Was beim Einkauf liegt und was schon ankam — nur der Weg, ohne Lieferant und Preis. */}
                        {tab !== 'lines' && <BomActivityPanel bom={bom} section={tab} canEdit={canEdit} onChanged={context.applyBom} />}
                    </div>
                )}

                {isMain && (
                    <SubBomTree
                        main={bom}
                        subs={subs}
                        max={data.settings.maxPerArea}
                        canAdd={canAddSub}
                        onOpen={(sub) => context.open({ kind: 'bom', bomId: sub.id })}
                        onAdd={() => setAddingSub(true)}
                    />
                )}
            </div>

            <BomUnsavedDialog
                guard={guard}
                text={t('productionBom.detail.unsavedText', { number: bom.bomNumber })}
                onSave={save}
            />
            <InsertTemplateDialog
                open={inserting}
                bom={bom}
                factor={factor}
                onClose={() => setInserting(false)}
                onInsert={insertTemplate}
            />
            {isMain && (
                <AddSubBomDialog
                    open={addingSub}
                    main={bom}
                    codes={data.codes}
                    deviceId={data.device.id}
                    onClose={() => setAddingSub(false)}
                    onCreated={(sub) => {
                        setAddingSub(false);
                        context.applyBom(sub);
                        context.reload();
                        context.open({ kind: 'bom', bomId: sub.id });
                    }}
                />
            )}
            <StartRevisionDialog
                open={ask === 'reviseStart'}
                bom={bom}
                onClose={() => setAsk(null)}
                onStarted={(next) => afterRevision(next)}
            />
            {ask === 'reviseApprove' && (
                <RevisionApproveDialog
                    open
                    bom={bom}
                    mode={isAdmin ? 'approve' : 'submit'}
                    onClose={() => setAsk(null)}
                    onApproved={(next) => afterRevision(next, isAdmin)}
                />
            )}
            {ask === 'reviseReject' && (
                <RevisionRejectDialog open bom={bom} onClose={() => setAsk(null)} onRejected={(next) => afterRevision(next)} />
            )}
            <DiscardRevisionDialog
                open={ask === 'reviseDiscard'}
                bom={bom}
                onClose={() => setAsk(null)}
                onDiscarded={(next) => afterRevision(next)}
            />
            <PopupDialog
                open={ask === 'delete'}
                onClose={() => { if (!busy) setAsk(null); }}
                title={t('productionBom.detail.deleteTitle')}
                subtitle={t('productionBom.detail.deleteText', { number: bom.bomNumber })}
                icon={<Trash2 size={18} />}
                tone="danger"
                width={460}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setAsk(null)} disabled={busy !== null}>{t('productionBom.common.cancel')}</PopupButton>
                        <PopupButton variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>{t('productionBom.common.delete')}</PopupButton>
                    </PopupActions>
                )}
            />
            <PopupDialog
                open={ask === 'consume'}
                onClose={() => { if (!busy) setAsk(null); }}
                title={t('productionBom.detail.consumeTitle')}
                subtitle={t(isMain && subs.length ? 'productionBom.detail.consumeTextMain' : 'productionBom.detail.consumeText', { number: bom.bomNumber })}
                icon={<PackageMinus size={18} />}
                tone="danger"
                width={480}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setAsk(null)} disabled={busy !== null}>{t('productionBom.common.cancel')}</PopupButton>
                        <PopupButton variant="danger" loading={busy === 'consume'} onClick={() => void run('consume', 'productionBom.detail.consumed')}>
                            {t('productionBom.detail.consume')}
                        </PopupButton>
                    </PopupActions>
                )}
            />
        </>
    );
};
