import { useEffect, useState, type ReactNode } from 'react';
import Drawer from 'antd/es/drawer';
import {
    ArrowRight,
    Briefcase01 as Briefcase,
    Building02 as Building,
    Calendar,
    File02 as FileText,
    Hash01 as Hash,
    Mail01 as Mail,
    MarkerPin01 as MapPin,
    Phone,
    Tag01 as Tag,
    User01 as User,
} from '@/components/icons/antIconCompat';

import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import { localizeTenderNumber, localizeTenderNumbersInText } from '@/utils/tenderNumber';

import type { CalendarCategory, CalendarEvent, EventDetail, Participant } from './UnifiedCalendar';

const chf = (value?: number | null) =>
    typeof value === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value)
        : null;

// Per-category accent so the popup header echoes the calendar block colours.
const CATEGORY_ACCENT: Record<CalendarCategory, string> = {
    orders: 'bg-blue-600',
    maintenance: 'bg-amber-500',
    meetings: 'bg-violet-600',
    tasks: 'bg-emerald-600',
};

type StatusVariant = 'active' | 'approved' | 'info' | 'warning' | 'danger' | 'neutral';
const STATUS_VARIANT: Record<string, StatusVariant> = {
    BOOKED: 'info',
    COMPLETED: 'active',
    CANCELLED: 'danger',
    AVAILABLE: 'neutral',
    PENDING: 'warning',
    IN_PROGRESS: 'approved',
};

const statusLabel = (status?: string | null) =>
    status ? t(`calendar.detail.statusValues.${status}`) : null;
const periodLabel = (period?: string | null) =>
    period ? t(`calendar.detail.periodValues.${period}`) : null;

const DetailRow = ({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) => (
    <div className="flex items-start gap-3 py-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">{icon}</span>
        <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-0.5 text-[13px] font-medium text-slate-800">{children}</div>
        </div>
    </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="border-t border-slate-100 pt-3">
        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
        {children}
    </div>
);

export const EventDetailModal = ({
    event,
    onClose,
    onOpenFull,
}: {
    event: CalendarEvent | null;
    onClose: () => void;
    onOpenFull: (event: CalendarEvent) => void;
}) => {
    // The detail payload is fetched lazily when the drawer opens — the calendar
    // list no longer carries it, so only the clicked appointment is loaded.
    const [detail, setDetail] = useState<EventDetail | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!event?.loadDetail) {
            setDetail(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setDetail(null);
        event.loadDetail()
            .then((result) => { if (!cancelled) setDetail(result); })
            .catch(() => { if (!cancelled) setDetail(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [event]);

    const category = event?.category;

    const headTitle =
        category === 'maintenance'
            ? t('calendar.detail.maintenanceTitle')
            : category === 'meetings'
                ? t('calendar.meetings', { defaultValue: 'Toplantılar' })
                : category === 'tasks'
                    ? t('calendar.tasks', { defaultValue: 'Görevler' })
                    : t('calendar.detail.appointmentTitle');
    const status = detail?.status;
    const variant = status ? STATUS_VARIANT[status] ?? 'neutral' : 'neutral';

    const when = event
        ? event.allDay
            ? event.start.format('dddd, DD MMMM YYYY')
            : `${event.start.format('dddd, DD MMMM YYYY')} · ${event.start.format('HH:mm')}–${event.end.format('HH:mm')}`
        : '';

    return (
        <Drawer
            open={Boolean(event)}
            onClose={onClose}
            placement="right"
            size={480}
            title={
                <div>
                    <div className="text-lg font-semibold">{event?.title || headTitle}</div>
                    <p className="mt-1 text-sm font-normal text-slate-400">{headTitle}</p>
                </div>
            }
            // Full-bleed footer: the "Go to Item" bar spans the panel edge-to-edge,
            // its bottom flush with the page while the top corners stay rounded.
            footer={event?.navigateTo ? (
                <button
                    type="button"
                    onClick={() => onOpenFull(event)}
                    className="flex w-full items-center justify-center gap-2 rounded-t-xl bg-blue-600 py-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                    {t('calendar.detail.goToItem')}
                    <ArrowRight size={16} />
                </button>
            ) : undefined}
            styles={{
                body: { padding: '24px' },
                header: { borderBottom: '1px solid #f1f5f9' },
                footer: { padding: 0, border: 'none' },
            }}
        >
            {event && loading && (
                <div className="space-y-3" aria-busy="true">
                    <div className="h-5 w-24 animate-pulse rounded bg-slate-100" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                    <div className="h-px bg-slate-100" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                    <div className="h-px bg-slate-100" />
                    <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                    <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                </div>
            )}
            {event && !loading && detail && (
                <div className="space-y-3">
                    {/* Status + schedule */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${CATEGORY_ACCENT[event.category]}`} />
                        {status && <StatusChip variant={variant}>{statusLabel(status)}</StatusChip>}
                    </div>

                    <DetailRow icon={<Calendar size={16} />} label={t('calendar.detail.when')}>
                        <span className="capitalize">{when}</span>
                    </DetailRow>

                    {/* Customer */}
                    {(detail.customerName || detail.customerEmail || detail.customerPhone || detail.customerAddress) && (
                        <Section title={t('calendar.detail.customer')}>
                            {detail.customerName && (
                                <DetailRow icon={<Building size={16} />} label={t('calendar.detail.customer')}>{detail.customerName}</DetailRow>
                            )}
                            {detail.customerEmail && (
                                <DetailRow icon={<Mail size={16} />} label={t('calendar.detail.email')}>
                                    <a href={`mailto:${detail.customerEmail}`} className="text-blue-600 hover:underline">{detail.customerEmail}</a>
                                </DetailRow>
                            )}
                            {detail.customerPhone && (
                                <DetailRow icon={<Phone size={16} />} label={t('calendar.detail.phone')}>
                                    <a href={`tel:${detail.customerPhone}`} className="text-blue-600 hover:underline">{detail.customerPhone}</a>
                                </DetailRow>
                            )}
                            {detail.customerAddress && (
                                <DetailRow icon={<MapPin size={16} />} label={t('calendar.detail.address')}>{detail.customerAddress}</DetailRow>
                            )}
                        </Section>
                    )}

                    {/* Participants / technicians */}
                    <Section title={t('calendar.detail.participants')}>
                        {detail.participants.length === 0 ? (
                            <p className="py-1 text-[13px] text-slate-400">{t('calendar.detail.noParticipants')}</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {detail.participants.map((person, index) => (
                                    <ParticipantRow key={person.id || `${person.name}-${index}`} person={person} />
                                ))}
                            </ul>
                        )}
                    </Section>

                    {/* Order / project details */}
                    {event.category === 'orders' && (detail.projectName || detail.orderNumber || detail.tenderNumber || detail.manager || detail.orderTotal != null) && (
                        <Section title={t('calendar.detail.project')}>
                            {detail.projectName && (
                                <DetailRow icon={<Briefcase size={16} />} label={t('calendar.detail.project')}>{localizeTenderNumbersInText(detail.projectName)}</DetailRow>
                            )}
                            {detail.orderNumber && (
                                <DetailRow icon={<Hash size={16} />} label={t('calendar.detail.order')}>
                                    {t('calendar.order', { number: localizeTenderNumbersInText(detail.orderNumber) })}
                                    {chf(detail.orderTotal) ? <span className="ml-1 text-slate-500">· {chf(detail.orderTotal)}</span> : null}
                                </DetailRow>
                            )}
                            {detail.tenderNumber && (
                                <DetailRow icon={<FileText size={16} />} label={t('calendar.detail.offer')}>{localizeTenderNumber(detail.tenderNumber)}</DetailRow>
                            )}
                            {detail.manager && (
                                <DetailRow icon={<User size={16} />} label={t('calendar.detail.manager')}>{detail.manager}</DetailRow>
                            )}
                        </Section>
                    )}

                    {/* Maintenance / contract details */}
                    {event.category === 'maintenance' && (detail.contractTitle || detail.contractCode || detail.siteName || detail.period) && (
                        <Section title={t('calendar.detail.contract')}>
                            {detail.contractTitle && (
                                <DetailRow icon={<FileText size={16} />} label={t('calendar.detail.contract')}>
                                    {detail.contractTitle}
                                    {detail.contractCode ? <span className="ml-1 text-slate-500">· {detail.contractCode}</span> : null}
                                </DetailRow>
                            )}
                            {detail.siteName && (
                                <DetailRow icon={<MapPin size={16} />} label={t('calendar.detail.site')}>{detail.siteName}</DetailRow>
                            )}
                            {periodLabel(detail.period) && (
                                <DetailRow icon={<Tag size={16} />} label={t('calendar.detail.period')}>{periodLabel(detail.period)}</DetailRow>
                            )}
                        </Section>
                    )}

                    {/* Notes */}
                    {detail.notes && (
                        <Section title={t('calendar.detail.notes')}>
                            <p className="whitespace-pre-wrap text-[13px] text-slate-700">{detail.notes}</p>
                        </Section>
                    )}
                </div>
            )}
        </Drawer>
    );
};

const ParticipantRow = ({ person }: { person: Participant }) => (
    <li className="flex items-center gap-3 rounded-lg bg-slate-50 px-2.5 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
            <User size={16} />
        </span>
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-slate-800">{person.name}</span>
                <span className="shrink-0 rounded-full bg-white px-1.5 py-px text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                    {t(`calendar.detail.tag.${person.tag}`)}
                </span>
            </div>
            {(person.email || person.phone) && (
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                    {person.email && <a href={`mailto:${person.email}`} className="hover:text-blue-600">{person.email}</a>}
                    {person.phone && <a href={`tel:${person.phone}`} className="hover:text-blue-600">{person.phone}</a>}
                </div>
            )}
        </div>
    </li>
);
