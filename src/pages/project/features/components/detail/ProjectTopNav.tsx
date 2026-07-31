import { useRef, useState } from 'react';
import type React from 'react';
import {
    Activity,
    CalendarCheck01 as CalendarClock,
    ChevronDown,
    Clipboard as ClipboardPenLine,
    List,
    PackagePlus,
    Coins01 as Wallet,
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

// The full ERP workflow, now as a horizontal top menu. Labels are lazily resolved
// so language switches re-render correctly.
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
        // Formerly "Saha Operasyonu" — consolidated into a single "Reports"
        // area; field/general/delivery/signatures all live in its popups now.
        section: 'field',
        label: () => t('projects.reportsHub.title'),
        icon: <ClipboardPenLine size={15} />,
        subs: [],
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
        section: 'billing',
        label: () => t('projects.flow.billing'),
        icon: <Wallet size={15} />,
        subs: [],
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
    <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-red-700">
        {label}
    </span>
);

// Horizontal workflow menu. Groups with sub-sections open their dropdown on hover
// (and on focus/click, so keyboard and touch keep working). Clicking a group jumps
// to its default sub-section.
export const ProjectTopNav = ({
    activeView,
    onChange,
    addonAttention = false,
}: {
    activeView: ProjectDetailView;
    onChange: (view: ProjectDetailView) => void;
    addonAttention?: boolean;
}) => {
    const groups = getGroups();
    const [openSection, setOpenSection] = useState<ProjectSectionKey | null>(null);
    // Small close delay so the pointer can travel from the trigger into the dropdown.
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleClose = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setOpenSection(null), 120);
    };
    const cancelClose = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = null;
    };
    const openMenu = (section: ProjectSectionKey) => {
        cancelClose();
        setOpenSection(section);
    };

    const sectionAttention = (section: ProjectSectionKey): string | null => {
        if (section === 'addons' && addonAttention) return t('projects.addonRequestBadge');
        return null;
    };

    return (
        <nav
            aria-label="Project workflow"
            // Same tab strip as the tender detail workspace (TenderWorkspaceTabs):
            // underline on the page edge, active tab = filled panel + brand
            // underline + weight. `ofi-quote-tab*` are the dark.css accent hooks.
            className="mb-2 min-w-0 overflow-x-auto border-b border-slate-200 md:overflow-visible dark:border-white/15"
        >
            <div className="flex min-w-max items-center gap-1">
            {groups.map((group) => {
                const active = activeView.section === group.section;
                const badge = sectionAttention(group.section);
                const hasSubs = group.subs.length > 0;
                const open = openSection === group.section && hasSubs;
                return (
                    <div
                        key={group.section}
                        className="relative shrink-0"
                        onMouseEnter={() => hasSubs && openMenu(group.section)}
                        onMouseLeave={scheduleClose}
                    >
                        <button
                            type="button"
                            aria-haspopup={hasSubs || undefined}
                            aria-expanded={hasSubs ? open : undefined}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => {
                                onChange(viewForSection(group.section));
                                setOpenSection(null);
                            }}
                            onFocus={() => hasSubs && openMenu(group.section)}
                            className={`ofi-quote-tab -mb-px inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-[3px] border-b-2 px-3.5 py-2 text-[12.5px] transition-colors ${
                                active
                                    ? 'ofi-quote-tab-active border-[#1f2654] bg-[#eef2fb] font-bold text-[#1f2654]'
                                    : 'border-transparent font-medium text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-[#1f2654] dark:text-white/70 dark:hover:text-white'
                            }`}
                        >
                            <span>{group.label()}</span>
                            {badge && !active && <AttentionBadge label={badge} />}
                            {hasSubs && (
                                <ChevronDown
                                    size={13}
                                    className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${active ? 'text-[#1f2654]/70 dark:text-current' : 'text-slate-400'}`}
                                />
                            )}
                        </button>

                        {open && (
                            <div
                                className="absolute left-0 top-full z-30 mt-1 min-w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/15 dark:bg-slate-900"
                                onMouseEnter={cancelClose}
                                onMouseLeave={scheduleClose}
                            >
                                {group.subs.map((sub) => {
                                    const subActive = active && activeView.subSection === sub.key;
                                    const subBadge = sub.key === 'addonOrders' && addonAttention ? t('projects.addonRequestBadge') : null;
                                    return (
                                        <button
                                            key={sub.key}
                                            type="button"
                                            onClick={() => {
                                                onChange({ section: group.section, subSection: sub.key });
                                                setOpenSection(null);
                                            }}
                                            className={`flex w-full items-center justify-between gap-2 whitespace-nowrap px-3.5 py-2 text-left text-[12.5px] font-medium transition-colors ${
                                                subActive
                                                    ? 'bg-[#eef4ff] text-[#272f67] dark:bg-white/10 dark:text-white'
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-white/70 dark:hover:bg-white/10'
                                            }`}
                                        >
                                            <span>{sub.label()}</span>
                                            {subBadge && <AttentionBadge label={subBadge} />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
            </div>
        </nav>
    );
};
