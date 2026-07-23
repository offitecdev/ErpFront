import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LuMoon, LuSun } from '@/components/icons/lucideLocal';
import { useAuthStore } from '../../store/authStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import { useThemeStore } from '../../store/themeStore';
import {
    Bell01 as BellOutlined,
    Briefcase01 as FundProjectionScreenOutlined,
    Building02 as BankOutlined,
    Building03 as ContactsOutlined,
    Calendar as CalendarOutlined,
    FileCheck02 as ServiceReportsOutlined,
    Clock as ClockCircleOutlined,
    SwitchHorizontal01 as SwapOutlined,
    LogOut01 as LogoutOutlined,
    Menu02 as MenuOutlined,
    Package as InboxOutlined,
    Plus as PlusOutlined,
    SearchLg as SearchOutlined,
    Settings01 as SettingOutlined,
    Truck01 as CarOutlined,
    User01 as UserOutlined,
    Building05 as TeamOutlined,
    Home01 as HomeOutlined,
    XClose as CloseOutlined,
} from '../icons/antIconCompat';
import { getRoleProfile } from '../../lib/access';
import { useGuardedNavigate } from '../../store/navGuardStore';
import { hrefFor, isModifiedClick } from '../../lib/navLink';
import { SlidePanel } from './SlidePanel';
import { AppSidebar, type QuickCreateItem } from './AppSidebar';
import { WorkspaceTabsProvider, WorkspaceTabLauncher, WorkspaceTabStrip } from './WorkspaceTabs';
import { SplitViewProvider, useSplitView, SPLIT_PANE_WINDOW_NAME } from './SplitViewContext';
import { SplitViewToggle } from './SplitViewToggle';
import { SecondaryPane } from './SecondaryPane';
import { PrimaryPane } from './PrimaryPane';
import { PaneErrorBoundary } from './PaneErrorBoundary';
import { notificationApi, type NotificationDto } from '../../lib/api/notifications';
import { LanguageSwitcher } from '../ui-shared/LanguageSwitcher';
import offitecLogo from '../../assets/images/offitec-1x.webp';
import offitecLogo2x from '../../assets/images/offitec-2x.webp';
import offitecLogoDark from '../../assets/images/darkmode-1x.webp';
import offitecLogoDark2x from '../../assets/images/darkmode-2x.webp';

const LazyGlobalAlertStack = React.lazy(() =>
    import('../alerts/GlobalAlertStack').then((module) => ({ default: module.GlobalAlertStack })),
);

/* ── Menü Tipleri ── */
type MenuLeaf = { key: string; label: string; permission?: string; hideForTechnician?: boolean; technicianOnly?: boolean };
type MenuIcon = React.ComponentType<any>;
type ModuleLauncherItem = {
    id: string;
    label: string;
    path: string;
    icon: MenuIcon;
    group: string;
    cardClassName?: string;
    iconClassName?: string;
    keywords?: string;
    permission?: string;
    feature?: 'projects';
};
type MenuSection =
    | { type: 'single'; key: string; path: string; label: string; icon: MenuIcon; feature?: 'projects' }
    | { type: 'group'; key: string; label: string; icon: MenuIcon; items: MenuLeaf[]; feature?: 'projects' };

const MENU_SECTIONS: MenuSection[] = [
    {
        type: 'single',
        key: '/',
        path: '/',
        label: 'nav.home',
        icon: HomeOutlined,
    },
    {
        type: 'single',
        key: '/attendance',
        path: '/attendance',
        label: 'nav.attendance',
        icon: ClockCircleOutlined,
    },
    {
        type: 'single',
        key: '/calendar',
        path: '/calendar',
        label: 'nav.calendar',
        icon: CalendarOutlined,
    },
    {
        type: 'group',
        key: 'personel',
        label: 'nav.personnel',
        icon: TeamOutlined,
        items: [
            { key: '/employees', label: 'nav.employeeList' },
            { key: '/attendance-records', label: 'nav.attendanceRecords', permission: 'attendance.read' },
            { key: '/attendance-settings', label: 'nav.attendanceQR', permission: 'tenants.update' },
            { key: '/roles', label: 'nav.roleManagement' },
        ],
    },
    {
        type: 'group',
        key: 'crm',
        label: 'nav.crm',
        icon: ContactsOutlined,
        items: [
            { key: '/crm/overview', label: 'nav.crmOverview', permission: 'crm.customers.view' },
            { key: '/crm/customers', label: 'nav.customerList', permission: 'crm.customers.view' },
            { key: '/crm/tenders', label: 'nav.tenderManagement', permission: 'tenders.view' },
        ],
    },
    {
        type: 'group',
        key: 'projects',
        label: 'nav.projects',
        feature: 'projects',
        icon: FundProjectionScreenOutlined,
        items: [
            { key: '/projects', label: 'nav.projectManagement', permission: 'projects.view', hideForTechnician: true },
            { key: '/projects/flow', label: 'nav.projectFlow', permission: 'projects.view', hideForTechnician: true },
            { key: '/crm/my-orders', label: 'nav.myOrders', permission: 'crm.customers.view', hideForTechnician: true },
            { key: '/projects/installation/tasks', label: 'nav.installationTasks', permission: 'projects.report', technicianOnly: true },
            { key: '/projects/installation/delivery', label: 'nav.deliveryReports', permission: 'projects.report', technicianOnly: true },
            { key: '/settings/mail', label: 'nav.mailSettings', permission: 'mail.manage', hideForTechnician: true },
        ],
    },
    {
        type: 'group',
        key: 'inventory',
        label: 'nav.inventory',
        icon: InboxOutlined,
        items: [
            { key: '/inventory/movements', label: 'nav.movements', permission: 'inventory.transfer', hideForTechnician: true },
            { key: '/inventory/articles', label: 'nav.articles', permission: 'inventory.view', hideForTechnician: true },
            { key: '/inventory/extra-materials', label: 'nav.materials', permission: 'inventory.view', hideForTechnician: true },
            { key: '/inventory/suppliers', label: 'nav.suppliers', permission: 'inventory.view', hideForTechnician: true },
            { key: '/inventory', label: 'nav.inventoryDashboard', permission: 'inventory.view', hideForTechnician: true },
        ],
    },
    {
        type: 'group',
        key: 'logistics',
        label: 'nav.logistics',
        icon: CarOutlined,
        items: [
            { key: '/logistics/shipments', label: 'nav.shipments', permission: 'logistics.view' },
            { key: '/logistics/shipments/new', label: 'nav.newShipment', permission: 'logistics.manage' },
        ],
    },

    {
        type: 'group',
        key: 'maintenance',
        label: 'nav.maintenance',
        icon: CalendarOutlined,
        items: [
            { key: '/maintenance', label: 'nav.maintenanceDashboard', permission: 'maintenance.contracts.manage', hideForTechnician: true },
            { key: '/maintenance/contracts', label: 'nav.contracts', permission: 'maintenance.contracts.manage', hideForTechnician: true },
            { key: '/maintenance/tasks', label: 'nav.maintenanceTasks', permission: 'maintenance.contracts.manage', hideForTechnician: true },
            { key: '/maintenance/technician/tasks', label: 'nav.technicianTasks', permission: 'maintenance.tasks.manage', technicianOnly: true },
            { key: '/maintenance/tasks?view=reports', label: 'nav.maintenanceReports', permission: 'maintenance.reports.manage', hideForTechnician: true },
            { key: '/maintenance/regie', label: 'nav.regie', permission: 'regie.calls.manage', hideForTechnician: true },
        ],
    },

    {
        type: 'group',
        key: 'services',
        label: 'nav.services',
        feature: 'projects',
        icon: ServiceReportsOutlined,
        items: [
            { key: '/services/reports', label: 'nav.serviceReports', permission: 'projects.view', hideForTechnician: true },
            { key: '/services/reports', label: 'nav.serviceReports', permission: 'projects.report', technicianOnly: true },
        ],
    },
    {
        type: 'group',
        key: 'settings',
        label: 'nav.settings',
        icon: SettingOutlined,
        items: [
            { key: '/settings/pdf', label: 'nav.pdfSettings' },
            { key: '/settings/checklists', label: 'nav.checklistSettings', hideForTechnician: true },
        ],
    },
];

MENU_SECTIONS.forEach((section) => {
    if (section.type !== 'group' || section.key !== 'projects') return;
    section.items.forEach((item) => {
        if (item.key === '/projects/installation/tasks') {
            item.permission = undefined;
            item.label = 'nav.technicianInstallations';
        }
    });
});

const MODULE_LAUNCHER_ITEMS: ModuleLauncherItem[] = [
    {
        id: 'create-tender',
        label: 'nav.quickActionsGroup.newTender',
        path: '/crm/tenders/new',
        icon: PlusOutlined,
        group: 'nav.moduleGroups.quickAction',
        cardClassName: 'border-sky-200/60 bg-sky-50/70 text-sky-950 shadow-sky-900/5 hover:bg-sky-100/80',
        iconClassName: 'text-sky-600',
        keywords: 'yeni teklif teklif olustur crm new tender offer',
        permission: 'tenders.manage',
    },
    {
        id: 'add-project',
        label: 'nav.projectManagement',
        path: '/projects',
        icon: FundProjectionScreenOutlined,
        group: 'nav.moduleGroups.quickAction',
        cardClassName: 'border-violet-200/60 bg-violet-50/70 text-violet-950 shadow-violet-900/5 hover:bg-violet-100/80',
        iconClassName: 'text-violet-600',
        keywords: 'yeni proje proje ekle proje yonetimi project management',
        permission: 'projects.view',
        feature: 'projects',
    },
    {
        id: 'sales-orders',
        label: 'nav.myOrders',
        path: '/crm/my-orders',
        icon: BankOutlined,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-indigo-200/60 bg-indigo-50/70 text-indigo-950 shadow-indigo-900/5 hover:bg-indigo-100/80',
        iconClassName: 'text-indigo-600',
        keywords: 'satis siparisi siparis order my orders',
        permission: 'crm.customers.view',
    },
    {
        id: 'customers',
        label: 'nav.customerList',
        path: '/crm/customers',
        icon: ContactsOutlined,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-950 shadow-emerald-900/5 hover:bg-emerald-100/80',
        iconClassName: 'text-emerald-600',
        keywords: 'musteri musteri listesi crm customers',
        permission: 'crm.customers.view',
    },
    {
        id: 'tenders',
        label: 'nav.tenderManagement',
        path: '/crm/tenders',
        icon: FundProjectionScreenOutlined,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-amber-200/60 bg-amber-50/70 text-amber-950 shadow-amber-900/5 hover:bg-amber-100/80',
        iconClassName: 'text-amber-600',
        keywords: 'teklifler teklif yonetimi crm tenders offers',
        permission: 'tenders.view',
    },
    {
        id: 'inventory',
        label: 'nav.inventory',
        path: '/inventory/articles',
        icon: InboxOutlined,
        group: 'nav.moduleGroups.inventory',
        cardClassName: 'border-cyan-200/60 bg-cyan-50/70 text-cyan-950 shadow-cyan-900/5 hover:bg-cyan-100/80',
        iconClassName: 'text-cyan-600',
        keywords: 'stok urunler malzeme depo inventory stock products',
        permission: 'inventory.view',
    },
    {
        id: 'maintenance',
        label: 'nav.maintenance',
        path: '/maintenance',
        icon: CalendarOutlined,
        group: 'nav.moduleGroups.maintenance',
        cardClassName: 'border-rose-200/60 bg-rose-50/70 text-rose-950 shadow-rose-900/5 hover:bg-rose-100/80',
        iconClassName: 'text-rose-600',
        keywords: 'bakim bakim panosu randevu sozlesme maintenance',
        permission: 'maintenance.contracts.manage',
    },
    {
        id: 'regie',
        label: 'nav.regie',
        path: '/maintenance/regie',
        icon: ClockCircleOutlined,
        group: 'nav.moduleGroups.maintenance',
        cardClassName: 'border-fuchsia-200/60 bg-fuchsia-50/70 text-fuchsia-950 shadow-fuchsia-900/5 hover:bg-fuchsia-100/80',
        iconClassName: 'text-fuchsia-600',
        keywords: 'regie ariza operasyon servis cagri',
        permission: 'regie.calls.manage',
    },
    {
        id: 'employees',
        label: 'nav.employeeList',
        path: '/employees',
        icon: TeamOutlined,
        group: 'nav.moduleGroups.personnel',
        cardClassName: 'border-lime-200/60 bg-lime-50/70 text-lime-950 shadow-lime-900/5 hover:bg-lime-100/80',
        iconClassName: 'text-lime-600',
        keywords: 'personel calisan ekip rol employees staff',
    },
];

/** True when this window is the split view's secondary-pane iframe — render a
    bare shell (no header/sidebar) and skip app-chrome side effects. */
const IS_SPLIT_PANE = typeof window !== 'undefined' && window.name === SPLIT_PANE_WINDOW_NAME;

/* ── İç Layout ── */
const DeferredGlobalAlertStack: React.FC<{
    onCountChange: (count: number) => void;
    onArchived: () => void;
}> = ({ onCountChange, onArchived }) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Alerts aggregate several large API lists and use the animation runtime.
        // Keep both the module download and its requests outside the detail LCP.
        const timer = window.setTimeout(() => setIsReady(true), 8000);
        return () => window.clearTimeout(timer);
    }, []);

    if (!isReady) return null;

    return (
        <React.Suspense fallback={null}>
            <LazyGlobalAlertStack onCountChange={onCountChange} onArchived={onArchived} />
        </React.Suspense>
    );
};

const MainLayoutInner: React.FC = () => {
    const navigate = useNavigate();
    // Menu / tab switches use this so leaving a tender with unsaved changes prompts
    // to save first; direct `navigate` stays for programmatic redirects.
    const guardedNavigate = useGuardedNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation();

    const { user, logout, permissions, tenants, selectedTenantId, setSelectedTenant } = useAuthStore();
    const { fetchTodayAttendance } = useAttendanceStore();
    const { splitMode, isSplit, secondaryPath, secondaryCurrentPath, exitSplit, openSecondary } = useSplitView();
    const { isDarkMode, toggleTheme } = useThemeStore();

    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
    const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationDto[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    // Live urgent-alert count from the floating alert deck; mirrored on the bell badge.
    const [alertCount, setAlertCount] = useState(0);
    const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
    const [globalSearch, setGlobalSearch] = useState('');
    const SIDEBAR_OPEN_STORAGE_KEY = "offitec:sidebar-open";
    const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY) === 'true';
    });
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchOverlayInputRef = useRef<HTMLInputElement>(null);
    const pageScrollRef = useRef<HTMLDivElement>(null);
    const primaryRoute = location.pathname + location.search;
    const [primaryLocation, setPrimaryLocation] = useState({
        entryPath: primaryRoute,
        currentPath: primaryRoute,
    });
    const primaryCurrentPath = primaryLocation.entryPath === primaryRoute
        ? primaryLocation.currentPath
        : primaryRoute;
    const reportPrimaryLocation = useCallback((path: string) => {
        setPrimaryLocation((current) => (
            current.entryPath === primaryRoute && current.currentPath === path
                ? current
                : { entryPath: primaryRoute, currentPath: path }
        ));
    }, [primaryRoute]);
    const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) || null;
    const projectModuleEnabled = selectedTenant?.isProjectModuleEnabled !== false;
    const roleProfile = useMemo(() => getRoleProfile(user), [user]);
    const visibleMenuSections = useMemo(
        () => MENU_SECTIONS.filter((section) => section.feature !== 'projects' || projectModuleEnabled),
        [projectModuleEnabled]
    );
    const moduleLauncherItems = useMemo(() => {
        return MODULE_LAUNCHER_ITEMS.filter((item) => {
            const hasPermission = !item.permission || permissions.includes(item.permission);
            const featureEnabled = item.feature !== 'projects' || projectModuleEnabled;
            return hasPermission && featureEnabled;
        });
    }, [permissions, projectModuleEnabled]);
    const activeLocale = useMemo(() => {
        const language = i18n.resolvedLanguage || i18n.language || 'tr';
        if (language.startsWith('de')) return 'de-DE';
        if (language.startsWith('en')) return 'en-US';
        return 'tr-TR';
    }, [i18n.language, i18n.resolvedLanguage]);
    const filteredModuleSearchItems = useMemo(() => {
        const query = globalSearch.trim().toLocaleLowerCase(activeLocale);
        if (!query) return moduleLauncherItems.slice(0, 12);
        return moduleLauncherItems.filter((item) =>
            `${t(item.label)} ${t(item.group)} ${item.keywords || ''} ${item.path}`.toLocaleLowerCase(activeLocale).includes(query),
        );
    }, [activeLocale, globalSearch, moduleLauncherItems, t]);
    // Quick-create actions surfaced by the sidebar three-dot button ("the new card").
    const quickCreateItems: QuickCreateItem[] = useMemo(
        () => moduleLauncherItems.slice(0, 8).map((item) => ({
            id: item.id,
            label: t(item.label),
            icon: item.icon,
            iconClassName: item.iconClassName,
        })),
        [moduleLauncherItems, t],
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsProfileDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    /* A table starts with the SVG's gray header band. Once that header sticks
       to the page scrollport, mark it so CSS can present it as a separate
       white card, matching the scrolled reference without changing the
       table's initial appearance. */
    useEffect(() => {
        const scroller = pageScrollRef.current;
        if (!scroller) return;

        let animationFrame = 0;
        const updateStickyTableHeaders = () => {
            animationFrame = 0;
            const scrollportTop = scroller.getBoundingClientRect().top;
            const headers = scroller.querySelectorAll<HTMLTableSectionElement>(
                'table:not([role="grid"]):not([data-unstyled-table]) > thead',
            );

            // Read every geometry value first, then update attributes. Mixing an
            // attribute write with the next geometry read forced a new layout
            // for each table.
            const measurements = Array.from(headers, (header) => {
                const table = header.closest('table');
                if (!table) return { header, isStuck: false };
                const tableRect = table.getBoundingClientRect();
                const headerHeight = header.getBoundingClientRect().height;
                return {
                    header,
                    isStuck: tableRect.top < scrollportTop
                        && tableRect.bottom > scrollportTop + headerHeight,
                };
            });
            measurements.forEach(({ header, isStuck }) => {
                header.toggleAttribute('data-scroll-stuck', isStuck);
            });
        };
        const scheduleUpdate = () => {
            if (animationFrame) return;
            animationFrame = window.requestAnimationFrame(updateStickyTableHeaders);
        };

        scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
        window.addEventListener('resize', scheduleUpdate);

        return () => {
            scroller.removeEventListener('scroll', scheduleUpdate);
            window.removeEventListener('resize', scheduleUpdate);
            if (animationFrame) window.cancelAnimationFrame(animationFrame);
            scroller.querySelectorAll('[data-scroll-stuck]').forEach((header) => {
                header.removeAttribute('data-scroll-stuck');
            });
        };
    }, [isSplit, location.pathname, selectedTenantId]);

    useEffect(() => {
        if (!isSearchOverlayOpen) return;

        const focusTimer = window.setTimeout(() => {
            searchOverlayInputRef.current?.focus();
        }, 80);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsSearchOverlayOpen(false);
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isSearchOverlayOpen]);

    useEffect(() => {
        // Fetch attendance in the background — do NOT block layout paint
        fetchTodayAttendance();
    }, [fetchTodayAttendance]);

    useEffect(() => {
        if (!isNotificationPanelOpen) return;
        setNotificationsLoading(true);
        notificationApi.list({ limit: 40 })
            .then(setNotifications)
            .catch(() => setNotifications([]))
            .finally(() => setNotificationsLoading(false));
    }, [isNotificationPanelOpen]);

    useEffect(() => {
        // The pane iframe shows no bell — don't duplicate the polling.
        if (!user?.id || IS_SPLIT_PANE) return;
        notificationApi.list({ unreadOnly: true, limit: 20 })
            .then(setNotifications)
            .catch(() => undefined);
    }, [user?.id, selectedTenantId]);

    useEffect(() => {
        window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(sidebarPinnedOpen));
    }, [sidebarPinnedOpen]);

    useEffect(() => {
        const mql = window.matchMedia('(max-width: 1023px)');
        const onChange = (event: MediaQueryListEvent) => {
            setIsMobile(event.matches);
            if (!event.matches) setIsMobileSidebarOpen(false);
        };
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    // Close the mobile drawer whenever the route changes.
    useEffect(() => {
        setIsMobileSidebarOpen(false);
    }, [location.pathname]);

    // Prevent body scroll while the mobile drawer is open.
    useEffect(() => {
        if (!isMobileSidebarOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [isMobileSidebarOpen]);

    useEffect(() => {
        if (!projectModuleEnabled && (location.pathname.startsWith('/projects') || location.pathname === '/settings/mail' || location.pathname === '/settings/checklists')) {
            navigate('/');
        }
    }, [location.pathname, navigate, projectModuleEnabled]);

    const initials = `${user?.firstName?.charAt(0) || ''}${user?.lastName?.charAt(0) || ''}`.toUpperCase();
    const unreadNotificationCount = notifications.filter((notification) => !notification.isRead).length;

    const activeUrl = useMemo(() => {
        const current = location.pathname + location.search;
        const allHrefs: string[] = [];
        for (const section of visibleMenuSections) {
            if (section.type === 'single') {
                allHrefs.push(section.path);
            } else {
                section.items.forEach((item) => allHrefs.push(item.key));
            }
        }
        return allHrefs
            .filter((href) => {
                // Query-keyed entries (e.g. /maintenance/tasks?view=reports) match
                // only their exact URL; the longest-match sort below then wins over
                // the plain sibling so exactly one row carries the selection dot.
                if (href.includes('?')) return current === href;
                return href === '/' ? location.pathname === '/' : location.pathname === href || location.pathname.startsWith(`${href}/`);
            })
            .sort((a, b) => b.length - a.length)[0] ?? location.pathname;
    }, [location.pathname, location.search, visibleMenuSections]);

    /* ── Dual-screen mode ──
       While armed, picking a page from the side menu fills the secondary
       (right) pane instead of navigating; the current page stays on the left. */
    const handleSidebarNavigate = (path: string) => {
        if (splitMode && !isMobile && path !== location.pathname + location.search) {
            openSecondary(path);
            return;
        }
        guardedNavigate(path);
    };

    const canSwapPanes = isSplit && !!secondaryPath;
    const handleExitSplit = () => {
        const target = primaryCurrentPath || primaryRoute;
        exitSplit();
        if (target !== primaryRoute) guardedNavigate(target);
    };

    const handleOpenSecondaryFullPage = (path: string) => {
        exitSplit();
        guardedNavigate(path);
    };

    const handleSwapPanes = () => {
        const rightPath = secondaryCurrentPath || secondaryPath;
        if (!rightPath) return;
        const leftPath = primaryCurrentPath || primaryRoute;
        guardedNavigate(rightPath);
        openSecondary(leftPath);
    };

    /* ── Pane sizing: drag the divider to give one screen more space ── */
    const SPLIT_RATIO_KEY = 'offitec:split-ratio';
    const [splitRatio, setSplitRatio] = useState(() => {
        if (typeof window === 'undefined') return 50;
        const stored = Number(window.localStorage.getItem(SPLIT_RATIO_KEY));
        return Number.isFinite(stored) && stored >= 25 && stored <= 75 ? stored : 50;
    });
    const [isResizingPanes, setIsResizingPanes] = useState(false);
    const mainRef = useRef<HTMLElement>(null);

    useEffect(() => {
        window.localStorage.setItem(SPLIT_RATIO_KEY, String(Math.round(splitRatio)));
    }, [splitRatio]);

    const startPaneResize = (event: React.PointerEvent) => {
        event.preventDefault();
        const main = mainRef.current;
        if (!main) return;
        setIsResizingPanes(true);
        const onMove = (ev: PointerEvent) => {
            const rect = main.getBoundingClientRect();
            if (!rect.width) return;
            const pct = ((ev.clientX - rect.left) / rect.width) * 100;
            setSplitRatio(Math.min(75, Math.max(25, pct)));
        };
        const onUp = () => {
            setIsResizingPanes(false);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    const handleModuleSelect = (item: ModuleLauncherItem) => {
        setIsSearchOverlayOpen(false);
        if (item.path.startsWith('#')) return;
        guardedNavigate(item.path);
    };

    const MAIN_SIDEBAR_WIDTH = 256;
    const COLLAPSED_SIDEBAR_WIDTH = 72;
    const visibleWidth = sidebarPinnedOpen ? MAIN_SIDEBAR_WIDTH : COLLAPSED_SIDEBAR_WIDTH;

    // ── Secondary-pane shell: just the page, full width of the iframe ──
    if (IS_SPLIT_PANE) {
        return (
            <div
                className="h-screen bg-[#f6f8fb] font-sans text-[#1D1D1F]"
                // Fixed bars inside pages align to the shell inset — in the pane
                // there is no sidebar, so the content column starts at 0.
                style={{ '--app-shell-inset': '0px' } as React.CSSProperties}
            >
                <div
                    ref={pageScrollRef}
                    // `--page-gutter` is the page's horizontal padding; full-bleed
                    // children (e.g. the tender top bar) negate it to reach the edge.
                    className="h-full overflow-auto px-[var(--page-gutter)] py-4 [--page-gutter:1rem] sm:[--page-gutter:1.25rem]"
                >
                    <PaneErrorBoundary resetKey={location.pathname + location.search}>
                        <Outlet key={selectedTenantId || user?.tenantId || 'default'} />
                    </PaneErrorBoundary>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-[#f6f8fb] font-sans text-[#1D1D1F] lg:flex"
            // Live sidebar width, published as an inheritable CSS variable so any
            // viewport-fixed descendant can align its left edge to the content
            // column in every sidebar state — collapsed (72px) or pinned open
            // (256px). Page-level bars should prefer `sticky` + `--page-gutter`
            // (see TenderQuoteTopBar): a fixed bar spans the whole window and so
            // overlays the second screen in split view.
            style={{ '--app-shell-inset': `${visibleWidth}px` } as React.CSSProperties}
        >
            {/* ── Sidebar (Evernote-style rail: hover-peek, flyout side-tabs, no footer) ── */}
            <AppSidebar
                variant="desktop"
                sections={MENU_SECTIONS}
                activeUrl={activeUrl}
                roleProfile={roleProfile}
                permissions={permissions}
                projectModuleEnabled={projectModuleEnabled}
                onNavigate={handleSidebarNavigate}
                pinnedOpen={sidebarPinnedOpen}
                onTogglePin={() => setSidebarPinnedOpen((open) => !open)}
                onOpenSearch={() => setIsSearchOverlayOpen(true)}
                quickCreateItems={quickCreateItems}
                onQuickCreate={(qi) => {
                    const item = moduleLauncherItems.find((m) => m.id === qi.id);
                    if (item) handleModuleSelect(item);
                }}
            />

            {/* ── Mobile sidebar drawer ── */}
            <div
                className={`fixed inset-0 z-[80] lg:hidden ${isMobileSidebarOpen ? '' : 'pointer-events-none'}`}
                aria-hidden={!isMobileSidebarOpen}
            >
                <div
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-200 ${isMobileSidebarOpen ? 'opacity-100' : 'opacity-0'}`}
                />
                <div
                    className={`absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col bg-[#f6f8fb] shadow-2xl transition-transform duration-200 ease-out ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="flex h-14 items-center justify-between border-b border-slate-200/60 px-4">
                        <img src={isDarkMode ? offitecLogoDark : offitecLogo} alt="Offitec" width={360} height={143} decoding="async" fetchPriority="high" className="h-8 w-auto object-contain" />
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={() => setIsMobileSidebarOpen(false)}
                            className="flex size-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-[#d3e3fd]"
                        >
                            <CloseOutlined size={18} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1">
                        <AppSidebar
                            variant="mobile"
                            sections={MENU_SECTIONS}
                            activeUrl={activeUrl}
                            roleProfile={roleProfile}
                            permissions={permissions}
                            projectModuleEnabled={projectModuleEnabled}
                            onNavigate={(path) => { guardedNavigate(path); setIsMobileSidebarOpen(false); }}
                            pinnedOpen
                            onTogglePin={() => { }}
                            onOpenSearch={() => { setIsMobileSidebarOpen(false); setIsSearchOverlayOpen(true); }}
                            quickCreateItems={quickCreateItems}
                            onQuickCreate={(qi) => {
                                const item = moduleLauncherItems.find((m) => m.id === qi.id);
                                if (item) { setIsMobileSidebarOpen(false); handleModuleSelect(item); }
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Placeholder for sidebar space — animates in step with the sidebar width */}
            <div
                style={{ paddingLeft: visibleWidth }}
                className="invisible hidden transition-[padding-left] duration-300 ease-in-out lg:sticky lg:top-0 lg:bottom-0 lg:left-0 lg:block"
            />

            {/* ── Ana İçerik ── */}
            <div className="flex min-w-0 flex-1 flex-col pt-16">

                {/* Header */}
                <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between bg-[#f6f8fb] pr-3 pl-0 sm:pr-5">
                    <WorkspaceTabsProvider userId={user?.id}>
                        <div className="flex min-w-0 flex-1 items-center">
                            {/* Mobile drawer opener — the desktop header has no hamburger;
                                the sidebar's own chevron pins/collapses it. */}
                            <button
                                type="button"
                                aria-label={t('nav.sidebarPin')}
                                aria-pressed={isMobileSidebarOpen}
                                onClick={() => setIsMobileSidebarOpen((open) => !open)}
                                className="ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-[#d3e3fd] lg:hidden"
                            >
                                <MenuOutlined size={18} />
                            </button>

                            {/* ── Brand cluster: the logo stays fixed in the header at all
                                times (independent of the sidebar), with the split toggle and
                                "+" beside it. When the menu is open the cluster spans exactly
                                the menu width so the icons align with its edge. */}
                            <div
                                style={!isMobile && sidebarPinnedOpen ? { width: MAIN_SIDEBAR_WIDTH } : undefined}
                                className="flex shrink-0 items-center gap-1.5 pl-3 pr-2"
                            >
                                <a
                                    href={hrefFor('/')}
                                    onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); guardedNavigate('/'); }}
                                    className={`flex h-9 min-w-0 items-center ${!isMobile && sidebarPinnedOpen ? 'flex-1' : ''}`}
                                >
                                    <img
                                        src={isDarkMode ? offitecLogoDark : offitecLogo}
                                        srcSet={`${isDarkMode ? offitecLogoDark : offitecLogo} 96w, ${isDarkMode ? offitecLogoDark2x : offitecLogo2x} 180w`}
                                        sizes="96px"
                                        alt="Offitec Heating Cooling"
                                        width={96}
                                        height={38}
                                        decoding="async"
                                        fetchPriority="high"
                                        className="h-8 w-auto max-w-[120px] object-contain"
                                    />
                                </a>
                                {/* Dual-screen toggle — arming it collapses the menu. */}
                                <SplitViewToggle
                                    onEnter={() => setSidebarPinnedOpen(false)}
                                    onExit={handleExitSplit}
                                    className="hidden size-8 shrink-0 lg:flex"
                                />
                                <WorkspaceTabLauncher className="hidden lg:block" />
                            </div>

                            {/* ── Middle: workspace tabs ── */}
                            <div className="flex min-w-0 flex-1 items-center gap-2 pl-2">
                                <WorkspaceTabStrip />
                            </div>
                        </div>
                    </WorkspaceTabsProvider>

                    <div className="flex items-center gap-1">
                        {tenants.length > 0 && (
                            <div className="mr-2 hidden items-center sm:flex">
                                <label className="relative block">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                                        <BankOutlined size={13} />
                                    </span>
                                    <select
                                    value={selectedTenantId || undefined}
                                    onChange={(event) => setSelectedTenant(event.target.value)}
                                    className="h-9 w-[190px] appearance-none rounded-lg border border-slate-200 bg-white py-0 pl-8 pr-8 text-[13px] font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-[#272f67] focus:ring-2 focus:ring-[#272f67]/10 dark:border-white/10 dark:bg-[#151616] dark:text-slate-200"
                                    title={t('nav.modules')}
                                    aria-label={t('nav.modules')}
                                    >
                                        {tenants.map((tenant) => (
                                            <option key={tenant.id} value={tenant.id}>
                                                {tenant.parentTenantId ? `  ${tenant.tenantName}` : tenant.tenantName}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-400" aria-hidden="true">
                                        ▾
                                    </span>
                                </label>
                            </div>
                        )}

                        <a
                            href={hrefFor('/calendar')}
                            onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); guardedNavigate('/calendar'); }}
                            className={`mr-1 inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold shadow-xs transition-colors ${location.pathname === '/calendar'
                                ? 'border-[#272f67] bg-[#272f67] text-white'
                                : 'border-slate-200/90 bg-white text-slate-700 hover:border-[#d3e3fd] hover:bg-[#d3e3fd] hover:text-[#1f2654]'
                                }`}
                            title={t('nav.calendar')}
                            aria-label={t('nav.calendar')}
                        >
                            <CalendarOutlined style={{ fontSize: 16 }} />
                            <span className="hidden sm:inline">{t('nav.calendar')}</span>
                        </a>

                        <button
                            onClick={async () => {
                                setIsNotificationPanelOpen(true);
                                await notificationApi.markAllRead().catch(() => { });
                                setNotifications((rows) => rows.map((row) => ({ ...row, isRead: true })));
                            }}
                            className="relative flex size-9 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-[#d3e3fd]"
                            aria-label={t('nav.notifications')}
                        >
                            <BellOutlined size={16} />
                            {unreadNotificationCount + alertCount > 0 && (
                                <span className="absolute right-0 top-0 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white dark:ring-[#08090a]">
                                    {unreadNotificationCount + alertCount > 99 ? '99+' : unreadNotificationCount + alertCount}
                                </span>
                            )}
                        </button>
                        <LanguageSwitcher />
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                                className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-[#d3e3fd] text-left"
                            >
                                <div className="flex size-8 items-center justify-center rounded-full bg-[#272f67] text-[11px] font-semibold text-white ring-2 ring-[#d3e3fd]">
                                    {initials || <UserOutlined style={{ fontSize: 14 }} />}
                                </div>
                            </button>

                            {isProfileDropdownOpen && (
                                <div className="absolute top-10 right-0 z-50 w-56 rounded-xl bg-primary p-1.5 shadow-lg ring-1 ring-secondary_alt animate-in fade-in slide-in-from-top-2">
                                    <div className="border-b border-secondary px-3 py-2.5">
                                        <p className="text-sm font-semibold text-primary">{user?.firstName} {user?.lastName}</p>
                                        <p className="mt-0.5 truncate text-xs text-tertiary">{user?.email}</p>
                                    </div>
                                    <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-brand-primary_alt hover:text-brand-secondary">
                                        <UserOutlined style={{ fontSize: 13 }} className="text-slate-400" /> {t('nav.profile')}
                                    </button>
                                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-brand-primary_alt hover:text-brand-secondary">
                                        <SettingOutlined style={{ fontSize: 13 }} className="text-slate-400" /> {t('nav.settingsMenu')}
                                    </button>
                                    <div className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary">
                                        {isDarkMode
                                            ? <LuSun size={13} className="text-slate-400" />
                                            : <LuMoon size={13} className="text-slate-400" />}
                                        <span className="flex-1 text-left">{t('common.darkMode', { defaultValue: 'Dark mode' })}</span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={isDarkMode}
                                            onClick={toggleTheme}
                                            aria-label={t('common.darkMode', { defaultValue: 'Dark mode' })}
                                            className={`relative h-5 w-9 shrink-0 rounded-full ${isDarkMode ? 'bg-[#e6cf9e]' : 'bg-slate-300'}`}
                                        >
                                            <span
                                                className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`}
                                            />
                                        </button>
                                    </div>
                                    <div className="my-1 border-t border-secondary" />
                                    <button
                                        onClick={() => {
                                            setIsProfileDropdownOpen(false);
                                            logout();
                                            navigate('/login');
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-error-primary transition-colors hover:bg-error-primary"
                                    >
                                        <LogoutOutlined style={{ fontSize: 13 }} /> {t('nav.logout')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {isSearchOverlayOpen && (
                    <div
                        className="fixed inset-0 z-[70] bg-slate-950/15 backdrop-blur-[6px] animate-in fade-in duration-200 dark:bg-black/55 dark:backdrop-blur-[10px]"
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) setIsSearchOverlayOpen(false);
                        }}
                    >
                        <div className="mx-auto mt-[18vh] w-[min(680px,calc(100%_-_32px))] animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex h-14 items-center gap-3 rounded-[14px] border border-slate-200 bg-white/95 px-4 shadow-[0_24px_70px_rgba(15,23,42,0.20)] backdrop-blur-xl dark:border-white/18 dark:bg-[#0d1220]/88 dark:shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
                                <SearchOutlined style={{ fontSize: 20 }} className="shrink-0 text-slate-400 dark:text-white/80" />
                                <input
                                    ref={searchOverlayInputRef}
                                    value={globalSearch}
                                    onChange={(event) => setGlobalSearch(event.target.value)}
                                    placeholder={t('nav.search')}
                                    className="h-full min-w-0 flex-1 border-0 bg-transparent text-[16px] font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/55"
                                />
                                {globalSearch && (
                                    <button
                                        type="button"
                                        aria-label={t('common.clear')}
                                        onClick={() => setGlobalSearch('')}
                                        className="flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/70 dark:hover:bg-white/12 dark:hover:text-white"
                                    >
                                        <CloseOutlined style={{ fontSize: 14 }} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    aria-label={t('common.close')}
                                    onClick={() => setIsSearchOverlayOpen(false)}
                                    className="flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/70 dark:hover:bg-white/12 dark:hover:text-white"
                                >
                                    <CloseOutlined style={{ fontSize: 14 }} />
                                </button>
                            </div>

                            <div className="mt-3 max-h-[430px] overflow-y-auto rounded-[14px] border border-slate-200 bg-white/95 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/18 dark:bg-[#0d1220]/88 dark:shadow-[0_18px_70px_rgba(0,0,0,0.5)]">
                                {filteredModuleSearchItems.length > 0 ? (
                                    <div className="grid gap-1">
                                        {filteredModuleSearchItems.map((item) => {
                                            const ItemIcon = item.icon;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => handleModuleSelect(item)}
                                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#eef4ff] dark:hover:bg-white/12"
                                                >
                                                    <ItemIcon className={`shrink-0 ${item.iconClassName || 'text-[#1f2654]'}`} style={{ fontSize: 22 }} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[14px] font-semibold text-slate-900 dark:text-white">{t(item.label)}</span>
                                                        <span className="block truncate text-[12px] font-semibold text-slate-500 dark:text-white/68">{t(item.group)}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="px-4 py-8 text-center text-[13px] font-medium text-slate-500">
                                        {t('nav.noResults')}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Page content */}
                <main ref={mainRef} className="relative flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#f6f8fb]">
                    <div
                        ref={pageScrollRef}
                        style={isSplit && !isMobile ? { width: `${splitRatio}%` } : undefined}
                        className={`${isSplit && !isMobile
                            ? `min-w-0 flex-1 overflow-hidden lg:flex-none lg:flex-shrink-0 lg:border-r lg:border-slate-200/70 ${isResizingPanes ? 'pointer-events-none select-none' : ''}`
                            : 'flex-1 overflow-auto px-[var(--page-gutter)] py-5 [--page-gutter:1rem] sm:[--page-gutter:1.5rem] lg:py-6 lg:[--page-gutter:2rem]'}`}
                    >
                        {isSplit && !isMobile ? (
                            <PrimaryPane
                                path={primaryRoute}
                                onLocationChange={reportPrimaryLocation}
                            />
                        ) : (
                            <PaneErrorBoundary resetKey={primaryRoute}>
                                <Outlet key={selectedTenantId || user?.tenantId || 'default'} />
                            </PaneErrorBoundary>
                        )}
                    </div>

                    {/* Divider: drag anywhere on the strip to resize the two screens;
                        the middle buttons swap them or drop back to single-page view
                        (the left page remains). */}
                    {isSplit && (
                        <div
                            className="absolute inset-y-0 z-30 hidden w-4 -translate-x-1/2 lg:block"
                            style={{ left: `${splitRatio}%` }}
                        >
                            <div
                                onPointerDown={startPaneResize}
                                className="absolute inset-0 cursor-col-resize transition-colors hover:bg-sky-400/15"
                            />
                            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
                                <button
                                    type="button"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={handleSwapPanes}
                                    disabled={!canSwapPanes}
                                    title={t('nav.swapPanes')}
                                    aria-label={t('nav.swapPanes')}
                                    className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-[#d3e3fd] hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-[#1c1d1f] dark:text-white/80 dark:hover:bg-white/10"
                                >
                                    <SwapOutlined size={14} />
                                </button>
                                <button
                                    type="button"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={handleExitSplit}
                                    title={t('nav.closeSplitView')}
                                    aria-label={t('nav.closeSplitView')}
                                    className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-[#d3e3fd] hover:text-[#1f2654] dark:border-white/15 dark:bg-[#1c1d1f] dark:text-white/80 dark:hover:bg-white/10"
                                >
                                    <CloseOutlined size={14} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Split view is a desktop feature — the secondary pane is hidden
                        on mobile. While dragging the divider the iframe must not
                        swallow pointer events, or the drag would stick. */}
                    {isSplit && (
                        <div className={`hidden lg:block lg:min-w-0 lg:flex-1 overflow-hidden ${isResizingPanes ? 'pointer-events-none select-none' : ''}`}>
                            <SecondaryPane
                                onClose={handleExitSplit}
                                onOpenFullPage={handleOpenSecondaryFullPage}
                            />
                        </div>
                    )}
                </main>
            </div>

            {/* Bildirimler Panel */}
            <SlidePanel
                open={isNotificationPanelOpen}
                onClose={() => setIsNotificationPanelOpen(false)}
                title={t('nav.notifications')}
                subtitle={t('nav.notificationsSub')}
            >
                <div>
                    <div className="mb-3 flex justify-end">
                        <button
                            type="button"
                            className="text-[12px] font-semibold text-slate-600 hover:text-slate-950"
                            onClick={async () => {
                                await notificationApi.markAllRead();
                                setNotifications((rows) => rows.map((row) => ({ ...row, isRead: true })));
                            }}
                        >
                            {t('nav.markAllRead')}
                        </button>
                    </div>
                    {notificationsLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded bg-slate-100" />)}
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-[13px] text-slate-500">
                            {t('nav.noNotifications')}
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {notifications.map((notification) => (
                                <button
                                    key={notification.id}
                                    type="button"
                                    // Unread rows carry a tinted background so they stand out at a glance.
                                    className={`flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors ${notification.isRead ? 'hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-sky-50/80 hover:bg-sky-100/80 dark:bg-sky-400/10 dark:hover:bg-sky-400/15'}`}
                                    onClick={async () => {
                                        if (!notification.isRead) {
                                            await notificationApi.markRead(notification.id).catch(() => undefined);
                                            setNotifications((rows) => rows.map((row) => row.id === notification.id ? { ...row, isRead: true } : row));
                                        }
                                        if (notification.linkUrl) {
                                            setIsNotificationPanelOpen(false);
                                            guardedNavigate(notification.linkUrl);
                                        }
                                    }}
                                >
                                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.isRead ? 'bg-slate-200' : 'bg-red-600'}`} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-semibold text-slate-900">{notification.title}</p>
                                        <p className="mt-0.5 text-[12px] text-slate-500">{notification.message}</p>
                                    </div>
                                    <span className="shrink-0 text-[11px] text-slate-400">
                                        {new Date(notification.createdAt).toLocaleDateString(activeLocale)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </SlidePanel>

            {/* App-level urgent alerts (top-right page-turn deck, 10-day snooze).
                Dismissed cards are archived into the notification list. */}
            <DeferredGlobalAlertStack
                onCountChange={setAlertCount}
                onArchived={() => {
                    notificationApi.list({ limit: 40 })
                        .then(setNotifications)
                        .catch(() => undefined);
                }}
            />
        </div>
    );
};

/* ── Provider sarmalayıcı ── */
export const MainLayout: React.FC = () => (
    <SplitViewProvider>
        <MainLayoutInner />
    </SplitViewProvider>
);
