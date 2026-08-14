import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Send01 as Send } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import {
    deliveryReportApi,
    signatureApi,
    type DeliveryReportDto,
    type SignatureRequestDto,
} from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { ReportsSheet } from './ReportsSheet';
import { SignatureDispatchPanel, type SignatureDispatchChannels } from './SignatureDispatchPanel';
import { appointmentTechnicianNames } from '../../../utils/appointmentPeople';
import { orderPayloadId, scopedRecords } from '../../../utils/projectOrderScope';
import type { SignatureDispatchTarget } from '../../../projects/types/signatureTypes';
import {
    computeSignatureStatus,
    getSignatureStatusLabel,
    getSignatureStatusVariant,
    isGeneralSigned,
    requestFor,
} from '../../../projects/utils/signatureRequestUtils';
import {
    buildDeliverySignatureSnapshot,
    buildFieldSignatureSnapshot,
    buildGeneralSignatureSnapshot,
} from '../../../projects/utils/signatureSnapshots';

type SignRow = {
    key: string;
    label: string;
    context: string;
    date: string;
    /** Everyone whose signature this document needs. */
    signatories: string[];
    signed: boolean;
    signedAt: string | null;
    request: SignatureRequestDto | null;
    ready: boolean;
    makeTarget: () => SignatureDispatchTarget;
};

/**
 * The project's signature desk: every document that can be signed — field
 * reports, site handovers and the general report — with the individuals whose
 * signature it needs, and a single action that dispatches the request. A
 * document that is already signed carries its status only: the send action is
 * not offered again.
 */
export const AllSignaturesSheet = ({
    open,
    project,
    order,
    isPrimary,
    onClose,
}: {
    open: boolean;
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    onClose: () => void;
}) => {
    const [deliveries, setDeliveries] = useState<DeliveryReportDto[]>([]);
    const [requests, setRequests] = useState<SignatureRequestDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const salesOrderId = orderPayloadId(order);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [deliveryRows, requestRows] = await Promise.all([
                deliveryReportApi.list({ projectId: project.id }).catch(() => [] as DeliveryReportDto[]),
                signatureApi.list().catch(() => [] as SignatureRequestDto[]),
            ]);
            setDeliveries(deliveryRows.filter((row) => !salesOrderId || (row.salesOrderId || null) === salesOrderId));
            setRequests(requestRows.filter((row) => row.projectId === project.id));
        } finally {
            setLoading(false);
        }
    }, [project.id, salesOrderId]);

    useEffect(() => {
        if (!open) return;
        setSelectedKey(null);
        void load();
    }, [open, load]);

    const fieldReports = useMemo(
        () => (scopedRecords(project.reports, order, isPrimary, project.salesOrders) as any[])
            .sort((a, b) => dayjs(b.workDate || b.reportDate).valueOf() - dayjs(a.workDate || a.reportDate).valueOf()),
        [project.reports, project.salesOrders, order, isPrimary],
    );

    const appointmentById = useMemo(
        () => new Map<string, any>((project.appointments || []).map((appointment: any) => [appointment.id, appointment])),
        [project.appointments],
    );

    // Who signs: the technicians who did the work plus the customer contact.
    const customerName = project.customer?.companyName || t('projects.musteri');
    const signatoriesFor = useCallback((appointmentId: string | null | undefined, employee: any): string[] => {
        const people = new Set<string>();
        const employeeName = employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : '';
        if (employeeName) people.add(employeeName);
        const appointment = appointmentId ? appointmentById.get(appointmentId) : null;
        if (appointment) {
            appointmentTechnicianNames(appointment)
                .split(', ')
                .map((name) => name.trim())
                .filter((name) => name && name !== t('auto.atanmadi'))
                .forEach((name) => people.add(name));
        }
        people.add(customerName);
        return Array.from(people);
    }, [appointmentById, customerName]);

    const rows: SignRow[] = useMemo(() => {
        const list: SignRow[] = [];

        fieldReports.forEach((report: any) => {
            const request = requestFor('FIELD', report.id, requests);
            list.push({
                key: `field-${report.id}`,
                label: t('projects.reportsHub.fieldSection'),
                context: report.operationsDone ? String(report.operationsDone).slice(0, 80) : '—',
                date: dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY'),
                signatories: signatoriesFor(report.appointmentId, report.employee),
                signed: Boolean(report.isSigned) || request?.status === 'SIGNED',
                signedAt: report.signedAt || request?.signedAt || null,
                request,
                ready: true,
                makeTarget: () => ({
                    reportType: 'FIELD',
                    reportId: report.id,
                    title: `${project.projectName} – ${t('signatures.tabs.field')}`,
                    snapshot: buildFieldSignatureSnapshot(project, report),
                    alreadySigned: Boolean(report.isSigned),
                }),
            });
        });

        deliveries.forEach((delivery) => {
            const request = requestFor('DELIVERY', delivery.id, requests);
            list.push({
                key: `delivery-${delivery.id}`,
                label: t('projects.reportsHub.deliverySection'),
                context: delivery.checklistName || t('projects.delivery.pdf.title'),
                date: dayjs(delivery.sentAt || delivery.createdAt).format('DD.MM.YYYY'),
                signatories: signatoriesFor(delivery.appointmentId, null),
                signed: Boolean(delivery.isSigned) || request?.status === 'SIGNED',
                signedAt: delivery.signedAt || request?.signedAt || null,
                request,
                ready: true,
                makeTarget: () => ({
                    reportType: 'DELIVERY',
                    reportId: delivery.id,
                    title: `${project.projectName} – ${delivery.checklistName || t('projects.delivery.pdf.title')}`,
                    snapshot: buildDeliverySignatureSnapshot(project, delivery),
                    alreadySigned: Boolean(delivery.isSigned),
                }),
            });
        });

        const generalRequest = requestFor('GENERAL', null, requests);
        const generalSigned = isGeneralSigned(requests);
        list.push({
            key: 'general',
            label: t('projects.reportsHub.generalSection'),
            context: fieldReports.length
                ? t('signatures.general.allFieldReports', { count: fieldReports.length })
                : t('signatures.generalNotReady'),
            date: fieldReports.length ? dayjs(fieldReports[0].workDate || fieldReports[0].reportDate).format('DD.MM.YYYY') : '—',
            signatories: Array.from(new Set(fieldReports.flatMap((report: any) => signatoriesFor(report.appointmentId, report.employee)))),
            signed: generalSigned,
            signedAt: generalRequest?.signedAt || null,
            request: generalRequest,
            ready: fieldReports.length > 0,
            makeTarget: () => ({
                reportType: 'GENERAL',
                reportId: null,
                title: `${project.projectName} – ${t('projects.general.previewTitle')}`,
                snapshot: buildGeneralSignatureSnapshot(project, salesOrderId, fieldReports),
                alreadySigned: generalSigned,
            }),
        });

        return list;
    }, [fieldReports, deliveries, requests, project, salesOrderId, signatoriesFor]);

    const selected = rows.find((row) => row.key === selectedKey) || null;

    const dispatch = async (channels: SignatureDispatchChannels) => {
        if (!selected) return;
        setBusy(true);
        try {
            const target = selected.makeTarget();
            const result = await signatureApi.create({
                reportType: target.reportType,
                reportId: target.reportId,
                projectId: project.id,
                title: target.title,
                snapshot: target.snapshot,
                customerEmail: channels.email || null,
                sendEmail: channels.sendEmail,
                notifyTechnician: channels.notifyTechnician,
            });
            const parts: string[] = [];
            if (result.notified) parts.push(t('signatures.notifiedTech'));
            if (result.emailed) parts.push(t('signatures.emailedCustomer'));
            toast.success(parts.length ? parts.join(' · ') : t('signatures.dispatched'));
            setSelectedKey(null);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('signatures.createError'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <ReportsSheet
            open={open}
            title={t('projects.reportsHub.signaturesAll')}
            subtitle={project.projectName || undefined}
            onClose={onClose}
        >
            <div className="ofi-rise-in space-y-3 p-4">
                <SectionCard title={`${t('projects.reportsHub.signaturesSection')} (${rows.length})`}>
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <thead>
                            <tr>
                                <th className="text-left">{t('projects.reportsHub.document')}</th>
                                <th className="w-28 text-left">{t('common.date')}</th>
                                <th className="w-36 text-left">{t('common.status')}</th>
                                <th className="w-44 text-right" />
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || rows.length === 0) && (
                                <TableStateRow colSpan={4} loading={loading} emptyText={t('projects.reportsHub.noSignatures')} />
                            )}
                            {!loading && rows.map((row) => {
                                const status = computeSignatureStatus({ signed: row.signed, request: row.request, ready: row.ready });
                                // The send action disappears once a document is signed
                                // (and never appears while it does not exist yet).
                                const canSend = status !== 'signed' && status !== 'notReady';
                                return (
                                    <tr key={row.key} className={selectedKey === row.key ? 'bg-slate-50 dark:bg-white/10' : undefined}>
                                        <td>
                                            <div className="truncate font-medium text-slate-800 dark:text-white">{row.label}</div>
                                            <div className="mt-0.5 truncate text-[11.5px] text-slate-400 dark:text-white/50">{row.context}</div>
                                        </td>
                                        <td className="tabular-nums text-slate-500 dark:text-white/60">{row.date}</td>
                                        <td>
                                            <StatusChip variant={getSignatureStatusVariant(status)}>
                                                {getSignatureStatusLabel(status)}
                                            </StatusChip>
                                            {row.signed && row.signedAt && (
                                                <div className="mt-0.5 text-[11px] text-slate-400 dark:text-white/50">
                                                    {dayjs(row.signedAt).format('DD.MM.YYYY HH:mm')}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-end">
                                                {canSend && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        icon={<Send size={12} />}
                                                        onClick={() => setSelectedKey(row.key === selectedKey ? null : row.key)}
                                                    >
                                                        {t('signatures.sendForSignature')}
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </SectionCard>

                {selected && (
                    <SignatureDispatchPanel
                        key={selected.key}
                        title={`${selected.label} · ${selected.date}`}
                        signatories={selected.signatories}
                        defaultEmail={project.customer?.mainEmail || ''}
                        busy={busy}
                        onCancel={() => setSelectedKey(null)}
                        onSend={(channels) => void dispatch(channels)}
                    />
                )}
            </div>
        </ReportsSheet>
    );
};
