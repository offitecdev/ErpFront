import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ChevronRight,
    ChevronDown,
    DotsVertical,
    SearchLg as SearchOutlined,
    XClose as CloseOutlined,
} from '../icons/antIconCompat';
import { isKeyAllowedForProfile, type RoleProfile } from '../../lib/access';
import { hrefFor, isModifiedClick } from '../../lib/navLink';

/* ── Shared menu types (also consumed by MainLayout) ── */
export type MenuLeaf = { key: string; label: string; permission?: string; hideForTechnician?: boolean; technicianOnly?: boolean };
export type MenuIcon = React.ComponentType<any>;
export type MenuSection =
    | { type: 'single'; key: string; path: string; label: string; icon: MenuIcon; feature?: 'projects' }
    | { type: 'group'; key: string; label: string; icon: MenuIcon; items: MenuLeaf[]; feature?: 'projects' };

export type QuickCreateItem = {
    id: string;
    label: string;
    icon: MenuIcon;
    iconClassName?: string;
};

const RAIL_WIDTH = 72;
const PANEL_WIDTH = 256;
const HEADER_HEIGHT = 64; // matches the fixed header (h-16)

/* ── Palette (from new_tasarım.txt): menu text #000, surfaces are a grey ramp —
   panel grey-99 (#FBFBFA), hover grey-96 (~black/5), selected grey-90 (~black/8).
   Dark mode: text is the focus — hover/active are quiet translucent "glass"
   whites; gold/wheat survives only as a muted icon tint (never as a state bg). */
const ROW_IDLE = 'text-black/85 hover:bg-[#eef1fa] hover:text-black dark:text-white/85 dark:hover:bg-white/8 dark:hover:text-white';
const ROW_ACTIVE = 'bg-black/8 text-black dark:bg-white/10 dark:text-white dark:ring-1 dark:ring-inset dark:ring-white/10';
const DOT_IDLE = 'bg-black/25 dark:bg-white/30';
// Seçili satırda nokta gösterilmez — satır zaten arka plan vurgusuyla belli olur.
// Boşluk (size-1.5) korunur ki metin, komşu satırlarla hizalı kalsın.
const DOT_ACTIVE = 'bg-transparent';
const ICON_IDLE = 'dark:text-[#e6cf9e]/70';
const ICON_ACTIVE = 'dark:text-[#e6cf9e]';
const PANEL_BG = 'bg-[#FBFBFA] dark:bg-[#151616]';

type AppSidebarProps = {
    sections: MenuSection[];
    activeUrl: string;
    roleProfile: RoleProfile;
    permissions: string[];
    projectModuleEnabled: boolean;
    onNavigate: (path: string) => void;
    /** Pinned-open state, controlled by MainLayout (header menu button persists it). */
    pinnedOpen: boolean;
    onTogglePin: () => void;
    onOpenSearch: () => void;
    quickCreateItems: QuickCreateItem[];
    onQuickCreate: (item: QuickCreateItem) => void;
    /** Mobile drawer renders the always-expanded layout (no rail / flyout). */
    variant?: 'desktop' | 'mobile';
};

/**
 * Evernote-style navigation. Collapsed it is a slim icon rail; the ONLY thing that
 * resizes it (and the content column) is the toggle chevron — hover never changes
 * the width. Grouped sections open a soft-edged flyout "side tab" panel beside the
 * rail, on hover or click. A search entry and a three-dot quick-create button sit at
 * the top; there is no profile/logo footer and no divider against the page.
 */
export const AppSidebar: React.FC<AppSidebarProps> = ({
    sections,
    activeUrl,
    roleProfile,
    permissions,
    projectModuleEnabled,
    onNavigate,
    pinnedOpen,
    onTogglePin,
    onOpenSearch,
    quickCreateItems,
    onQuickCreate,
    variant = 'desktop',
}) => {
    const { t } = useTranslation();
    const isMobile = variant === 'mobile';

    const [flyoutKey, setFlyoutKey] = useState<string | null>(null);
    const [openGroups, setOpenGroups] = useState<string[]>([]);
    const [quickCreateOpen, setQuickCreateOpen] = useState(false);

    const asideRef = useRef<HTMLElement>(null);
    const quickCreateRef = useRef<HTMLDivElement>(null);
    const flyoutCloseTimer = useRef<number | null>(null);

    // Width is driven purely by the pin toggle (hover never resizes the sidebar).
    const expanded = isMobile || pinnedOpen;
    // Expanded sidebar shows groups as inline accordions; the rail uses flyouts.
    const accordionMode = expanded;

    const restricted = roleProfile !== 'full';
    const canSee = useMemo(() => (item: MenuLeaf) => {
        if (restricted) {
            if (item.technicianOnly && roleProfile !== 'technician') return false;
            if (item.hideForTechnician && roleProfile === 'technician') return false;
            return isKeyAllowedForProfile(roleProfile, item.key);
        }
        if (item.technicianOnly) return false;
        return !item.permission || permissions.includes(item.permission);
    }, [restricted, roleProfile, permissions]);

    // Visible sections, with their visible children resolved once.
    const items = useMemo(() => {
        return sections
            .filter((section) => section.feature !== 'projects' || projectModuleEnabled)
            .map((section) => {
                if (section.type === 'single') {
                    if (restricted && !isKeyAllowedForProfile(roleProfile, section.path)) return null;
                    return { section, children: [] as MenuLeaf[] };
                }
                const children = section.items.filter(canSee);
                if (!children.length) return null;
                return { section, children };
            })
            .filter(Boolean) as Array<{ section: MenuSection; children: MenuLeaf[] }>;
    }, [sections, projectModuleEnabled, restricted, roleProfile, canSee]);

    const activeGroupKey = useMemo(() => {
        for (const { section, children } of items) {
            if (section.type === 'group' && children.some((c) => c.key === activeUrl)) return section.key;
        }
        return null;
    }, [items, activeUrl]);

    // Keep the active group's accordion open while the full sidebar is shown,
    // and drop any flyout left over from rail mode.
    useEffect(() => {
        if (accordionMode) {
            setFlyoutKey(null);
            if (activeGroupKey && !openGroups.includes(activeGroupKey)) {
                setOpenGroups((prev) => [...prev, activeGroupKey]);
            }
        }
    }, [accordionMode, activeGroupKey]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Flyout hover lifecycle: opening is instant, closing is debounced so the
       pointer can travel from the rail icon into the panel without it vanishing. ── */
    const cancelFlyoutClose = () => {
        if (flyoutCloseTimer.current !== null) {
            window.clearTimeout(flyoutCloseTimer.current);
            flyoutCloseTimer.current = null;
        }
    };
    const scheduleFlyoutClose = () => {
        cancelFlyoutClose();
        flyoutCloseTimer.current = window.setTimeout(() => setFlyoutKey(null), 240);
    };
    useEffect(() => cancelFlyoutClose, []);

    // Dismiss the quick-create card on outside click / Escape.
    useEffect(() => {
        if (!quickCreateOpen) return;
        const onDown = (e: MouseEvent) => {
            if (quickCreateRef.current && !quickCreateRef.current.contains(e.target as Node)) setQuickCreateOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setQuickCreateOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [quickCreateOpen]);

    // Dismiss the flyout side-tab on outside click / Escape.
    useEffect(() => {
        if (!flyoutKey) return;
        const onDown = (e: MouseEvent) => {
            const panel = document.getElementById('oi-sidebar-flyout');
            const inRail = asideRef.current?.contains(e.target as Node);
            const inPanel = panel?.contains(e.target as Node);
            if (!inRail && !inPanel) setFlyoutKey(null);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFlyoutKey(null); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [flyoutKey]);

    const width = isMobile ? '100%' : expanded ? PANEL_WIDTH : RAIL_WIDTH;

    // Navigation clears transient panels.
    const go = (path: string) => { cancelFlyoutClose(); setFlyoutKey(null); setQuickCreateOpen(false); onNavigate(path); };

    const openFlyout = (key: string) => { cancelFlyoutClose(); setFlyoutKey(key); };
    const handleGroupClick = (key: string) => {
        if (accordionMode) {
            setOpenGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
        } else {
            setFlyoutKey((prev) => (prev === key ? null : key));
        }
    };

    const flyoutData = flyoutKey ? items.find((i) => i.section.key === flyoutKey) : null;

    /* ── Item row (icon + optional label) ── */
    const rowBase = 'flex w-full items-center rounded-lg text-left transition-colors duration-100';
    const rowPad = expanded ? 'gap-3 px-3 py-2' : 'justify-center px-0 py-2';

    const renderRows = () => (
        <div className="flex flex-col gap-0.5 px-2">
            {items.map(({ section, children }) => {
                const Icon = section.icon;
                if (section.type === 'single') {
                    const active = section.path === activeUrl;
                    return (
                        <a
                            key={section.path}
                            href={hrefFor(section.path)}
                            title={!expanded ? t(section.label) : undefined}
                            onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); go(section.path); }}
                            // Landing on a non-group item dismisses any open flyout.
                            onMouseEnter={() => { if (!accordionMode) { cancelFlyoutClose(); setFlyoutKey(null); } }}
                            className={`${rowBase} ${rowPad} ${active ? `${ROW_ACTIVE} font-semibold` : `${ROW_IDLE} font-medium`}`}
                        >
                            <Icon size={19} className={`shrink-0 ${active ? ICON_ACTIVE : ICON_IDLE}`} />
                            {expanded && <span className="truncate text-[13.5px]">{t(section.label)}</span>}
                        </a>
                    );
                }

                const groupActive = activeGroupKey === section.key;
                const groupOpen = accordionMode && openGroups.includes(section.key);
                const flyoutActive = flyoutKey === section.key;
                // The selected child row is the single source of truth while it is
                // visible (accordion / flyout) — the parent header must not read as
                // selected too. Only the collapsed rail (children hidden) keeps the
                // location hint on the group icon.
                const headerHighlight = accordionMode ? false : (groupActive || flyoutActive);
                return (
                    <div key={section.key}>
                        <button
                            type="button"
                            title={!expanded ? t(section.label) : undefined}
                            onClick={() => handleGroupClick(section.key)}
                            // The flyout "side tab" also opens when the pointer lands on the icon.
                            onMouseEnter={() => { if (!accordionMode) openFlyout(section.key); }}
                            className={`${rowBase} ${rowPad} ${headerHighlight ? `${ROW_ACTIVE} font-semibold` : `${ROW_IDLE} font-medium`}`}
                        >
                            <Icon size={19} className={`shrink-0 ${headerHighlight ? ICON_ACTIVE : ICON_IDLE}`} />
                            {expanded && (
                                <>
                                    <span className="flex-1 truncate text-[13.5px]">{t(section.label)}</span>
                                    <ChevronDown size={15} className={`shrink-0 opacity-50 transition-transform duration-150 ${groupOpen ? 'rotate-180' : ''}`} />
                                </>
                            )}
                        </button>

                        {/* Expanded inline accordion (pinned / mobile) */}
                        {groupOpen && (
                            <div className="mt-0.5 mb-1 flex flex-col gap-0.5 pl-4">
                                {children.map((child) => {
                                    const active = child.key === activeUrl;
                                    return (
                                        <a
                                            key={child.key}
                                            href={hrefFor(child.key)}
                                            onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); go(child.key); }}
                                            className={`flex items-center gap-2.5 rounded-lg py-1.5 pl-3 pr-2 text-left text-[13px] transition-colors duration-100 ${active ? `${ROW_ACTIVE} font-semibold` : `${ROW_IDLE} font-medium`}`}
                                        >
                                            <span className={`size-1.5 shrink-0 rounded-full ${active ? DOT_ACTIVE : DOT_IDLE}`} />
                                            <span className="truncate">{t(child.label)}</span>
                                        </a>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    /* ── Top: search + quick access bar ── */
    const topSection = (
        <div className="px-2 pt-2 pb-1.5">
            {/* Search — opens the quick-search overlay; lives in the sidebar,
                not the header. */}
            <button
                type="button"
                onClick={onOpenSearch}
                title={!expanded ? t('nav.search') : undefined}
                onMouseEnter={() => { if (!accordionMode) { cancelFlyoutClose(); setFlyoutKey(null); } }}
                className={`flex w-full items-center rounded-lg bg-black/6 text-black/80 transition-colors hover:bg-black/10 hover:text-black dark:bg-white/8 dark:text-white/85 dark:hover:bg-white/12 dark:hover:text-white ${expanded ? 'gap-2.5 px-3 py-2' : 'justify-center px-0 py-2'}`}
            >
                <SearchOutlined size={18} className={`shrink-0 ${ICON_IDLE}`} />
                {expanded && <span className="text-[13.5px] font-medium">{t('nav.search')}</span>}
            </button>

            {/* Quick-access bar: three-dot opens the quick-create card */}
            <div ref={quickCreateRef} className="relative mt-1.5">
                <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={quickCreateOpen}
                    title={t('nav.quickCreate', { defaultValue: 'Hızlı oluştur' })}
                    onClick={() => setQuickCreateOpen((v) => !v)}
                    onMouseEnter={() => { if (!accordionMode) { cancelFlyoutClose(); setFlyoutKey(null); } }}
                    className={`flex items-center justify-center rounded-lg transition-colors ${quickCreateOpen ? ROW_ACTIVE : ROW_IDLE} ${expanded ? 'h-9 w-full gap-2 px-3' : 'mx-auto size-10'}`}
                >
                    <DotsVertical size={18} className={`shrink-0 rotate-90 ${quickCreateOpen ? ICON_ACTIVE : ICON_IDLE}`} />
                    {expanded && <span className="text-[13px] font-semibold">{t('nav.quickCreate', { defaultValue: 'Hızlı oluştur' })}</span>}
                </button>

                {/* Quick-create card ("the new card") */}
                {quickCreateOpen && quickCreateItems.length > 0 && (
                    <div
                        role="menu"
                        className={`absolute z-[70] mt-1.5 w-60 overflow-hidden rounded-xl border border-[#EAEAEC] ${PANEL_BG} p-1.5 shadow-[0_12px_40px_rgba(16,24,40,0.14)] dark:border-white/10 dark:shadow-black/50 ${expanded ? 'left-0' : 'left-[52px] top-0'}`}
                    >
                        <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[#98A0AE] dark:text-[#8f95a1]">
                            {t('nav.quickCreate', { defaultValue: 'Hızlı oluştur' })}
                        </p>
                        <div className="flex flex-col gap-0.5">
                            {quickCreateItems.map((qi) => {
                                const QIcon = qi.icon;
                                return (
                                    <button
                                        key={qi.id}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => { onQuickCreate(qi); setQuickCreateOpen(false); }}
                                        className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#eef1fa] dark:hover:bg-[#232326]"
                                    >
                                        <QIcon size={18} className={`shrink-0 dark:!text-[#e6cf9e]/80 ${qi.iconClassName || 'text-black/70'}`} />
                                        <span className="truncate text-[13.5px] font-medium text-black dark:text-white">{qi.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    /* ── Mobile: static expanded column (host provides the drawer chrome) ── */
    if (isMobile) {
        return (
            <div className="flex h-full flex-col">
                {topSection}
                <div className="my-1.5 h-px bg-black/8 dark:bg-white/10" />
                <nav className="flex-1 overflow-y-auto pb-3">{renderRows()}</nav>
            </div>
        );
    }

    /* ── Desktop rail — same background as the page, no dividing line ── */
    return (
        <>
            <aside
                ref={asideRef}
                style={{ width }}
                onMouseLeave={() => { if (flyoutKey) scheduleFlyoutClose(); }}
                onMouseEnter={cancelFlyoutClose}
                className="hidden lg:fixed lg:top-16 lg:bottom-0 lg:left-0 lg:z-40 lg:flex lg:flex-col bg-[#f6f8fb] transition-[width] duration-300 ease-in-out"
            >
                {topSection}
                <div className="mx-2 my-1 h-px bg-black/8 dark:bg-white/10" />
                <nav className="flex-1 overflow-y-auto overflow-x-hidden pb-2">{renderRows()}</nav>

                {/* Pin/collapse toggle — the only control that resizes the sidebar */}
                <div className={`flex px-2 py-2 ${expanded ? 'justify-end' : 'justify-center'}`}>
                    <button
                        type="button"
                        aria-label={pinnedOpen ? t('nav.sidebarCollapse') : t('nav.sidebarPin')}
                        aria-pressed={pinnedOpen}
                        onClick={onTogglePin}
                        className="flex size-8 items-center justify-center rounded-lg bg-white text-black/60 shadow-[0_1px_3px_rgba(16,24,40,0.08)] transition-colors hover:bg-black/5 hover:text-black dark:text-[#e6cf9e]/80 dark:hover:text-[#f0dcae]"
                    >
                        <ChevronRight size={16} className={`transition-transform duration-200 ${pinnedOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </aside>

            {/* Flyout "side tab" — a soft-edged rounded panel floating beside the rail */}
            {flyoutData && flyoutData.section.type === 'group' && (
                <div
                    id="oi-sidebar-flyout"
                    style={{ left: RAIL_WIDTH, top: HEADER_HEIGHT + 8 }}
                    onMouseEnter={cancelFlyoutClose}
                    onMouseLeave={scheduleFlyoutClose}
                    className={`fixed bottom-2 z-[45] hidden w-64 flex-col rounded-2xl ${PANEL_BG} shadow-[0_16px_48px_rgba(16,24,40,0.14)] ring-1 ring-black/5 dark:shadow-black/60 dark:ring-white/10 lg:flex animate-in fade-in slide-in-from-left-2 duration-150`}
                >
                    <div className="flex items-center justify-between px-4 pb-2 pt-4">
                        <h2 className="truncate text-[16px] font-semibold text-black dark:text-white">{t(flyoutData.section.label)}</h2>
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={() => setFlyoutKey(null)}
                            className="flex size-7 items-center justify-center rounded-lg text-black/45 transition-colors hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/8 dark:hover:text-white"
                        >
                            <CloseOutlined size={15} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-3">
                        <div className="flex flex-col gap-0.5">
                            {flyoutData.children.map((child) => {
                                const active = child.key === activeUrl;
                                return (
                                    <a
                                        key={child.key}
                                        href={hrefFor(child.key)}
                                        onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); go(child.key); }}
                                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors duration-100 ${active ? `${ROW_ACTIVE} font-semibold` : `${ROW_IDLE} font-medium`}`}
                                    >
                                        <span className={`size-1.5 shrink-0 rounded-full ${active ? DOT_ACTIVE : DOT_IDLE}`} />
                                        <span className="truncate">{t(child.label)}</span>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AppSidebar;
