import { t } from '@/i18n/translate';

import type { TenderSettingsTabKey, TenderWorkspaceTabKey } from '../types/tenderDetail.types';

const getTenderWorkspaceTabs = (): Array<{
    key: TenderWorkspaceTabKey;
    label: string;
    settingsTab?: TenderSettingsTabKey;
    disabled?: boolean;
}> => [
    { key: 'lines', label:t('tenders.tender_satirlari') },
    { key: 'mail', label:t('tenders.tender_maili'), settingsTab: 'mail' },
    { key: 'assets', label:t('tenders.yazilar_gorseller'), disabled: true },
];

type TenderWorkspaceTabsProps = {
    workspaceTab: TenderWorkspaceTabKey;
    onSelectTab: (tab: TenderWorkspaceTabKey) => void;
    onOpenSettingsTab: (tab: TenderSettingsTabKey) => void;
};

export const TenderWorkspaceTabs = ({ workspaceTab, onSelectTab, onOpenSettingsTab }: TenderWorkspaceTabsProps) => (
    <div className="mb-3 min-w-0 overflow-x-auto">
        <div className="min-w-0 overflow-x-auto">
            <div className="inline-flex min-w-max items-center gap-1 rounded-lg border border-slate-200/80 bg-white p-1 dark:border-white/15 dark:bg-white/5">
                {getTenderWorkspaceTabs().map((tab) => {
                    const active = workspaceTab === tab.key;
                    return (
                        <button
                            key={tab.label}
                            type="button"
                            disabled={tab.disabled}
                            onClick={() => {
                                if (tab.settingsTab) {
                                    onOpenSettingsTab(tab.settingsTab);
                                    return;
                                }
                                onSelectTab(tab.key);
                            }}
                            className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-all ${
                                active
                                    ? 'bg-[#1f2654] text-white shadow-sm'
                                    : tab.disabled
                                        ? 'cursor-not-allowed text-slate-300 dark:text-white/35'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-[#1f2654] dark:text-white dark:hover:bg-white/10 dark:hover:text-white'
                            }`}
                        >
                            {tab.label}
                            {tab.disabled && tab.label === t('tenders.technician_ata') && (
                                <span className="ml-1 text-[11px] font-medium text-slate-300 dark:text-white/35">{t('tenders.eklenecek')}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    </div>
);
