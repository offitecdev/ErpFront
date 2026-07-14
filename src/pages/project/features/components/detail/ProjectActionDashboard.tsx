import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import dayjs from 'dayjs';
import {
    AlertTriangle,
    CalendarCheck01 as CalendarClock,
    ChevronRight,
    Clipboard as ClipboardPenLine,
    FileDownload02 as FileDown,
    Receipt as ReceiptText,
    Send01 as Send,
} from '@/components/icons/antIconCompat';

import { deliveryReportApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';
import { money } from '../../utils/projectFormatters';
import { scopedRecords } from '../../utils/projectOrderScope';
import type { calculateTotals } from '../../utils/projectTotals';
import type { ProjectDetailView } from '../../types/projectDetailNavigation';
import { viewForSection } from '../../types/projectDetailNavigation';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

const TONE_STYLES: Record<Tone, { chip: string; icon: string }> = {
    ok: { chip: 'bg-emerald-50 text-emerald-700', icon: 'text-emerald-600 bg-emerald-50' },
    warn: { chip: 'bg-amber-50 text-amber-700', icon: 'text-amber-600 bg-amber-50' },
    danger: { chip: 'bg-red-50 text-red-700', icon: 'text-red-600 bg-red-50' },
    neutral: { chip: 'bg-slate-100 text-slate-600', icon: 'text-slate-500 bg-slate-50' },
};

const StatusTile = ({
    icon,
    label,
    value,
    hint,
    tone,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    hint?: string;
    tone: Tone;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className="group flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-3.5 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/60"
    >
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${TONE_STYLES[tone].icon}`}>{icon}</span>
        <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-0.5 truncate text-[14px] font-bold leading-tight text-slate-900">{value}</div>
            {hint && <div className="truncate text-[11px] text-slate-400">{hint}</div>}
        </div>
        <ChevronRight size={15} className="shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
    </button>
);

// The "what should I do now?" overview panel. It surfaces the state of every
// workflow stage, floats critical warnings into an attention strip and offers
// one-click shortcuts to the relevant sections. It is display-only — no numbers
// here feed back into any mutation.
export const ProjectActionDashboard = ({
    project,
    order,
    isPrimary,
    totals,
    awaitingAppointments,
    addonAttention,
    onNavigate,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    totals: ReturnType<typeof calculateTotals>;
    awaitingAppointments: any[];
    addonAttention: boolean;
    onNavigate: (view: ProjectDetailView) => void;
}) => {
    const [deliverySigned, setDeliverySigned] = useState<number | null>(null);
    const [deliveryCount, setDeliveryCount] = useState<number | null>(null);

    useEffect(() => {
        let active = true;
        deliveryReportApi
            .list({ projectId: project.id })
            .then((rows) => {
                if (!active) return;
                setDeliveryCount(rows.length);
                setDeliverySigned(rows.filter((row) => row.isSigned).length);
            })
            .catch(() => {
                if (!active) return;
                setDeliveryCount(0);
                setDeliverySigned(0);
            });
        return () => { active = false; };
    }, [project.id]);

    const appointments = useMemo(
        () => scopedRecords(project.appointments, order, isPrimary, project.salesOrders),
        [project.appointments, project.salesOrders, order, isPrimary],
    );
    const reports = useMemo(
        () => scopedRecords(project.reports, order, isPrimary, project.salesOrders),
        [project.reports, project.salesOrders, order, isPrimary],
    );

    const nextAppointment = useMemo(
        () => [...appointments]
            .filter((appt: any) => appt.status !== 'CANCELLED' && !dayjs(appt.startTime).isBefore(dayjs(), 'day'))
            .sort((a: any, b: any) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())[0] || null,
        [appointments],
    );
    const signedReports = reports.filter((report: any) => report.isSigned).length;
    const unsignedReports = reports.length - signedReports;
    const awaiting = awaitingAppointments.length;
    const deliveryUnsigned = deliveryCount !== null && deliverySigned !== null ? deliveryCount - deliverySigned : 0;

    const goAppointments = () => onNavigate({ section: 'planning', subSection: 'appointments' });
    const goReports = () => onNavigate({ section: 'field', subSection: 'fieldReports' });
    const goSignatures = () => onNavigate({ section: 'field', subSection: 'signatures' });
    const goDelivery = () => onNavigate({ section: 'field', subSection: 'delivery' });
    const goAddons = () => onNavigate(viewForSection('addons'));

    // Critical items that should not be buried inside a card.
    const attention: Array<{ key: string; label: string; onClick: () => void }> = [];
    if (awaiting > 0) attention.push({ key: 'field', label: `${t('projects.technicianNotFinished')} (${awaiting})`, onClick: goAppointments });
    if (addonAttention) attention.push({ key: 'addon', label: t('projects.addonRequestAttention'), onClick: goAddons });
    if (unsignedReports > 0) attention.push({ key: 'sign', label: `${t('nav.signatures')}: ${unsignedReports}`, onClick: goSignatures });
    if (deliveryUnsigned > 0) attention.push({ key: 'delivery', label: `${t('projects.delivery.tab')}: ${deliveryUnsigned}`, onClick: goDelivery });

    const deliveryValue = deliveryCount === null
        ? '…'
        : deliveryCount === 0
            ? '-'
            : `${deliverySigned}/${deliveryCount}`;

    const totalsRow: Array<{ label: string; value: number; strong?: boolean }> = [
        { label: t('auto.siparis_tutari'), value: totals.orderBudget },
        { label: t('auto.harici_gider'), value: totals.expenses },
        { label: t('auto.ek_malzeme'), value: totals.extraMaterials },
        { label: t('auto.15_uzeri_fazla_calisma'), value: totals.overtime },
        { label: t('common.total'), value: totals.total, strong: true },
    ];

    return (
        <div className="space-y-4">
            {attention.length > 0 && (
                <div className="project-attention-strip rounded-xl border border-white/65 bg-rose-50/30 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-1px_0_rgba(255,255,255,0.34)] ring-1 ring-rose-300/25 backdrop-blur-2xl backdrop-saturate-200">
                    <div className="project-attention-title flex items-center gap-2 text-[12.5px] font-semibold text-slate-950">
                        <AlertTriangle size={15} />
                        <span>{t('projects.attentionRequired')}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {attention.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={item.onClick}
                                className="project-attention-pill inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-rose-50/25 px-3 py-1 text-[11.5px] font-semibold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),inset_0_-1px_0_rgba(255,255,255,0.30)] ring-1 ring-rose-300/20 backdrop-blur-xl backdrop-saturate-200 transition-colors hover:bg-rose-50/40"
                            >
                                {item.label}
                                <ChevronRight size={13} />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                <StatusTile
                    icon={<CalendarClock size={16} />}
                    label={t('projects.appointment')}
                    value={nextAppointment ? dayjs(nextAppointment.startTime).format('DD.MM.YYYY') : (appointments.length ? String(appointments.length) : '-')}
                    hint={nextAppointment ? dayjs(nextAppointment.startTime).format('HH:mm') : t('auto.saat_plani_yok')}
                    tone={appointments.length ? 'ok' : 'neutral'}
                    onClick={goAppointments}
                />
                <StatusTile
                    icon={<ClipboardPenLine size={16} />}
                    label={t('projects.fieldReport')}
                    value={String(reports.length)}
                    hint={awaiting > 0 ? `${awaiting} ${t('projects.technicianNotFinished')}` : t('auto.montaj_tamamlandi')}
                    tone={awaiting > 0 ? 'danger' : reports.length ? 'ok' : 'neutral'}
                    onClick={goReports}
                />
                <StatusTile
                    icon={<Send size={16} />}
                    label={t('nav.signatures')}
                    value={reports.length ? `${signedReports}/${reports.length}` : '-'}
                    hint={unsignedReports > 0 ? t('auto.imza_bekliyor') : t('auto.imzali')}
                    tone={unsignedReports > 0 ? 'warn' : reports.length ? 'ok' : 'neutral'}
                    onClick={goSignatures}
                />
                <StatusTile
                    icon={<FileDown size={16} />}
                    label={t('projects.delivery.tab')}
                    value={deliveryValue}
                    hint={deliveryUnsigned > 0 ? t('projects.delivery.statusUnsigned') : t('projects.delivery.statusSigned')}
                    tone={deliveryUnsigned > 0 ? 'warn' : deliveryCount ? 'ok' : 'neutral'}
                    onClick={goDelivery}
                />
            </div>

            <div className="rounded-xl border border-slate-200/70 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-slate-900">
                    <ReceiptText size={14} className="text-slate-400" />
                    {localizeTenderNumbersInText(order?.orderNumber || project.projectName)}
                    {addonAttention && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-semibold text-red-700">
                            <AlertTriangle size={12} />{t('projects.addonRequestBadge')}
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                    {totalsRow.map((row) => (
                        <div key={row.label} className={`rounded-lg border px-3 py-2.5 ${row.strong ? 'border-[#272f67]/20 bg-[#eef4ff]' : 'border-slate-200/70 bg-slate-50/50'}`}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{row.label}</div>
                            <div className={`mt-1 truncate font-mono text-[13.5px] font-bold ${row.strong ? 'text-[#272f67]' : 'text-slate-900'}`}>{money(row.value)}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
