import { t } from '@/i18n/translate';

export type DetailTab = 'content' | 'comments' | 'files' | 'activity';

/**
 * Reiter der Aufgabe im Kleid der Modulleiste (`.ofi-gv-nav`): İçerik ·
 * Yorumlar · Dosyalar · Geçmiş (nur Leitung). Zähler als leise Marke.
 */
export const DetailTabs = ({
    value,
    onChange,
    commentCount,
    fileCount,
    showActivity,
}: {
    value: DetailTab;
    onChange: (next: DetailTab) => void;
    commentCount: number;
    fileCount: number;
    showActivity: boolean;
}) => {
    const tabs: Array<{ key: DetailTab; label: string; count?: number }> = [
        { key: 'content', label: t('tasksModule.detail.tabs.content') },
        { key: 'comments', label: t('tasksModule.detail.tabs.comments'), count: commentCount },
        { key: 'files', label: t('tasksModule.detail.tabs.files'), count: fileCount },
    ];
    if (showActivity) tabs.push({ key: 'activity', label: t('tasksModule.detail.tabs.activity') });

    return (
        <div className="ofi-gv-nav ofi-gv-detail-tabs" role="tablist" aria-label={t('tasksModule.detail.tabs.label')}>
            {tabs.map((tab) => {
                const active = tab.key === value;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`ofi-gv-nav__item ofi-btn-plain ${active ? 'is-active' : ''}`}
                        onClick={() => onChange(tab.key)}
                    >
                        {tab.label}
                        {tab.count ? <span className="ofi-gv-count">{tab.count > 99 ? '99+' : tab.count}</span> : null}
                    </button>
                );
            })}
        </div>
    );
};
