import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { OrderBillingSection, type BillingLineInput } from '@/components/billing/OrderBillingSection';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { myOrdersApi } from '@/lib/api/billing';
import { lineBilled, lineRemaining, lineTotal, orderBillingLines, sharePercent } from '@/lib/orderBillingTotals';
import type { MyOrderDetailDto, MyOrderDto } from '@/types/billing';

import {
    InvoiceField,
    InvoiceModeSwitch,
    InvoicePageHeader,
    InvoiceStepFoot,
    InvoiceSteps,
    type WizardStep,
} from './components/InvoiceFormBits';
import { PickerField } from './components/PickerField';
import { apiError, round2 } from './invoiceShared';

/**
 * ── RECHNUNG AUS EINEM AUFTRAG (`/sales/invoices/new/order`) ─────────────────
 *
 * Vorgabe Samet: die Erstellung öffnet KEIN Fenster, sondern eine eigene Seite
 * mit Zurück-Knopf. Sie führte anfangs durch VIER Schritte (Kunde · Projekt ·
 * Auftrag · Rechnung); seit dem 24.08.2026 sind die drei Auswahlschritte EIN
 * Schritt — die Seite hat nur noch zwei Stationen, und weil zwei sich nicht
 * zählen lassen müssen, trägt die Leiter keine „1"/„2" mehr, sondern nur die
 * Namen und die Raute dazwischen:
 *
 *   Auswahl     Ein Umschalter sagt zuerst, welchen Weg der Auftrag geht:
 *               PROJEKTAUFTRAG (Voreinstellung) oder LIEFERAUFTRAG. Darunter
 *               stehen Kunde → Projekt → Auftrag in EINER Karte, aber weiter
 *               als Kaskade: jedes Feld öffnet erst, wenn das davor steht
 *               (ohne Projekt wären es sonst alle Aufträge des Mandanten).
 *               Der Lieferweg kennt kein Projekt und zeigt das Feld nicht.
 *   Rechnung    Der gewählte Auftrag mit SEINEN Rechnungen darunter — und
 *               fakturiert wird direkt hier: es ist dieselbe Fläche
 *               (`OrderBillingSection`) wie im Projekt und im Auftrag,
 *               samt Zahlungsplan, Rechnungsliste, Vorschau und Storno.
 *
 * Die Rechnung selbst entsteht deshalb NICHT in dieser Datei: sie entsteht
 * dort, wo sie auch sonst entsteht. Diese Seite ist der Weg dorthin.
 */

/** Welchen Weg der Auftrag geht — das ist zugleich der Rechnungstyp der Liste. */
type OrderMode = 'PROJECT' | 'DELIVERY';

/** Ein wählbarer Auftrag mit seinen Zahlen. */
type OrderOption = {
    id: string;
    orderNumber: string;
    customerId: string | null;
    customerName: string;
    projectId: string | null;
    projectLabel: string;
    total: number;
    billed: number;
    remainingAmount: number;
    billedPercent: number;
    fullyBilled: boolean;
    /** Projektweg oder Lieferweg — der Umschalter filtert danach. */
    isProject: boolean;
};

/**
 * Projekt- oder Lieferauftrag? Dieselbe Frage, die der Server an der fertigen
 * Rechnung stellt (`deriveInvoiceCategory`): ein Projekt am Beleg macht ihn zum
 * Projektauftrag, sonst ist es ein Lieferauftrag.
 */
const isProjectOrder = (order: MyOrderDto): boolean =>
    Boolean(order.projectId || order.project) || String(order.orderType || '').startsWith('PROJECT');

export const InvoiceFromOrderPage = () => {
    const navigate = useNavigate();

    const [orders, setOrders] = useState<MyOrderDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [step, setStep] = useState(0);

    // Projektauftrag ist die Voreinstellung (Vorgabe Samet).
    const [mode, setMode] = useState<OrderMode>('PROJECT');
    const [customerId, setCustomerId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [orderId, setOrderId] = useState('');

    /** Der gewählte Auftrag in voller Tiefe — er speist die Abrechnungsfläche. */
    const [detail, setDetail] = useState<MyOrderDetailDto | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);


    const loadOrders = useCallback(async () => {
        try {
            const list = await myOrdersApi.list();
            setOrders(list);
        } catch (e) {
            toast.error(apiError(e, t('crm.orders_yuklenemedi')));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadOrders(); }, [loadOrders]);

    /* HAUPTaufträge sind die wählbaren Ziele; die Zusatzaufträge kommen mit dem
       gewählten Auftrag von selbst mit (die Abrechnungsfläche zeigt sie unter
       ihm, wie im Auftrag selbst). */
    const options = useMemo<OrderOption[]>(() => orders.map((order) => {
        const [main] = orderBillingLines(order);
        const total = main ? lineTotal(main) : Number(order.totalAmount || 0);
        const billed = main ? lineBilled(main) : 0;
        const billedPercent = round2(Number(main?.summary?.billedPercent ?? sharePercent(billed, total)));
        return {
            id: order.id,
            orderNumber: order.orderNumber,
            customerId: order.customer?.id ?? null,
            customerName: order.customer?.companyName || '',
            projectId: order.project?.id ?? order.projectId ?? null,
            projectLabel: order.project?.projectNumber || order.project?.projectName || '',
            total,
            billed,
            remainingAmount: main ? lineRemaining(main) : total,
            billedPercent,
            fullyBilled: billedPercent >= 100 - 0.005,
            isProject: isProjectOrder(order),
        };
    }).filter((option) => (mode === 'PROJECT' ? option.isProject : !option.isProject)),
    [orders, mode]);

    /** Kunden, die auf diesem Weg überhaupt einen Auftrag haben. */
    const customers = useMemo(() => {
        const seen = new Map<string, string>();
        for (const option of options) {
            if (option.customerId && !seen.has(option.customerId)) seen.set(option.customerId, option.customerName);
        }
        return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [options]);

    /** Projekte DIESES Kunden — vorher gibt es nichts zu wählen. */
    const projects = useMemo(() => {
        if (!customerId) return [];
        const seen = new Map<string, string>();
        for (const option of options) {
            if (option.customerId !== customerId || !option.projectId) continue;
            if (!seen.has(option.projectId)) seen.set(option.projectId, option.projectLabel || option.projectId);
        }
        return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [options, customerId]);

    /* Aufträge erscheinen ERST, wenn das Projekt steht (Vorgabe Samet) — im
       Lieferweg gibt es kein Projekt, dort genügt der Kunde. */
    const orderOptions = useMemo(() => {
        if (!customerId) return [];
        if (mode === 'PROJECT' && !projectId) return [];
        return options.filter((option) => option.customerId === customerId
            && (mode === 'DELIVERY' || option.projectId === projectId));
    }, [options, customerId, projectId, mode]);

    const loadDetail = useCallback(async (id: string) => {
        setDetailLoading(true);
        try {
            setDetail(await myOrdersApi.getById(id));
        } catch (e) {
            toast.error(apiError(e, t('crm.orders_yuklenemedi')));
            setDetail(null);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    // Der gewählte Auftrag wird in voller Tiefe nachgeladen: die
    // Abrechnungsfläche braucht Offerte, Zusatzaufträge und Ratenplan.
    useEffect(() => {
        if (!orderId) { setDetail(null); return; }
        void loadDetail(orderId);
    }, [orderId, loadDetail]);

    /** Nach dem Fakturieren: Auftrag UND Liste neu lesen. */
    const refresh = useCallback(async () => {
        if (orderId) await loadDetail(orderId);
        await loadOrders();
    }, [orderId, loadDetail, loadOrders]);

    const changeMode = (next: OrderMode) => {
        setMode(next);
        setCustomerId('');
        setProjectId('');
        setOrderId('');
        setStep(0);
    };

    /* Der Ratenplan und die Rechnungen kommen aus DEMSELBEN Bauteil wie im
       Projekt und im Auftrag — die Zeilen werden genauso gebaut wie dort
       (siehe `MyOrderDetail`), damit sich die drei Flächen nicht auseinander
       entwickeln können. */
    const billingLines: BillingLineInput[] = useMemo(() => {
        if (!detail) return [];
        const salespersonName = detail.tender?.salespersonName
            || [detail.tender?.createdBy?.firstName, detail.tender?.createdBy?.lastName].filter(Boolean).join(' ')
            || null;
        const addons = detail.addonSalesOrders || [];
        return [
            {
                id: detail.id,
                orderNumber: detail.orderNumber,
                isAddon: false,
                date: detail.createdAt,
                totalAmount: Number(detail.totalAmount) || 0,
                summary: detail.billingSummary ?? null,
                paymentStagesRaw: detail.paymentStages ?? null,
                context: {
                    orderNumber: detail.orderNumber,
                    tenderId: detail.tender?.id ?? null,
                    customerName: detail.customer?.companyName ?? null,
                    billingAddress: detail.tender?.billingAddress ?? null,
                    commissionNumber: detail.tender?.commissionNumber ?? null,
                    salespersonName,
                },
            },
            ...addons.map((addon) => ({
                id: addon.id,
                orderNumber: addon.orderNumber,
                isAddon: true,
                revisionNumber: addon.revisionNumber ?? null,
                date: addon.orderDate || addon.createdAt,
                totalAmount: Number(addon.totalAmount) || 0,
                summary: addon.billingSummary ?? null,
                paymentStagesRaw: addon.paymentStages ?? null,
                context: {
                    orderNumber: addon.orderNumber,
                    customerName: detail.customer?.companyName ?? null,
                    billingAddress: detail.tender?.billingAddress ?? null,
                    commissionNumber: detail.tender?.commissionNumber ?? null,
                    salespersonName,
                },
            })),
        ];
    }, [detail]);

    /* ZWEI Stationen: die Auswahl und die Rechnung. Der Hinweis nennt, was in
       der Auswahl steht — im Lieferweg ohne das Projekt, das es dort nicht
       gibt. */
    const STEPS: WizardStep[] = [
        {
            key: 'pick',
            label: t('invoices.stepPickAll'),
            hint: mode === 'PROJECT' ? t('invoices.stepHintPickProject') : t('invoices.stepHintPickDirect'),
        },
        { key: 'billing', label: t('invoices.stepBilling'), hint: t('invoices.stepHintBilling') },
    ];
    const stepKey = STEPS[step]?.key ?? 'pick';
    /* Die Auswahl ist erst erledigt, wenn der Auftrag steht — Kunde und Projekt
       sind die Wege dorthin und stehen dann ohnehin. */
    const done: Record<string, boolean> = {
        pick: Boolean(orderId),
        billing: true,
    };
    // Erreichbar ist der erste Schritt, dessen Vorgänger alle erledigt sind.
    const furthest = STEPS.reduce((reached, _step, index) => (
        index === 0 || STEPS.slice(0, index).every((prev) => done[prev.key]) ? index : reached
    ), 0);

    return (
        <div className="ofi-invp-page">
            <InvoicePageHeader title={t('invoices.fromOrderTitle')} />

            {/* Die Wegwahl steht ÜBER dem Zähler und nicht im ersten Schritt:
                sie entscheidet die ganze Kaskade, und in der Karte hätte sie
                den ersten Schritt tiefer gesetzt als die beiden anderen
                (Vorgabe Samet: dieselbe Stelle auf jedem Schritt). EIN Ort für
                beide Wege, die Marke gleitet, die Fläche ist Glas. */}
            <div className="ofi-invp-switchrow is-bare">
                <InvoiceModeSwitch
                    value={mode}
                    onChange={changeMode}
                    options={[
                        { key: 'PROJECT', label: t('invoices.projectOrderField') },
                        { key: 'DELIVERY', label: t('invoices.deliveryOrderField') },
                    ]}
                />
                <p className="ofi-invp-switchrow__hint">{t('invoices.modeHint')}</p>
            </div>

            <InvoiceSteps steps={STEPS} current={step} furthest={furthest} onGo={setStep} numbered={false} />

            {stepKey === 'pick' && (
                <SectionCard title={t('invoices.stepPickAll')}>
                    {/* EINE Karte, drei Felder — aber weiter als Kaskade: das
                        nächste Feld bleibt geschlossen, solange das davor leer
                        ist, sonst stünde dort die Auftragsliste des ganzen
                        Mandanten. Eine spätere Änderung räumt darum auch alles
                        auf, was von ihr abhängt. */}
                    <div className="ofi-invp-grid">
                        <InvoiceField label={t('invoices.customerField')} hint={t('invoices.stepHintCustomer')}>
                            <PickerField
                                value={customerId}
                                options={customers.map(([id, name]) => ({ id, label: name }))}
                                disabled={loading}
                                placeholder={t('invoices.pickerPlaceholder')}
                                emptyText={t('invoices.noCustomers')}
                                onSelect={(id) => {
                                    setCustomerId(id);
                                    setProjectId('');
                                    setOrderId('');
                                }}
                            />
                        </InvoiceField>

                        {mode === 'PROJECT' && (
                            <InvoiceField label={t('invoices.projectField')} hint={t('invoices.stepHintProject')}>
                                <PickerField
                                    value={projectId}
                                    options={projects.map(([id, label]) => ({ id, label }))}
                                    disabled={!customerId}
                                    placeholder={t('invoices.pickerPlaceholder')}
                                    emptyText={t('invoices.noProjects')}
                                    onSelect={(id) => {
                                        setProjectId(id);
                                        setOrderId('');
                                    }}
                                />
                            </InvoiceField>
                        )}

                        <InvoiceField
                            label={t('invoices.stepOrder')}
                            hint={mode === 'PROJECT' ? t('invoices.stepHintOrderPick') : t('invoices.stepHintOrderDirect')}
                        >
                            <PickerField
                                value={orderId}
                                options={orderOptions.map((option) => ({ id: option.id, label: option.orderNumber }))}
                                disabled={mode === 'PROJECT' ? !projectId : !customerId}
                                placeholder={t('invoices.pickerPlaceholder')}
                                emptyText={t('invoices.noOrders')}
                                onSelect={setOrderId}
                            />
                        </InvoiceField>
                    </div>
                    {loading && <div className="ofi-invp-note"><LoadingDots /></div>}

                    <InvoiceStepFoot
                        stepIndex={step}
                        stepCount={STEPS.length}
                        onBack={() => navigate('/sales/invoices')}
                        onNext={() => setStep(step + 1)}
                        nextDisabled={!orderId}
                        finalLabel={t('invoices.stepNext')}
                        onFinal={() => setStep(step + 1)}
                    />
                </SectionCard>
            )}

            {stepKey === 'billing' && (
                <>
                    {/* Genau die Fläche des Projekts und des Auftrags: Zeile mit
                        Total/Fakturiert/Offen, Eingabestreifen zum Fakturieren,
                        Rechnungsfenster und Zahlungsplan. */}
                    {detailLoading && <SectionCard title={t('invoices.stepBilling')}><div className="ofi-invp-note"><LoadingDots /></div></SectionCard>}
                    {!detailLoading && billingLines.length > 0 && (
                        <>
                            <p className="ofi-invp-lead">{t('invoices.billingHere')}</p>
                            <OrderBillingSection
                                lines={billingLines}
                                onReload={refresh}
                                activeOrderId={detail?.id}
                                onOpenOrder={(id) => navigate(`/sales/orders/${id}?tab=billing`)}
                            />
                        </>
                    )}
                    {/* Nur die Leiste, ohne Karte darum: ihr Titel wuerde bloss
                        wiederholen, was die Schrittleiste schon sagt. */}
                    <div className="ofi-invp-footbar">
                        <InvoiceStepFoot
                            stepIndex={step}
                            stepCount={STEPS.length}
                            onBack={() => setStep(step - 1)}
                            onNext={() => undefined}
                            finalLabel={t('invoices.backToList')}
                            onFinal={() => navigate('/sales/invoices')}
                        />
                    </div>
                </>
            )}
        </div>
    );
};
