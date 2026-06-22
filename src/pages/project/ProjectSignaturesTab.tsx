import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Send01 as Send, Bell01 as Bell, Mail01 as Mail } from '@/components/icons/antIconCompat';

import { Button } from '../../components/ui-shared/Button';
import { Field, Input } from '../../components/ui-shared/Field';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { SnapshotView } from '../../components/ui-shared/SnapshotView';
import {
    deliveryReportApi, signatureApi,
    type DeliveryReportDto, type SignatureReportType, type SignatureRequestDto, type SignatureSnapshot,
} from '../../lib/api/project';
import type { ProjectDto } from '../../types/project';

import { t } from '@/i18n/translate';

type Order = { id: string } | null;

const gatherImages = (project: ProjectDto, salesOrderId: string | null): string[] =>
    ((project as any).reports || [])
        .filter((r: any) => !salesOrderId || (r.salesOrderId || null) === salesOrderId)
        .flatMap((r: any) => (Array.isArray(r.images) ? r.images : []))
        .map((img: any) => img?.imageData)
        .filter(Boolean);

type ActiveTarget = {
    reportType: SignatureReportType;
    reportId: string | null;
    title: string;
    snapshot: SignatureSnapshot;
    alreadySigned: boolean;
};

type SignTab = 'field' | 'delivery' | 'general';

export const ProjectSignaturesTab = ({ project, order }: { project: ProjectDto; order: Order; isPrimary?: boolean }) => {
    const salesOrderId = order?.id || null;
    const [deliveries, setDeliveries] = useState<DeliveryReportDto[]>([]);
    const [requests, setRequests] = useState<SignatureRequestDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<SignTab>('field');
    const [active, setActive] = useState<ActiveTarget | null>(null);
    const [notifyTech, setNotifyTech] = useState(true);
    const [emailCustomer, setEmailCustomer] = useState(false);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);

    const fieldReports = useMemo(
        () => ((project as any).reports || []).filter((r: any) => !salesOrderId || (r.salesOrderId || null) === salesOrderId),
        [project, salesOrderId],
    );

    // Find the most relevant dispatched signature request for a given report.
    // A SIGNED request wins; otherwise we keep the first match so the row can
    // reflect its pending/submitted state without ever exposing a link.
    const requestFor = (reportType: SignatureReportType, reportId: string | null): SignatureRequestDto | null => {
        const matches = requests.filter(
            (r) => r.reportType === reportType && (r.reportId || null) === (reportId || null),
        );
        return matches.find((r) => r.status === 'SIGNED') || matches[0] || null;
    };

    // The general report has no persisted row of its own; its signed state is
    // derived from whether a GENERAL signature request for this project is signed.
    const generalSigned = useMemo(
        () => requests.some((r) => r.reportType === 'GENERAL' && r.status === 'SIGNED'),
        [requests],
    );

    const load = async () => {
        setLoading(true);
        try {
            const [del, reqs] = await Promise.all([
                deliveryReportApi.list({ projectId: project.id }).catch(() => [] as DeliveryReportDto[]),
                signatureApi.list().catch(() => [] as SignatureRequestDto[]),
            ]);
            setDeliveries(del);
            setRequests(reqs.filter((r) => r.projectId === project.id));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id, salesOrderId]);

    // ── snapshot builders ───────────────────────────────────────────────────
    const fieldSnapshot = (r: any): SignatureSnapshot => ({
        title: t('signatures.tabs.field'),
        customerName: project.customer?.companyName,
        projectName: project.projectName,
        meta: [{ label: t('signatures.field.workDate'), value: dayjs(r.workDate || r.reportDate).format('DD.MM.YYYY') }],
        notes: r.operationsDone || undefined,
        images: Array.isArray(r.images) ? r.images.map((i: any) => i.imageData).filter(Boolean) : [],
    });
    const deliverySnapshot = (d: DeliveryReportDto): SignatureSnapshot => {
        const cats: string[] = [];
        for (const x of d.responses || []) { const k = x.category?.trim() || t('projects.delivery.uncategorized'); if (!cats.includes(k)) cats.push(k); }
        return {
            title: d.checklistName || t('projects.delivery.pdf.title'),
            customerName: project.customer?.companyName,
            projectName: project.projectName,
            sections: cats.map((c) => ({ heading: c, rows: (d.responses || []).filter((x) => (x.category?.trim() || t('projects.delivery.uncategorized')) === c).map((x) => ({ label: x.label, status: x.status, value: x.measurement || undefined })) })),
            notes: d.notes || undefined,
            images: gatherImages(project, d.salesOrderId),
        };
    };
    const generalSnapshot = (): SignatureSnapshot => ({
        title: t('projects.general.previewTitle'),
        customerName: project.customer?.companyName,
        projectName: project.projectName,
        sections: fieldReports.map((r: any) => ({ heading: dayjs(r.workDate || r.reportDate).format('DD.MM.YYYY'), rows: [{ label: r.operationsDone || '—' }] })),
        images: gatherImages(project, salesOrderId),
    });

    const openTarget = (target: ActiveTarget) => {
        setActive(target);
        setNotifyTech(true);
        setEmailCustomer(Boolean(project.customer?.mainEmail));
        setEmail(project.customer?.mainEmail || '');
    };

    const dispatch = async () => {
        if (!active) return;
        const willEmail = emailCustomer && Boolean(email.trim());
        if (!notifyTech && !willEmail) return toast.error(t('signatures.chooseChannel'));
        setBusy(true);
        try {
            const res = await signatureApi.create({
                reportType: active.reportType, reportId: active.reportId, projectId: project.id, title: active.title, snapshot: active.snapshot,
                customerEmail: email.trim() || null, sendEmail: willEmail, notifyTechnician: notifyTech,
            });
            const parts: string[] = [];
            if (res.notified) parts.push(t('signatures.notifiedTech'));
            if (res.emailed) parts.push(t('signatures.emailedCustomer'));
            toast.success(parts.length ? parts.join(' · ') : t('signatures.dispatched'));
            setActive(null);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('signatures.createError'));
        } finally {
            setBusy(false);
        }
    };

    // Status / action cell shared by every table row. A report that has been
    // signed — or for which a signature request has already been dispatched —
    // shows a status chip and never a link.
    const renderStatus = (signed: boolean, request: SignatureRequestDto | null, onGet: () => void) => {
        const isSigned = signed || request?.status === 'SIGNED';
        if (isSigned) return <StatusChip variant="active">{t('signatures.statusSigned')}</StatusChip>;
        if (request) {
            return request.status === 'SUBMITTED'
                ? <StatusChip variant="info">{t('signatures.statusSubmitted')}</StatusChip>
                : <StatusChip variant="warning">{t('signatures.statusPending')}</StatusChip>;
        }
        return <Button variant="secondary" size="sm" icon={<Send size={12} />} onClick={onGet}>{t('signatures.sendForSignature')}</Button>;
    };

    const tabs: Array<{ key: SignTab; label: string; count: number }> = [
        { key: 'field', label: t('signatures.tabs.field'), count: fieldReports.length },
        { key: 'delivery', label: t('signatures.tabs.delivery'), count: deliveries.length },
        { key: 'general', label: t('signatures.tabs.general'), count: 1 },
    ];

    if (loading) return <div className="h-48 animate-pulse rounded-lg bg-slate-100" />;

    const thClass = 'px-3 py-2 text-left font-semibold';
    const emptyRow = (cols: number, label: string) => (
        <tr><td colSpan={cols} className="px-3 py-6 text-center text-[12px] text-slate-400">{label}</td></tr>
    );

    return (
        <div className="space-y-4">
            <p className="text-[12.5px] text-slate-500">{t('signatures.projectDispatchHint')}</p>

            {/* Sub-tab switcher */}
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-white/15 dark:bg-white/5">
                {tabs.map((it) => (
                    <button
                        key={it.key}
                        type="button"
                        onClick={() => setTab(it.key)}
                        className={`rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                            tab === it.key
                                ? 'bg-[#272f67] text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-950 dark:text-white dark:hover:text-white'
                        }`}
                    >
                        {it.label}
                        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === it.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{it.count}</span>
                    </button>
                ))}
            </div>

            {/* Field reports table */}
            {tab === 'field' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-[12.5px]">
                        <thead className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className={thClass}>{t('signatures.field.workDate')}</th>
                                <th className={thClass}>{t('auto.yapilan_islemler')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {fieldReports.length === 0 && emptyRow(3, t('signatures.noneField'))}
                            {fieldReports.map((r: any) => {
                                const req = requestFor('FIELD', r.id);
                                return (
                                    <tr key={r.id} className="hover:bg-slate-50/60">
                                        <td className="px-3 py-2.5 font-medium text-slate-800">{dayjs(r.workDate || r.reportDate).format('DD.MM.YYYY')}</td>
                                        <td className="px-3 py-2.5 text-slate-500">{r.operationsDone ? <span className="line-clamp-1">{r.operationsDone}</span> : '—'}</td>
                                        <td className="px-3 py-2.5 text-right">
                                            {renderStatus(Boolean(r.isSigned), req,
                                                () => openTarget({ reportType: 'FIELD', reportId: r.id, title: `${project.projectName} – ${t('signatures.tabs.field')}`, snapshot: fieldSnapshot(r), alreadySigned: Boolean(r.isSigned) }))}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Delivery (Teslim) reports table */}
            {tab === 'delivery' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-[12.5px]">
                        <thead className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className={thClass}>{t('projects.delivery.pdf.title')}</th>
                                <th className={thClass}>{t('common.date')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {deliveries.length === 0 && emptyRow(3, t('signatures.noneDelivery'))}
                            {deliveries.map((d) => {
                                const req = requestFor('DELIVERY', d.id);
                                return (
                                    <tr key={d.id} className="hover:bg-slate-50/60">
                                        <td className="px-3 py-2.5 font-medium text-slate-800">{d.checklistName || t('projects.delivery.pdf.title')}</td>
                                        <td className="px-3 py-2.5 text-slate-500">{dayjs(d.sentAt || d.createdAt).format('DD.MM.YYYY HH:mm')}</td>
                                        <td className="px-3 py-2.5 text-right">
                                            {renderStatus(Boolean(d.isSigned), req,
                                                () => openTarget({ reportType: 'DELIVERY', reportId: d.id, title: `${project.projectName} – ${d.checklistName || t('projects.delivery.pdf.title')}`, snapshot: deliverySnapshot(d), alreadySigned: Boolean(d.isSigned) }))}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* General report table */}
            {tab === 'general' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-[12.5px]">
                        <thead className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className={thClass}>{t('projects.general.previewTitle')}</th>
                                <th className={thClass}>{t('signatures.general.allFieldReports', { count: fieldReports.length })}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <tr className="hover:bg-slate-50/60">
                                <td className="px-3 py-2.5 font-medium text-slate-800">{t('projects.general.previewTitle')}</td>
                                <td className="px-3 py-2.5 text-slate-500">{t('signatures.general.allFieldReports', { count: fieldReports.length })}</td>
                                <td className="px-3 py-2.5 text-right">
                                    {renderStatus(generalSigned, requestFor('GENERAL', null),
                                        () => openTarget({ reportType: 'GENERAL', reportId: null, title: `${project.projectName} – ${t('projects.general.previewTitle')}`, snapshot: generalSnapshot(), alreadySigned: generalSigned }))}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {/* Dispatch modal: preview + dual option (notify technician / email customer) */}
            <Modal
                open={Boolean(active)}
                title={t('signatures.sendForSignature')}
                description={active?.title || ''}
                onClose={() => setActive(null)}
                width="xl"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setActive(null)}>{t('common.close')}</Button>
                        <Button variant="primary" icon={<Send size={13} />} loading={busy} onClick={dispatch}>{t('signatures.send')}</Button>
                    </>
                }
            >
                {active && (
                    <div className="max-h-[64vh] space-y-4 overflow-y-auto pr-1">
                        {active.alreadySigned && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('signatures.alreadySignedNote')}</div>
                        )}
                        <SnapshotView snapshot={active.snapshot} />

                        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                            <div className="text-[12px] font-semibold text-slate-700">{t('signatures.dualOption')}</div>
                            <Checkbox label={<span className="inline-flex items-center gap-1.5"><Bell size={13} /> {t('signatures.notifyTechnician')}</span>} hint={t('signatures.notifyTechnicianHint')} size="sm" isSelected={notifyTech} onChange={setNotifyTech} className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset" />
                            <Checkbox label={<span className="inline-flex items-center gap-1.5"><Mail size={13} /> {t('signatures.emailCustomerOpt')}</span>} hint={t('signatures.emailCustomerHint')} size="sm" isSelected={emailCustomer} onChange={setEmailCustomer} className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset" />
                            {emailCustomer && (
                                <Field label={t('signatures.customerEmail')}>
                                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kunde@example.ch" />
                                </Field>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ProjectSignaturesTab;
