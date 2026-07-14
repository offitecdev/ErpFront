import React, { useEffect, useState, useRef, useMemo } from 'react';
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
    SwitchHorizontal01 as SplitCellsOutlined,
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
import Badge from 'antd/es/badge';
import AntSelect from 'antd/es/select';
import Switch from 'antd/es/switch';
import { SlidePanel } from './SlidePanel';
import { AppSidebar, type QuickCreateItem } from './AppSidebar';
import { WorkspaceTabs } from './WorkspaceTabs';
import { SplitViewProvider, useSplitView, SPLITABLE_ROUTES, type SplitablePath } from './SplitViewContext';
import { SecondaryPane } from './SecondaryPane';
import { notificationApi, type NotificationDto } from '../../lib/api/notifications';
import { LanguageSwitcher } from '../ui-shared/LanguageSwitcher';
import offitecLogo from '../../assets/images/offitec.png';
import offitecLogoDark from '../../assets/images/darkmode.png';

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

/* ── İç Layout ── */
const MainLayoutInner: React.FC = () => {
    const navigate = useNavigate();
    // Menu / tab switches use this so leaving a tender with unsaved changes prompts
    // to save first; direct `navigate` stays for programmatic redirects.
    const guardedNavigate = useGuardedNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation();

    const { user, logout, permissions, tenants, selectedTenantId, setSelectedTenant } = useAuthStore();
    const { fetchTodayAttendance } = useAttendanceStore();
    const { isSplit, openSplit } = useSplitView();
    const { isDarkMode, toggleTheme } = useThemeStore();

    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
    const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationDto[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [isSplitMenuOpen, setIsSplitMenuOpen] = useState(false);
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
    const splitMenuRef = useRef<HTMLDivElement>(null);
    const searchOverlayInputRef = useRef<HTMLInputElement>(null);
    const pageScrollRef = useRef<HTMLDivElement>(null);
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
            if (splitMenuRef.current && !splitMenuRef.current.contains(event.target as Node)) {
                setIsSplitMenuOpen(false);
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

            headers.forEach((header) => {
                const table = header.closest('table');
                if (!table) return;
                const tableRect = table.getBoundingClientRect();
                const isStuck = tableRect.top < scrollportTop
                    && tableRect.bottom > scrollportTop + header.offsetHeight;
                header.toggleAttribute('data-scroll-stuck', isStuck);
            });
        };
        const scheduleUpdate = () => {
            if (animationFrame) return;
            animationFrame = window.requestAnimationFrame(updateStickyTableHeaders);
        };

        scheduleUpdate();
        scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
        window.addEventListener('resize', scheduleUpdate);
        const contentObserver = new MutationObserver(scheduleUpdate);
        contentObserver.observe(scroller, { childList: true, subtree: true });

        return () => {
            scroller.removeEventListener('scroll', scheduleUpdate);
            window.removeEventListener('resize', scheduleUpdate);
            contentObserver.disconnect();
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
        if (!user?.id) return;
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

    const canSplit = SPLITABLE_ROUTES.some(r => r.path === location.pathname);

    const activeUrl = useMemo(() => {
        const allHrefs: string[] = [];
        for (const section of visibleMenuSections) {
            if (section.type === 'single') {
                allHrefs.push(section.path);
            } else {
                section.items.forEach((item) => allHrefs.push(item.key));
            }
        }
        return allHrefs
            .filter((href) => href === '/' ? location.pathname === '/' : location.pathname === href || location.pathname.startsWith(`${href}/`))
            .sort((a, b) => b.length - a.length)[0] ?? location.pathname;
    }, [location.pathname, visibleMenuSections]);

    const handleModuleSelect = (item: ModuleLauncherItem) => {
        setIsSearchOverlayOpen(false);
        if (item.path.startsWith('#')) return;
        guardedNavigate(item.path);
    };

    const MAIN_SIDEBAR_WIDTH = 256;
    const COLLAPSED_SIDEBAR_WIDTH = 72;
    const visibleWidth = sidebarPinnedOpen ? MAIN_SIDEBAR_WIDTH : COLLAPSED_SIDEBAR_WIDTH;

    return (
        <div
            className="min-h-screen bg-[#f8fafd] font-sans text-[#1D1D1F] lg:flex"
            // Live sidebar width, published as an inheritable CSS variable so
            // viewport-fixed descendants (e.g. TenderQuoteTopBar) can align their
            // left edge to the content column in every sidebar state — collapsed
            // (72px) or pinned open (256px). A fixed left offset alone hid the bar's
            // buttons behind the pinned sidebar.
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
                onNavigate={(path) => guardedNavigate(path)}
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
                    className={`absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col bg-[#f8fafd] shadow-2xl transition-transform duration-200 ease-out ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
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
                <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between bg-[#f8fafd] pr-3 pl-0 sm:pr-5">
                    <div className="flex min-w-0 flex-1 items-center">
                        <div className="flex w-[72px] shrink-0 items-center justify-center">
                            <button
                                type="button"
                                aria-label={sidebarPinnedOpen ? t('nav.sidebarCollapse') : t('nav.sidebarPin')}
                                aria-pressed={isMobile ? isMobileSidebarOpen : sidebarPinnedOpen}
                                onClick={() => {
                                    // Read the breakpoint at click time so a stale `isMobile`
                                    // state can never block the drawer from opening.
                                    if (window.matchMedia('(max-width: 1023px)').matches) {
                                        setIsMobileSidebarOpen((open) => !open);
                                    } else {
                                        setSidebarPinnedOpen((open) => !open);
                                    }
                                }}
                                className="flex size-10 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-[#d3e3fd]"
                            >
                                <MenuOutlined size={18} />
                            </button>
                        </div>
                        <a
                            href={hrefFor('/')}
                            onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); guardedNavigate('/'); }}
                            className="ml-2 flex h-9 shrink-0 items-center"
                        >
                            <img src={isDarkMode ? offitecLogoDark : offitecLogo} alt="Offitec Heating Cooling" width={360} height={143} decoding="async" fetchPriority="high" className="h-9 w-auto max-w-[148px] object-contain" />
                        </a>
                        <button
                            type="button"
                            aria-label={t('nav.search')}
                            onClick={() => setIsSearchOverlayOpen(true)}
                            className="ml-9 hidden size-10 shrink-0 items-center justify-center rounded-full bg-[#eaf1fb] text-slate-700 transition-[background-color,box-shadow,transform] duration-200 hover:bg-white hover:text-[#1f2654] hover:shadow-xs hover:ring-1 hover:ring-[#d3e3fd] sm:flex"
                        >
                            <SearchOutlined style={{ fontSize: 19 }} />
                        </button>
                        <WorkspaceTabs userId={user?.id} />
                    </div>

                    <div className="flex items-center gap-1">
                        {tenants.length > 0 && (
                            <div className="mr-2 hidden items-center sm:flex">
                                <AntSelect
                                    value={selectedTenantId || undefined}
                                    onChange={(value: string) => setSelectedTenant(value)}
                                    className="offitec-tenant-select"
                                    style={{ width: 190, height: 36 }}
                                    size="middle"
                                    prefix={<BankOutlined style={{ fontSize: 13, color: '#64748b' }} />}
                                    title={t('nav.modules')}
                                    options={tenants.map((tenant) => ({
                                        value: tenant.id,
                                        label: tenant.parentTenantId ? `  ${tenant.tenantName}` : tenant.tenantName,
                                    }))}
                                />
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

                        {/* Split view */}
                        {canSplit && (
                            <div className="relative" ref={splitMenuRef}>
                                <button
                                    onClick={() => setIsSplitMenuOpen(!isSplitMenuOpen)}
                                    className={`flex size-9 items-center justify-center rounded-full transition-colors ${isSplit
                                        ? "bg-[#272f67]/8 text-[#272f67]"
                                        : 'text-slate-600 hover:bg-[#d3e3fd]'
                                        }`}
                                    title={t('nav.splitView')}
                                    aria-label={t('nav.splitView')}
                                >
                                    <SplitCellsOutlined style={{ fontSize: 18 }} />
                                </button>

                                {isSplitMenuOpen && (
                                    <div className="absolute top-9 right-0 z-50 w-60 rounded-xl bg-primary p-1.5 shadow-lg ring-1 ring-secondary_alt animate-in fade-in slide-in-from-top-2">
                                        <div className="border-b border-secondary px-2.5 py-2 text-xs font-semibold text-tertiary">
                                            {t('nav.splitPane')}
                                        </div>
                                        {SPLITABLE_ROUTES
                                            .filter(r => !r.permission || permissions.includes(r.permission))
                                            .filter(r => r.path !== location.pathname)
                                            .map(r => (
                                                <button
                                                    key={r.path}
                                                    onClick={() => {
                                                        openSplit(r.path as SplitablePath);
                                                        setIsSplitMenuOpen(false);
                                                    }}
                                                    className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-secondary transition-colors hover:bg-brand-primary_alt hover:text-brand-secondary"
                                                >
                                                    {t(r.label)}
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={async () => {
                                setIsNotificationPanelOpen(true);
                                await notificationApi.markAllRead().catch(() => { });
                                setNotifications((rows) => rows.map((row) => ({ ...row, isRead: true })));
                            }}
                            className="relative flex size-9 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-[#d3e3fd]"
                            aria-label={t('nav.notifications')}
                        >
                            <Badge count={unreadNotificationCount > 0 ? unreadNotificationCount : 0} size="small" offset={[-2, 2]}>
                                <BellOutlined style={{ fontSize: 16 }} />
                            </Badge>
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
                                        <Switch
                                            size="small"
                                            checked={isDarkMode}
                                            onChange={toggleTheme}
                                            aria-label={t('common.darkMode', { defaultValue: 'Dark mode' })}
                                        />
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
                <main className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#f8fafd]">
                    <div ref={pageScrollRef} className={`overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-6 transition-all duration-200 ${isSplit ? 'flex-1 lg:w-1/2 lg:flex-none lg:flex-shrink-0 lg:border-r lg:border-slate-200/70' : 'flex-1'}`}>
                        <Outlet key={selectedTenantId || user?.tenantId || 'default'} />
                    </div>

                    {/* Split view is a desktop feature — the secondary pane is hidden on mobile */}
                    {isSplit && (
                        <div className="hidden lg:block lg:w-1/2 lg:flex-shrink-0 overflow-hidden">
                            <SecondaryPane />
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
                                    className="flex w-full items-start gap-3 rounded px-2 py-3 text-left transition-colors hover:bg-slate-50"
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
        </div>
    );
};

/* ── Provider sarmalayıcı ── */
export const MainLayout: React.FC = () => (
    <SplitViewProvider>
        <MainLayoutInner />
    </SplitViewProvider>
);
