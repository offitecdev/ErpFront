import { useMemo, useState } from 'react';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { useLanguageTick, useLeaveCounts, useLeaveRequests } from './hooks/usePersonnel';
import { LeaveList } from './components/LeaveList';
import { PersonnelTopTabs } from './components/primitives';

/**
 * ── URLAUBSANTRÄGE (POSTFACH DER FREIGEBENDEN PERSON) ────────────────────────
 *
 * Hier landet, was BEI MIR eingereicht wurde — Urlaub wie Homeoffice. Ein Ja
 * schickt einen Urlaubsantrag weiter in die Buchhaltung; ein Homeoffice-Antrag
 * ist damit fertig, und die Person gilt für den Zeitraum als „im Homeoffice"
 * (die Berichte tragen ihr die Tage dann ohne Scan als voll gearbeitet ein).
 *
 * Drei Reiter: offen, alles, und die eigenen Entscheide der Vergangenheit
 * sind im „alles" enthalten — ein Postfach, das nur den Rückstand zeigt, macht
 * nachträgliches Nachschauen unmöglich.
 */
export const LeaveApprovalsPage = () => {
    useLanguageTick();
    const [tab, setTab] = useState<'open' | 'all'>('open');
    const requests = useLeaveRequests('approver');
    const counts = useLeaveCounts();

    const open = useMemo(
        () => requests.rows.filter((row) => row.status === 'PENDING_MANAGER'),
        [requests.rows],
    );

    const rows = tab === 'open' ? open : requests.rows;

    const reload = () => {
        requests.reload();
        counts.reload();
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <div>
                <InventoryListHeader title={t('personnel.approvals.title')} />
                <p className="-mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-white/60">
                    {t('personnel.approvals.description')}
                </p>
            </div>

            <PersonnelTopTabs
                activeKey={tab}
                onChange={(key) => setTab(key as 'open' | 'all')}
                items={[
                    { key: 'open', label: t('personnel.approvals.tabOpen'), badge: open.length },
                    { key: 'all', label: t('personnel.approvals.tabAll') },
                ]}
            />

            <LeaveList
                rows={rows}
                loading={requests.loading}
                emptyText={tab === 'open' ? t('personnel.approvals.emptyOpen') : t('personnel.approvals.emptyAll')}
                decidable
                decisionCopy={{
                    approveTitle: t('personnel.approvals.approveTitle'),
                    rejectTitle: t('personnel.approvals.rejectTitle'),
                }}
                onChanged={reload}
            />
        </div>
    );
};
