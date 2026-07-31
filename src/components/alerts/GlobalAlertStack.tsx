import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Building03, Calendar, Clock, User01, X } from '@/components/icons/antIconCompat';
import { notificationApi } from '../../lib/api/notifications';
import { meetingApi, meetingParticipantName, type MeetingActivityDto } from '../../lib/api/meetings';
import { onIdle } from '../../lib/utils/onIdle';

interface AlertRow {
    icon: React.ReactNode;
    text: string;
}

interface AlertItem {
    id: string;
    tone: 'rose' | 'violet' | 'emerald' | 'amber';
    icon: React.ReactNode;
    tagKey: string;
    tagDefault: string;
    title: string;
    rows: AlertRow[];
    navigateTo?: string;
}

interface GlobalAlertStackProps {
    /** Reports how many alerts are live, so the bell badge can include them. */
    onCountChange: (count: number) => void;
    /** Called after alerts were archived into the notification list. */
    onArchived: () => void;
}


const SNOOZE_KEY = 'globalAlerts.snooze.v1';
const SNOOZE_MS = 10 * 24 * 60 * 60 * 1000;

const APP_OPENED_AT = Date.now();

const readSnoozes = (): Record<string, number> => {
    try {
        const parsed = JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const TONE: Record<AlertItem['tone'], { card: string; chip: string }> = {
    rose: {
        card: 'from-rose-300/40 to-rose-400/55 dark:from-rose-400/25 dark:to-rose-500/35',
        chip: 'bg-rose-500/15 text-rose-800 dark:bg-rose-400/20 dark:text-rose-100',
    },
    amber: {
        card: 'from-amber-300/40 to-amber-400/55 dark:from-amber-400/25 dark:to-amber-500/35',
        chip: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-100',
    },
    violet: {
        card: 'from-violet-300/40 to-violet-400/55 dark:from-violet-400/25 dark:to-violet-500/35',
        chip: 'bg-violet-500/15 text-violet-800 dark:bg-violet-400/20 dark:text-violet-100',
    },
    emerald: {
        card: 'from-emerald-300/40 to-emerald-400/55 dark:from-emerald-400/25 dark:to-emerald-500/35',
        chip: 'bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-100',
    },
};

/**
 * App-level page-turn alert deck, TOP-RIGHT, mounted once in MainLayout: shows
 * urgent items (imminent meetings & tasks) when the
 * app opens. X flips the card away and snoozes that alert for 10 days; the
 * live count is mirrored onto the notification bell badge.
 */
export const GlobalAlertStack: React.FC<GlobalAlertStackProps> = ({ onCountChange, onArchived }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [meetings, setMeetings] = useState<MeetingActivityDto[]>([]);
    const [snoozes, setSnoozes] = useState<Record<string, number>>(readSnoozes);
    // Cards the user flipped away this session — keeps the "x / y" counter's
    // total stable while the live alert list shrinks.
    const [dismissedCount, setDismissedCount] = useState(0);

    // This app-level component must not fetch whole business collections. Offer
    // alerts previously loaded every tender and every sales order on every page,
    // including inventory. Keep only the small, time-bounded meeting request;
    // offer data is loaded by CRM pages when those pages are actually opened.
    useEffect(() => {
        let cancelled = false;
        const cancelIdle = onIdle(() => {
            if (cancelled) return;
            meetingApi
                .list(dayjs().subtract(1, 'hour').toISOString(), dayjs().add(24, 'hour').toISOString())
                .then((rows) => !cancelled && setMeetings(Array.isArray(rows) ? rows : []))
                .catch(() => undefined);
        }, 4000);
        return () => {
            cancelled = true;
            cancelIdle();
        };
    }, []);

    const alerts = useMemo<AlertItem[]>(() => {
        const active = (id: string) => !(snoozes[id] && APP_OPENED_AT - snoozes[id] < SNOOZE_MS);
        const out: AlertItem[] = [];

        for (const meeting of meetings) {
            const id = `meeting-${meeting.id}`;
            if (!active(id)) continue;
            const isTask = meeting.kind === 'TASK';
            const start = dayjs(meeting.startTime);
            const rows: AlertRow[] = [
                { icon: <Clock size={13} />, text: `${start.format('DD MMM · HH:mm')} – ${dayjs(meeting.endTime).format('HH:mm')}` },
            ];
            if (meeting.customer?.companyName) rows.push({ icon: <Building03 size={13} />, text: meeting.customer.companyName });
            const people = meeting.participants.map(meetingParticipantName).filter(Boolean);
            if (people.length) {
                rows.push({
                    icon: <User01 size={13} />,
                    text: people.length > 2 ? `${people.slice(0, 2).join(', ')} +${people.length - 2}` : people.join(', '),
                });
            }
            out.push({
                id,
                tone: isTask ? 'emerald' : 'violet',
                icon: isTask ? <Clock size={15} /> : <Calendar size={15} />,
                tagKey: isTask ? 'crmOverview.alerts.taskSoon' : 'crmOverview.alerts.meetingSoon',
                tagDefault: isTask ? 'Görev hatırlatması' : 'Toplantı hatırlatması',
                title: meeting.title,
                rows,
                navigateTo: '/calendar',
            });
        }

        return out;
    }, [meetings, snoozes]);

    useEffect(() => {
        onCountChange(alerts.length);
    }, [alerts.length, onCountChange]);

    const snooze = (ids: string[]) => {
        setSnoozes((cur) => {
            const next = { ...cur };
            const stamp = Date.now();
            ids.forEach((id) => {
                next[id] = stamp;
            });
            try {
                localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
            } catch {
                /* snoozing is best-effort */
            }
            return next;
        });
    };

    // Archive one alert into the notification list, then flip the card away.
    const archive = (alert: AlertItem, asRead = false) =>
        notificationApi
            .create({
                title: `${t(alert.tagKey, { defaultValue: alert.tagDefault })}: ${alert.title}`,
                message: alert.rows.map((r) => r.text).join(' · '),
                type: 'ALERT',
                linkUrl: alert.navigateTo || null,
                isRead: asRead,
            })
            .catch(() => undefined);

    const dismiss = (alert: AlertItem) => {
        setDismissedCount((count) => count + 1);
        snooze([alert.id]);
        // Closing a card is an acknowledgement — archive it read so the bell
        // badge drops instead of trading an alert for a fresh unread.
        void archive(alert, true).then(onArchived);
    };

    // The big circle below the deck: archive everything as read + mark the whole
    // notification list read in one tap.
    const dismissAll = () => {
        const all = [...alerts];
        setDismissedCount((count) => count + all.length);
        snooze(all.map((a) => a.id));
        void Promise.all(all.map((a) => archive(a, true)))
            .then(() => notificationApi.markAllRead().catch(() => undefined))
            .then(onArchived);
    };

    // Deck total = live alerts + cards dismissed this session. Deriving it from
    // the dismiss actions (rather than "largest deck seen") keeps transient
    // over-counts out: while the sales orders are still loading, offers briefly
    // look "not converted" and the deck can spike far above its settled size.
    const deckTotal = alerts.length + dismissedCount;

    if (alerts.length === 0) return null;
    const visible = alerts.slice(0, 3);

    return (
        // Pinned to the very top right, right under the bell — the notification corner.
        <div className="pointer-events-none fixed right-3 top-[68px] z-50 flex w-[320px] flex-col items-center">
            <div className="relative h-[210px] w-full">
            <AnimatePresence>
                {visible.map((alert, index) => {
                    const tone = TONE[alert.tone];
                    return (
                        <motion.div
                            key={alert.id}
                            initial={{ opacity: 0, y: -24, rotate: -2 }}
                            animate={{
                                opacity: 1,
                                y: index * 10,
                                x: index * 6,
                                scale: 1 - index * 0.05,
                                rotate: 0,
                                zIndex: 10 - index,
                            }}
                            // "Page turn": the dismissed card lifts, rotates and slides away.
                            exit={{ opacity: 0, x: 140, rotate: 10, transition: { duration: 0.28, ease: 'easeIn' } }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            style={{ transformOrigin: 'top right' }}
                            className={`pointer-events-auto absolute inset-0 flex flex-col rounded-2xl bg-gradient-to-b p-4 ring-1 ring-white/45 backdrop-blur-xl backdrop-saturate-150 dark:ring-white/15 ${tone.card}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <span className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide ${tone.chip}`}>
                                    {alert.icon}
                                    {t(alert.tagKey, { defaultValue: alert.tagDefault })}
                                </span>
                                <button
                                    type="button"
                                    aria-label={t('common.close', { defaultValue: 'Kapat' })}
                                    onClick={() => dismiss(alert)}
                                    className="flex size-7 items-center justify-center rounded-lg text-[#1A1A1A]/60 transition-colors hover:bg-white/40 hover:text-[#1A1A1A] dark:text-white/70 dark:hover:bg-white/15 dark:hover:text-white"
                                >
                                    <X size={15} />
                                </button>
                            </div>

                            <p className="mt-2.5 line-clamp-1 text-[14.5px] font-bold leading-snug text-[#101322] dark:text-white">
                                {alert.title}
                            </p>
                            <div className="mt-1.5 flex flex-col gap-1">
                                {alert.rows.slice(0, 3).map((row, i) => (
                                    <p key={i} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#101322]/75 dark:text-white/75">
                                        <span className="shrink-0 opacity-70">{row.icon}</span>
                                        <span className="truncate tabular-nums">{row.text}</span>
                                    </p>
                                ))}
                            </div>

                            <div className="mt-auto flex items-center justify-between">
                                {alert.navigateTo ? (
                                    <button
                                        type="button"
                                        onClick={() => navigate(alert.navigateTo!)}
                                        className="flex items-center gap-1 rounded-lg bg-white/50 px-2.5 py-1.5 text-[12px] font-bold text-[#101322] transition-colors hover:bg-white/75 dark:bg-white/15 dark:text-white dark:hover:bg-white/25"
                                    >
                                        {t('crmOverview.alerts.open', { defaultValue: 'Aç' })}
                                        <ArrowRight size={13} />
                                    </button>
                                ) : (
                                    <span />
                                )}
                                <span className="text-[11px] font-semibold tabular-nums text-[#101322]/50 dark:text-white/50">
                                    {deckTotal > 1 ? `${alerts.length} / ${deckTotal}` : ''}
                                </span>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
            </div>

            {/* Big clear-all circle: archives every card and marks notifications read. */}
            <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25, duration: 0.25, ease: 'easeOut' }}
                onClick={dismissAll}
                title={t('crmOverview.alerts.clearAll', { defaultValue: 'Tümünü kapat ve okundu say' })}
                aria-label={t('crmOverview.alerts.clearAll', { defaultValue: 'Tümünü kapat ve okundu say' })}
                className="pointer-events-auto mt-4 flex size-14 items-center justify-center rounded-full bg-white/70 text-[#101322]/70 ring-1 ring-white/60 backdrop-blur-xl backdrop-saturate-150 transition-colors hover:bg-white/90 hover:text-[#101322] dark:bg-white/10 dark:text-white/80 dark:ring-white/15 dark:hover:bg-white/20 dark:hover:text-white"
            >
                <X size={26} />
            </motion.button>
        </div>
    );
};
