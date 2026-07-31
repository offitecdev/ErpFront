import { t } from '@/i18n/translate';

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
    { key: 'mail', label:t('tenders.tender_maili'), settingsTab: 'mail' },
];

type TenderWorkspaceTabsProps = {
    workspaceTab: TenderWorkspaceTabKey;
    onSelectTab: (tab: TenderWorkspaceTabKey) => void;
    onOpenSettingsTab: (tab: TenderSettingsTabKey) => void;
};

type TenderWorkspaceTabsProps2 = TenderWorkspaceTabsProps & {
    /** Line count shown as a badge on the lines tab. */
    lineCount?: number;
};

// Tab strip sitting directly on the page, aligned with the card edges: the
// active tab is marked by a single underline rather than a filled pill, so the
// strip reads as navigation and stops competing with the toolbar buttons above.
export const TenderWorkspaceTabs = ({ workspaceTab, onSelectTab, onOpenSettingsTab, lineCount }: TenderWorkspaceTabsProps2) => (
    <div className="mb-2 min-w-0 overflow-x-auto border-b border-slate-200 dark:border-white/15">
        <div className="flex min-w-max items-center gap-1">
            {getTenderWorkspaceTabs().map((tab) => {
                const active = workspaceTab === tab.key;
                const showCount = tab.key === 'lines' && typeof lineCount === 'number' && lineCount > 0;
                return (
                    <button
                        key={tab.label}
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
                        // The active tab is marked three ways at once — filled
                        // panel, brand underline and weight — so which of
                        // "Quotation lines" / "Quotation email" you are looking at
                        // is unmistakable at a glance, not a subtle colour shift.
                        // `ofi-quote-tab-active` is the hook dark.css uses to repaint
                        // the fill in the accent gold (see dark.css); the light tint
                        // below has no dark counterpart of its own.
                        className={`ofi-quote-tab -mb-px inline-flex items-center gap-1.5 rounded-t-[3px] border-b-2 px-3.5 py-2 text-[12.5px] transition-colors ${
                            active
                                ? 'ofi-quote-tab-active border-[#1f2654] bg-[#eef2fb] font-bold text-[#1f2654]'
                                : tab.disabled
                                    ? 'cursor-not-allowed border-transparent font-medium text-slate-300 dark:text-white/35'
                                    : 'border-transparent font-medium text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-[#1f2654] dark:text-white/70 dark:hover:text-white'
                        }`}
                    >
                        {tab.label}
                        {showCount && (
                            <span
                                className={`ofi-quote-tab-badge inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10.5px] font-bold tabular-nums ${
                                    active ? 'bg-[#1f2654] text-white' : 'border border-slate-300 bg-white text-slate-500'
                                }`}
                            >
                                {lineCount}
                            </span>
                        )}
                        {tab.disabled && tab.label === t('tenders.technician_ata') && (
                            <span className="text-[11px] font-medium text-slate-300 dark:text-white/35">{t('tenders.eklenecek')}</span>
                        )}
                    </button>
                );
            })}
        </div>
    </div>
);
