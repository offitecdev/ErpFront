import { useMemo, useState } from 'react';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { useLanguageTick, useLeaveRequests, usePersonnelMe } from './hooks/usePersonnel';
import { LeaveList } from './components/LeaveList';
import { PersonnelTopTabs } from './components/primitives';

/**
 * ── EINGEHENDE ANTRÄGE (BUCHHALTUNG) ─────────────────────────────────────────
 *
 * Die ZWEITE Stufe des Urlaubsweges und eine eigene Seite (Vorgabe). Hier steht
 * NUR, was der Vorgesetzte bereits durchgelassen hat — vorher erfährt die
 * Buchhaltung von einem Antrag nichts, und ohne ihr Ja ist er nicht bewilligt.
 *
 * Homeoffice-Anträge erscheinen hier NIE: sie sind mit der Freigabe des
 * Vorgesetzten abgeschlossen (Vorgabe). Der Server filtert sie schon weg; die
 * Seite verlässt sich nicht darauf, sondern sagt es im Hinweis auch dem Leser.
 *
 * Die Urlaubsarten sind für die Buchhaltung sichtbar (Vorgabe) — sie stehen auf
 * jeder Karte, weil bezahlter Jahresurlaub, Krankheit unter drei Tagen und
 * Krankheit ab drei Tagen lohnseitig verschieden behandelt werden.
 */
export const IncomingRequestsPage = () => {
    useLanguageTick();
    const [tab, setTab] = useState<'open' | 'all'>('open');
    const { me, loading: meLoading } = usePersonnelMe();
    const requests = useLeaveRequests('accounting');

    const open = useMemo(
        () => requests.rows.filter((row) => row.status === 'PENDING_ACCOUNTING'),
        [requests.rows],
    );

    // Wer die Buchhaltungsrolle nicht trägt, bekommt vom Server ohnehin eine
    // Abweisung — hier steht dafür ein verständlicher Satz statt einer leeren
    // Liste, die wie ein Fehler aussieht.
    if (!meLoading && me && me.staffRole !== 'ACCOUNTANT') {
        return (
            <div className="flex w-full flex-col gap-4">
                <InventoryListHeader title={t('personnel.incoming.title')} />
                <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-[13px] text-slate-500 dark:border-white/20 dark:text-white/60">
                    {t('personnel.incoming.notAccountant')}
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full flex-col gap-4">
            <div>
                <InventoryListHeader title={t('personnel.incoming.title')} />
                <p className="-mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-white/60">
                    {t('personnel.incoming.description')}
                </p>
            </div>

            <PersonnelTopTabs
                activeKey={tab}
                onChange={(key) => setTab(key as 'open' | 'all')}
                items={[
                    { key: 'open', label: t('personnel.incoming.tabOpen'), badge: open.length },
                    { key: 'all', label: t('personnel.incoming.tabAll') },
                ]}
            />

            <LeaveList
                rows={tab === 'open' ? open : requests.rows}
                loading={requests.loading || meLoading}
                emptyText={tab === 'open' ? t('personnel.incoming.emptyOpen') : t('personnel.incoming.emptyAll')}
                decidable
                decisionCopy={{
                    approveTitle: t('personnel.incoming.approveTitle'),
                    rejectTitle: t('personnel.incoming.rejectTitle'),
                }}
                onChanged={requests.reload}
            />
        </div>
    );
};
