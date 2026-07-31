import { Fragment, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';

import { ChevronDown, ChevronRight } from '@/components/icons/antIconCompat';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { signatureApi, type SignatureRequestDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';

import { ReportsSheet } from './ReportsSheet';

const typeLabel = (reportType: SignatureRequestDto['reportType']): string => {
    if (reportType === 'FIELD') return t('projects.reportsHub.fieldSection');
    if (reportType === 'DELIVERY') return t('projects.reportsHub.deliverySection');
    return t('projects.reportsHub.generalSection');
};

/**
 * Every signature of the project, newest first, inside the same square
 * bottom-sheet as the rest of the Reports flow. A row expands in place to the
 * customer / project / appointment context — details never leave the popup.
 */
export const AllSignaturesSheet = ({
    open,
    project,
    onClose,
}: {
    open: boolean;
    project: ProjectDto;
    onClose: () => void;
}) => {
    const [requests, setRequests] = useState<SignatureRequestDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setExpandedId(null);
        signatureApi.list()
            .then((rows) => {
                if (cancelled) return;
                setRequests(rows
                    .filter((row) => row.projectId === project.id)
                    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()));
            })
            .catch(() => { if (!cancelled) setRequests([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, project.id]);

    // Resolve the appointment behind a field-report signature so the detail
    // block can show when the signed work actually happened.
    const appointmentFor = useMemo(() => {
        const reportById = new Map<string, any>(((project as any).reports || []).map((r: any) => [r.id, r]));
        const appointmentById = new Map<string, any>((project.appointments || []).map((a: any) => [a.id, a]));
        return (request: SignatureRequestDto) => {
            if (!request.reportId) return null;
            const report = reportById.get(request.reportId);
            return report?.appointmentId ? appointmentById.get(report.appointmentId) || null : null;
        };
    }, [project]);

    return (
        <ReportsSheet
            open={open}
            title={t('projects.reportsHub.signaturesAll')}
            subtitle={project.projectName || undefined}
            onClose={onClose}
        >
            <div className="ofi-rise-in p-4">
                <SectionCard title={`${t('projects.reportsHub.signaturesSection')} (${requests.length})`}>
                    <table data-inv-table data-unstyled-table className="w-full">
                        <thead>
                            <tr>
                                <th className="w-8 text-left" />
                                <th className="w-40 text-left">{t('common.date')}</th>
                                <th className="text-left">{t('projects.reportsHub.document')}</th>
                                <th className="w-36 text-left">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || requests.length === 0) && (
                                <TableStateRow colSpan={4} loading={loading} emptyText={t('projects.reportsHub.noSignatures')} />
                            )}
                            {!loading && requests.map((request) => {
                                const openRow = expandedId === request.id;
                                const appointment = appointmentFor(request);
                                return (
                                    <Fragment key={request.id}>
                                        <tr
                                            onClick={() => setExpandedId(openRow ? null : request.id)}
                                            className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                        >
                                            <td className="text-slate-400 dark:text-white/50">
                                                {openRow ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </td>
                                            <td className="tabular-nums text-slate-700 dark:text-white/80">
                                                {dayjs(request.createdAt).format('DD.MM.YYYY HH:mm')}
                                            </td>
                                            <td>
                                                <div className="truncate font-medium text-slate-800 dark:text-white">{request.title || typeLabel(request.reportType)}</div>
                                                <div className="mt-0.5 truncate text-[11.5px] text-slate-400 dark:text-white/50">{typeLabel(request.reportType)}</div>
                                            </td>
                                            <td>
                                                <StatusChip variant={request.status === 'SIGNED' ? 'active' : 'warning'}>
                                                    {request.status === 'SIGNED' ? t('projects.reportsHub.signed') : t('projects.reportsHub.unsigned')}
                                                </StatusChip>
                                            </td>
                                        </tr>
                                        {openRow && (
                                            <tr>
                                                <td />
                                                <td colSpan={3} className="bg-slate-50/60 dark:bg-white/5">
                                                    <div className="grid grid-cols-1 gap-x-6 gap-y-1 py-1.5 text-[12.5px] sm:grid-cols-2">
                                                        <div><span className="font-semibold text-slate-500 dark:text-white/60">{t('projects.musteri')}: </span><span className="text-slate-800 dark:text-white">{project.customer?.companyName || '—'}</span></div>
                                                        <div><span className="font-semibold text-slate-500 dark:text-white/60">{t('auto.proje')}: </span><span className="text-slate-800 dark:text-white">{project.projectName || '—'}</span></div>
                                                        <div><span className="font-semibold text-slate-500 dark:text-white/60">{t('signatures.customerEmail')}: </span><span className="text-slate-800 dark:text-white">{request.customerEmail || '—'}</span></div>
                                                        <div>
                                                            <span className="font-semibold text-slate-500 dark:text-white/60">{t('projects.appointment')}: </span>
                                                            <span className="text-slate-800 dark:text-white">
                                                                {appointment
                                                                    ? `${dayjs(appointment.startTime).format('DD.MM.YYYY')} · ${dayjs(appointment.startTime).format('HH:mm')}–${dayjs(appointment.endTime).format('HH:mm')}`
                                                                    : '—'}
                                                            </span>
                                                        </div>
                                                        {request.signedAt && (
                                                            <div><span className="font-semibold text-slate-500 dark:text-white/60">{t('projects.reportsHub.signedAt')}: </span><span className="text-slate-800 dark:text-white">{dayjs(request.signedAt).format('DD.MM.YYYY HH:mm')}</span></div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </SectionCard>
            </div>
        </ReportsSheet>
    );
};
