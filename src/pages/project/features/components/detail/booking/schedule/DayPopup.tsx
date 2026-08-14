import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';

import {
    ArrowLeft,
    CheckCircle as CheckCircle2,
    Edit01 as Pencil,
    Mail01 as Mail,
    Plus,
    Trash01 as Trash2,
} from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { ColResizeHandle, ResizableCols, TableStateRow } from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { projectApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { PersonLite } from '@/types/maintenance';
import type { MailSettingDto, ProjectDto, ProjectSalesOrder } from '@/types/project';

import { durationFmt, money } from '../../../../utils/projectFormatters';
import { appointmentDuration, findAppointmentReport } from '../../../../utils/projectAppointments';
import { AppointmentMailPanel } from './AppointmentMailPanel';
import { AppointmentWizard } from './AppointmentWizard';
import { BottomSheet } from './BottomSheet';
import {
    appointmentClientLabel,
    appointmentInstallerNames,
    appointmentStatusKind,
    leadInstallerName,
    statusBadgeClass,
    statusLabel,
} from './scheduleShared';

type PopupView =
    | { kind: 'list' }
    | { kind: 'detail'; appointment: any }
    | { kind: 'create' }
    | { kind: 'edit'; appointment: any }
    | { kind: 'mail'; fromDetail?: any };

type Anim = 'rise' | 'right' | 'left';

const animClass: Record<Anim, string> = {
    rise: 'ofi-rise-in',
    right: 'ofi-slide-in-right',
    left: 'ofi-slide-in-left',
};

const StatusBadge = ({ appointment }: { appointment: any }) => {
    const kind = appointmentStatusKind(appointment);
    return (
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10.5px] font-semibold ${statusBadgeClass(kind)}`}>
            {kind === 'completed' && <CheckCircle2 size={10} />}
            {statusLabel(kind)}
        </span>
    );
};

// Day pop-up: one bottom sheet hosting every flow for the day. The first view
// rises in with the sheet; every toggle after that slides left/right — the
// create wizard and the mail composer are views here, never a second pop-up.
export const DayPopup = ({
    date,
    project,
    order,
    salesOrderId,
    technicians,
    settings,
    userEmail,
    mine,
    others,
    allAppointments,
    initialAppointment,
    onClose,
    onSaved,
    onDelete,
    onManagerFinish,
    canManagerFinish,
}: {
    date: string;
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    salesOrderId: string | null;
    technicians: PersonLite[];
    settings: MailSettingDto | null;
    userEmail: string;
    /** This order's plans on the day. */
    mine: any[];
    /** The rest of the tenant's plans on the day. */
    others: any[];
    /** This order's full plan list (feeds the mail composer's slot picker). */
    allAppointments: any[];
    /** Jump straight to this appointment's detail (calendar chip click). */
    initialAppointment?: any | null;
    onClose: () => void;
    onSaved: () => Promise<void>;
    onDelete: (appointment: any) => Promise<void>;
    onManagerFinish: (appointment: any) => Promise<void>;
    canManagerFinish: (appointment: any) => boolean;
}) => {
    const [view, setView] = useState<PopupView>(
        () => (initialAppointment ? { kind: 'detail', appointment: initialAppointment } : { kind: 'list' }),
    );
    const [anim, setAnim] = useState<Anim>('rise');
    const [finishing, setFinishing] = useState(false);

    const go = (next: PopupView, direction: Exclude<Anim, 'rise'>) => {
        setAnim(direction);
        setView(next);
    };

    // Müşteri sütunu esnektir; diğerleri sürüklenerek genişletilir.
    const grid = useColumnWidths({
        storageKey: 'offitec:day-popup:col-widths:v1',
        defaults: { time: 176, installer: 176, status: 112 },
        minPx: 72,
    });
    const rows = useMemo(() => {
        const mineIds = new Set(mine.map((appointment) => appointment.id));
        return [
            ...mine.map((appointment) => ({ appointment, isMine: true })),
            ...others.filter((appointment) => !mineIds.has(appointment.id)).map((appointment) => ({ appointment, isMine: false })),
        ].sort((a, b) => dayjs(a.appointment.startTime).valueOf() - dayjs(b.appointment.startTime).valueOf());
    }, [mine, others]);

    const isMineAppointment = (appointment: any) => mine.some((item) => item.id === appointment.id);

    const detail = view.kind === 'detail' ? view.appointment : null;

    // Rows from other orders arrive slim from the calendar listing — pull the
    // full payload lazily so the detail can show every assignee.
    useEffect(() => {
        if (!detail || isMineAppointment(detail) || detail.technicianAssignments) return;
        let cancelled = false;
        projectApi.getAppointmentDetail(detail.id)
            .then((full) => {
                if (!cancelled && full) setView({ kind: 'detail', appointment: full });
            })
            .catch(() => undefined);
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detail?.id]);

    // Actual end + overrun for completed plans, from the linked field report.
    const completionInfo = (appointment: any) => {
        if (appointment.status !== 'COMPLETED') return null;
        const report = findAppointmentReport(project, appointment);
        if (!report?.endedAt) return null;
        const overrunMinutes = dayjs(report.endedAt).diff(dayjs(appointment.endTime), 'minute');
        return { actualEnd: report.endedAt as string, overrunMinutes };
    };

    // Overtime beyond the tolerance, line by line, for this appointment only.
    const tolerance = Number(project.overtimeTolerancePercent ?? 15);
    const overtimeRows = useMemo(() => {
        if (!detail) return [];
        return (project.reports || [])
            .filter((report: any) => report.appointmentId === detail.id && Number(report.overtimeCost) > 0)
            .map((report: any) => ({
                id: report.id,
                date: dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY'),
                meta: `${durationFmt(Number(report.overtimeMinutes || 0))} × ${money(report.overtimeHourlyRate)}`,
                amount: Number(report.overtimeCost) || 0,
            }));
    }, [detail, project.reports]);
    const overtimeTotal = overtimeRows.reduce((sum, row) => sum + row.amount, 0);

    const detailIsMine = detail ? isMineAppointment(detail) : false;
    const detailKind = detail ? appointmentStatusKind(detail) : null;
    const detailInfo = detail ? completionInfo(detail) : null;

    const headerByView = (): { title: string; subtitle?: string } => {
        if (view.kind === 'create') return { title: t('projects.schedule.createAppointment'), subtitle: project.customer?.companyName || undefined };
        if (view.kind === 'edit') return { title: t('auto.saat_planini_duzenle'), subtitle: project.customer?.companyName || undefined };
        if (view.kind === 'mail') return { title: t('projects.schedule.sendEmail'), subtitle: project.customer?.mainEmail || undefined };
        if (view.kind === 'detail') return { title: dayjs(date).format('dddd, DD MMMM YYYY'), subtitle: t('projects.schedule.detailTitle') };
        return { title: dayjs(date).format('dddd, DD MMMM YYYY'), subtitle: `${rows.length} ${t('projects.appointment')}` };
    };
    const header = headerByView();

    return (
        <BottomSheet
            open
            onClose={onClose}
            title={header.title}
            subtitle={header.subtitle}
            headerActions={view.kind === 'list' ? (
                <Button size="md" variant="primary" icon={<Plus size={19} />} onClick={() => go({ kind: 'create' }, 'right')}>
                    {t('projects.schedule.newForDay')}
                </Button>
            ) : undefined}
        >
            {view.kind === 'list' && (
                <div key="list" className={`flex-1 p-4 ${animClass[anim]}`}>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
                        <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                            <colgroup>
                                <ResizableCols keys={['time'] as const} grid={grid} />
                                {/* Müşteri sütunu: genişliği yok, kalan yeri emer. */}
                                <col />
                                <ResizableCols keys={['installer', 'status'] as const} grid={grid} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th className="relative text-left">
                                        {t('projects.schedule.time')}
                                        <ColResizeHandle {...grid.resizeProps('time', 'right')} />
                                    </th>
                                    <th className="text-left">{t('projects.schedule.customer')}</th>
                                    <th className="relative text-left">
                                        {t('projects.schedule.installer')}
                                        <ColResizeHandle {...grid.resizeProps('installer')} />
                                    </th>
                                    <th className="relative text-left">
                                        {t('common.status')}
                                        <ColResizeHandle {...grid.resizeProps('status')} />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && (
                                    <TableStateRow colSpan={4} loading={false} emptyText={t('projects.schedule.dayEmpty')} />
                                )}
                                {rows.map(({ appointment, isMine }) => {
                                    const info = isMine ? completionInfo(appointment) : null;
                                    return (
                                        <tr
                                            key={appointment.id}
                                            onClick={() => go({ kind: 'detail', appointment }, 'right')}
                                            className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${isMine ? '' : 'opacity-75'}`}
                                        >
                                            <td className="font-semibold tabular-nums text-slate-800 dark:text-white">
                                                {dayjs(appointment.startTime).format('HH:mm')} – {dayjs(appointment.endTime).format('HH:mm')}
                                                {info && (
                                                    <span className="ml-1.5 text-[11.5px] font-medium text-slate-500 dark:text-white/60">
                                                        → {dayjs(info.actualEnd).format('HH:mm')}
                                                    </span>
                                                )}
                                                {info && info.overrunMinutes > 0 && (
                                                    <span className="ml-1.5 rounded bg-rose-50 px-1 py-px text-[10px] font-bold text-rose-600">
                                                        +{durationFmt(info.overrunMinutes)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="font-medium text-slate-800 dark:text-white">
                                                {appointmentClientLabel(appointment, isMine ? project : null)}
                                            </td>
                                            <td className="text-slate-500 dark:text-white/60">{leadInstallerName(appointment)}</td>
                                            <td><StatusBadge appointment={appointment} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {view.kind === 'detail' && detail && (
                <div key={`detail-${detail.id}`} className={`flex flex-1 flex-col p-4 ${animClass[anim]}`}>
                    <button
                        type="button"
                        onClick={() => go({ kind: 'list' }, 'left')}
                        className="mb-3 inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10"
                    >
                        <ArrowLeft size={13} />
                        {t('common.back')}
                    </button>

                    {/* Everything about the plan, line by line in a single table:
                        client, window (planned vs actual for completed jobs),
                        crew, status — then the 15%+ overtime rows. */}
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
                        <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                            <thead>
                                <tr>
                                    <th className="w-44 text-left">{t('common.detail')}</th>
                                    <th className="text-left" />
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="font-semibold text-slate-500 dark:text-white/60">{t('projects.schedule.customer')}</td>
                                    <td className="font-semibold text-slate-800 dark:text-white">
                                        {appointmentClientLabel(detail, detailIsMine ? project : null)}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="font-semibold text-slate-500 dark:text-white/60">{t('common.date')}</td>
                                    <td className="tabular-nums text-slate-700 dark:text-white/80">{dayjs(detail.startTime).format('DD.MM.YYYY')}</td>
                                </tr>
                                <tr>
                                    <td className="font-semibold text-slate-500 dark:text-white/60">{t('common.start')}</td>
                                    <td className="tabular-nums text-slate-700 dark:text-white/80">{dayjs(detail.startTime).format('HH:mm')}</td>
                                </tr>
                                <tr>
                                    <td className="font-semibold text-slate-500 dark:text-white/60">
                                        {detailInfo ? t('projects.schedule.plannedEnd') : t('common.end')}
                                    </td>
                                    <td className="tabular-nums text-slate-700 dark:text-white/80">
                                        {dayjs(detail.endTime).format('HH:mm')}
                                        <span className="ml-2 text-[11.5px] text-slate-400 dark:text-white/50">
                                            ({t('auto.plan')}: {durationFmt(appointmentDuration(detail))})
                                        </span>
                                    </td>
                                </tr>
                                {detailInfo && (
                                    <tr>
                                        <td className="font-semibold text-slate-500 dark:text-white/60">{t('projects.schedule.actualEnd')}</td>
                                        <td className="tabular-nums text-slate-700 dark:text-white/80">
                                            {dayjs(detailInfo.actualEnd).format('HH:mm')}
                                            {detailInfo.overrunMinutes > 0 ? (
                                                <span className="ml-2 rounded bg-rose-50 px-1.5 py-px text-[11px] font-bold text-rose-600">
                                                    {t('projects.schedule.overrun')}: +{durationFmt(detailInfo.overrunMinutes)}
                                                </span>
                                            ) : (
                                                <span className="ml-2 rounded bg-emerald-50 px-1.5 py-px text-[11px] font-bold text-emerald-600">
                                                    {t('projects.schedule.onTime')}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                )}
                                <tr>
                                    <td className="font-semibold text-slate-500 dark:text-white/60">{t('projects.schedule.installer')}</td>
                                    <td className="text-slate-700 dark:text-white/80">
                                        {appointmentInstallerNames(detail).join(', ') || t('auto.atanmadi')}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="font-semibold text-slate-500 dark:text-white/60">{t('common.status')}</td>
                                    <td><StatusBadge appointment={detail} /></td>
                                </tr>
                                {detail.notes && (
                                    <tr>
                                        <td className="font-semibold text-slate-500 dark:text-white/60">{t('common.notes')}</td>
                                        <td className="text-slate-700 dark:text-white/80">{detail.notes}</td>
                                    </tr>
                                )}
                                {overtimeRows.map((row) => (
                                    <tr key={row.id}>
                                        <td className="font-semibold text-amber-700">
                                            {t('projects.settings.overtimeShort', { tolerance })} · {row.date}
                                        </td>
                                        <td className="tabular-nums text-slate-700 dark:text-white/80">
                                            {row.meta}
                                            <span className="ml-2 font-mono font-bold text-[#272f67] dark:text-white">{money(row.amount)}</span>
                                        </td>
                                    </tr>
                                ))}
                                {overtimeRows.length > 0 && (
                                    <tr>
                                        <td className="font-bold text-slate-700 dark:text-white/80">{t('common.total')}</td>
                                        <td className="font-mono font-bold text-[#272f67] dark:text-white">{money(overtimeTotal)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {detailIsMine && (
                        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4">
                            {canManagerFinish(detail) && (
                                <Button
                                    size="sm"
                                    variant="primary"
                                    loading={finishing}
                                    icon={<CheckCircle2 size={13} />}
                                    onClick={async () => {
                                        if (!window.confirm(t('projects.managerFinish'))) return;
                                        setFinishing(true);
                                        try {
                                            await onManagerFinish(detail);
                                            onClose();
                                        } finally {
                                            setFinishing(false);
                                        }
                                    }}
                                >
                                    {t('projects.managerFinish')}
                                </Button>
                            )}
                            {detailKind !== 'completed' && detailKind !== 'cancelled' && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    icon={<Mail size={13} />}
                                    onClick={() => go({ kind: 'mail', fromDetail: detail }, 'right')}
                                >
                                    {t('projects.schedule.sendEmail')}
                                </Button>
                            )}
                            <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => go({ kind: 'edit', appointment: detail }, 'right')}>
                                {t('common.edit')}
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                icon={<Trash2 size={13} />}
                                onClick={async () => {
                                    if (!window.confirm(t('auto.saat_plani_silinsin_mi_bu_randevuya_bagli_teknis'))) return;
                                    await onDelete(detail);
                                    go({ kind: 'list' }, 'left');
                                }}
                            >
                                {t('common.delete')}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {(view.kind === 'create' || view.kind === 'edit') && (
                <div key={view.kind === 'edit' ? `edit-${view.appointment.id}` : 'create'} className={`flex min-h-0 flex-1 flex-col ${animClass[anim]}`}>
                    <AppointmentWizard
                        project={project}
                        salesOrderId={salesOrderId}
                        technicians={technicians}
                        editing={view.kind === 'edit' ? view.appointment : null}
                        initialDate={date}
                        onSaved={onSaved}
                        onClose={() => go({ kind: 'list' }, 'left')}
                        onExit={() => go(
                            view.kind === 'edit' ? { kind: 'detail', appointment: view.appointment } : { kind: 'list' },
                            'left',
                        )}
                    />
                </div>
            )}

            {view.kind === 'mail' && (
                <div key="mail" className={`flex min-h-0 flex-1 flex-col ${animClass[anim]}`}>
                    <div className="px-4 pt-3">
                        <button
                            type="button"
                            onClick={() => go(
                                view.fromDetail ? { kind: 'detail', appointment: view.fromDetail } : { kind: 'list' },
                                'left',
                            )}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10"
                        >
                            <ArrowLeft size={13} />
                            {t('common.back')}
                        </button>
                    </div>
                    <AppointmentMailPanel
                        project={project}
                        order={order}
                        appointments={allAppointments}
                        preselectedId={view.fromDetail?.id || null}
                        settings={settings}
                        userEmail={userEmail}
                        onClose={() => go({ kind: 'list' }, 'left')}
                    />
                </div>
            )}
        </BottomSheet>
    );
};
