import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    AlertTriangle,
    Bell01,
    Calendar,
    CalendarPlus01,
    ChevronRight,
    Clock,
    Mail01,
    Trash01,
} from '@/components/icons/antIconCompat';
import { Button } from '../../../../components/ui-shared/Button';
import { formatMoney, toCurrencyCode } from '../../../../utils/currency';
import type { NotificationDto } from '../../../../lib/api/notifications';
import type { MaintenanceTaskDto } from '../../../../types/maintenance';
import type { AppointmentDto } from '../../../../types/project';
import { meetingApi, meetingParticipantName, type MeetingActivityDto } from '../../../../lib/api/meetings';
import { employeeName, type CriticalOffer } from '../overviewShared';
import { OverviewCard } from './OverviewCard';
import { MeetingComposerModal } from './MeetingComposerModal';

type AgendaTab = 'all' | 'critical' | 'upcoming';

interface AgendaItem {
    id: string;
    kind: 'offer' | 'task' | 'appointment' | 'meeting';
    critical: boolean;
    title: string;
    subtitle?: string;
    /** e.g. "09:30 – 11:00" or "3 gün kaldı" */
    timeLabel?: string;
    /** For chronological sorting of upcoming items. */
    when: dayjs.Dayjs;
    overdue?: boolean;
    tagKey: string;
    tagDefault: string;
    onOpen?: () => void;
    onRemove?: () => void;
}

interface PriorityAgendaProps {
    critical: CriticalOffer[];
    tasks: MaintenanceTaskDto[];
    weekAppointments: AppointmentDto[];
    notifications: NotificationDto[];
    meetings: MeetingActivityDto[];
    /** Refetch after creating/removing a meeting activity. */
    onMeetingsChanged: () => void;
    composerOpen: boolean;
    onComposerClose: () => void;
    onComposerOpen: () => void;
}

const TAB_KEYS: Record<AgendaTab, { key: string; defaultLabel: string }> = {
    all: { key: 'crmOverview.agenda.tabAll', defaultLabel: 'Tümü' },
    critical: { key: 'crmOverview.agenda.tabCritical', defaultLabel: 'Kritik' },
    upcoming: { key: 'crmOverview.agenda.tabUpcoming', defaultLabel: 'Yaklaşan' },
};

/**
 * Priority panel: critical offer labels (expiring / not converted / stale draft
 * mail), today's overdue + upcoming meetings and tasks with times, calendar
 * notifications, and a quick composer for workspace meetings/tasks.
 */
export const PriorityAgenda: React.FC<PriorityAgendaProps> = ({
    critical,
    tasks,
    weekAppointments,
    notifications,
    meetings,
    onMeetingsChanged,
    composerOpen,
    onComposerClose,
    onComposerOpen,
}) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [tab, setTab] = useState<AgendaTab>('all');

    const removeMeeting = (id: string) => {
        meetingApi
            .remove(id)
            .then(onMeetingsChanged)
            .catch(() => undefined);
    };

    const reasonLabel = (reason: CriticalOffer['reason']) => {
        switch (reason) {
            case 'expiring':
                return { key: 'crmOverview.agenda.reasonExpiring', defaultLabel: 'Teklif süresi doluyor' };
            case 'notConverted':
                return { key: 'crmOverview.agenda.reasonNotConverted', defaultLabel: 'Siparişe dönüştürülmedi' };
            default:
                return { key: 'crmOverview.agenda.reasonStaleDraft', defaultLabel: '10+ gündür taslakta' };
        }
    };

    const items = useMemo<AgendaItem[]>(() => {
        const now = dayjs();
        const horizon = now.add(7, 'day').endOf('day');
        const out: AgendaItem[] = [];

        for (const { tender, reason } of critical) {
            const { key, defaultLabel } = reasonLabel(reason);
            const days = tender.validUntil ? dayjs(tender.validUntil).startOf('day').diff(now.startOf('day'), 'day') : null;
            out.push({
                id: `offer-${tender.id}`,
                kind: 'offer',
                critical: true,
                title: `${tender.tenderNumber}${tender.customerName ? ` · ${tender.customerName}` : ''}`,
                subtitle: tender.grandTotal
                    ? formatMoney(tender.grandTotal, toCurrencyCode(tender.currency))
                    : undefined,
                timeLabel:
                    reason === 'expiring' && days !== null
                        ? days < 0
                            ? t('crmOverview.agenda.expired', { defaultValue: 'Süresi doldu' })
                            : t('crmOverview.agenda.daysLeft', { count: days, defaultValue: '{{count}} gün kaldı' })
                        : undefined,
                when: tender.validUntil ? dayjs(tender.validUntil) : now,
                overdue: days !== null && days < 0,
                tagKey: key,
                tagDefault: defaultLabel,
                onOpen: () => navigate(`/crm/tenders/${tender.id}`),
            });
        }

        for (const task of tasks) {
            const day = dayjs(task.plannedDate);
            const overdue = (task.status === 'PENDING' || task.status === 'IN_PROGRESS') && day.isBefore(now.startOf('day'));
            const upcoming = day.isAfter(now.startOf('day').subtract(1, 'minute')) && day.isBefore(horizon);
            if (!overdue && !upcoming) continue;
            const timeRange = task.scheduledStartTime
                ? `${dayjs(task.scheduledStartTime).format('HH:mm')}${task.scheduledEndTime ? ` – ${dayjs(task.scheduledEndTime).format('HH:mm')}` : ''}`
                : undefined;
            out.push({
                id: `task-${task.id}`,
                kind: 'task',
                critical: overdue,
                title: task.contract?.title || task.siteName || t('crmOverview.agenda.maintenanceTask', { defaultValue: 'Bakım görevi' }),
                subtitle: employeeName(task.technician) || undefined,
                timeLabel: `${day.format('DD MMM')}${timeRange ? ` · ${timeRange}` : ''}`,
                when: day,
                overdue,
                tagKey: overdue ? 'crmOverview.agenda.tagDelayed' : 'crmOverview.agenda.tagTask',
                tagDefault: overdue ? 'Gecikti' : 'Görev',
                onOpen: () => navigate(`/maintenance/tasks/${task.id}`),
            });
        }

        for (const appt of weekAppointments) {
            const start = dayjs(appt.startTime);
            if (start.isBefore(now.startOf('day')) || start.isAfter(horizon)) continue;
            out.push({
                id: `appt-${appt.id}`,
                kind: 'appointment',
                critical: false,
                title: appt.notes || t('crmOverview.agenda.appointment', { defaultValue: 'Randevu' }),
                subtitle: employeeName(appt.assignedTechnician) || undefined,
                timeLabel: `${start.format('DD MMM')} · ${start.format('HH:mm')} – ${dayjs(appt.endTime).format('HH:mm')}`,
                when: start,
                tagKey: 'crmOverview.agenda.tagAppointment',
                tagDefault: 'Randevu',
                onOpen: () => navigate('/calendar'),
            });
        }

        for (const meeting of meetings) {
            const start = dayjs(meeting.startTime);
            const end = dayjs(meeting.endTime);
            if (start.isBefore(now.subtract(1, 'day')) || start.isAfter(horizon)) continue;
            const people = meeting.participants.map(meetingParticipantName).filter(Boolean);
            const peopleLabel =
                people.length > 2 ? `${people.slice(0, 2).join(', ')} +${people.length - 2}` : people.join(', ');
            out.push({
                id: `mtg-${meeting.id}`,
                kind: 'meeting',
                critical: false,
                title: meeting.customer?.companyName ? `${meeting.title} · ${meeting.customer.companyName}` : meeting.title,
                subtitle: peopleLabel || meeting.notes || undefined,
                timeLabel: `${start.format('DD MMM')} · ${start.format('HH:mm')} – ${end.format('HH:mm')}`,
                when: start,
                overdue: start.isBefore(now),
                tagKey: meeting.kind === 'TASK' ? 'crmOverview.agenda.tagMyTask' : 'crmOverview.agenda.tagMeeting',
                tagDefault: meeting.kind === 'TASK' ? 'Görev' : 'Toplantı',
                onRemove: () => removeMeeting(meeting.id),
            });
        }

        // Critical first (most urgent on top), then chronological.
        return out.sort((a, b) => Number(b.critical) - Number(a.critical) || a.when.valueOf() - b.when.valueOf());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [critical, tasks, weekAppointments, meetings, i18n.language]);

    const visible = items.filter((item) =>
        tab === 'all' ? true : tab === 'critical' ? item.critical : !item.critical,
    );

    const counts: Record<AgendaTab, number> = {
        all: items.length,
        critical: items.filter((i) => i.critical).length,
        upcoming: items.filter((i) => !i.critical).length,
    };

    const KIND_ICON: Record<AgendaItem['kind'], React.ReactNode> = {
        offer: <Mail01 size={14} />,
        task: <AlertTriangle size={14} />,
        appointment: <Calendar size={14} />,
        meeting: <Clock size={14} />,
    };

    return (
        <OverviewCard
            title={t('crmOverview.agenda.title', { defaultValue: 'Öncelikli işler ve ajanda' })}
            subtitle={t('crmOverview.agenda.subtitle', { defaultValue: 'Kritik teklifler, geciken görevler ve yaklaşan toplantılar' })}
            icon={<AlertTriangle size={16} />}
            actions={
                <Button variant="secondary" size="sm" icon={<CalendarPlus01 size={14} />} onClick={onComposerOpen}>
                    {t('crmOverview.agenda.addMeeting', { defaultValue: 'Aktivite ekle' })}
                </Button>
            }
            bodyClassName="flex flex-col gap-3 pt-3"
        >
            {/* Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-black/4 p-1 dark:bg-white/6">
                {(Object.keys(TAB_KEYS) as AgendaTab[]).map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                            tab === key
                                ? 'bg-white text-[#1A1A1A] shadow-sm dark:bg-white/12 dark:text-white'
                                : 'text-[#6B7280] hover:text-[#1A1A1A] dark:text-white/60 dark:hover:text-white'
                        }`}
                    >
                        {t(TAB_KEYS[key].key, { defaultValue: TAB_KEYS[key].defaultLabel })}
                        <span
                            className={`rounded-full px-1.5 text-[10.5px] tabular-nums ${
                                key === 'critical' && counts.critical > 0
                                    ? 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
                                    : 'bg-black/6 text-[#6B7280] dark:bg-white/10 dark:text-white/60'
                            }`}
                        >
                            {counts[key]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Items */}
            <div className="flex max-h-[380px] flex-col gap-1.5 overflow-y-auto pr-0.5">
                {visible.length === 0 && (
                    <p className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-[13px] text-[#98A0AE] dark:border-white/15">
                        {t('crmOverview.agenda.empty', { defaultValue: 'Bu görünümde bekleyen bir şey yok. ' })}
                    </p>
                )}
                {visible.map((item) => (
                    <div
                        key={item.id}
                        role={item.onOpen ? 'button' : undefined}
                        tabIndex={item.onOpen ? 0 : undefined}
                        onClick={item.onOpen}
                        onKeyDown={(e) => {
                            if (item.onOpen && (e.key === 'Enter' || e.key === ' ')) item.onOpen();
                        }}
                        className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                            item.critical
                                ? 'border-rose-200/70 bg-rose-50/60 dark:border-rose-400/20 dark:bg-rose-400/8'
                                : 'border-[#E3E7F0] bg-[#F7F8FC] dark:border-white/8 dark:bg-white/4'
                        } ${item.onOpen ? 'cursor-pointer hover:border-[#C9D0DF] dark:hover:bg-white/8' : ''}`}
                    >
                        <span
                            className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                                item.critical
                                    ? 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
                                    : 'bg-[#07145c]/8 text-[#07145c] dark:bg-[#e6cf9e]/12 dark:text-[#e6cf9e]'
                            }`}
                        >
                            {KIND_ICON[item.kind]}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold text-[#1A1A1A] dark:text-white">{item.title}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[#6B7280] dark:text-[#aab0bb]">
                                <span
                                    className={`rounded-md px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide ${
                                        item.critical
                                            ? 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
                                            : 'bg-black/6 text-[#6B7280] dark:bg-white/10 dark:text-white/70'
                                    }`}
                                >
                                    {t(item.tagKey, { defaultValue: item.tagDefault })}
                                </span>
                                {item.timeLabel && (
                                    <span className={`tabular-nums ${item.overdue ? 'font-semibold text-rose-600 dark:text-rose-300' : ''}`}>
                                        {item.timeLabel}
                                    </span>
                                )}
                                {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                            </p>
                        </div>
                        {item.onRemove && (
                            <button
                                type="button"
                                aria-label={t('common.delete', { defaultValue: 'Sil' })}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    item.onRemove?.();
                                }}
                                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[#98A0AE] opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-600 group-hover:opacity-100"
                            >
                                <Trash01 size={14} />
                            </button>
                        )}
                        {item.onOpen && <ChevronRight size={15} className="shrink-0 text-[#C4C7CE] dark:text-white/25" />}
                    </div>
                ))}
            </div>

            {/* Calendar notifications */}
            {notifications.length > 0 && (
                <div className="border-t border-black/6 pt-3 dark:border-white/8">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#98A0AE] dark:text-[#8f95a1]">
                        <Bell01 size={13} />
                        {t('crmOverview.agenda.notifications', { defaultValue: 'Bildirimler' })}
                    </p>
                    <div className="flex flex-col gap-1">
                        {notifications.slice(0, 4).map((n) => (
                            <button
                                key={n.id}
                                type="button"
                                onClick={() => n.linkUrl && navigate(n.linkUrl)}
                                className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/4 dark:hover:bg-white/6"
                            >
                                <span className={`mt-1 size-1.5 shrink-0 rounded-full ${n.isRead ? 'bg-black/15 dark:bg-white/20' : 'bg-sky-500'}`} />
                                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#3F4350] dark:text-[#d9dce3]">{n.title}</span>
                                <span className="shrink-0 text-[11px] tabular-nums text-[#98A0AE]">{dayjs(n.createdAt).format('DD MMM HH:mm')}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <MeetingComposerModal open={composerOpen} onClose={onComposerClose} onSaved={onMeetingsChanged} />
        </OverviewCard>
    );
};
