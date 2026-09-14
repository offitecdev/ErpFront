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
import '@/styles/modules/projectDetail.css';

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
        // One plain button, no dropdown: it goes straight to the appointment
        // calendar. The mail entry it used to carry is redundant — the calendar
        // header already has its own "send e-mail" button.
        section: 'planning',
        label: () => t('projects.appointment'),
        icon: <CalendarClock size={15} />,
        subs: [],
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
        // Single tab: external expenses, extra materials and extra work all live
        // in one table there, and the overtime tolerance is no longer configured
        // here — it is settled on the tablet during the appointment.
        section: 'costs',
        label: () => t('auto.maliyet_ve_malzemeler'),
        icon: <ReceiptText size={15} />,
        subs: [],
    },
    {
        // Addon orders come BEFORE billing: their lines have to be reviewed and
        // ordered before anything is invoiced.
        section: 'addons',
        label: () => t('projects.addonOrder'),
        icon: <PackagePlus size={15} />,
        subs: [],
    },
    {
        section: 'billing',
        label: () => t('projects.flow.billing'),
        icon: <Wallet size={15} />,
        subs: [],
    },
];

// A short, readable badge instead of a bare red dot (per ERP-style requirement).
const AttentionBadge = ({ label }: { label: string }) => (
    <span className="ofi-prj-tabs__badge">{label}</span>
);

// Horizontal workflow menu — a Mac segmented control since 10.09.2026 (the
// same one the quote detail's workspace tabs use): a 5% rail, 24px segments,
// the active one white with a hairline shadow. No underline, no gradient bar.
// Groups with sub-sections open their dropdown on hover (and on focus/click,
// so keyboard and touch keep working). Clicking a group jumps to its default
// sub-section.
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
        <nav aria-label="Project workflow" className="ofi-prj-tabs">
            {/* `role="tablist"` also keeps the app-wide button standard
                (styles/buttons.css) off these segments. */}
            <div className="ofi-prj-tabs__rail" role="tablist">
            {groups.map((group) => {
                const active = activeView.section === group.section;
                const badge = sectionAttention(group.section);
                const hasSubs = group.subs.length > 0;
                const open = openSection === group.section && hasSubs;
                return (
                    <div
                        key={group.section}
                        data-tab-key={group.section}
                        className="ofi-prj-tabs__item"
                        onMouseEnter={() => hasSubs && openMenu(group.section)}
                        onMouseLeave={scheduleClose}
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-haspopup={hasSubs || undefined}
                            aria-expanded={hasSubs ? open : undefined}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => {
                                onChange(viewForSection(group.section));
                                setOpenSection(null);
                            }}
                            onFocus={() => hasSubs && openMenu(group.section)}
                            className={`ofi-prj-tab ${active ? 'is-active' : ''}`}
                        >
                            <span>{group.label()}</span>
                            {badge && !active && <AttentionBadge label={badge} />}
                            {hasSubs && (
                                <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                            )}
                        </button>

                        {open && (
                            <div
                                className="ofi-prj-tabs__menu"
                                onMouseEnter={cancelClose}
                                onMouseLeave={scheduleClose}
                            >
                                {group.subs.map((sub) => {
                                    const subActive = active && activeView.subSection === sub.key;
                                    const subBadge = sectionAttention(group.section);
                                    return (
                                        <button
                                            key={sub.key}
                                            type="button"
                                            onClick={() => {
                                                onChange({ section: group.section, subSection: sub.key });
                                                setOpenSection(null);
                                            }}
                                            className={`ofi-prj-tabs__menuItem ${subActive ? 'is-active' : ''}`}
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
