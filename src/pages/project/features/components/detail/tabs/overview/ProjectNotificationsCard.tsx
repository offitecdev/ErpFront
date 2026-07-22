import { memo, useState } from 'react';
import dayjs from 'dayjs';
import type React from 'react';

import {
    AlertTriangle,
    Bell01,
    ChevronRight,
    Clipboard as ClipboardPenLine,
    FileDownload02 as FileDown,
    X,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { DeliveryReportDto } from '@/lib/api/project';

import { InitialsAvatar } from '../../../common/InitialsAvatar';
import { displayOperationsDone } from '../../../../utils/projectFormatters';
import type { ProjectDetailView } from '../../../../types/projectDetailNavigation';

export type ProjectNotificationItem = {
    key: string;
    critical?: boolean;
    title: string;
    tag: string;
    subtitle?: string;
    icon?: React.ReactNode;
    avatarName?: string;
    onOpen: () => void;
};

const reportEmployeeName = (report: any) =>
    report?.employee ? `${report.employee.firstName || ''} ${report.employee.lastName || ''}`.trim() : '';

// The project's notification box, in the CRM-overview agenda style: a deep-gold
// glass card whose items are slightly larger square tiles — critical work first
// (rose-tinted), then everything still waiting for a signature, with the
// responsible person's avatar. Dismissible with X.
export const ProjectNotificationsCard = memo(({
    attention,
    unsignedReports,
    unsignedDeliveries,
    onNavigate,
}: {
    attention: Array<{ key: string; label: string; onClick: () => void }>;
    unsignedReports: any[];
    unsignedDeliveries: DeliveryReportDto[];
    onNavigate: (view: ProjectDetailView) => void;
}) => {
    const [dismissed, setDismissed] = useState(false);

    const items: ProjectNotificationItem[] = [
        ...attention.map((item) => ({
            key: item.key,
            critical: true,
            title: item.label,
            tag: t('projects.attentionRequired'),
            icon: <AlertTriangle size={15} />,
            onOpen: item.onClick,
        })),
        ...unsignedReports.map((report: any) => {
            const name = reportEmployeeName(report);
            return {
                key: `report-${report.id}`,
                title: name || t('auto.teknisyen'),
                tag: t('auto.imza_bekliyor'),
                subtitle: `${dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')} · ${t('projects.fieldReport')}${report.operationsDone ? ` · ${displayOperationsDone(report.operationsDone)}` : ''}`,
                avatarName: name || t('auto.teknisyen'),
                onOpen: () => onNavigate({ section: 'field', subSection: 'signatures' }),
            };
        }),
        ...unsignedDeliveries.map((report) => ({
            key: `delivery-${report.id}`,
            title: report.checklistName || t('projects.delivery.tab'),
            tag: t('projects.delivery.statusUnsigned'),
            subtitle: `${dayjs(report.createdAt).format('DD.MM.YYYY')} · ${t('projects.delivery.tab')}`,
            icon: <FileDown size={15} />,
            onOpen: () => onNavigate({ section: 'field', subSection: 'delivery' }),
        })),
    ];

    if (dismissed || items.length === 0) return null;

    return (
        <section className="project-attention-strip overflow-hidden rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-2xl backdrop-saturate-200">
            <header className="flex items-center justify-between gap-3 px-4 pt-3">
                <div className="project-attention-title flex items-center gap-2 text-[12.5px] font-semibold">
                    <Bell01 size={15} />
                    <span>{t('projects.detail.notifications')}</span>
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#8a5f08] px-1 text-[10px] font-bold text-white dark:bg-[#e6cf9e] dark:text-black">
                        {items.length}
                    </span>
                </div>
                <button
                    type="button"
                    aria-label={t('projects.detail.dismiss')}
                    title={t('projects.detail.dismiss')}
                    onClick={() => setDismissed(true)}
                    className="rounded-md p-1 text-slate-600 transition-colors hover:bg-white/60 hover:text-slate-900 dark:text-white/70"
                >
                    <X size={14} />
                </button>
            </header>

            {/* Slightly larger, square-ish notification tiles (CRM agenda style). */}
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        onClick={item.onOpen}
                        className={`group flex min-h-[76px] items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                            item.critical
                                ? 'border-rose-200/80 bg-rose-50/70 hover:border-rose-300 dark:border-rose-400/25 dark:bg-rose-400/10 dark:hover:bg-rose-400/15'
                                : 'border-white/70 bg-white/70 hover:border-[#b28010]/40 hover:bg-white/85 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
                        }`}
                    >
                        {item.avatarName ? (
                            <InitialsAvatar name={item.avatarName} size={36} />
                        ) : (
                            <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                                item.critical
                                    ? 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
                                    : 'bg-[#8a5f08]/10 text-[#8a5f08] dark:bg-[#e6cf9e]/12 dark:text-[#e6cf9e]'
                            }`}>
                                {item.icon || <ClipboardPenLine size={15} />}
                            </span>
                        )}
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-slate-900 dark:text-white">{item.title}</span>
                            <span className="mt-0.5 flex items-center gap-2">
                                <span className={`rounded-md px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                                    item.critical
                                        ? 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
                                        : 'bg-[#8a5f08]/10 text-[#7a5407] dark:bg-white/10 dark:text-white/70'
                                }`}>
                                    {item.tag}
                                </span>
                            </span>
                            {item.subtitle && (
                                <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-white/60">{item.subtitle}</span>
                            )}
                        </span>
                        <ChevronRight size={15} className="shrink-0 text-slate-400 transition-colors group-hover:text-slate-600 dark:text-white/30" />
                    </button>
                ))}
            </div>
        </section>
    );
});
