import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Save01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { personnelHrApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import '@/styles/personnel.css';
import type { LeavePolicy } from '@/pages/personnel/types/personnel';
import { DEFAULT_LEAVE_POLICY, roundHalf } from '@/pages/personnel/utils/personnel';
import { formatLeaveDays } from '@/pages/personnel/utils/format';
import { PrimaryButton } from '@/pages/personnel/components/primitives';

/**
 * ── URLAUBSANSPRUCH (Einstellungen → Module → Personal) ─────────────────────
 *
 *   «Für den Jahresurlaub soll es eine Einstellung nach der Zahl der
 *    Arbeitstage im Jahr geben: das System rechnet den Anspruch danach aus,
 *    wie viele Tage die Person bis dahin gearbeitet hat, und schreibt ihn
 *    fort, während weitere Daten anfallen; diesen Urlaub kann die Person dann
 *    verwenden.»
 *
 * ZWEI ZAHLEN UND EIN SCHALTER — mehr braucht die Regel nicht:
 *
 *   Jahresanspruch    wie viele Urlaubstage ein VOLLES Jahr ergibt.
 *   Jahresarbeitstage worauf sich dieses volle Jahr bezieht (der Nenner).
 *   Anteilig          an: der Anspruch wächst mit den geleisteten Tagen.
 *                     aus: der volle Anspruch steht ab dem 1. Januar.
 *
 *       anteilig = Jahresanspruch × geleistete Arbeitstage / Jahresarbeitstage
 *
 * DIE VORSCHAU IST DER ZWECK DIESER SEITE. Eine Formel im Kopf nachzurechnen
 * verlangt niemand; darum steht darunter, was die Regel nach einem Monat, nach
 * einem halben und nach einem ganzen Jahr ergibt — mit denselben Funktionen,
 * mit denen sie später auf der Personenseite gerechnet wird.
 */

const readError = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

export const PersonnelLeavePolicySection = () => {
    const permissions = useAuthStore((state) => state.permissions);
    const canEdit = permissions.includes('employees.update') || permissions.includes('roles.manage');

    const [policy, setPolicy] = useState<LeavePolicy>({ ...DEFAULT_LEAVE_POLICY });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        personnelHrApi.leavePolicy()
            .then((value) => { if (!cancelled) setPolicy(value); })
            .catch(() => { if (!cancelled) setPolicy({ ...DEFAULT_LEAVE_POLICY }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const patch = (next: Partial<LeavePolicy>) => setPolicy((current) => ({ ...current, ...next }));

    /* Die Vorschau: dieselbe Rechnung wie im Konto der Personenseite, nur mit
       runden Beispielzahlen statt echter Stempelungen. */
    const preview = useMemo(() => {
        const reference = Math.max(1, policy.annualWorkdays);
        const at = (workedDays: number) => {
            const accrued = policy.accrueByWorkdays
                ? policy.annualLeaveDays * Math.min(1, workedDays / reference)
                : policy.annualLeaveDays;
            return roundHalf(accrued + policy.carryOverDays);
        };
        return [
            { label: t('personnel.policy.previewMonth'), days: at(Math.round(reference / 12)) },
            { label: t('personnel.policy.previewHalf'), days: at(Math.round(reference / 2)) },
            { label: t('personnel.policy.previewYear'), days: at(reference) },
        ];
    }, [policy]);

    const save = async () => {
        setSaving(true);
        try {
            const saved = await personnelHrApi.saveLeavePolicy(policy);
            setPolicy(saved);
            toast.success(t('personnel.policy.saved'));
        } catch (error) {
            toast.error(readError(error, t('personnel.policy.saveFailed')));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="ofi-mset-card ofi-pol">
            <header>
                <h2 className="ofi-mset-cardtitle">{t('personnel.policy.title')}</h2>
                <p className="ofi-mset-cardhint">{t('personnel.policy.hint')}</p>
            </header>

            <div className="ofi-pol-grid">
                <label className="ofi-pol-field">
                    <span className="ofi-pol-label">{t('personnel.policy.annualLeaveDays')}</span>
                    <input
                        type="number"
                        min={0}
                        max={365}
                        disabled={!canEdit || loading}
                        value={policy.annualLeaveDays}
                        onChange={(event) => patch({ annualLeaveDays: Math.max(0, Number(event.target.value) || 0) })}
                        className="ofi-cal-input w-full"
                    />
                    <span className="ofi-pol-hint">{t('personnel.policy.annualLeaveDaysHint')}</span>
                </label>

                <label className="ofi-pol-field">
                    <span className="ofi-pol-label">{t('personnel.policy.annualWorkdays')}</span>
                    <input
                        type="number"
                        min={1}
                        max={366}
                        disabled={!canEdit || loading || !policy.accrueByWorkdays}
                        value={policy.annualWorkdays}
                        onChange={(event) => patch({ annualWorkdays: Math.max(1, Number(event.target.value) || 1) })}
                        className="ofi-cal-input w-full"
                    />
                    <span className="ofi-pol-hint">{t('personnel.policy.annualWorkdaysHint')}</span>
                </label>

                <label className="ofi-pol-field">
                    <span className="ofi-pol-label">{t('personnel.policy.carryOver')}</span>
                    <input
                        type="number"
                        min={0}
                        max={365}
                        disabled={!canEdit || loading}
                        value={policy.carryOverDays}
                        onChange={(event) => patch({ carryOverDays: Math.max(0, Number(event.target.value) || 0) })}
                        className="ofi-cal-input w-full"
                    />
                    <span className="ofi-pol-hint">{t('personnel.policy.carryOverHint')}</span>
                </label>

                <label className="ofi-pol-switch">
                    <input
                        type="checkbox"
                        disabled={!canEdit || loading}
                        checked={policy.accrueByWorkdays}
                        onChange={(event) => patch({ accrueByWorkdays: event.target.checked })}
                    />
                    <span>
                        <span className="ofi-pol-label">{t('personnel.policy.accrue')}</span>
                        <span className="ofi-pol-hint">{t('personnel.policy.accrueHint')}</span>
                    </span>
                </label>
            </div>

            <div className="ofi-pol-preview">
                <span className="ofi-pol-previewhead">{t('personnel.policy.previewTitle')}</span>
                <div className="ofi-pol-previewrow">
                    {preview.map((row) => (
                        <div key={row.label} className="ofi-pol-previewcell">
                            <span className="ofi-pol-previewvalue">{formatLeaveDays(row.days)}</span>
                            <span className="ofi-pol-previewlabel">{row.label}</span>
                        </div>
                    ))}
                </div>
                <p className="ofi-pol-formula">
                    {policy.accrueByWorkdays
                        ? t('personnel.policy.formula', {
                            days: formatLeaveDays(policy.annualLeaveDays),
                            workdays: policy.annualWorkdays,
                        })
                        : t('personnel.policy.formulaFull')}
                </p>
            </div>

            {canEdit && (
                <div className="ofi-pol-actions">
                    <PrimaryButton icon={<Save01 size={14} />} onClick={() => void save()} disabled={saving || loading}>
                        {saving ? t('common.loading') : t('common.save')}
                    </PrimaryButton>
                </div>
            )}
        </div>
    );
};
