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

// The quote workspace uses a compact segmented rail. Keep the shared tab
// hooks so selection and navigation behavior remain consistent.
export const TenderWorkspaceTabs = ({ workspaceTab, onSelectTab, onOpenSettingsTab }: TenderWorkspaceTabsProps) => (
    <div className="ofi-quote-tabs-strip ofi-quote-workspace-nav min-w-0 overflow-x-auto">
        <SlidingTopTabs activeKey={workspaceTab} className="ofi-quote-workspace-nav__rail flex min-w-max items-stretch">
            {getTenderWorkspaceTabs().map((tab) => {
                const active = workspaceTab === tab.key;
                return (
                    <button
                        key={tab.key}
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
                        className={`ofi-quote-tab ofi-quote-workspace-nav__tab inline-flex items-center gap-1.5 transition-colors ${active ? 'ofi-quote-tab-active' : ''}`}
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
