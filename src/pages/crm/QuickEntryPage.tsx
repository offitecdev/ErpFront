import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell01 as Bell, Check as CheckIcon, Edit01 as NoteIcon, Phone } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { SlidingTopTabs } from '@/components/ui-shared/SlidingTopTabs';
import { QuickEntryBulkTable } from './components/QuickEntryBulkTable';
import type { QuickEntryAction } from './types/crm.types';

/**
 * Schnellerfassung — oben das gleitende Reiterband wie in der Projektansicht
 * (SlidingTopTabs mit den `ofi-quote-tab`-Klassen), darunter die Tabelle des
 * gewählten Reiters. Erfasst wird zeilenweise und mit EINEM "Speichern"
 * abgeschickt; Kunden werden in der Zelle getippt, die Trefferliste klappt
 * darunter auf — dieselbe Bedienung wie die Produktzelle im Lagermodul.
 *
 * `?action=` wählt den Reiter vor, damit sich ein Reiter verlinken lässt.
 */

const TABS: Array<{ action: QuickEntryAction; param: string; labelKey: string; Icon: typeof Phone }> = [
    { action: 'PHONE', param: 'call', labelKey: 'crm.quick.actionPhone', Icon: Phone },
    { action: 'NOTE', param: 'note', labelKey: 'crm.quick.actionNote', Icon: NoteIcon },
    { action: 'TASK', param: 'task', labelKey: 'crm.quick.actionTask', Icon: CheckIcon },
    { action: 'REMINDER', param: 'reminder', labelKey: 'crm.quick.actionReminder', Icon: Bell },
];

const actionFromParam = (raw: string | null): QuickEntryAction | null =>
    TABS.find((tab) => tab.param === raw)?.action ?? null;

const paramForAction = (action: QuickEntryAction): string =>
    TABS.find((tab) => tab.action === action)?.param ?? 'call';

export const QuickEntryPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const paramAction = actionFromParam(searchParams.get('action'));
    const [action, setAction] = useState<QuickEntryAction>(() => paramAction ?? 'PHONE');

    // Ein verlinkter Reiter (?action=…) gewinnt, solange die Adresse ihn nennt.
    useEffect(() => {
        if (paramAction) setAction(paramAction);
    }, [paramAction]);

    const pickAction = (next: QuickEntryAction) => {
        setAction(next);
        setSearchParams({ action: paramForAction(next) }, { replace: true });
    };

    const isCommunication = action === 'PHONE' || action === 'NOTE';

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader title={t('nav.crmQuickEntry')} />

            {/* Reiterband exakt wie die Projektansicht (ProjectTopNav): der
                Streifen trägt Rahmen und Überlauf, die Reiter liegen INNEN in
                einer flex-Reihe nebeneinander — die Klassen gehören auf zwei
                Ebenen, sonst stapeln sich die Reiter untereinander. */}
            <nav
                aria-label={t('nav.crmQuickEntry')}
                className="ofi-quote-tabs-strip mb-2 min-w-0 overflow-x-auto border-b border-slate-200 px-1 pt-1 md:overflow-visible dark:border-white/15"
            >
                <SlidingTopTabs activeKey={action} className="flex min-w-max items-stretch gap-1">
                    {TABS.map(({ action: key, labelKey, Icon }) => {
                        const active = key === action;
                        return (
                            <div key={key} data-tab-key={key} className="relative -mb-px shrink-0">
                                <button
                                    type="button"
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => pickAction(key)}
                                    className={`ofi-quote-tab inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-t-md border border-b-0 px-4 py-2.5 text-[12.5px] transition-colors ${active
                                        ? 'ofi-quote-tab-active border-slate-200 bg-[#eef2fb] font-bold text-[#1f2654]'
                                        : 'border-transparent font-medium text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-[#1f2654] dark:text-white/70'}`}
                                >
                                    <Icon size={13} />
                                    <span>{t(labelKey)}</span>
                                </button>
                            </div>
                        );
                    })}
                </SlidingTopTabs>
            </nav>

            {/* Reiterwechsel setzt die Tabelle neu auf (key): halb getippte Zeilen
                einer anderen Erfassungsart dürfen nicht stehen bleiben. */}
            <QuickEntryBulkTable
                key={action}
                action={action}
                onSaved={() => undefined}
            />

            {/* Verweis auf die Liste, in der die Zeilen landen: Verlauf,
                Aufgaben oder Erinnerungen — je Reiter die passende. */}
            <div>
                <button
                    type="button"
                    onClick={() => navigate(isCommunication ? '/crm/communication' : action === 'REMINDER' ? '/crm/reminders' : '/crm/tasks')}
                    className="text-[12.5px] font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-white/60"
                >
                    {isCommunication ? t('nav.crmCommunication') : action === 'REMINDER' ? t('nav.crmReminders') : t('nav.crmTasks')} →
                </button>
            </div>
        </div>
    );
};
