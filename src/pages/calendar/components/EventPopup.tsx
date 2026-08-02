import { useEffect, useState } from 'react';

import { CalendarPlus01, Mail01, MarkerPin01, Phone, User01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { SheetShell } from './shells';
import { dotClass, type CalEvent, type CalEventDetail, type CalStatus } from '../calendarShared';

const STATUS_LABEL_KEY: Record<CalStatus, string> = {
    planned: 'calendar.status.planned',
    done: 'calendar.status.done',
    cancelled: 'calendar.status.cancelled',
    meeting: 'calendar.status.meeting',
    maintenance: 'calendar.status.maintenance',
};

const STATUS_BADGE: Record<CalStatus, string> = {
    planned: 'border-[#101e6e]/25 bg-[#101e6e]/[0.07] text-[#101e6e] dark:border-[#8fa2ff]/30 dark:bg-[#8fa2ff]/10 dark:text-[#b9c5ff]',
    done: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
    cancelled: 'border-slate-200 bg-slate-50 text-slate-400 line-through dark:border-white/15 dark:bg-white/5 dark:text-white/40',
    meeting: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300',
    maintenance: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300',
};

const Row = ({ label, value }: { label: string; value?: string | null }) => {
    if (!value) return null;
    return (
        <div className="flex items-baseline gap-3 py-1">
            <span className="w-32 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{label}</span>
            <span className="min-w-0 flex-1 text-[13px] text-slate-800 dark:text-white/90">{value}</span>
        </div>
    );
};

/* Detail popup for a clicked calendar entry. Loads the heavy payload lazily so
   the grid stays light; a past appointment offers "plan a new appointment". */
export const EventPopup = ({ event, onClose, onNavigate, onCreateFrom, canCreate = true }: {
    event: CalEvent | null;
    onClose: () => void;
    onNavigate: (event: CalEvent) => void;
    onCreateFrom: (event: CalEvent) => void;
    canCreate?: boolean;
}) => {
    const [detail, setDetail] = useState<CalEventDetail | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setDetail(null);
        if (!event?.loadDetail) return;
        let cancelled = false;
        setLoading(true);
        event.loadDetail()
            .then((payload) => { if (!cancelled) setDetail(payload); })
            .catch(() => { if (!cancelled) setDetail(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!event) return null;

    const sameDay = event.start.isSame(event.end, 'day');
    const when = sameDay
        ? `${event.start.format('DD MMMM YYYY, dddd')} · ${event.start.format('HH:mm')} – ${event.end.format('HH:mm')}`
        : `${event.start.format('DD MMM YYYY HH:mm')} – ${event.end.format('DD MMM YYYY HH:mm')}`;

    return (
        <SheetShell
            open
            onClose={onClose}
            title={(
                <span className="flex items-center gap-2">
                    <span className={dotClass(event.status)} />
                    <span className="truncate">{event.title}</span>
                </span>
            )}
            subtitle={when}
            width={640}
            height="min(560px, 85vh)"
            headerActions={(
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[event.status]}`}>
                    {t(STATUS_LABEL_KEY[event.status])}
                </span>
            )}
            footer={(
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {event.category === 'appointments' && canCreate && (
                        <button
                            type="button"
                            onClick={() => onCreateFrom(event)}
                            className="flex h-9 items-center gap-1.5 rounded-md border border-[#E3E7F0] bg-white px-3.5 text-[12.5px] font-semibold text-[#07145c] transition-colors hover:bg-[#F7F8FC] dark:border-white/10 dark:bg-white/6 dark:text-[#d48f16] dark:hover:bg-white/10"
                        >
                            <CalendarPlus01 size={14} />
                            {t('calendar.detail.newAppointment')}
                        </button>
                    )}
                    {event.navigateTo && (
                        <button
                            type="button"
                            onClick={() => onNavigate(event)}
                            className="h-9 rounded-md bg-[#07145c] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c]"
                        >
                            {t('calendar.detail.goToItem')}
                        </button>
                    )}
                </div>
            )}
        >
            <div className="px-5 py-4">
                {event.subtitle && <div className="pb-2 text-[13px] font-semibold text-slate-600 dark:text-white/70">{event.subtitle}</div>}

                {loading && (
                    <div className="space-y-2 py-2">
                        {[0, 1, 2].map((row) => <div key={row} className="ofi-shimmer h-5 rounded bg-slate-100 dark:bg-white/5" />)}
                    </div>
                )}

                {!loading && detail && (
                    <div className="space-y-4">
                        <div>
                            <Row label={t('calendar.detail.customer')} value={detail.customerName} />
                            <Row label={t('calendar.detail.project')} value={detail.projectName} />
                            <Row label={t('calendar.detail.order')} value={detail.orderNumber} />
                            <Row label={t('calendar.detail.offer')} value={detail.tenderNumber} />
                            <Row label={t('calendar.detail.manager')} value={detail.manager} />
                            <Row label={t('calendar.detail.contract')} value={detail.contractTitle ? `${detail.contractTitle}${detail.contractCode ? ` (${detail.contractCode})` : ''}` : null} />
                            <Row label={t('calendar.detail.site')} value={detail.siteName} />
                            <Row label={t('calendar.detail.period')} value={detail.period} />
                            <Row label={t('calendar.detail.notes')} value={detail.notes} />
                        </div>

                        {(detail.customerEmail || detail.customerPhone || detail.customerAddress) && (
                            <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
                                <div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.detail.contact')}</div>
                                <div className="space-y-1 text-[12.5px] text-slate-700 dark:text-white/80">
                                    {detail.customerEmail && <div className="flex items-center gap-2"><Mail01 size={13} className="text-slate-400" />{detail.customerEmail}</div>}
                                    {detail.customerPhone && <div className="flex items-center gap-2"><Phone size={13} className="text-slate-400" />{detail.customerPhone}</div>}
                                    {detail.customerAddress && <div className="flex items-center gap-2"><MarkerPin01 size={13} className="text-slate-400" />{detail.customerAddress}</div>}
                                </div>
                            </div>
                        )}

                        {detail.participants.length > 0 && (
                            <div>
                                <div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.detail.participants')}</div>
                                <div className="space-y-1">
                                    {detail.participants.map((person) => (
                                        <div key={person.id || person.name} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
                                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#07145c]/8 text-[#07145c] dark:bg-[#d48f16]/12 dark:text-[#d48f16]">
                                                <User01 size={13} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-white/90">{person.name}</span>
                                                <span className="block truncate text-[11px] text-slate-500 dark:text-white/50">
                                                    {[person.role, person.email, person.phone].filter(Boolean).join(' · ') || '—'}
                                                </span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(detail.ccEmails || []).length > 0 && (
                            <div>
                                <div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.detail.cc')}</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {(detail.ccEmails || []).map((email) => (
                                        <span key={email} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11.5px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
                                            {email}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {!loading && !detail && !event.loadDetail && (
                    <div className="py-4 text-[13px] text-slate-400 dark:text-white/40">{t('calendar.detail.noDetail')}</div>
                )}
            </div>
        </SheetShell>
    );
};
