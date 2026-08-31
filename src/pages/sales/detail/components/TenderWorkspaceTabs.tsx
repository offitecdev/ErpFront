import { t } from '@/i18n/translate';
import { SlidingTopTabs } from '@/components/ui-shared/SlidingTopTabs';

import type { TenderSettingsTabKey, TenderWorkspaceTabKey } from '../types/tenderDetail.types';

const getTenderWorkspaceTabs = (): Array<{
    key: TenderWorkspaceTabKey;
    label: string;
    settingsTab?: TenderSettingsTabKey;
    disabled?: boolean;
}> => [
    { key: 'lines', label:t('tenders.tender_satirlari') },
    { key: 'pdf', label:t('tenders.pdf_version') },
    { key: 'payment', label:t('tenders.payment_schedule_tab') },
    // Checklisten / Formulare hängen NICHT mehr am Angebot (Vorgabe
    // 15.08.2026): der Bereich ist noch in Arbeit und trägt dort seinen
    // eigenen Hinweis. Erfasst wird weiterhin über CRM → Checklisten sowie am
    // Auftrag, Projekt und beim Techniker.
    { key: 'mail', label:t('tenders.tender_maili'), settingsTab: 'mail' },
    { key: 'logs', label:t('tenders.loglar') },
];

type TenderWorkspaceTabsProps = {
    workspaceTab: TenderWorkspaceTabKey;
    onSelectTab: (tab: TenderWorkspaceTabKey) => void;
    onOpenSettingsTab: (tab: TenderSettingsTabKey) => void;
};

// Tab strip sitting directly on the page, aligned with the card edges. It is
// the SAME strip as the project detail workflow menu (ProjectTopNav) — same
// classes, same `.ofi-quote-tab*` CSS hooks — so a user moving between a quote,
// an order and a project sees one navigation idiom, not three.
export const TenderWorkspaceTabs = ({ workspaceTab, onSelectTab, onOpenSettingsTab }: TenderWorkspaceTabsProps) => (
    <div className="ofi-quote-tabs-strip mb-2 min-w-0 overflow-x-auto border-b border-slate-200 px-1 pt-1 dark:border-white/15">
        <SlidingTopTabs activeKey={workspaceTab} className="flex min-w-max items-stretch gap-1">
            {getTenderWorkspaceTabs().map((tab) => {
                const active = workspaceTab === tab.key;
                return (
                    <button
                        key={tab.label}
                        data-tab-key={tab.key}
                        type="button"
                        disabled={tab.disabled}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                            if (tab.settingsTab) {
                                onOpenSettingsTab(tab.settingsTab);
                                return;
                            }
                            onSelectTab(tab.key);
                        }}
                        // ONE strip style across the app (user request
                        // 17.08.2026: "make it the same as the other CRM /
                        // project pages"): the very same classes as
                        // ProjectTopNav — active tab = filled light-navy panel
                        // with rounded top corners, hairline edge and bold navy
                        // label; idle tabs are quiet grey text.
                        // `ofi-quote-tab-active` is the hook dark.css uses to
                        // repaint the fill in the accent gold; the light tint
                        // below has no dark counterpart of its own.
                        className={`ofi-quote-tab -mb-px inline-flex items-center gap-1.5 rounded-t-md border border-b-0 px-4 py-2.5 text-[12.5px] transition-colors ${
                            active
                                ? 'ofi-quote-tab-active border-slate-200 bg-[#eef2fb] font-bold text-[#1f2654]'
                                : tab.disabled
                                    ? 'cursor-not-allowed border-transparent font-medium text-slate-300 dark:text-white/35'
                                    : 'border-transparent font-medium text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-[#1f2654] dark:text-white/70'
                        }`}
                    >
                        {tab.label}
                        {tab.disabled && tab.label === t('tenders.technician_ata') && (
                            <span className="text-[11px] font-medium text-slate-300 dark:text-white/35">{t('tenders.eklenecek')}</span>
                        )}
                    </button>
                );
            })}
        </SlidingTopTabs>
    </div>
);
