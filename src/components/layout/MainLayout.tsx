import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import {
    Bell01 as BellOutlined,
    Box as AppstoreOutlined,
    Briefcase01 as FundProjectionScreenOutlined,
    Building02 as BankOutlined,
    Building05 as ContactsOutlined,
    Calendar as CalendarOutlined,
    Check as CheckOutlined,
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
    XClose as CloseOutlined,
} from '../icons/antIconCompat';
import { Badge, Button as AntButton, Select as AntSelect, Menu } from 'antd';
import { SlidePanel } from './SlidePanel';
import { SplitViewProvider, useSplitView, SPLITABLE_ROUTES, type SplitablePath } from './SplitViewContext';
import { SecondaryPane } from './SecondaryPane';
import { notificationApi, type NotificationDto } from '../../lib/api/notifications';
import { LanguageSwitcher } from '../ui-shared/LanguageSwitcher';
import offitecLogo from '../../assets/images/offitec.png';

import { t as i18nT } from '@/i18n/translate';

/* ── Menü Tipleri ── */
type MenuLeaf = { key: string; label: string; permission?: string; hideForTechnician?: boolean; technicianOnly?: boolean };
type MenuIcon = React.ComponentType<any>;
type QuickAction = {
    id: string;
    label: string;
    path: string;
    icon: MenuIcon;
    permission?: string;
    feature?: 'projects';
};
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
        label: 'nav.attendance',
        icon: ClockCircleOutlined,
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
            { key: '/crm/my-orders', label: 'nav.myOrders', permission: 'crm.customers.view' },
        ],
    },
    {
        type: 'group',
        key: 'inventory',
        label: 'nav.inventory',
        icon: InboxOutlined,
        items: [
            { key: '/inventory', label: 'nav.inventoryDashboard', permission: 'inventory.view', hideForTechnician: true },
            { key: '/inventory/articles', label: 'nav.articles', permission: 'inventory.view', hideForTechnician: true },
            { key: '/inventory/suppliers', label: 'nav.suppliers', permission: 'inventory.view', hideForTechnician: true },
            { key: '/inventory/extra-materials', label: 'nav.materials', permission: 'inventory.view', hideForTechnician: true },
            { key: '/inventory/locations', label: 'nav.locations', permission: 'inventory.view', hideForTechnician: true },
            { key: '/inventory/movements', label: 'nav.movements', permission: 'inventory.transfer', hideForTechnician: true },
            { key: '/inventory/proposals', label: 'nav.purchaseProposals', permission: 'inventory.proposals.manage', hideForTechnician: true },
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
            { key: '/maintenance/technician/calendar', label: 'nav.technicianCalendar', permission: 'maintenance.tasks.manage', technicianOnly: true },
            { key: '/maintenance/technician/tasks', label: 'nav.technicianTasks', permission: 'maintenance.tasks.manage', technicianOnly: true },
            { key: '/maintenance/reports', label: 'nav.maintenanceReports', permission: 'maintenance.reports.manage', hideForTechnician: true },
            { key: '/maintenance/regie', label: 'nav.regie', permission: 'regie.calls.manage', hideForTechnician: true },
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
            { key: '/crm/my-orders', label: 'nav.myOrders', permission: 'crm.customers.view', hideForTechnician: true },
            { key: '/projects/installation/calendar', label: 'nav.installationCalendar', permission: 'projects.report', technicianOnly: true },
            { key: '/projects/installation/tasks', label: 'nav.installationTasks', permission: 'projects.report', technicianOnly: true },
            { key: '/settings/mail', label: 'nav.mailSettings', permission: 'mail.manage', hideForTechnician: true },
        ],
    },
    {
        type: 'group',
        key: 'settings',
        label: 'nav.settings',
        icon: SettingOutlined,
        items: [
            { key: '/settings/pdf', label: 'nav.pdfSettings' },
        ],
    },
];

const QUICK_ACTION_STORAGE_KEY = 'offitec:header-quick-actions';
MENU_SECTIONS.forEach((section) => {
    if (section.type !== 'group' || section.key !== 'projects') return;
    section.items.forEach((item) => {
        if (item.key === '/projects/installation/calendar' || item.key === '/projects/installation/tasks') item.permission = undefined;
        if (item.key === '/projects/installation/calendar') item.label = 'nav.technicianInstallationCalendar';
        if (item.key === '/projects/installation/tasks') item.label = 'nav.technicianInstallations';
    });
});

const QUICK_ACTION_LIMIT = 4;
const DEFAULT_QUICK_ACTION_IDS = ['new-tender', 'maintenance', 'inventory', 'customers'];
const QUICK_ACTIONS: QuickAction[] = [
    { id: 'new-tender', label: 'nav.quickActionsGroup.newTender', path: '/crm/tenders/new', icon: PlusOutlined, permission: 'tenders.manage' },
    { id: 'maintenance', label: 'nav.quickActionsGroup.maintenance', path: '/maintenance', icon: CalendarOutlined, permission: 'maintenance.contracts.manage' },
    { id: 'inventory', label: 'nav.quickActionsGroup.inventory', path: '/inventory/articles', icon: InboxOutlined, permission: 'inventory.view' },
    { id: 'customers', label: 'nav.quickActionsGroup.customers', path: '/crm/customers', icon: ContactsOutlined, permission: 'crm.customers.view' },
    { id: 'shipment', label: 'nav.quickActionsGroup.shipment', path: '/logistics/shipments/new', icon: CarOutlined, permission: 'logistics.manage' },
    { id: 'employees', label: 'nav.quickActionsGroup.employees', path: '/employees', icon: TeamOutlined },
    { id: 'projects', label: 'nav.quickActionsGroup.projects', path: '/projects', icon: FundProjectionScreenOutlined, permission: 'projects.view', feature: 'projects' },
    { id: 'regie', label: 'nav.quickActionsGroup.regie', path: '/maintenance/regie', icon: ClockCircleOutlined, permission: 'regie.calls.manage' },
];

const MODULE_LAUNCHER_ITEMS: ModuleLauncherItem[] = [
    {
        id: 'create-tender',
        label: 'nav.quickActionsGroup.newTender',
        path: '/crm/tenders/new',
        icon: PlusOutlined,
        group: 'nav.moduleGroups.quickAction',
        cardClassName: 'border-sky-200/60 bg-sky-50/70 text-sky-950 shadow-sky-900/5 hover:bg-sky-100/80',
        iconClassName: 'text-sky-600',
        keywords:i18nT('auto.yeni_teklif_teklif_olustur_crm_new_tender_offer'),
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
        keywords:i18nT('auto.yeni_proje_proje_ekle_proje_yonetimi_project_man'),
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
        keywords:i18nT('auto.satis_siparisi_siparis_order_my_orders'),
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
        keywords:i18nT('auto.musteri_musteri_listesi_crm_customers'),
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
        keywords:i18nT('auto.teklifler_teklif_yonetimi_crm_tenders_offers'),
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
        keywords:i18nT('auto.stok_urunler_malzeme_depo_inventory_stock_produc'),
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
        keywords:i18nT('auto.bakim_bakim_panosu_randevu_sozlesme_maintenance'),
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
        keywords:i18nT('auto.regie_ariza_operasyon_servis_cagri'),
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
        keywords:i18nT('auto.personel_calisan_ekip_rol_employees_staff'),
    },
];

/* ── Sidebar Ant Design Menu ── */
const SidebarMenu: React.FC<{
    sections: MenuSection[];
    activeUrl: string;
    isTechnician: boolean;
    permissions: string[];
    projectModuleEnabled: boolean;
    onNavigate: (path: string) => void;
    collapsed: boolean;
}> = ({ sections, activeUrl, isTechnician, permissions, projectModuleEnabled, onNavigate, collapsed }) => {
    const { t } = useTranslation();
    const canSee = (item: MenuLeaf) => {
        if (isTechnician && item.hideForTechnician) return false;
        if (!isTechnician && item.technicianOnly) return false;
        return !item.permission || permissions.includes(item.permission);
    };

    const menuItems = sections
        .filter((section) => section.feature !== 'projects' || projectModuleEnabled)
        .map((section) => {
            if (section.type === 'single') {
                const Icon = section.icon;
                return {
                    key: section.path,
                    icon: <Icon size={18} />,
                    label: t(section.label),
                };
            }
            const visibleChildren = section.items.filter(canSee);
            if (!visibleChildren.length) return null;
            const Icon = section.icon;
            return {
                key: section.key,
                icon: <Icon size={18} />,
                label: t(section.label),
                popupClassName: 'offitec-sidebar-menu-popup',
                children: visibleChildren.map((item) => ({
                    key: item.key,
                    label: t(item.label),
                })),
            };
        })
        .filter(Boolean) as any[];

    const selectedKeys = menuItems.flatMap((item: any) => {
        if (item.children) {
            return item.children
                .filter((child: any) => child.key === activeUrl)
                .map((child: any) => child.key);
        }
        if (item.key === activeUrl) {
            return [item.key];
        }
        return [];
    });

    const defaultOpenKeys = !collapsed ? menuItems
        .filter((item: any) => item.children?.some((child: any) => selectedKeys.includes(child.key)))
        .map((item: any) => item.key) : [];

    return (
        <Menu
            className="offitec-sidebar-menu"
            mode="inline"
            selectedKeys={selectedKeys}
            defaultOpenKeys={defaultOpenKeys}
            items={menuItems}
            onClick={({ key }) => onNavigate(key)}
            inlineCollapsed={collapsed}
            style={{
                border: 'none',
                background: 'transparent',
                fontSize: 13,
                fontWeight: 500,
            }}
        />
    );
};

/* ── İç Layout ── */
const MainLayoutInner: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation();

    const { user, logout, permissions, tenants, selectedTenantId, setSelectedTenant } = useAuthStore();
    const { fetchTodayAttendance } = useAttendanceStore();
    const { isSplit, openSplit } = useSplitView();

    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
    const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationDto[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [isSplitMenuOpen, setIsSplitMenuOpen] = useState(false);
    const [isQuickActionMenuOpen, setIsQuickActionMenuOpen] = useState(false);
    const [isModuleMenuOpen, setIsModuleMenuOpen] = useState(false);
    const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
    const [globalSearch, setGlobalSearch] = useState('');
    const SIDEBAR_OPEN_STORAGE_KEY = "offitec:sidebar-open";
    const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY) === 'true';
    });
    const [quickActionIds, setQuickActionIds] = useState<string[]>(() => {
        if (typeof window === 'undefined') return DEFAULT_QUICK_ACTION_IDS;
        try {
            const stored = JSON.parse(window.localStorage.getItem(QUICK_ACTION_STORAGE_KEY) || '[]');
            if (Array.isArray(stored) && stored.every((item) => typeof item === 'string')) {
                return stored.slice(0, QUICK_ACTION_LIMIT);
            }
        } catch {
            // Ignore corrupted localStorage and fall back to defaults.
        }
        return DEFAULT_QUICK_ACTION_IDS;
    });

    const dropdownRef = useRef<HTMLDivElement>(null);
    const splitMenuRef = useRef<HTMLDivElement>(null);
    const quickActionMenuRef = useRef<HTMLDivElement>(null);
    const moduleMenuRef = useRef<HTMLDivElement>(null);
    const searchOverlayInputRef = useRef<HTMLInputElement>(null);
    const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) || null;
    const projectModuleEnabled = selectedTenant?.isProjectModuleEnabled !== false;
    const isTechnician = useMemo(
        () => user?.roleName?.toLowerCase().includes('teknisyen') || user?.employeeRoles?.some((r: any) => r.role?.roleName?.toLowerCase().includes('teknisyen')),
        [user],
    );
    const visibleMenuSections = useMemo(
        () => MENU_SECTIONS.filter((section) => section.feature !== 'projects' || projectModuleEnabled),
        [projectModuleEnabled]
    );
    const availableQuickActions = useMemo(
        () => QUICK_ACTIONS.filter((action) => {
            const hasPermission = !action.permission || permissions.includes(action.permission);
            const featureEnabled = action.feature !== 'projects' || projectModuleEnabled;
            return hasPermission && featureEnabled;
        }),
        [permissions, projectModuleEnabled],
    );
    const visibleQuickActions = useMemo(() => {
        const byId = new Map(availableQuickActions.map((action) => [action.id, action]));
        const orderedIds = [
            ...quickActionIds,
            ...DEFAULT_QUICK_ACTION_IDS.filter((id) => !quickActionIds.includes(id)),
        ];
        return orderedIds.map((id) => byId.get(id)).filter(Boolean).slice(0, QUICK_ACTION_LIMIT) as QuickAction[];
    }, [availableQuickActions, quickActionIds]);
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
    const activeModuleId = useMemo(() => {
        return moduleLauncherItems
            .filter((item) => item.path === location.pathname || (item.path !== '/' && location.pathname.startsWith(item.path + '/')))
            .sort((a, b) => b.path.length - a.path.length)[0]?.id;
    }, [location.pathname, moduleLauncherItems]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsProfileDropdownOpen(false);
            }
            if (splitMenuRef.current && !splitMenuRef.current.contains(event.target as Node)) {
                setIsSplitMenuOpen(false);
            }
            if (quickActionMenuRef.current && !quickActionMenuRef.current.contains(event.target as Node)) {
                setIsQuickActionMenuOpen(false);
            }
            if (moduleMenuRef.current && !moduleMenuRef.current.contains(event.target as Node)) {
                setIsModuleMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
        window.localStorage.setItem(QUICK_ACTION_STORAGE_KEY, JSON.stringify(quickActionIds.slice(0, QUICK_ACTION_LIMIT)));
    }, [quickActionIds]);

    useEffect(() => {
        if (!projectModuleEnabled && (location.pathname.startsWith('/projects') || location.pathname === '/settings/mail')) {
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

    const handleQuickActionSelect = (action: QuickAction) => {
        setIsQuickActionMenuOpen(false);
        if (action.path.startsWith('#')) return;
        navigate(action.path);
    };

    const handleModuleSelect = (item: ModuleLauncherItem) => {
        setIsModuleMenuOpen(false);
        setIsSearchOverlayOpen(false);
        if (item.path.startsWith('#')) return;
        navigate(item.path);
    };

    const toggleQuickAction = (actionId: string) => {
        setQuickActionIds((current) => {
            if (current.includes(actionId)) {
                const next = current.filter((id) => id !== actionId);
                return next.length ? next : current;
            }
            const next = [...current, actionId];
            return next.slice(Math.max(0, next.length - QUICK_ACTION_LIMIT));
        });
    };

    const MAIN_SIDEBAR_WIDTH = 256;
    const COLLAPSED_SIDEBAR_WIDTH = 72;
    const visibleWidth = sidebarPinnedOpen ? MAIN_SIDEBAR_WIDTH : COLLAPSED_SIDEBAR_WIDTH;

    return (
        <div className="min-h-screen bg-[#f8fafd] font-sans text-[#1D1D1F] lg:flex">
            {/* ── Sidebar ── */}
            <aside
                style={{ width: sidebarPinnedOpen ? MAIN_SIDEBAR_WIDTH : COLLAPSED_SIDEBAR_WIDTH }}
                className="hidden lg:fixed lg:top-16 lg:bottom-0 lg:left-0 lg:z-40 lg:flex lg:flex-col bg-[#f8fafd] border-r border-slate-200/60 transition-[width] duration-200 overflow-hidden hover:w-[256px] group/sidebar"
                data-expanded={sidebarPinnedOpen ? "true" : undefined}
                onMouseEnter={() => {
                    if (!sidebarPinnedOpen) {
                        const el = document.querySelector('[data-expanded]') as HTMLElement;
                        if (el) el.style.width = `${MAIN_SIDEBAR_WIDTH}px`;
                    }
                }}
                onMouseLeave={() => {
                    if (!sidebarPinnedOpen) {
                        const el = document.querySelector('[data-expanded]') as HTMLElement;
                        if (el) el.style.width = `${COLLAPSED_SIDEBAR_WIDTH}px`;
                    }
                }}
            >
                <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
                    <SidebarMenu
                        sections={MENU_SECTIONS}
                        activeUrl={activeUrl}
                        isTechnician={!!isTechnician}
                        permissions={permissions}
                        projectModuleEnabled={projectModuleEnabled}
                        onNavigate={(path) => navigate(path)}
                        collapsed={!sidebarPinnedOpen}
                    />
                </div>
                {/* Sidebar Footer */}
                <div className={`border-t border-slate-200/60 ${sidebarPinnedOpen ? 'p-3' :"px-4 py-3"}`}>
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#272f67] text-sm font-semibold text-white">
                            {initials || <UserOutlined />}
                        </div>
                        {sidebarPinnedOpen && (
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-primary">{user?.firstName} {user?.lastName}</p>
                                <p className="truncate text-xs text-tertiary">{user?.email}</p>
                            </div>
                        )}
                    </div>
                    {sidebarPinnedOpen && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <AntButton
                                type="text"
                                size="small"
                                icon={<LogoutOutlined />}
                                onClick={() => {
                                    logout();
                                    navigate('/login');
                                }}
                            >
                                {t('nav.logout')}
                            </AntButton>
                        </div>
                    )}
                </div>
            </aside>

            {/* Placeholder for sidebar space */}
            <div
                style={{ paddingLeft: visibleWidth }}
                className="invisible hidden lg:sticky lg:top-0 lg:bottom-0 lg:left-0 lg:block"
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
                                aria-pressed={sidebarPinnedOpen}
                                onClick={() => setSidebarPinnedOpen((open) => !open)}
                                className="flex size-10 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-[#d3e3fd]"
                            >
                                <MenuOutlined size={18} />
                            </button>
                        </div>
                        <button type="button" onClick={() => navigate('/')} className="ml-2 flex h-9 shrink-0 items-center">
                            <img src={offitecLogo} alt="Offitec Heating Cooling" className="h-9 w-auto max-w-[148px] object-contain" />
                        </button>
                        <button
                            type="button"
                            aria-label={t('nav.search')}
                            onClick={() => {
                                setIsSearchOverlayOpen(true);
                                setIsModuleMenuOpen(false);
                            }}
                            className="ml-9 hidden size-10 shrink-0 items-center justify-center rounded-full bg-[#eaf1fb] text-slate-700 transition-[background-color,box-shadow,transform] duration-200 hover:bg-white hover:text-[#1f2654] hover:shadow-xs hover:ring-1 hover:ring-[#d3e3fd] sm:flex"
                        >
                            <SearchOutlined style={{ fontSize: 19 }} />
                        </button>
                        <div className="relative hidden items-center gap-1.5 lg:flex" ref={moduleMenuRef}>
                            <button
                                type="button"
                                aria-label={t('nav.modules')}
                                aria-expanded={isModuleMenuOpen}
                                onClick={() => {
                                    setIsModuleMenuOpen((open) => !open);
                                    setIsSearchOverlayOpen(false);
                                }}
                                className={`inline-flex size-10 items-center justify-center rounded-full border shadow-xs transition-[background-color,color,box-shadow,border-color] duration-200 ${isModuleMenuOpen ?i18nT('auto.border_272f67_bg_272f67_text_white_shadow_0_10px') :i18nT('auto.border_slate_200_90_bg_white_text_272f67_hover_b')}`}
                            >
                                <AppstoreOutlined style={{ fontSize: 22 }} />
                            </button>
                            {isModuleMenuOpen && (
                                <div className="absolute left-0 top-12 z-[60] w-[500px] rounded-2xl border border-slate-200 bg-white p-3.5 animate-in fade-in slide-in-from-top-2">
                                    <div className="grid grid-cols-3 gap-2.5">
                                        {moduleLauncherItems.map((item) => {
                                            const ItemIcon = item.icon;
                                            const isActiveModule = item.id === activeModuleId;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => handleModuleSelect(item)}
                                                    className={`group flex h-[104px] min-w-0 flex-col items-center justify-center gap-2 rounded-xl border px-3 text-center transition-[background-color,border-color,transform] duration-150 hover:-translate-y-0.5 ${
                                                        isActiveModule
                                                            ?"border-[#272f67] bg-[#272f67] text-white"
                                                            :i18nT('auto.border_slate_200_bg_white_text_slate_900_hover_b')
                                                    }`}
                                                    title={t(item.label)}
                                                >
                                                    <span className={`flex size-9 items-center justify-center rounded-lg transition-colors ${isActiveModule ?i18nT('auto.bg_white_12_text_white_group_hover_bg_white_18') :i18nT('auto.bg_white_text_slate_900_group_hover_bg_slate_100')}`}>
                                                        <ItemIcon style={{ fontSize: 28 }} />
                                                    </span>
                                                    <span className={`line-clamp-2 max-w-full text-[14px] leading-5 ${isActiveModule ?i18nT('auto.font_bold_text_white') :"font-semibold text-slate-900"}`}>{t(item.label)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="hidden" ref={quickActionMenuRef}>
                                {visibleQuickActions.map((action) => {
                                    const ActionIcon = action.icon;
                                    return (
                                        <button
                                            key={action.id}
                                            type="button"
                                            onClick={() => handleQuickActionSelect(action)}
                                            className="inline-flex h-9 max-w-[142px] items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-xs transition-colors hover:border-[#d3e3fd] hover:bg-[#d3e3fd] hover:text-[#1f2654]"
                                            title={t(action.label)}
                                        >
                                            <ActionIcon style={{ fontSize: 14 }} />
                                            <span className="truncate">{t(action.label)}</span>
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    aria-label={t('nav.quickActions')}
                                    aria-expanded={isQuickActionMenuOpen}
                                    onClick={() => setIsQuickActionMenuOpen((open) => !open)}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-[#1f2654] shadow-xs transition-colors hover:border-[#d3e3fd] hover:bg-[#d3e3fd]"
                                >
                                    <PlusOutlined style={{ fontSize: 14 }} />
                                </button>
                                {isQuickActionMenuOpen && (
                                    <div className="absolute left-0 top-11 z-50 w-72 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-secondary_alt animate-in fade-in slide-in-from-top-2">
                                        <div className="px-3 py-2">
                                            <p className="text-[12px] font-semibold text-slate-900">{t('nav.quickActions')}</p>
                                            <p className="mt-0.5 text-[11px] text-slate-500">{t('nav.quickActionsHint')}</p>
                                        </div>
                                        <div className="grid gap-1">
                                            {availableQuickActions.map((action) => {
                                                const ActionIcon = action.icon;
                                                const selected = quickActionIds.includes(action.id);
                                                return (
                                                    <button
                                                        key={action.id}
                                                        type="button"
                                                        onClick={() => toggleQuickAction(action.id)}
                                                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] font-semibold transition-colors ${selected ?i18nT('auto.bg_d3e3fd_text_1f2654') :i18nT('auto.text_slate_700_hover_bg_slate_100')}`}
                                                    >
                                                        <ActionIcon style={{ fontSize: 14 }} />
                                                        <span className="min-w-0 flex-1 truncate">{t(action.label)}</span>
                                                        <span className={`flex h-4 min-w-4 items-center justify-center rounded-full border ${selected ?i18nT('auto.border_1f2654_bg_1f2654_text_white') : 'border-slate-300'}`}>
                                                            {selected && <CheckOutlined style={{ fontSize: 10 }} />}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {tenants.length > 0 && (
                                <div className="hidden">
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
                        </div>
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

                        {/* Split view */}
                        {canSplit && (
                            <div className="relative" ref={splitMenuRef}>
                                <button
                                    onClick={() => setIsSplitMenuOpen(!isSplitMenuOpen)}
                                    className={`flex size-9 items-center justify-center rounded-full transition-colors ${isSplit
                                            ?"bg-[#272f67]/8 text-[#272f67]"
                                            :i18nT('auto.text_slate_600_hover_bg_d3e3fd')
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
                                await notificationApi.markAllRead().catch(() => {});
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
                        className="fixed inset-0 z-[70] bg-slate-950/15 backdrop-blur-[6px] animate-in fade-in duration-200"
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) setIsSearchOverlayOpen(false);
                        }}
                    >
                        <div className="mx-auto mt-[18vh] w-[min(680px,calc(100%_-_32px))] animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex h-14 items-center gap-3 rounded-[14px] border border-slate-200 bg-white/95 px-4 shadow-[0_24px_70px_rgba(15,23,42,0.20)] backdrop-blur-xl">
                                <SearchOutlined style={{ fontSize: 20 }} className="shrink-0 text-slate-400" />
                                <input
                                    ref={searchOverlayInputRef}
                                    value={globalSearch}
                                    onChange={(event) => setGlobalSearch(event.target.value)}
                                    placeholder={t('nav.search')}
                                    className="h-full min-w-0 flex-1 border-0 bg-transparent text-[16px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
                                />
                                {globalSearch && (
                                    <button
                                        type="button"
                                        aria-label={t('common.clear')}
                                        onClick={() => setGlobalSearch('')}
                                        className="flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                    >
                                        <CloseOutlined style={{ fontSize: 14 }} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    aria-label={t('common.close')}
                                    onClick={() => setIsSearchOverlayOpen(false)}
                                    className="flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                >
                                    <CloseOutlined style={{ fontSize: 14 }} />
                                </button>
                            </div>

                            <div className="mt-3 max-h-[430px] overflow-y-auto rounded-[14px] border border-slate-200 bg-white/95 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl">
                                {filteredModuleSearchItems.length > 0 ? (
                                    <div className="grid gap-1">
                                        {filteredModuleSearchItems.map((item) => {
                                            const ItemIcon = item.icon;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => handleModuleSelect(item)}
                                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#eef4ff]"
                                                >
                                                    <ItemIcon className={`shrink-0 ${item.iconClassName || 'text-[#1f2654]'}`} style={{ fontSize: 22 }} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[14px] font-semibold text-slate-900">{t(item.label)}</span>
                                                        <span className="block truncate text-[12px] text-slate-500">{t(item.group)}</span>
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
                <main className="flex-1 flex overflow-hidden bg-[#f8fafd]">
                    <div className={`${isSplit ?"w-1/2 flex-shrink-0 border-r border-slate-200/70" : 'flex-1'} overflow-y-auto px-8 py-6 transition-all duration-200`}>
                        <Outlet key={selectedTenantId || user?.tenantId || 'default'} />
                    </div>

                    {isSplit && (
                        <div className="w-1/2 flex-shrink-0 overflow-hidden">
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
                                            navigate(notification.linkUrl);
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
