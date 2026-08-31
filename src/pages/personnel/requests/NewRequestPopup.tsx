import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { PopupButton, PopupCard, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { DateField } from '@/components/ui-shared/DateField';
import { personnelApi, personnelHrApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import '@/styles/personnel.css';

import type { LeaveEntitlement, LeaveTypeKey, RequestTypeKey } from '../types/personnel';
import { useApprovers, useShiftPlan } from '../hooks/usePersonnel';
import { countWorkdaysInRange, parseDateOnly } from '../utils/personnel';
import { formatLeaveDays, fullName, toInputDate } from '../utils/format';

/**
 * ── NEUER ANTRAG (26.08.2026, Vorgabe Samet) ─────────────────────────────────
 *
 * EIN Formular für alle vier Arten — «Urlaub, Homeoffice, Krankheit,
 * Sonstiges» —, weil sie denselben Weg gehen und dieselben Felder brauchen.
 * Bis hierher waren Urlaub und Homeoffice zwei Reiter auf einer eigenen Seite;
 * dass Homeoffice die Buchhaltung überspringt, ist ein Unterschied im WEG, kein
 * Grund für ein zweites Formular.
 *
 * DER JAHRESURLAUB ZEIGT DAS KONTO. Wer Urlaub beantragt, will vor dem
 * Abschicken wissen, wie viele Tage ihm noch zustehen — sonst reicht er einen
 * Antrag ein, den die Buchhaltung gleich wieder zurückgibt. Die Zahl kommt aus
 * derselben Rechnung, die auch auf der Personenseite steht.
 *
 * Die Arbeitstage im gewählten Zeitraum werden schon hier gezählt, mit
 * DERSELBEN Funktion, mit der der Server sie gleich speichert.
 */

/* NUR NOCH DREI ARTEN (Vorgabe 27.08.2026: «Abwesenheit ist keine
   Antragsart») — eine Abwesenheit wird nicht beantragt, sondern von der
   Verwaltung MANUELL erfasst (Abwesenheitsfenster). Der Server kennt
   'OTHER' weiterhin: der Nachtrag legt genau solche Zeilen an. */
const REQUEST_TYPE_ORDER: RequestTypeKey[] = ['VACATION', 'REMOTE', 'SICK'];

const INPUT_CLASS = 'ofi-cal-input w-full';

export const NewRequestPopup = ({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}) => {
    const myId = useAuthStore((state) => state.user?.id ?? '');
    const { approvers, loading: approversLoading } = useApprovers();
    const { plan } = useShiftPlan();

    const [requestType, setRequestType] = useState<RequestTypeKey>('VACATION');
    const [sickType, setSickType] = useState<LeaveTypeKey>('SICK_SHORT');
    const [startDate, setStartDate] = useState(toInputDate(new Date()));
    const [endDate, setEndDate] = useState(toInputDate(new Date()));
    const [approverId, setApproverId] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [entitlement, setEntitlement] = useState<LeaveEntitlement | null>(null);

    /* Das eigene Urlaubskonto — nur beim Jahresurlaub geholt, und nur, solange
       das Fenster offen ist. Ein Fehler bleibt still: das Konto ist eine Hilfe,
       kein Tor. Der Server rechnet ohnehin selbst nach. */
    useEffect(() => {
        if (!open || requestType !== 'VACATION' || !myId) return;
        let cancelled = false;
        personnelHrApi.leaveYear(myId, new Date().getFullYear())
            .then((year) => { if (!cancelled) setEntitlement(year.entitlement); })
            .catch(() => { if (!cancelled) setEntitlement(null); });
        return () => { cancelled = true; };
    }, [open, requestType, myId]);

    const workdays = useMemo(() => {
        const start = parseDateOnly(startDate);
        const end = parseDateOnly(endDate);
        if (!start || !end || end < start) return 0;
        return countWorkdaysInRange(start, end, plan.workdays);
    }, [startDate, endDate, plan.workdays]);

    const overBudget = requestType === 'VACATION'
        && entitlement != null
        && workdays > entitlement.remainingDays;

    const leaveTypeOf = (): LeaveTypeKey => {
        if (requestType === 'SICK') return sickType;
        if (requestType === 'REMOTE') return 'REMOTE_WORK';
        return 'ANNUAL_PAID';
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
        setSaving(true);
        try {
            await personnelApi.createLeave({
                requestType,
                kind: requestType === 'REMOTE' ? 'REMOTE' : 'LEAVE',
                leaveType: leaveTypeOf(),
                startDate,
                endDate,
                approverId,
                note: note.trim() || undefined,
            });
            toast.success(t('personnel.requests.submitted'));
            setNote('');
            onCreated();
            onClose();
        } catch (error) {
            toast.error(
                (error as { response?: { data?: { error?: string } } })?.response?.data?.error
                || t('personnel.leave.submitFailed'),
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <PopupCard
            open={open}
            onClose={onClose}
            title={t('personnel.requests.newTitle')}
            subtitle={t('personnel.requests.newSubtitle')}
            width={640}
            footer={(
                <>
                    <PopupButton onClick={onClose} disabled={saving}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" onClick={() => void submit()} loading={saving}>
                        {t('personnel.leave.submit')}
                    </PopupButton>
                </>
            )}
        >
            <div className="flex flex-col gap-4">
                {/* DIE ART ist die erste Entscheidung und deshalb kein Auswahlfeld,
                    sondern vier Knöpfe: sie sagt, welche Felder darunter kommen. */}
                <PopupField label={t('personnel.requests.type')} required>
                    <div className="ofi-req-typerow">
                        {REQUEST_TYPE_ORDER.map((key) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={requestType === key}
                                onClick={() => setRequestType(key)}
                                className={`ofi-req-typebtn ${requestType === key ? 'is-active' : ''}`}
                            >
                                {t(`personnel.requestType.${key}`)}
                            </button>
                        ))}
                    </div>
                </PopupField>

                {requestType === 'VACATION' && entitlement && (
                    <PopupNote tone={overBudget ? 'warning' : 'neutral'}>
                        {t('personnel.requests.balanceLine', {
                            remaining: formatLeaveDays(entitlement.remainingDays),
                            earned: formatLeaveDays(entitlement.earnedDays),
                            used: formatLeaveDays(entitlement.usedDays),
                        })}
                        {overBudget && ` — ${t('personnel.requests.overBudget')}`}
                    </PopupNote>
                )}

                {requestType === 'SICK' && (
                    <PopupField label={t('personnel.field.leaveType')} required>
                        <SelectMenu
                            value={sickType}
                            onChange={(next) => setSickType(next as LeaveTypeKey)}
                            ariaLabel={t('personnel.field.leaveType')}
                            options={[
                                { value: 'SICK_SHORT', label: t('personnel.leaveType.SICK_SHORT') },
                                { value: 'SICK_LONG', label: t('personnel.leaveType.SICK_LONG') },
                            ]}
                        />
                    </PopupField>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                    <PopupField label={t('personnel.filter.startDate')} required>
                        <DateField
                            value={startDate}
                            onChange={(next) => {
                                if (!next) return;
                                setStartDate(next);
                                // Ein Ende vor dem Beginn ist nie gewollt — es wandert mit.
                                if (next > endDate) setEndDate(next);
                            }}
                            ariaLabel={t('personnel.filter.startDate')}
                            buttonClassName={INPUT_CLASS}
                        />
                    </PopupField>
                    <PopupField label={t('personnel.filter.endDate')} required>
                        <DateField
                            value={endDate}
                            onChange={(next) => { if (next) setEndDate(next); }}
                            min={startDate}
                            ariaLabel={t('personnel.filter.endDate')}
                            buttonClassName={INPUT_CLASS}
                        />
                    </PopupField>
                </div>

                <PopupField
                    label={t('personnel.leave.approver')}
                    hint={t('personnel.leave.approverHint')}
                    required
                >
                    <SelectMenu
                        value={approverId}
                        onChange={setApproverId}
                        ariaLabel={t('personnel.leave.approver')}
                        placeholder={approversLoading ? t('common.loading') : t('personnel.leave.approverPlaceholder')}
                        listWidth={300}
                        options={approvers.map((person) => ({
                            value: person.id,
                            label: fullName(person),
                            hint: person.staffNumber != null ? `#${person.staffNumber}` : undefined,
                        }))}
                    />
                </PopupField>

                <PopupField label={t('personnel.field.note')}>
                    <textarea
                        rows={3}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder={t('personnel.leave.notePlaceholder')}
                        className={INPUT_CLASS}
                    />
                </PopupField>

                <p className="ofi-req-foot">
                    <span className="ofi-req-foot__days">
                        {t('personnel.leave.workdayCount', { count: workdays })}
                    </span>
                    <span>
                        {requestType === 'REMOTE'
                            ? t('personnel.leave.remoteFlowHint')
                            : t('personnel.leave.flowHint')}
                    </span>
                </p>
            </div>
        </PopupCard>
    );
};
