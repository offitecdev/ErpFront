import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGuardedNavigate } from '../../store/navGuardStore';
import { hrefFor, isModifiedClick } from '../../lib/navLink';
import {
    Plus as PlusIcon,
    XClose as CloseIcon,
    Building03 as CustomersIcon,
    Briefcase01 as ProjectsIcon,
    FileCheck02 as TenderIcon,
    Building02 as OrdersIcon,
    Package as ProductsIcon,
    SwitchHorizontal01 as MovementsIcon,
    Box as StockPanelIcon,
} from '../icons/antIconCompat';

type TabIcon = React.ComponentType<any>;

/** A destination that can be opened as a workspace tab. */
type TabDefinition = {
    /** Stable id — this is what gets persisted to localStorage. */
    id: string;
    /** i18n key for the tab / menu label. */
    labelKey: string;
    /** SPA route the tab points to. */
    path: string;
    /** Icon rendered in the "+" menu (and, subtly, could be reused on the tab). */
    icon: TabIcon;
};

/**
 * The fixed catalogue offered by the "+" menu. We persist only the `id`s, then
 * re-resolve label/icon/path from here, so translations and route changes stay
 * correct across reloads without migrating stored data.
 */
const TAB_CATALOG: TabDefinition[] = [
    { id: 'customers', labelKey: 'nav.customerList', path: '/crm/customers', icon: CustomersIcon },
    { id: 'tenders', labelKey: 'nav.tenderManagement', path: '/crm/tenders', icon: TenderIcon },
    { id: 'projects', labelKey: 'nav.projectManagement', path: '/projects', icon: ProjectsIcon },
    { id: 'orders', labelKey: 'nav.myOrders', path: '/crm/my-orders', icon: OrdersIcon },
    { id: 'articles', labelKey: 'nav.articles', path: '/inventory/articles', icon: ProductsIcon },
    { id: 'movements', labelKey: 'nav.movements', path: '/inventory/movements', icon: MovementsIcon },
    { id: 'inventory', labelKey: 'nav.inventoryDashboard', path: '/inventory', icon: StockPanelIcon },
];

const CATALOG_BY_ID = new Map(TAB_CATALOG.map((item) => [item.id, item]));

const keyFor = (userId?: string) => `offitec:workspace-tabs:${userId || 'anon'}`;

/** Read the persisted tab ids for a user, dropping anything no longer in the catalogue. */
const readStoredTabs = (userId?: string): string[] => {
    if (typeof window === 'undefined') return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(keyFor(userId)) || '[]');
        if (Array.isArray(parsed)) {
            return parsed.filter((id): id is string => typeof id === 'string' && CATALOG_BY_ID.has(id));
        }
    } catch {
        // Corrupted storage — start empty.
    }
    return [];
};

interface WorkspaceTabsProps {
    /** Current user id — tabs are persisted per user. */
    userId?: string;
}

/**
 * Header workspace tabs: a "+" launcher that opens frequently used list/detail
 * routes as closable tabs. The tab strip fills the space up to the tenant
 * selector and shows as many tabs as fully fit that space — anything that would
 * overflow is simply hidden (no scrolling). The open set is remembered in
 * localStorage, keyed per user.
 *
 * Kept as a standalone component so the header shell stays free of this logic.
 */
export const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({ userId }) => {
    // Guarded so switching tabs while a tender has unsaved changes prompts to save.
    const navigate = useGuardedNavigate();
    const location = useLocation();
    const { t } = useTranslation();

    const [tabIds, setTabIds] = useState<string[]>(() => readStoredTabs(userId));
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    // Tracks which user's tabs are currently loaded so persistence never leaks
    // one user's tabs into another user's storage key.
    const hydratedFor = useRef(userId);

    const tabs = useMemo(
        () => tabIds.map((id) => CATALOG_BY_ID.get(id)).filter(Boolean) as TabDefinition[],
        [tabIds],
    );

    const persist = useCallback(
        (next: string[]) => {
            try {
                window.localStorage.setItem(keyFor(userId), JSON.stringify(next));
            } catch {
                // Ignore quota / private-mode failures.
            }
        },
        [userId],
    );

    // Reload the persisted set when the signed-in user changes.
    useEffect(() => {
        if (hydratedFor.current === userId) return;
        hydratedFor.current = userId;
        setTabIds(readStoredTabs(userId));
    }, [userId]);

    // Which open tab (if any) matches the current route — used for highlighting.
    const activePath = useMemo(() => {
        const matches = tabs
            .map((tab) => tab.path)
            .filter((path) => (path === '/' ? location.pathname === '/' : location.pathname === path || location.pathname.startsWith(`${path}/`)))
            .sort((a, b) => b.length - a.length);
        return matches[0];
    }, [tabs, location.pathname]);

    // Show only the tabs that fully fit the available width; hide the overflow.
    // We measure the real DOM nodes (they are `shrink-0`, so each has an intrinsic
    // width) and toggle `display` inline — no scrolling, no arrows.
    useLayoutEffect(() => {
        const strip = stripRef.current;
        if (!strip) return;

        const fit = () => {
            const kids = Array.from(strip.children) as HTMLElement[];
            const available = strip.clientWidth;
            const gap = 4; // matches gap-1 (0.25rem)
            // Reveal everything first so measurement reflects natural widths.
            kids.forEach((kid) => { kid.style.display = ''; });
            let used = 0;
            kids.forEach((kid) => {
                used += (used > 0 ? gap : 0) + kid.offsetWidth;
                if (used > available) kid.style.display = 'none';
            });
        };

        fit();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(fit);
        observer.observe(strip);
        return () => observer.disconnect();
    }, [tabs]);

    // Close the "+" menu on outside click.
    useEffect(() => {
        if (!isMenuOpen) return;
        const onMouseDown = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [isMenuOpen]);

    const openTab = useCallback(
        (definition: TabDefinition) => {
            setIsMenuOpen(false);
            setTabIds((prev) => {
                const next = prev.includes(definition.id) ? prev : [...prev, definition.id];
                persist(next);
                return next;
            });
            navigate(definition.path);
        },
        [navigate, persist],
    );

    const closeTab = useCallback(
        (event: React.MouseEvent, id: string) => {
            event.stopPropagation();
            event.preventDefault(); // the tab is an anchor — don't let the close click navigate it
            setTabIds((prev) => {
                const index = prev.indexOf(id);
                if (index === -1) return prev;
                const next = prev.filter((tabId) => tabId !== id);
                persist(next);

                // If we closed the tab the user is currently on, move to the
                // neighbouring tab (or home when none remain).
                const closed = CATALOG_BY_ID.get(id);
                const onClosed = closed && (location.pathname === closed.path || location.pathname.startsWith(`${closed.path}/`));
                if (onClosed) {
                    const fallback = next[index] ?? next[index - 1];
                    navigate(fallback ? CATALOG_BY_ID.get(fallback)!.path : '/');
                }
                return next;
            });
        },
        [location.pathname, navigate, persist],
    );

    return (
        <div className="workspace-tabs ml-3 hidden min-w-0 flex-1 items-center gap-1.5 lg:flex" ref={menuRef}>
            {/* "+" launcher */}
            <div className="relative shrink-0">
                <button
                    type="button"
                    aria-label={t('nav.workspaceTabs.add')}
                    aria-expanded={isMenuOpen}
                    title={t('nav.workspaceTabs.add')}
                    onClick={() => setIsMenuOpen((open) => !open)}
                    className={`inline-flex size-10 items-center justify-center rounded-full border shadow-xs transition-[background-color,color,box-shadow,border-color] duration-200 ${isMenuOpen
                        ? 'border-[#272f67] bg-[#272f67] text-white shadow-lg'
                        : 'border-slate-200/90 bg-white text-[#272f67] hover:border-[#d3e3fd] hover:bg-[#d3e3fd] hover:text-[#1f2654] dark:border-white/15 dark:bg-white/8 dark:text-white/85 dark:hover:border-white/25 dark:hover:bg-white/14 dark:hover:text-white'
                        }`}
                >
                    <PlusIcon style={{ fontSize: 22 }} />
                </button>

                {isMenuOpen && (
                    <div className="absolute left-0 top-12 z-[60] w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg animate-in fade-in slide-in-from-top-2 dark:border-white/15 dark:bg-[#0d1220]/90 dark:shadow-[0_24px_70px_rgba(0,0,0,0.48)] dark:backdrop-blur-xl">
                        <p className="px-3 pb-1.5 pt-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                            {t('nav.workspaceTabs.menuTitle')}
                        </p>
                        <div className="grid gap-0.5">
                            {TAB_CATALOG.map((item) => {
                                const ItemIcon = item.icon;
                                const isOpen = tabIds.includes(item.id);
                                return (
                                    <a
                                        key={item.id}
                                        href={hrefFor(item.path)}
                                        onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); openTab(item); }}
                                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-colors ${isOpen
                                            ? 'bg-[#d3e3fd] text-[#1f2654] dark:bg-white/12 dark:text-white'
                                            : 'text-slate-700 hover:bg-slate-100 dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white'
                                            }`}
                                    >
                                        <ItemIcon style={{ fontSize: 16 }} className="shrink-0" />
                                        <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Tab strip — shows as many tabs as fit; overflow is hidden. */}
            <div ref={stripRef} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {tabs.map((tab) => {
                    const isActive = tab.path === activePath;
                    return (
                        <a
                            key={tab.id}
                            href={hrefFor(tab.path)}
                            data-active={isActive || undefined}
                            onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); navigate(tab.path); }}
                            title={t(tab.labelKey)}
                            className={`group inline-flex h-9 max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors ${isActive
                                ? 'border-[#272f67] bg-[#272f67] text-white'
                                : 'border-slate-200/90 bg-white text-slate-700 hover:border-[#d3e3fd] hover:bg-[#d3e3fd] hover:text-[#1f2654] dark:border-white/15 dark:bg-white/8 dark:text-white/80 dark:hover:border-white/25 dark:hover:bg-white/14 dark:hover:text-white'
                                }`}
                        >
                            <span className="min-w-0 truncate">{t(tab.labelKey)}</span>
                            <span
                                role="button"
                                tabIndex={-1}
                                aria-label={t('nav.workspaceTabs.close')}
                                onClick={(event) => closeTab(event, tab.id)}
                                className={`-mr-1 flex size-4 shrink-0 items-center justify-center rounded-full transition-colors ${isActive
                                    ? 'text-white/70 hover:bg-white/20 hover:text-white'
                                    : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-white/55 dark:hover:bg-white/12 dark:hover:text-white'
                                    }`}
                            >
                                <CloseIcon style={{ fontSize: 12 }} />
                            </span>
                        </a>
                    );
                })}
            </div>
        </div>
    );
};
