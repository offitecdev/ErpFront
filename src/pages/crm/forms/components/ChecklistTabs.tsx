import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuLayoutTemplate, LuListChecks } from 'react-icons/lu';
import { t } from '@/i18n/translate';
import { SlidingTopTabs } from '@/components/ui-shared/SlidingTopTabs';
import { CHECKLIST_PATHS, type ChecklistTabKey } from '../routes';

/**
 * Reiterband des Checklisten-Bereichs — dieselbe Bauart wie die übrigen
 * CRM-Seiten (Schnellerfassung / Projektansicht): der Streifen trägt Rahmen
 * und Überlauf, die Reiter liegen INNEN in einer flex-Reihe.
 *
 * Der Bereich hat genau ZWEI Seiten: die ausgefüllten Checklisten
 * (/crm/forms) und die Vorlagen (/crm/forms/templates). Der Vorlagen-Editor
 * ist eine Unterseite der Vorlagen und zeigt darum denselben Reiter aktiv.
 *
 * `onLeave` darf einen Wechsel abfangen (der Editor fragt bei ungesicherten
 * Änderungen nach): `false` bricht die Navigation ab.
 */
type TabIcon = ComponentType<{ size?: number; className?: string }>;

interface ChecklistTab {
    key: ChecklistTabKey;
    labelKey: string;
    Icon: TabIcon;
}

const TABS: readonly ChecklistTab[] = [
    { key: 'checklists', labelKey: 'forms.tabs.checklists', Icon: LuListChecks },
    { key: 'templates', labelKey: 'forms.tabs.templates', Icon: LuLayoutTemplate },
];

export const ChecklistTabs = ({
    active,
    onLeave,
}: {
    active: ChecklistTabKey;
    onLeave?: (path: string) => boolean;
}) => {
    const navigate = useNavigate();

    const go = (key: ChecklistTabKey) => {
        if (key === active) return;
        const path = CHECKLIST_PATHS[key];
        if (onLeave && !onLeave(path)) return;
        navigate(path);
    };

    return (
        <nav
            aria-label={t('forms.tabs.aria')}
            className="ofi-quote-tabs-strip mb-2 min-w-0 overflow-x-auto border-b border-slate-200 px-1 pt-1 md:overflow-visible dark:border-white/15"
        >
            <SlidingTopTabs activeKey={active} className="flex min-w-max items-stretch gap-1">
                {TABS.map(({ key, labelKey, Icon }) => {
                    const isActive = key === active;
                    return (
                        <div key={key} data-tab-key={key} className="relative -mb-px shrink-0">
                            <button
                                type="button"
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => go(key)}
                                className={`ofi-quote-tab inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-t-md border border-b-0 px-4 py-2.5 text-[12.5px] transition-colors ${isActive
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
    );
};
