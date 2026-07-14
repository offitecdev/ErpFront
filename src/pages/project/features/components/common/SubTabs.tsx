export const SubTabs = <T extends string>({
    tabs,
    activeTab,
    onSelectTab,
}: {
    tabs: Array<{ key: T; label: string }>;
    activeTab: T;
    onSelectTab: (tab: T) => void;
}) => (
    <div className="mb-4 inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-white/15 dark:bg-white/5">
        {tabs.map((tab) => (
            <button
                key={tab.key}
                type="button"
                onClick={() => onSelectTab(tab.key)}
                className={`rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    activeTab === tab.key
                        ? 'bg-[#272f67] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-950 dark:text-white dark:hover:text-white'
                }`}
            >
                {tab.label}
            </button>
        ))}
    </div>
);
