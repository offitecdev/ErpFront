import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Send01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import type { LeaveKind, LeaveTypeKey } from './types/personnel';
import { useApprovers, useLanguageTick, useLeaveRequests, useShiftPlan } from './hooks/usePersonnel';
import { LeaveList } from './components/LeaveList';
import { CELL_INPUT_CLASS, Labelled, PersonnelTopTabs, PrimaryButton, SectionCard } from './components/primitives';
import { formatDate, fullName, leaveTypeLabel, toInputDate } from './utils/format';
import { LEAVE_TYPES, LEAVE_TYPE_LABEL_MAX, countWorkdaysInRange, parseDateOnly, requiresLeaveTypeLabel } from './utils/personnel';

/**
 * ── ANTRAG STELLEN ───────────────────────────────────────────────────────────
 *
 * Drei Reiter oben (Vorgabe): Urlaub, Homeoffice und die eigenen Anträge. Der
 * Homeoffice-Antrag ist AUSDRÜCKLICH ein eigener Reiter und kein Häkchen im
 * Urlaubsformular — er läuft einen anderen Weg:
 *
 *   Urlaub      → Vorgesetzter → Buchhaltung → bewilligt
 *   Homeoffice  → Vorgesetzter → bewilligt   (die Buchhaltung sieht ihn nie)
 *
 * MOBILE TAUGLICHKEIT ist Vorgabe: eine Spalte auf dem Telefon, zwei ab Tablet,
 * Datumsfelder sind native `type="date"`-Felder — sie öffnen auf jedem Gerät den
 * eingebauten Kalender UND lassen sich von Hand tippen, ohne dass dafür eine
 * eigene Kalenderbibliothek geladen werden müsste.
 *
 * Die Arbeitstage im gewählten Zeitraum werden hier schon gezeigt, mit
 * DERSELBEN Funktion, mit der der Server sie gleich speichert.
 */

type TabKey = 'leave' | 'remote' | 'mine';

/* Abkürzungen für das Freitextfeld — die Arten, die erfahrungsgemäss am
   häufigsten getippt werden. Sie sind eine VORSCHLAGSLISTE, keine Auswahl:
   das Feld nimmt jeden Text an. */
const LEAVE_TYPE_SUGGESTION_KEYS = ['annual', 'unpaid', 'special', 'training'] as const;

export const LeaveRequestPage = () => {
    useLanguageTick();
    const [searchParams, setSearchParams] = useSearchParams();
    const rawTab = searchParams.get('tab');
    const tab: TabKey = rawTab === 'remote' || rawTab === 'mine' ? rawTab : 'leave';

    const { approvers, loading: approversLoading } = useApprovers();
    const { plan } = useShiftPlan();
    const mine = useLeaveRequests('mine');

    // „Sonstiger Urlaub" ist die Vorauswahl: der Jahresurlaub läuft darüber
    // und ist damit der häufigste Fall.
    const [leaveType, setLeaveType] = useState<LeaveTypeKey>('OTHER');
    const [leaveTypeText, setLeaveTypeText] = useState('');
    const [startDate, setStartDate] = useState(toInputDate(new Date()));
    const [endDate, setEndDate] = useState(toInputDate(new Date()));
    const [approverId, setApproverId] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const kind: LeaveKind = tab === 'remote' ? 'REMOTE' : 'LEAVE';
    const needsLeaveTypeText = kind === 'LEAVE' && requiresLeaveTypeLabel(leaveType);

    const workdays = useMemo(() => {
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        if (!start || !end || end < start) return 0;
        return countWorkdaysInRange(start, end, plan.workdays);
    }, [startDate, endDate, plan.workdays]);

    const setTab = (next: string) => {
        const params = new URLSearchParams(searchParams);
        params.set('tab', next);
        setSearchParams(params, { replace: true });
    };

    const submit = async () => {
        if (!approverId) {
            toast.error(t('personnel.leave.approverRequired'));
            return;
        }
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        if (!start || !end || end < start) {
            toast.error(t('personnel.leave.rangeInvalid'));
            return;
        }
        // Ohne den Freitext stünde beim Buchhaltungs-Rapport nur „Sonstiger
        // Urlaub" — der Server weist den Antrag dann ohnehin ab.
        if (needsLeaveTypeText && !leaveTypeText.trim()) {
            toast.error(t('personnel.leave.leaveTypeTextRequired'));
            return;
        }
        setSaving(true);
        try {
            await personnelApi.createLeave({
                kind,
                // Homeoffice trägt seine eigene Art; die Auswahl oben gilt nur
                // für den Urlaubsreiter.
                leaveType: kind === 'REMOTE' ? 'REMOTE_WORK' : leaveType,
                ...(needsLeaveTypeText ? { leaveTypeLabel: leaveTypeText.trim() } : {}),
                startDate,
                endDate,
                approverId,
                note: note.trim() || undefined,
            });
            toast.success(kind === 'REMOTE' ? t('personnel.leave.remoteSubmitted') : t('personnel.leave.submitted'));
            setNote('');
            setLeaveTypeText('');
            mine.reload();
            setTab('mine');
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('personnel.leave.submitFailed'));
        } finally {
            setSaving(false);
        }
    };

    const form = (
        <SectionCard title={kind === 'REMOTE' ? t('personnel.leave.remoteFormTitle') : t('personnel.leave.formTitle')}>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
                {kind === 'LEAVE' && (
                    <Labelled label={t('personnel.field.leaveType')} required className="sm:col-span-2">
                        <select
                            value={leaveType}
                            onChange={(event) => setLeaveType(event.target.value as LeaveTypeKey)}
                            className={CELL_INPUT_CLASS}
                        >
                            {LEAVE_TYPES.map((key) => (
                                <option key={key} value={key}>{leaveTypeLabel(key)}</option>
                            ))}
                        </select>
                    </Labelled>
                )}

                {/* „Sonstiger Urlaub" wird selbst benannt — der Jahresurlaub
                    läuft seit dem 16.08.2026 hierüber (Vorgabe). Der Text ist
                    das, was später in Rapport und PDF als Urlaubsart steht.
                    Die Vorschlagsliste ist nur eine Abkürzung; getippt werden
                    darf alles. */}
                {kind === 'LEAVE' && needsLeaveTypeText && (
                    <Labelled
                        label={t('personnel.leave.leaveTypeText')}
                        hint={t('personnel.leave.leaveTypeTextHint')}
                        required
                        className="sm:col-span-2"
                    >
                        <input
                            value={leaveTypeText}
                            onChange={(event) => setLeaveTypeText(event.target.value)}
                            maxLength={LEAVE_TYPE_LABEL_MAX}
                            list="personnel-leave-type-suggestions"
                            placeholder={t('personnel.leave.leaveTypeTextPlaceholder')}
                            className={CELL_INPUT_CLASS}
                        />
                        <datalist id="personnel-leave-type-suggestions">
                            {LEAVE_TYPE_SUGGESTION_KEYS.map((key) => (
                                <option key={key} value={t(`personnel.leave.leaveTypeSuggestion.${key}`)} />
                            ))}
                        </datalist>
                    </Labelled>
                )}

                <Labelled label={t('personnel.filter.startDate')} required>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(event) => {
                            setStartDate(event.target.value);
                            // Ein Ende vor dem Beginn ist nie gewollt — es wandert mit.
                            if (event.target.value > endDate) setEndDate(event.target.value);
                        }}
                        className={CELL_INPUT_CLASS}
                    />
                </Labelled>
                <Labelled label={t('personnel.filter.endDate')} required>
                    <input
                        type="date"
                        min={startDate}
                        value={endDate}
                        onChange={(event) => setEndDate(event.target.value)}
                        className={CELL_INPUT_CLASS}
                    />
                </Labelled>

                <Labelled
                    label={t('personnel.leave.approver')}
                    hint={t('personnel.leave.approverHint')}
                    required
                    className="sm:col-span-2"
                >
                    <select
                        value={approverId}
                        onChange={(event) => setApproverId(event.target.value)}
                        className={CELL_INPUT_CLASS}
                    >
                        <option value="">
                            {approversLoading ? t('common.loading') : t('personnel.leave.approverPlaceholder')}
                        </option>
                        {approvers.map((person) => (
                            <option key={person.id} value={person.id}>{fullName(person)}</option>
                        ))}
                    </select>
                </Labelled>

                <Labelled label={t('personnel.field.note')} className="sm:col-span-2">
                    <textarea
                        rows={3}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder={t('personnel.leave.notePlaceholder')}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[13.5px] text-slate-800 outline-none transition-colors hover:border-slate-300 focus:border-[#1f2654] dark:border-white/15 dark:bg-transparent dark:text-white"
                    />
                </Labelled>

                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
                    <p className="text-[12.5px] text-slate-500 dark:text-white/60">
                        {formatDate(startDate)} – {formatDate(endDate)}
                        {' · '}
                        <span className="font-semibold text-slate-800 dark:text-white">
                            {t('personnel.leave.workdayCount', { count: workdays })}
                        </span>
                    </p>
                    <PrimaryButton icon={<Send01 size={14} />} onClick={() => void submit()} disabled={saving}>
                        {saving ? t('common.loading') : t('personnel.leave.submit')}
                    </PrimaryButton>
                </div>

                <p className="sm:col-span-2 text-[11.5px] leading-relaxed text-slate-400 dark:text-white/45">
                    {kind === 'REMOTE' ? t('personnel.leave.remoteFlowHint') : t('personnel.leave.flowHint')}
                </p>
            </div>
        </SectionCard>
    );

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader title={t('personnel.leave.title')} />

            <PersonnelTopTabs
                activeKey={tab}
                onChange={setTab}
                items={[
                    { key: 'leave', label: t('personnel.leave.tabLeave') },
                    { key: 'remote', label: t('personnel.leave.tabRemote') },
                    { key: 'mine', label: t('personnel.leave.tabMine') },
                ]}
            />

            {tab === 'mine' ? (
                <LeaveList
                    rows={mine.rows}
                    loading={mine.loading}
                    emptyText={t('personnel.leave.mineEmpty')}
                    showRequester={false}
                />
            ) : form}
        </div>
    );
};
