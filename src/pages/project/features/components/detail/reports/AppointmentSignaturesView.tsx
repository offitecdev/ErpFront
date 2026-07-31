import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Bell01 as Bell, Mail01 as Mail, Send01 as Send } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Checkbox } from '@/components/ui-shared/Checkbox';
import { Field, Input } from '@/components/ui-shared/Field';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import {
    deliveryReportApi,
    signatureApi,
    type DeliveryReportDto,
    type SignatureRequestDto,
} from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';

import type { SignatureDispatchTarget } from '../../../projects/types/signatureTypes';
import {
    computeSignatureStatus,
    getSignatureStatusLabel,
    isGeneralSigned,
    requestFor,
} from '../../../projects/utils/signatureRequestUtils';
import {
    buildDeliverySignatureSnapshot,
    buildFieldSignatureSnapshot,
    buildGeneralSignatureSnapshot,
} from '../../../projects/utils/signatureSnapshots';

type TargetRow = {
    key: string;
    label: string;
    date: string;
    signed: boolean;
    request: SignatureRequestDto | null;
    ready: boolean;
    makeTarget: (() => SignatureDispatchTarget) | null;
};

/**
 * Signatures for the documents of one appointment, as a plain gray-bordered
 * table: field report, delivery report and the project's general report, each
 * with its signed/unsigned state. Selecting a sendable row opens the channel
 * checkboxes (notify technician in-app / email the customer) below the table.
 */
export const AppointmentSignaturesView = ({
    project,
    appointment,
    report,
    salesOrderId,
}: {
    project: ProjectDto;
    appointment: any;
    report: any | null;
    salesOrderId: string | null;
}) => {
    const [delivery, setDelivery] = useState<DeliveryReportDto | null>(null);
    const [requests, setRequests] = useState<SignatureRequestDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [notifyTech, setNotifyTech] = useState(true);
    const [emailCustomer, setEmailCustomer] = useState(false);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [deliveryRow, allRequests] = await Promise.all([
                deliveryReportApi.getByAppointment(appointment.id).catch(() => null),
                signatureApi.list().catch(() => [] as SignatureRequestDto[]),
            ]);
            setDelivery(deliveryRow);
            setRequests(allRequests.filter((r) => r.projectId === project.id));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appointment.id, project.id]);

    const fieldReports = useMemo(
        () => ((project as any).reports || []).filter((r: any) => !salesOrderId || (r.salesOrderId || null) === salesOrderId),
        [project, salesOrderId],
    );

    const rows: TargetRow[] = useMemo(() => {
        const list: TargetRow[] = [];
        list.push({
            key: 'field',
            label: t('projects.reportsHub.fieldSection'),
            date: report ? dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY') : '—',
            signed: Boolean(report?.isSigned),
            request: report ? requestFor('FIELD', report.id, requests) : null,
            ready: Boolean(report),
            makeTarget: report ? () => ({
                reportType: 'FIELD',
                reportId: report.id,
                title: `${project.projectName} – ${t('signatures.tabs.field')}`,
                snapshot: buildFieldSignatureSnapshot(project, report),
                alreadySigned: Boolean(report.isSigned),
            }) : null,
        });
        list.push({
            key: 'delivery',
            label: t('projects.reportsHub.deliverySection'),
            date: delivery ? dayjs(delivery.sentAt || delivery.createdAt).format('DD.MM.YYYY') : '—',
            signed: Boolean(delivery?.isSigned),
            request: delivery ? requestFor('DELIVERY', delivery.id, requests) : null,
            ready: Boolean(delivery),
            makeTarget: delivery ? () => ({
                reportType: 'DELIVERY',
                reportId: delivery.id,
                title: `${project.projectName} – ${delivery.checklistName || t('projects.delivery.pdf.title')}`,
                snapshot: buildDeliverySignatureSnapshot(project, delivery),
                alreadySigned: Boolean(delivery.isSigned),
            }) : null,
        });
        const generalSigned = isGeneralSigned(requests);
        list.push({
            key: 'general',
            label: t('projects.reportsHub.generalSection'),
            date: fieldReports.length ? dayjs(fieldReports[0].workDate || fieldReports[0].reportDate).format('DD.MM.YYYY') : '—',
            signed: generalSigned,
            request: requestFor('GENERAL', null, requests),
            ready: fieldReports.length > 0,
            makeTarget: fieldReports.length ? () => ({
                reportType: 'GENERAL',
                reportId: null,
                title: `${project.projectName} – ${t('projects.general.previewTitle')}`,
                snapshot: buildGeneralSignatureSnapshot(project, salesOrderId, fieldReports),
                alreadySigned: generalSigned,
            }) : null,
        });
        return list;
    }, [report, delivery, requests, fieldReports, project, salesOrderId]);

    const selected = rows.find((row) => row.key === selectedKey) || null;

    const selectRow = (row: TargetRow) => {
        if (!row.makeTarget) return;
        setSelectedKey(row.key === selectedKey ? null : row.key);
        setNotifyTech(true);
        setEmailCustomer(Boolean(project.customer?.mainEmail));
        setEmail(project.customer?.mainEmail || '');
    };

    const dispatch = async () => {
        if (!selected?.makeTarget) return;
        const willEmail = emailCustomer && Boolean(email.trim());
        if (!notifyTech && !willEmail) {
            toast.error(t('signatures.chooseChannel'));
            return;
        }
        setBusy(true);
        try {
            const target = selected.makeTarget();
            const res = await signatureApi.create({
                reportType: target.reportType,
                reportId: target.reportId,
                projectId: project.id,
                title: target.title,
                snapshot: target.snapshot,
                customerEmail: email.trim() || null,
                sendEmail: willEmail,
                notifyTechnician: notifyTech,
            });
            const parts: string[] = [];
            if (res.notified) parts.push(t('signatures.notifiedTech'));
            if (res.emailed) parts.push(t('signatures.emailedCustomer'));
            toast.success(parts.length ? parts.join(' · ') : t('signatures.dispatched'));
            setSelectedKey(null);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('signatures.createError'));
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <div className="h-40 animate-pulse rounded-[3px] bg-slate-100" />;

    return (
        <div className="space-y-3">
            <SectionCard title={`${t('projects.reportsHub.signaturesSection')} (${rows.length})`}>
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{t('projects.reportsHub.document')}</th>
                            <th className="w-32 text-left">{t('common.date')}</th>
                            <th className="w-36 text-left">{t('common.status')}</th>
                            <th className="w-44 text-right" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <TableStateRow colSpan={4} loading={false} emptyText={t('projects.reportsHub.noSignatures')} />
                        )}
                        {rows.map((row) => {
                            const status = computeSignatureStatus({ signed: row.signed, request: row.request, ready: row.ready });
                            return (
                                <tr key={row.key} className={selectedKey === row.key ? 'bg-slate-50 dark:bg-white/10' : undefined}>
                                    <td className="font-medium text-slate-800 dark:text-white">{row.label}</td>
                                    <td className="tabular-nums text-slate-500 dark:text-white/60">{row.date}</td>
                                    <td>
                                        <StatusChip variant={row.signed ? 'active' : 'warning'}>
                                            {row.signed ? t('projects.reportsHub.signed') : t('projects.reportsHub.unsigned')}
                                        </StatusChip>
                                    </td>
                                    <td>
                                        <div className="flex items-center justify-end">
                                            {status === 'ready' || status === 'pending' ? (
                                                <Button variant="secondary" size="sm" icon={<Send size={12} />} onClick={() => selectRow(row)}>
                                                    {t('signatures.sendForSignature')}
                                                </Button>
                                            ) : (
                                                <span className="text-[11.5px] text-slate-400 dark:text-white/50">{getSignatureStatusLabel(status)}</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </SectionCard>

            {/* Channel selection for the selected row — the dual send option. */}
            {selected && (
                <div className="space-y-2 rounded-[3px] border border-slate-200 bg-white p-3">
                    <div className="text-[12px] font-semibold text-slate-700">{selected.label} · {t('signatures.dualOption')}</div>
                    <Checkbox
                        label={<span className="inline-flex items-center gap-1.5"><Bell size={13} /> {t('signatures.notifyTechnician')}</span>}
                        hint={t('signatures.notifyTechnicianHint')}
                        size="sm"
                        isSelected={notifyTech}
                        onChange={setNotifyTech}
                    />
                    <Checkbox
                        label={<span className="inline-flex items-center gap-1.5"><Mail size={13} /> {t('signatures.emailCustomerOpt')}</span>}
                        hint={t('signatures.emailCustomerHint')}
                        size="sm"
                        isSelected={emailCustomer}
                        onChange={setEmailCustomer}
                    />
                    {emailCustomer && (
                        <Field label={t('signatures.customerEmail')}>
                            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kunde@example.ch" />
                        </Field>
                    )}
                    <div className="flex items-center justify-end gap-2 pt-1">
                        <Button variant="secondary" size="sm" onClick={() => setSelectedKey(null)}>{t('common.close')}</Button>
                        <Button variant="primary" size="sm" icon={<Send size={13} />} loading={busy} onClick={() => void dispatch()}>{t('signatures.send')}</Button>
                    </div>
                </div>
            )}
        </div>
    );
};
