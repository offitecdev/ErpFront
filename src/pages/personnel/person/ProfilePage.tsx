import { useCallback, useEffect, useMemo, useState } from 'react';

import { ChevronRight, File02, FileCheck02, Plus } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { toast } from 'sonner';
import { personnelApi, personnelHrApi } from '@/lib/api/personnel';
import { passwordRequestApi } from '@/lib/api/authorization';
import { useAuthStore } from '@/store/authStore';
import { PageSkeleton } from '@/components/ui-shared/PageSkeleton';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { DateField } from '@/components/ui-shared/DateField';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { PopupCard } from '@/components/ui-shared/PopupKit';
import '@/styles/person.css';
import '@/styles/personnel.css';

import type {
    LeaveYear,
    PersonAppointment,
    PersonMeeting,
    PersonOverview,
    PersonProfile,
    PersonTask,
} from '../types/personnel';
import { useLanguageTick } from '../hooks/usePersonnel';
import { Chip, PrimaryButton } from '../components/primitives';
import {
    EMPTY_CELL,
    appointmentStatusChipClass,
    appointmentStatusLabel,
    formatDate,
    formatDateTime,
    formatFileSize,
    formatLeaveDays,
    formatTime,
    leaveStatusChipClass,
    leaveStatusLabel,
    leaveTypeLabel,
    toInputDate,
    workLocationLabel,
} from '../utils/format';
import { clampRangeEnd, maxRangeEnd, resolvePreset } from '../utils/ranges';
import { openStaffDocument } from '../utils/openStaffDocument';
import { PersonHero, type PersonTab } from './PersonHero';
import { PersonPhotoSheet } from './PersonPhotoSheet';
import { PersonAbsencesTab } from './tabs/PersonAbsencesTab';
import { PersonJumpSheet, type JumpDetail, type JumpTarget } from './PersonJumpSheet';
import { NewRequestPopup } from '../requests/NewRequestPopup';

/**
 * ── DAS EIGENE PROFIL (/profile) — Neuaufbau 27.08.2026, Vorgabe Samet ───────
 *
 * SECHS REITER: «Mein Profil» (nur Angaben), «Urlaub» (Resttage + eigene
 * Anträge + der Handgriff «Urlaub beantragen»), «Absenzen» (EIGENER Reiter —
 * Vorgabe 27.08.2026: «Urlaub und Absenzen sind getrennte Seiten», max. ein
 * Monat), «Aufgaben», «Erinnerungen» und «Termine & Besprechungen».
 *
 * AUFGABEN, ERINNERUNGEN UND TERMINE SIND KARTEN, keine Tabellen (Vorgabe:
 * «Knopf-Karten-Form, moderner, mit Kästen») — ein Klick auf eine Karte öffnet
 * das Detailfenster. Gefiltert wird NUR über den Zeitraum, höchstens ein
 * Monat, vorbelegt mit dem laufenden.
 *
 * E-MAIL UND KENNWORTWUNSCH stehen hier (vom abgeschafften Reiter «Zugang»
 * der Personalseite hergezogen), ebenso die Liste der sichtbaren Firmen.
 */

type TabKey = 'profile' | 'leave' | 'absences' | 'tasks' | 'reminders' | 'agenda';

const CARD_INPUT = 'ofi-cal-input ofi-pf-input';

/* ── Zeitraumfilter: Von/Bis, höchstens ein Monat ──────────────────────────── */
const useMonthFilter = () => {
    const initial = resolvePreset('thisMonth');
    const [from, setFrom] = useState(initial.startDate);
    const [to, setTo] = useState(initial.endDate);
    const setStart = (next: string) => {
        if (!next) return;
        setFrom(next);
        setTo((current) => clampRangeEnd(next, current));
    };
    const setEnd = (next: string) => { if (next) setTo(clampRangeEnd(from, next)); };
    return { from, to, setStart, setEnd };
};

const RangeFilter = ({
    filter,
}: {
    filter: ReturnType<typeof useMonthFilter>;
}) => (
    <div className="flex flex-wrap items-end gap-2.5">
        <label className="ofi-req-filter" style={{ maxWidth: 170 }}>
            <span>{t('personnel.filter.startDate')}</span>
            <DateField
                value={filter.from}
                onChange={filter.setStart}
                ariaLabel={t('personnel.filter.startDate')}
                buttonClassName={CARD_INPUT}
            />
        </label>
        <label className="ofi-req-filter" style={{ maxWidth: 170 }}>
            <span>{t('personnel.filter.endDate')}</span>
            <DateField
                value={filter.to}
                onChange={filter.setEnd}
                min={filter.from}
                max={maxRangeEnd(filter.from)}
                ariaLabel={t('personnel.filter.endDate')}
                buttonClassName={CARD_INPUT}
            />
        </label>
        <span className="pb-1 text-[11px] text-slate-400 dark:text-white/45">
            {t('personnel.filter.maxMonthHint')}
        </span>
    </div>
);

/** Liegt der Stichtag im Zeitraum? Undatiertes bleibt IMMER sichtbar. */
const inRange = (value: string | null | undefined, from: string, to: string): boolean => {
    if (!value) return true;
    const key = toInputDate(value);
    return key >= from && key <= to;
};

/* ── Die Kartenfläche ──────────────────────────────────────────────────────── */
const CardGrid = ({ children }: { children: React.ReactNode }) => (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
);

const ItemCard = ({
    title,
    lines,
    chip,
    onClick,
}: {
    title: string;
    lines: string[];
    chip?: React.ReactNode;
    onClick: () => void;
}) => (
    <button type="button" onClick={onClick} className="ofi-me-card">
        <span className="flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 truncate text-[13px] font-semibold text-slate-800 dark:text-white">
                {title || EMPTY_CELL}
            </span>
            {chip}
        </span>
        {lines.filter(Boolean).map((line) => (
            <span key={line} className="block truncate text-[11.5px] text-slate-500 dark:text-white/55">
                {line}
            </span>
        ))}
    </button>
);

const EmptyNote = ({ text }: { text: string }) => (
    <p className="px-1 py-8 text-center text-[12.5px] text-slate-400 dark:text-white/45">{text}</p>
);

const taskStatusChip = (status: string): string => {
    if (status === 'DONE') return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30';
    if (status === 'INCOMPLETE') return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30';
    return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30';
};

export const ProfilePage = () => {
    useLanguageTick();
    const myId = useAuthStore((state) => state.user?.id ?? '');
    const tenants = useAuthStore((state) => state.tenants);

    const [tab, setTab] = useState<TabKey>('profile');
    const [overview, setOverview] = useState<PersonOverview | null>(null);
    const [profile, setProfile] = useState<PersonProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [photoOpen, setPhotoOpen] = useState(false);
    const [composing, setComposing] = useState(false);

    const load = useCallback(() => {
        if (!myId) return;
        setLoading(true);
        /* Zwei Aufrufe NEBENEINANDER — und jeder darf für sich scheitern. */
        Promise.allSettled([
            personnelApi.staffOverview(myId),
            personnelHrApi.profile(myId),
        ])
            .then(([overviewResult, profileResult]) => {
                if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
                if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
            })
            .finally(() => setLoading(false));
    }, [myId]);

    useEffect(load, [load]);

    if (loading && !overview) return <PageSkeleton />;
    if (!overview) {
        // Kein Zurückwerfen: es gibt keine Liste, auf die man zurückfiele.
        return (
            <div className="flex w-full flex-col items-center gap-3 py-16">
                <p className="text-[13px] text-slate-500 dark:text-white/60">{t('personnel.person.loadFailed')}</p>
                <button
                    type="button"
                    onClick={load}
                    className="rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                >
                    {t('common.retry')}
                </button>
            </div>
        );
    }

    const { person } = overview;
    /* Urlaub und Absenzen sind GETRENNTE Reiter (Vorgabe 27.08.2026) — wie
       auf der Personalseite. */
    const tabs: PersonTab[] = [
        { key: 'profile', label: t('personnel.profilePage.tabProfile') },
        { key: 'leave', label: t('personnel.profilePage.tabLeave') },
        { key: 'absences', label: t('personnel.profilePage.tabAbsences') },
        { key: 'tasks', label: t('personnel.profilePage.tabTasks') },
        { key: 'reminders', label: t('personnel.profilePage.tabReminders') },
        { key: 'agenda', label: t('personnel.profilePage.tabAgenda') },
    ];

    return (
        <div className="ofi-person ofi-profile flex w-full flex-col gap-4">
            <PersonHero
                person={person}
                tabs={tabs}
                activeKey={tab}
                onTab={(key) => setTab(key as TabKey)}
                canEditPhoto
                onEditPhoto={() => setPhotoOpen(true)}
                action={(
                    <PrimaryButton icon={<Plus size={14} />} onClick={() => setComposing(true)}>
                        {t('personnel.profilePage.requestLeave')}
                    </PrimaryButton>
                )}
            />

            {tab === 'profile' && (
                <MyProfileTab person={person} profile={profile} tenants={tenants} onChanged={load} />
            )}
            {tab === 'leave' && (
                <MyLeaveTab
                    myId={myId}
                    hireDate={person.hireDate}
                    overview={overview}
                    onRequestLeave={() => setComposing(true)}
                />
            )}
            {tab === 'absences' && (
                <PersonAbsencesTab employeeId={myId} hireDate={person.hireDate} />
            )}
            {tab === 'tasks' && <MyTasksTab tasks={overview.tasks} kind="task" />}
            {tab === 'reminders' && <MyTasksTab tasks={overview.tasks} kind="reminder" />}
            {tab === 'agenda' && (
                <MyAgendaTab appointments={overview.appointments ?? []} meetings={overview.meetings} />
            )}

            <PersonPhotoSheet
                open={photoOpen}
                employeeId={person.id}
                name={`${person.firstName} ${person.lastName}`.trim() || person.email}
                initials={`${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase()}
                current={person.profilePictureUrl}
                onClose={() => setPhotoOpen(false)}
                onSaved={(photo) => setOverview((current) => (
                    current ? { ...current, person: { ...current.person, profilePictureUrl: photo } } : current
                ))}
            />

            <NewRequestPopup
                open={composing}
                onClose={() => setComposing(false)}
                onCreated={load}
            />
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Reiter «Mein Profil» — nur Angaben, dazu E-Mail/Kennwortwunsch und die
   sichtbaren Firmen (vom abgeschafften Zugangs-Reiter hergezogen).
   ═══════════════════════════════════════════════════════════════════════════ */

const ReadRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
            {label}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-slate-800 dark:text-white/85">
            {value || EMPTY_CELL}
        </span>
    </div>
);

const MyProfileTab = ({
    person,
    profile,
    tenants,
    onChanged,
}: {
    person: PersonOverview['person'];
    profile: PersonProfile | null;
    tenants: Array<{ id: string; tenantName: string }>;
    onChanged: () => void;
}) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [requestNote, setRequestNote] = useState('');
    const [requesting, setRequesting] = useState(false);

    const documents = profile
        ? [...(profile.contract ? [profile.contract] : []), ...profile.documents]
        : [];

    const submitPasswordRequest = async () => {
        if (!currentPassword || !newPassword) {
            toast.error(t('personnel.person.passwordBothRequired'));
            return;
        }
        try {
            setRequesting(true);
            const result = await passwordRequestApi.submit({
                currentPassword,
                newPassword,
                note: requestNote.trim() || undefined,
            });
            setCurrentPassword('');
            setNewPassword('');
            setRequestNote('');
            toast.success(result.applied ? t('personnel.person.passwordChanged') : t('personnel.person.passwordRequested'));
            onChanged();
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : t('personnel.person.passwordRequestFailed'));
        } finally {
            setRequesting(false);
        }
    };

    return (
        <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-4">
                <SectionCard title={t('personnel.person.masterData')}>
                    <div className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2">
                        <ReadRow label={t('personnel.field.email')} value={person.email} />
                        <ReadRow label={t('personnel.person.phone')} value={person.phone} />
                        <ReadRow label={t('personnel.person.jobTitle')} value={person.title} />
                        <ReadRow
                            label={t('personnel.person.hireDate')}
                            value={person.hireDate ? formatDate(person.hireDate) : ''}
                        />
                        <ReadRow label={t('personnel.field.staffNumber')} value={person.staffNumber ?? ''} />
                        <ReadRow label={t('personnel.field.workLocation')} value={workLocationLabel(person.workLocation)} />
                        <ReadRow label={t('settings.roles.colRole')} value={person.roleName ?? t('personnel.person.noRole')} />
                    </div>
                </SectionCard>

                {/* ── SICHTBARE FIRMEN ─────────────────────────────────────── */}
                <SectionCard title={t('personnel.person.companies')}>
                    <div className="flex flex-wrap gap-1.5 p-4">
                        {tenants.length === 0 ? (
                            <span className="text-[12.5px] text-slate-400 dark:text-white/45">{EMPTY_CELL}</span>
                        ) : tenants.map((tenant) => (
                            <span key={tenant.id} className="ofi-pf-chip is-active">{tenant.tenantName}</span>
                        ))}
                    </div>
                </SectionCard>

                {/* ── KENNWORT ÄNDERN — als Wunsch an die Verwaltung ───────── */}
                <SectionCard title={t('personnel.person.changePassword')}>
                    <div className="flex flex-col gap-3 p-4">
                        <p className="text-[11.5px] text-slate-500 dark:text-white/55">
                            {t('personnel.person.changePasswordApproval')}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <input
                                type="password"
                                value={currentPassword}
                                autoComplete="current-password"
                                placeholder={t('personnel.person.currentPassword')}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                                className={`${CARD_INPUT} w-full`}
                            />
                            <input
                                type="password"
                                value={newPassword}
                                autoComplete="new-password"
                                placeholder={t('personnel.person.newPassword')}
                                onChange={(event) => setNewPassword(event.target.value)}
                                className={`${CARD_INPUT} w-full`}
                            />
                        </div>
                        <input
                            value={requestNote}
                            onChange={(event) => setRequestNote(event.target.value)}
                            placeholder={t('personnel.person.requestNotePlaceholder')}
                            className={`${CARD_INPUT} w-full`}
                        />
                        <div className="flex justify-end">
                            <PrimaryButton disabled={requesting} onClick={() => void submitPasswordRequest()}>
                                {t('personnel.person.requestPassword')}
                            </PrimaryButton>
                        </div>
                    </div>
                </SectionCard>
            </div>

            {/* ── UNTERLAGEN — Arbeitsvertrag und Dokumente, nur öffnen. ───── */}
            <SectionCard title={t('personnel.profile.documents', { count: documents.length })}>
                {documents.length === 0 ? (
                    <EmptyNote text={t('personnel.profile.documentsEmpty')} />
                ) : (
                    <ul className="list-none">
                        {documents.map((row) => (
                            <li
                                key={row.id}
                                className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 dark:border-white/10"
                            >
                                <File02 size={16} className="shrink-0 text-slate-400" />
                                <button
                                    type="button"
                                    onClick={() => void openStaffDocument(row)}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <span className="block truncate text-[13px] font-medium text-slate-800 underline-offset-2 hover:underline dark:text-white">
                                        {row.title}
                                        {row.kind === 'CONTRACT' && (
                                            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                                {t('personnel.profile.contract')}
                                            </span>
                                        )}
                                    </span>
                                    <span className="block truncate text-[11.5px] text-slate-400 dark:text-white/45">
                                        {row.fileName} · {formatFileSize(row.sizeBytes)} · {formatDate(row.createdAt)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Reiter «Urlaub & Absenzen» — Resttage gross, Absenzen mit Zeitraumfilter,
   die eigenen Anträge darunter. Nur Angaben; der Handgriff ist der eine Knopf.
   ═══════════════════════════════════════════════════════════════════════════ */

const yearOptionsFrom = (hireDate: string | null): number[] => {
    const current = new Date().getFullYear();
    const hired = hireDate ? new Date(hireDate).getFullYear() : current;
    const first = Number.isFinite(hired) ? Math.min(hired, current) : current;
    const years: number[] = [];
    for (let year = current; year >= first && years.length < 12; year -= 1) years.push(year);
    return years;
};

/** Kachel im Stil der Karten — Klick öffnet das Fenster. */
const OpenTile = ({
    icon,
    label,
    count,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    count: number;
    onClick: () => void;
}) => (
    <button type="button" onClick={onClick} className="ofi-me-card">
        <span className="flex w-full items-center gap-3">
            <span className="ofi-pf-upload__icon">{icon}</span>
            <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-white">{label}</span>
                <span className="block text-[11.5px] text-slate-500 dark:text-white/55">
                    {t('personnel.leaveYear.tileCount', { count })}
                </span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-slate-300 dark:text-white/30" />
        </span>
    </button>
);

const MyLeaveTab = ({
    myId,
    hireDate,
    overview,
    onRequestLeave,
}: {
    myId: string;
    hireDate: string | null;
    overview: PersonOverview;
    onRequestLeave: () => void;
}) => {
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [data, setData] = useState<LeaveYear | null>(null);
    const [loading, setLoading] = useState(true);
    const [popup, setPopup] = useState<'requests' | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        personnelHrApi.leaveYear(myId, year)
            .then((value) => { if (!cancelled) setData(value); })
            .catch(() => { if (!cancelled) setData(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [myId, year]);

    const entitlement = data?.entitlement ?? null;

    return (
        <div className="ofi-ly flex flex-col gap-4">
            <SectionCard
                title={t('personnel.profilePage.leaveTitle', { year })}
                action={(
                    <span className="flex items-center gap-2">
                        <SelectMenu
                            value={String(year)}
                            onChange={(next) => setYear(Number(next))}
                            ariaLabel={t('personnel.leaveYear.year')}
                            className="w-24"
                            listWidth={104}
                            buttonClassName={CARD_INPUT}
                            options={yearOptionsFrom(hireDate).map((value) => ({ value: String(value), label: String(value) }))}
                        />
                        <PrimaryButton icon={<Plus size={13} />} onClick={onRequestLeave}>
                            {t('personnel.profilePage.requestLeave')}
                        </PrimaryButton>
                    </span>
                )}
            >
                {loading && !data ? (
                    <div className="ofi-shimmer m-4 h-24 rounded-lg" />
                ) : entitlement ? (
                    <div className="ofi-ly-stats">
                        <div className="ofi-ly-stat is-strong">
                            <span className="ofi-ly-stat__value">{formatLeaveDays(entitlement.remainingDays)}</span>
                            <span className="ofi-ly-stat__label">{t('personnel.leaveYear.remaining')}</span>
                        </div>
                        <div className="ofi-ly-stat">
                            <span className="ofi-ly-stat__value">{formatLeaveDays(entitlement.earnedDays)}</span>
                            <span className="ofi-ly-stat__label">{t('personnel.leaveYear.earned')}</span>
                        </div>
                        <div className="ofi-ly-stat">
                            <span className="ofi-ly-stat__value">{formatLeaveDays(entitlement.usedDays)}</span>
                            <span className="ofi-ly-stat__label">{t('personnel.leaveYear.used')}</span>
                        </div>
                        <div className="ofi-ly-stat">
                            <span className="ofi-ly-stat__value">{formatLeaveDays(entitlement.pendingDays)}</span>
                            <span className="ofi-ly-stat__label">{t('personnel.leaveYear.pending')}</span>
                        </div>
                    </div>
                ) : (
                    <EmptyNote text={t('personnel.leaveYear.loadFailed')} />
                )}
            </SectionCard>

            {/* ── DIE ANTRÄGE ALS KACHEL mit Fenster (Vorgabe: «anklickbare
                Pop-ups, keine Aufklappmenüs»). Absenzen sind ein EIGENER
                Reiter. ─────────────────────────────────────────────────── */}
            <div className="grid gap-2.5 sm:grid-cols-2">
                <OpenTile
                    icon={<FileCheck02 size={16} />}
                    label={t('personnel.requests.tab.mine')}
                    count={overview.leaves.length}
                    onClick={() => setPopup('requests')}
                />
            </div>

            {/* ── FENSTER: DIE EIGENEN ANTRÄGE ─────────────────────────────── */}
            <PopupCard
                open={popup === 'requests'}
                onClose={() => setPopup(null)}
                title={t('personnel.requests.tab.mine')}
                width={640}
                closeOnOutside
            >
                {overview.leaves.length === 0 ? (
                    <EmptyNote text={t('personnel.person.noLeaves')} />
                ) : (
                    <ul className="list-none">
                        {overview.leaves.map((leave) => (
                            <li
                                key={leave.id}
                                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-1 py-2.5 last:border-b-0 dark:border-white/10"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-white">
                                        {leaveTypeLabel(leave.leaveType, leave.leaveTypeLabel)}
                                    </span>
                                    <span className="font-mono text-[12px] text-slate-500 dark:text-white/60">
                                        {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
                                        {' · '}
                                        {t('personnel.leaveFlag.days', { count: leave.totalDays })}
                                    </span>
                                </span>
                                <Chip className={leaveStatusChipClass(leave.status)}>
                                    {leaveStatusLabel(leave.status)}
                                </Chip>
                            </li>
                        ))}
                    </ul>
                )}
            </PopupCard>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Reiter «Aufgaben» und «Erinnerungen» — zwei getrennte Kartenflächen aus
   derselben Quelle, gefiltert über den Stichtag. Klick → Detailfenster.
   ═══════════════════════════════════════════════════════════════════════════ */

const MyTasksTab = ({ tasks, kind }: { tasks: PersonTask[]; kind: 'task' | 'reminder' }) => {
    const filter = useMonthFilter();
    const [selected, setSelected] = useState<PersonTask | null>(null);

    const rows = useMemo(() => tasks
        .filter((task) => (kind === 'reminder' ? task.kind === 'REMINDER' : task.kind !== 'REMINDER'))
        .filter((task) => inRange(task.dueDate ?? task.createdAt, filter.from, filter.to)), [tasks, kind, filter.from, filter.to]);

    const details: JumpDetail[] = selected ? [
        { label: t('personnel.person.colTitle'), value: selected.title },
        { label: t('personnel.person.colCustomer'), value: selected.customerName ?? '' },
        { label: t('personnel.person.colDue'), value: selected.dueDate ? formatDate(selected.dueDate) : '' },
        { label: t('common.status'), value: t(`personnel.person.taskStatus.${selected.status}`) },
        { label: t('personnel.field.createdAt'), value: formatDateTime(selected.createdAt) },
    ] : [];

    const targets: JumpTarget[] = selected ? [
        {
            key: 'board',
            label: kind === 'reminder' ? t('personnel.profilePage.jumpReminders') : t('personnel.profilePage.jumpTasks'),
            to: kind === 'reminder' ? '/crm/reminders' : '/crm/tasks',
        },
    ] : [];

    return (
        <SectionCard
            title={kind === 'reminder'
                ? t('personnel.profilePage.remindersTitle', { count: rows.length })
                : t('personnel.profilePage.tasksTitle', { count: rows.length })}
        >
            <div className="flex flex-col gap-3 p-4">
                <RangeFilter filter={filter} />
                {rows.length === 0 ? (
                    <EmptyNote text={t('personnel.person.noTasks')} />
                ) : (
                    <CardGrid>
                        {rows.map((task) => (
                            <ItemCard
                                key={task.id}
                                title={task.title}
                                lines={[
                                    task.customerName ?? '',
                                    task.dueDate ? `${t('personnel.person.colDue')}: ${formatDate(task.dueDate)}` : '',
                                ]}
                                chip={(
                                    <Chip className={taskStatusChip(task.status)}>
                                        {t(`personnel.person.taskStatus.${task.status}`)}
                                    </Chip>
                                )}
                                onClick={() => setSelected(task)}
                            />
                        ))}
                    </CardGrid>
                )}
            </div>

            <PersonJumpSheet
                open={Boolean(selected)}
                title={selected?.title || ''}
                details={details}
                targets={targets}
                onClose={() => setSelected(null)}
            />
        </SectionCard>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Reiter «Termine & Besprechungen» — beide als Karten, gefiltert über den
   Zeitraum; Klick → Detailfenster mit den Wegen in die Bereiche.
   ═══════════════════════════════════════════════════════════════════════════ */

type AgendaSelection =
    | { mode: 'appointment'; appointment: PersonAppointment }
    | { mode: 'meeting'; meeting: PersonMeeting };

const MyAgendaTab = ({
    appointments,
    meetings,
}: {
    appointments: PersonAppointment[];
    meetings: PersonMeeting[];
}) => {
    const filter = useMonthFilter();
    const [selected, setSelected] = useState<AgendaSelection | null>(null);

    const shownAppointments = useMemo(() => appointments
        .filter((appointment) => inRange(appointment.startTime, filter.from, filter.to))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)), [appointments, filter.from, filter.to]);
    const shownMeetings = useMemo(() => meetings
        .filter((meeting) => inRange(meeting.startTime, filter.from, filter.to))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)), [meetings, filter.from, filter.to]);

    const details: JumpDetail[] = !selected ? [] : selected.mode === 'appointment'
        ? [
            {
                label: t('personnel.person.colWhen'),
                value: `${formatDateTime(selected.appointment.startTime)} – ${formatTime(selected.appointment.endTime)}`,
            },
            { label: t('personnel.person.colProject'), value: selected.appointment.projectName ?? selected.appointment.projectNumber ?? '' },
            { label: t('personnel.person.colCustomer'), value: selected.appointment.customerName ?? '' },
            { label: t('common.status'), value: appointmentStatusLabel(selected.appointment.status) },
            { label: t('personnel.person.colNotes'), value: selected.appointment.notes ?? '' },
        ]
        : [
            {
                label: t('personnel.person.colWhen'),
                value: `${formatDateTime(selected.meeting.startTime)} – ${formatTime(selected.meeting.endTime)}`,
            },
            { label: t('personnel.person.colCustomer'), value: selected.meeting.customerName ?? '' },
            {
                label: t('personnel.person.colRoleInMeeting'),
                value: selected.meeting.isOwner ? t('personnel.person.owner') : t('personnel.person.participant'),
            },
            { label: t('personnel.person.colNotes'), value: selected.meeting.notes ?? '' },
        ];

    const targets: JumpTarget[] = !selected ? [] : selected.mode === 'appointment'
        ? [
            ...(selected.appointment.projectId ? [{
                key: 'project',
                label: t('personnel.person.jumpProject'),
                hint: [selected.appointment.projectNumber, selected.appointment.projectName].filter(Boolean).join(' · ') || undefined,
                to: `/projects/${selected.appointment.projectId}`,
            }] : []),
            ...(selected.appointment.customerId ? [{
                key: 'customer',
                label: t('personnel.person.jumpCustomer'),
                hint: selected.appointment.customerName ?? undefined,
                to: `/crm/customers/${selected.appointment.customerId}`,
            }] : []),
            { key: 'calendar', label: t('personnel.person.jumpCalendar'), to: '/calendar' },
        ]
        : [
            { key: 'calendar', label: t('personnel.person.jumpCalendar'), to: '/calendar' },
            ...(selected.meeting.customerId ? [{
                key: 'customer',
                label: t('personnel.person.jumpCustomer'),
                hint: selected.meeting.customerName ?? undefined,
                to: `/crm/customers/${selected.meeting.customerId}`,
            }] : []),
        ];

    return (
        <div className="flex flex-col gap-4">
            <SectionCard title={t('personnel.profilePage.agendaTitle', { count: shownAppointments.length + shownMeetings.length })}>
                <div className="flex flex-col gap-3 p-4">
                    <RangeFilter filter={filter} />

                    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                        {t('personnel.person.tabAppointments')}
                    </span>
                    {shownAppointments.length === 0 ? (
                        <EmptyNote text={t('personnel.person.noAppointments')} />
                    ) : (
                        <CardGrid>
                            {shownAppointments.map((appointment) => (
                                <ItemCard
                                    key={appointment.id}
                                    title={appointment.projectNumber || appointment.projectName || t('personnel.person.noProject')}
                                    lines={[
                                        `${formatDateTime(appointment.startTime)} – ${formatTime(appointment.endTime)}`,
                                        appointment.customerName ?? '',
                                    ]}
                                    chip={(
                                        <Chip className={appointmentStatusChipClass(appointment.status)}>
                                            {appointmentStatusLabel(appointment.status)}
                                        </Chip>
                                    )}
                                    onClick={() => setSelected({ mode: 'appointment', appointment })}
                                />
                            ))}
                        </CardGrid>
                    )}

                    <span className="mt-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                        {t('personnel.person.tabMeetings')}
                    </span>
                    {shownMeetings.length === 0 ? (
                        <EmptyNote text={t('personnel.person.noMeetings')} />
                    ) : (
                        <CardGrid>
                            {shownMeetings.map((meeting) => (
                                <ItemCard
                                    key={meeting.id}
                                    title={meeting.title}
                                    lines={[
                                        `${formatDateTime(meeting.startTime)} – ${formatTime(meeting.endTime)}`,
                                        meeting.customerName ?? '',
                                    ]}
                                    chip={(
                                        <Chip className={meeting.isOwner
                                            ? 'bg-[#eef2fb] text-[#1f2654] ring-[#c9d5f0] dark:bg-white/10 dark:text-white/80 dark:ring-white/15'
                                            : 'bg-slate-50 text-slate-500 ring-slate-200 dark:bg-white/5 dark:text-white/55 dark:ring-white/10'}>
                                            {meeting.isOwner ? t('personnel.person.owner') : t('personnel.person.participant')}
                                        </Chip>
                                    )}
                                    onClick={() => setSelected({ mode: 'meeting', meeting })}
                                />
                            ))}
                        </CardGrid>
                    )}
                </div>
            </SectionCard>

            <PersonJumpSheet
                open={Boolean(selected)}
                title={!selected
                    ? ''
                    : selected.mode === 'appointment'
                        ? (selected.appointment.projectNumber || selected.appointment.projectName || t('personnel.person.tabAppointments'))
                        : (selected.meeting.title || t('personnel.person.tabMeetings'))}
                details={details}
                targets={targets}
                onClose={() => setSelected(null)}
            />
        </div>
    );
};
