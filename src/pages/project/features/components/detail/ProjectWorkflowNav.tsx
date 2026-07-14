import type React from 'react';
import {
    Activity,
    CalendarCheck01 as CalendarClock,
    Clipboard as ClipboardPenLine,
    List,
    PackagePlus,
    Receipt as ReceiptText,
} from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import type {
    ProjectDetailView,
    ProjectSectionKey,
    ProjectSubSectionKey,
} from '../../types/projectDetailNavigation';
import { viewForSection } from '../../types/projectDetailNavigation';

type SubItem = { key: ProjectSubSectionKey; label: () => string };

type Group = {
    section: ProjectSectionKey;
    label: () => string;
    icon: React.ReactNode;
    subs: SubItem[];
};

// The full ERP workflow tree. Labels are lazily resolved so language switches
// re-render correctly. `overview` and `addons` behave as single leaf groups.
const getGroups = (): Group[] => [
    {
        section: 'overview',
        label: () => t('auto.genel_bakis'),
        icon: <Activity size={15} />,
        subs: [],
    },
    {
        section: 'positions',
        label: () => t('auto.pozisyon_ozeti'),
        icon: <List size={15} />,
        subs: [],
    },
    {
        section: 'planning',
        label: () => t('auto.planlama'),
        icon: <CalendarClock size={15} />,
        subs: [
            { key: 'appointments', label: () => t('auto.randevu_saat_planlari') },
            { key: 'appointmentMail', label: () => t('auto.randevu_maili') },
        ],
    },
    {
        section: 'field',
        label: () => t('auto.saha_operasyonu'),
        icon: <ClipboardPenLine size={15} />,
        subs: [
            { key: 'fieldReports', label: () => t('projects.fieldReport') },
            { key: 'delivery', label: () => t('projects.delivery.reportsTab') },
            { key: 'signatures', label: () => t('nav.signatures') },
        ],
    },
    {
        section: 'costs',
        label: () => t('auto.maliyet_ve_malzemeler'),
        icon: <ReceiptText size={15} />,
        subs: [
            { key: 'expenses', label: () => t('auto.harici_giderler') },
            { key: 'materials', label: () => t('nav.materials') },
            { key: 'overtime', label: () => t('auto.15_uzeri_fazla_calisma') },
        ],
    },
    {
        section: 'addons',
        label: () => t('projects.addonOrder'),
        icon: <PackagePlus size={15} />,
        subs: [
            { key: 'addonOrders', label: () => t('auto.ek_siparis_olustur') },
        ],
    },
];

// A short, readable badge instead of a bare red dot (per ERP-style requirement).
const AttentionBadge = ({ label }: { label: string }) => (
    <span className="ml-auto inline-flex items-center rounded-full bg-red-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-red-700">
        {label}
    </span>
);

export const ProjectWorkflowNav = ({
    activeView,
    onChange,
    addonAttention = false,
}: {
    activeView: ProjectDetailView;
    onChange: (view: ProjectDetailView) => void;
    addonAttention?: boolean;
}) => {
    const groups = getGroups();

    // Which top-level group should render an attention badge.
    const sectionAttention = (section: ProjectSectionKey): string | null => {
        if (section === 'addons' && addonAttention) return t('projects.addonRequestBadge');
        return null;
    };
    // Which sub-item should render an attention badge.
    const subAttention = (sub: ProjectSubSectionKey): string | null => {
        if (sub === 'addonOrders' && addonAttention) return t('projects.addonRequestBadge');
        return null;
    };

    return (
        <nav
            aria-label="Project workflow"
            className="mb-4 flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 md:flex-col md:overflow-visible dark:border-white/15 dark:bg-white/5"
        >
            {groups.map((group) => {
                const active = activeView.section === group.section;
                const badge = sectionAttention(group.section);
                return (
                    <div key={group.section} className="shrink-0 md:shrink">
                        <button
                            type="button"
                            onClick={() => onChange(viewForSection(group.section))}
                            className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                                active
                                    ? 'bg-[#272f67] text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-white dark:hover:bg-white/10'
                            }`}
                        >
                            <span className="shrink-0">{group.icon}</span>
                            <span>{group.label()}</span>
                            {badge && !active && <AttentionBadge label={badge} />}
                        </button>

                        {/* Sub-sections appear when the group is active. On desktop they nest
                            under the group; on mobile they flow inline horizontally. */}
                        {active && group.subs.length > 0 && (
                            <div className="mt-1 flex gap-1 md:ml-2 md:mt-1 md:flex-col md:border-l md:border-slate-200 md:pl-2 dark:md:border-white/15">
                                {group.subs.map((sub) => {
                                    const subActive = activeView.subSection === sub.key;
                                    const subBadge = subAttention(sub.key);
                                    return (
                                        <button
                                            key={sub.key}
                                            type="button"
                                            onClick={() => onChange({ section: group.section, subSection: sub.key })}
                                            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors md:w-full ${
                                                subActive
                                                    ? 'bg-[#eef4ff] text-[#272f67]'
                                                    : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:text-white/70 dark:hover:bg-white/10'
                                            }`}
                                        >
                                            <span>{sub.label()}</span>
                                            {subBadge && !subActive && <AttentionBadge label={subBadge} />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
};
