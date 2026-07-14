import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    ChevronRight,
    Plus,
    Briefcase01 as BriefcaseBusiness,
    File05 as FileSpreadsheet,
    CurrencyDollar as DollarSign,
    CheckCircle,
    X as XIcon,
    Save01 as Save,
} from '@/components/icons/antIconCompat';

import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Textarea, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { BillingButton } from '../../components/billing/BillingButton';
import { t as i18nT } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import { customerApi, type CustomerOrderDto } from '../../lib/api/customer';
import { billingApi } from '../../lib/api/billing';
import type { InvoiceDto, InvoiceStatus } from '../../types/billing';

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '—';

const orderStatusVariant = (status: string): any => {
    switch (status) {
        case 'ORDERED': return 'order';
        case 'COMPLETED': return 'approved';
        case 'CANCELLED': return 'passive';
        default: return 'info';
    }
};

const invoiceStatusVariant = (status: InvoiceStatus): any => {
    switch (status) {
        case 'PAID': return 'approved';
        case 'CANCELLED': return 'passive';
        default: return 'warning'; // ISSUED
    }
};

const invoiceStatusLabel = (status: InvoiceStatus): string => i18nT(`crm.invoiceStatus_${status}`);

/* ----------------------------- Orders (Aufträge) ----------------------------- */
export const OrdersTab: React.FC<{ customerId: string }> = ({ customerId }) => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<CustomerOrderDto[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        return customerApi.listOrders(customerId)
            .then(setOrders)
            .catch(() => toast.error(i18nT('crm.ordersLoadError')))
            .finally(() => setLoading(false));
    }, [customerId]);

    useEffect(() => { void load(); }, [load]);

    return (
        <Card title={i18nT('crm.tab_orders')} icon={<BriefcaseBusiness size={13} />} noPadding>
            {loading ? (
                <div className="p-6 text-center text-[12px] text-slate-400">{i18nT('common.loading')}</div>
            ) : orders.length === 0 ? (
                <EmptyState icon={<BriefcaseBusiness size={28} />} title={i18nT('crm.ordersEmpty')} />
            ) : (
                <div className="divide-y divide-slate-100">
                    {orders.map((o) => (
                        <div
                            key={o.id}
                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80"
                        >
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-emerald-50 text-emerald-700">
                                <BriefcaseBusiness size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[13px] font-semibold text-slate-900">{localizeTenderNumbersInText(o.orderNumber)}</span>
                                    <StatusChip variant={orderStatusVariant(o.status)}>{o.status}</StatusChip>
                                    {o.parentSalesOrderId && <span className="font-mono text-[10.5px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">{i18nT('crm.orderAddon')}</span>}
                                </div>
                                <div className="mt-0.5 text-[11.5px] text-slate-500">
                                    {o.project?.projectName ? `${localizeTenderNumbersInText(o.project.projectName)} · ` : ''}
                                    {dayjs(o.createdAt).format('DD.MM.YYYY')}
                                </div>
                            </div>
                            {/* Right column — fixed widths so amount + action buttons line up
                                identically on every row, addon orders included */}
                            <div className="flex flex-shrink-0 items-center gap-2">
                                <span className="w-32 whitespace-nowrap text-right font-mono font-semibold text-slate-900 text-[13px]">{fmtMoney(o.totalAmount)}</span>
                                <BillingButton
                                    target={{
                                        type: 'order',
                                        id: o.id,
                                        label: o.parentSalesOrderId
                                            ? i18nT('crm.additional_order_label', { number: localizeTenderNumbersInText(o.orderNumber) })
                                            : i18nT('crm.order_label', { number: localizeTenderNumbersInText(o.orderNumber) }),
                                    }}
                                    onBilled={() => void load()}
                                    size="sm"
                                    variant="secondary"
                                />
                                {/* Detail only for the main order; addons reserve the same
                                    slot width (empty) so every row stays aligned */}
                                <div className="w-24 flex-shrink-0">
                                    {!o.parentSalesOrderId && (
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            icon={<ChevronRight size={12} />}
                                            className="w-full"
                                            onClick={() => navigate(`/crm/my-orders/${o.id}`)}
                                        >
                                            {i18nT('common.detail')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};

/* ----------------------------- Billing (Rechnungen) ----------------------------- */
export const BillingTab: React.FC<{ customerId: string }> = ({ customerId }) => {
    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [orders, setOrders] = useState<CustomerOrderDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ salesOrderId: '', billingType: 'FULL', percent: '60', notes: '' });
    const [saving, setSaving] = useState(false);

    const load = () => {
        setLoading(true);
        return Promise.all([
            billingApi.listInvoices({ customerId }),
            customerApi.listOrders(customerId),
        ])
            .then(([inv, ord]) => { setInvoices(inv); setOrders(ord); })
            .catch(() => toast.error(i18nT('crm.billingLoadError')))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [customerId]);

    const openCreate = () => {
        setForm({ salesOrderId: orders[0]?.id ?? '', billingType: 'FULL', percent: '60', notes: '' });
        setShowCreate(true);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.salesOrderId) return toast.error(i18nT('crm.invoiceSelectOrder'));
        try {
            setSaving(true);
            await billingApi.createInvoice({
                salesOrderId: form.salesOrderId,
                billingType: form.billingType as 'FULL' | 'PARTIAL',
                percent: form.billingType === 'PARTIAL' ? Number(form.percent) : null,
                notes: form.notes || null,
            });
            toast.success(i18nT('crm.invoiceCreated'));
            setShowCreate(false);
            await load();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || i18nT('crm.invoiceCreateError'));
        } finally {
            setSaving(false);
        }
    };

    const changeStatus = async (id: string, status: InvoiceStatus) => {
        try {
            setUpdatingId(id);
            await billingApi.updateStatus(id, status);
            toast.success(i18nT('crm.invoiceStatusUpdated'));
            await load();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || i18nT('common.error'));
        } finally {
            setUpdatingId(null);
        }
    };

    const totalBilled = invoices.filter(i => i.status !== 'CANCELLED').reduce((s, i) => s + (i.amount ?? 0), 0);

    return (
        <Card
            title={i18nT('crm.tab_billing')}
            icon={<DollarSign size={13} />}
            actions={
                <Button variant="primary" size="sm" icon={<Plus size={11} />} onClick={openCreate} disabled={loading || orders.length === 0}>
                    {i18nT('crm.createInvoice')}
                </Button>
            }
        >
            {loading ? (
                <div className="py-6 text-center text-[12px] text-slate-400">{i18nT('common.loading')}</div>
            ) : (
                <>
                    {orders.length === 0 && (
                        <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-700">
                            {i18nT('crm.invoiceNoOrders')}
                        </div>
                    )}
                    {invoices.length === 0 ? (
                        <EmptyState icon={<FileSpreadsheet size={28} />} title={i18nT('crm.billingEmpty')} />
                    ) : (
                        <>
                            <div className="mb-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{i18nT('crm.billingTotal')}</span>
                                <span className="font-mono text-[14px] font-semibold text-slate-800">{fmtMoney(totalBilled)}</span>
                            </div>
                            <div className="space-y-2">
                                {invoices.map((inv) => (
                                    <div key={inv.id} className="border border-slate-200 rounded-md p-3 bg-white">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-slate-900 text-[13px] font-mono">{inv.invoiceNumber}</span>
                                            <StatusChip variant={invoiceStatusVariant(inv.status)}>{invoiceStatusLabel(inv.status)}</StatusChip>
                                            {inv.billingType === 'PARTIAL' && (
                                                <span className="font-mono text-[10.5px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">%{inv.billedPercent}</span>
                                            )}
                                            <span className="ml-auto font-mono font-semibold text-slate-900 text-[13px]">{fmtMoney(inv.amount)}</span>
                                        </div>
                                        <div className="mt-1 text-[11.5px] text-slate-500">
                                            {inv.salesOrder?.orderNumber ? `${localizeTenderNumbersInText(inv.salesOrder.orderNumber)} · ` : ''}
                                            {dayjs(inv.createdAt).format('DD.MM.YYYY')}
                                        </div>
                                        {inv.notes && <p className="mt-1 text-[12px] text-slate-600 whitespace-pre-wrap">{inv.notes}</p>}
                                        {inv.status === 'ISSUED' && (
                                            <div className="mt-2 flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                                                <Button variant="secondary" size="sm" disabled={updatingId === inv.id} onClick={() => changeStatus(inv.id, 'CANCELLED')}>
                                                    {i18nT('crm.invoiceCancel')}
                                                </Button>
                                                <Button variant="primary" size="sm" icon={<CheckCircle size={12} />} loading={updatingId === inv.id} onClick={() => changeStatus(inv.id, 'PAID')}>
                                                    {i18nT('crm.invoiceMarkPaid')}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </>
            )}

            <Modal
                open={showCreate}
                title={i18nT('crm.createInvoice')}
                onClose={() => !saving && setShowCreate(false)}
                width="md"
                footer={
                    <>
                        <Button variant="secondary" type="button" icon={<XIcon size={13} />} onClick={() => setShowCreate(false)} disabled={saving}>{i18nT('common.cancel')}</Button>
                        <Button variant="primary" type="submit" form="create-invoice-form" loading={saving} icon={<Save size={13} />}>{i18nT('crm.createInvoice')}</Button>
                    </>
                }
            >
                <form id="create-invoice-form" onSubmit={handleCreate} className="space-y-3">
                    <Field label={i18nT('crm.invoiceOrder')} required>
                        <Select value={form.salesOrderId} onChange={(e) => setForm({ ...form, salesOrderId: e.target.value })}>
                            <option value="">{i18nT('common.select')}</option>
                            {orders.map((o) => (
                                <option key={o.id} value={o.id}>{localizeTenderNumbersInText(o.orderNumber)} — {fmtMoney(o.totalAmount)}</option>
                            ))}
                        </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={i18nT('crm.invoiceBillingType')}>
                            <Select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })}>
                                <option value="FULL">{i18nT('crm.invoiceFull')}</option>
                                <option value="PARTIAL">{i18nT('crm.invoicePartial')}</option>
                            </Select>
                        </Field>
                        {form.billingType === 'PARTIAL' && (
                            <Field label={i18nT('crm.invoicePercent')}>
                                <Input type="number" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
                            </Field>
                        )}
                    </div>
                    <Field label={i18nT('crm.note_content')}>
                        <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </Field>
                </form>
            </Modal>
        </Card>
    );
};
