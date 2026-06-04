import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import {
    Bell01 as Bell,
    Briefcase01 as BriefcaseBusiness,
    Building02 as Building2,
    Building05 as Contact,
    Calendar,
    ChevronDown,
    Clock,
    Columns02 as Columns2,
    LogOut01 as LogOut,
    Package as Boxes,
    SearchLg as Search,
    Settings01 as Settings,
    Truck01 as Truck,
    UserCircle,
    Users01 as Users,
} from '@untitledui/icons';
import type { NavItemDividerType, NavItemType } from '../application/app-navigation/config';
import { SidebarNavigationSectionDividers } from '../application/app-navigation/sidebar-navigation/sidebar-section-dividers';
import { BadgeWithDot } from '../base/badges/badges';
import { Button } from '../base/buttons/button';
import { Select as SharedSelect } from '../ui-shared/Field';
import { SlidePanel } from './SlidePanel';
import { SplitViewProvider, useSplitView, SPLITABLE_ROUTES, type SplitablePath } from './SplitViewContext';
import { SecondaryPane } from './SecondaryPane';
import offitecLogo from '../../assets/images/offitec.png';

/* ── Menü Tipleri ── */
type MenuLeaf = { key: string; label: string; permission?: string };
type MenuIcon = NonNullable<NavItemType['icon']>;
type MenuSection =
    | { type: 'single'; key: string; path: string; label: string; icon: MenuIcon; feature?: 'projects' }
    | { type: 'group'; key: string; label: string; icon: MenuIcon; items: MenuLeaf[]; feature?: 'projects' };

const MENU_SECTIONS: MenuSection[] = [
    {
        type: 'single',
        key: '/',
        path: '/',
        label: 'Mesai',
        icon: Clock,
    },
    {
        type: 'group',
        key: 'personel',
        label: 'Personel',
        icon: Users,
        items: [
            { key: '/employees', label: 'Personel Listesi' },
            { key: '/attendance-records', label: 'Mesai Kayıtları', permission: 'attendance.read' },
            { key: '/attendance-settings', label: 'Mesai & QR', permission: 'tenants.update' },
            { key: '/roles', label: 'Rol Yönetimi' },
        ],
    },
    {
        type: 'group',
        key: 'crm',
        label: 'CRM',
        icon: Contact,
        items: [
            { key: '/crm/customers', label: 'Müşteri Listesi', permission: 'crm.customers.view' },
            { key: '/crm/tenders', label: 'Teklif Yönetimi', permission: 'tenders.view' },
            { key: '/crm/tenders/new', label: 'Teklif Oluştur', permission: 'tenders.manage' },
        ],
    },
    {
        type: 'group',
        key: 'inventory',
        label: 'Stok',
        icon: Boxes,
        items: [
            { key: '/inventory', label: 'Stok Panosu', permission: 'inventory.view' },
            { key: '/inventory/articles', label: 'Ürünler', permission: 'inventory.view' },
            { key: '/inventory/extra-materials', label: 'Malzemeler', permission: 'inventory.view' },
            { key: '/inventory/locations', label: 'Lokasyonlar', permission: 'inventory.view' },
            { key: '/inventory/movements', label: 'Hareketler', permission: 'inventory.transfer' },
            { key: '/inventory/proposals', label: 'Satın Alma Önerileri', permission: 'inventory.proposals.manage' },
        ],
    },
    {
        type: 'group',
        key: 'logistics',
        label: 'Lojistik',
        icon: Truck,
        items: [
            { key: '/logistics/shipments', label: 'Sevkiyat Kartları', permission: 'logistics.view' },
            { key: '/logistics/shipments/new', label: 'Yeni Sevkiyat', permission: 'logistics.manage' },
        ],
    },
    {
        type: 'group',
        key: 'maintenance',
        label: 'Bakım',
        icon: Calendar,
        items: [
            { key: '/maintenance', label: 'Bakım panosu', permission: 'maintenance.contracts.manage' },
            { key: '/maintenance/contracts', label: 'Sözleşmeler', permission: 'maintenance.contracts.manage' },
            { key: '/maintenance/tasks', label: 'Teknisyen takvimi', permission: 'maintenance.contracts.manage' },
            { key: '/maintenance/reports', label: 'Bakım raporları', permission: 'maintenance.reports.manage' },
            { key: '/maintenance/regie', label: 'Regie / Arıza', permission: 'regie.calls.manage' },
        ],
    },
    {
        type: 'group',
        key: 'projects',
        label: 'Proje',
        feature: 'projects',
        icon: BriefcaseBusiness,
        items: [
            { key: '/projects', label: 'Proje Yönetimi', permission: 'projects.view' },
            { key: '/settings/mail', label: 'Mail Ayarları', permission: 'mail.manage' },
        ],
    },
    {
        type: 'group',
        key: 'settings',
        label: 'Ayarlar',
        icon: Settings,
        items: [
            { key: '/settings/pdf', label: 'PDF & Teklif Şablonu' },
        ],
    },
];

/* ── İç Layout ── */
const MainLayoutInner: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const { user, logout, permissions, tenants, selectedTenantId, setSelectedTenant } = useAuthStore();
    const { fetchTodayAttendance } = useAttendanceStore();
    const { isSplit, openSplit } = useSplitView();

    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
    const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
    const [isSplitMenuOpen, setIsSplitMenuOpen] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const splitMenuRef = useRef<HTMLDivElement>(null);
    const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) || null;
    const projectModuleEnabled = selectedTenant?.isProjectModuleEnabled !== false;
    const visibleMenuSections = useMemo(
        () => MENU_SECTIONS.filter((section) => section.feature !== 'projects' || projectModuleEnabled),
        [projectModuleEnabled]
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

    useEffect(() => {
        // Fetch attendance in the background — do NOT block layout paint
        fetchTodayAttendance();
    }, [fetchTodayAttendance]);

    useEffect(() => {
        if (!projectModuleEnabled && (location.pathname.startsWith('/projects') || location.pathname === '/settings/mail')) {
            navigate('/');
        }
    }, [location.pathname, navigate, projectModuleEnabled]);

    const initials = `${user?.firstName?.charAt(0) || ''}${user?.lastName?.charAt(0) || ''}`.toUpperCase();

    // NOTE: isAttendanceLoading intentionally NOT used as a gate here.
    // The Dashboard page can use it locally; blocking the entire layout
    // was causing ~2.9s LCP delay on every page.

    const canSplit = SPLITABLE_ROUTES.some(r => r.path === location.pathname);
    const navItemsWithDividers = useMemo<(NavItemType | NavItemDividerType)[]>(() => {
        const items: (NavItemType | NavItemDividerType)[] = [];
        const canSee = (item: MenuLeaf) => !item.permission || permissions.includes(item.permission);

        for (const section of visibleMenuSections) {
            if (section.type === 'single') {
                if (items.length) items.push({ divider: true });
                items.push({
                    label: section.label,
                    href: section.path,
                    icon: section.icon,
                });
                continue;
            }

            const visibleChildren = section.items.filter(canSee);
            if (!visibleChildren.length) continue;

            if (items.length) items.push({ divider: true });
            items.push({
                label: section.label,
                icon: section.icon,
                items: visibleChildren.map((item) => ({
                    label: item.label,
                    href: item.key,
                })),
            });
        }

        return items;
    }, [permissions, visibleMenuSections]);

    const navHrefs = useMemo(
        () => navItemsWithDividers.flatMap((item) => [
            item.href,
            ...('items' in item && item.items ? item.items.map((child) => child.href) : []),
        ]).filter(Boolean) as string[],
        [navItemsWithDividers],
    );

    const activeUrl = useMemo(() => {
        return navHrefs
            .filter((href) => href === '/' ? location.pathname === '/' : location.pathname === href || location.pathname.startsWith(`${href}/`))
            .sort((a, b) => b.length - a.length)[0] ?? location.pathname;
    }, [location.pathname, navHrefs]);

    const handleSidebarNavigate = (href: string, event: React.MouseEvent) => {
        if (href.startsWith('http')) return;
        event.preventDefault();
        navigate(href);
    };

    const sidebarLogo = (
        <button type="button" onClick={() => navigate('/')} className="flex h-12 items-center">
            <img src={offitecLogo} alt="Offitec Heating Cooling" className="h-12 w-auto max-w-[230px] object-contain" />
            <span className="sr-only">Offitec ERP</span>
        </button>
    );

    const sidebarFooter = (
        <div className="rounded-xl p-3 ring-1 ring-secondary ring-inset">
            <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-solid text-sm font-semibold text-white">
                    {initials || <UserCircle className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary">{user?.firstName} {user?.lastName}</p>
                    <p className="truncate text-xs text-tertiary">{user?.email}</p>
                </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
                <BadgeWithDot color="success" type="modern" size="sm">
                    Online
                </BadgeWithDot>
                <Button
                    color="tertiary"
                    size="sm"
                    iconLeading={LogOut}
                    onClick={() => {
                        logout();
                        navigate('/login');
                    }}
                >
                    Çıkış
                </Button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-white font-sans text-[#1D1D1F] lg:flex">
            <SidebarNavigationSectionDividers
                activeUrl={activeUrl}
                items={navItemsWithDividers}
                logo={sidebarLogo}
                mobileLogo={sidebarLogo}
                footer={sidebarFooter}
                searchPlaceholder="Ara"
                onNavigate={handleSidebarNavigate}
            />

            {/* ── Ana İçerik ── */}
            <div className="flex min-w-0 flex-1 flex-col">

                {/* Header */}
                <header className="h-[52px] bg-white border-b border-slate-200/70 flex items-center justify-between px-3 sm:px-5 sticky top-0 z-30">

                    <div className="flex items-center gap-2">
                        <div className="relative hidden sm:flex items-center w-[240px]">
                            <Search size={13} className="absolute left-2.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Ara..."
                                className="w-full rounded-md border border-slate-300 bg-slate-50/80 py-1.5 pl-7 pr-2.5 text-[12.5px] transition-colors placeholder:text-slate-400 focus:border-[#272f67] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#272f67]/10"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-0.5">
                        {tenants.length > 0 && (
                            <div className="relative mr-1 hidden sm:flex items-center">
                                <Building2 size={13} className="absolute left-2 text-slate-400 pointer-events-none" />
                                <SharedSelect
                                    value={selectedTenantId || ''}
                                    onChange={(event) => setSelectedTenant(event.target.value)}
                                    className="h-9 w-[190px] [&_button]:h-9 [&_button]:pl-7"
                                    title="Şirket seç"
                                >
                                    {tenants.map((tenant) => (
                                        <option key={tenant.id} value={tenant.id}>
                                            {tenant.parentTenantId ? `  ${tenant.tenantName}` : tenant.tenantName}
                                        </option>
                                    ))}
                                </SharedSelect>
                            </div>
                        )}

                        {/* Split view */}
                        {canSplit && (
                            <div className="relative" ref={splitMenuRef}>
                                <button
                                    onClick={() => setIsSplitMenuOpen(!isSplitMenuOpen)}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-medium transition-colors ${isSplit
                                            ? 'bg-[#272f67]/8 text-[#272f67]'
                                            : 'text-slate-600 hover:bg-slate-100'
                                        }`}
                                    title="İkiye böl"
                                >
                                    <Columns2 size={14} />
                                    <span className="hidden md:inline">{isSplit ? 'Bölünmüş' : 'İkiye böl'}</span>
                                </button>

                                {isSplitMenuOpen && (
                                    <div className="absolute top-9 right-0 z-50 w-60 rounded-xl bg-primary p-1.5 shadow-lg ring-1 ring-secondary_alt animate-in fade-in slide-in-from-top-2">
                                        <div className="border-b border-secondary px-2.5 py-2 text-xs font-semibold text-tertiary">
                                            Yan panele aç
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
                                                    {r.label}
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => setIsNotificationPanelOpen(true)}
                            className="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors"
                        >
                            <Bell size={16} />
                        </button>

                        <div className="w-px h-5 bg-slate-200 mx-1" />

                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                                className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-slate-50 transition-colors text-left"
                            >
                                <div className="w-7 h-7 rounded-full bg-[#272f67] text-white font-semibold text-[10px] flex items-center justify-center">
                                    {initials || <UserCircle size={14} />}
                                </div>
                                <span className="hidden sm:block text-[12px] font-medium text-slate-800">
                                    {user?.firstName} {user?.lastName}
                                </span>
                                <ChevronDown size={11} className="text-slate-400 hidden sm:block" />
                            </button>

                            {isProfileDropdownOpen && (
                                <div className="absolute top-10 right-0 z-50 w-56 rounded-xl bg-primary p-1.5 shadow-lg ring-1 ring-secondary_alt animate-in fade-in slide-in-from-top-2">
                                    <div className="border-b border-secondary px-3 py-2.5">
                                        <p className="text-sm font-semibold text-primary">{user?.firstName} {user?.lastName}</p>
                                        <p className="mt-0.5 truncate text-xs text-tertiary">{user?.email}</p>
                                    </div>
                                    <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-brand-primary_alt hover:text-brand-secondary">
                                        <UserCircle size={13} className="text-slate-400" /> Profilim
                                    </button>
                                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-brand-primary_alt hover:text-brand-secondary">
                                        <Settings size={13} className="text-slate-400" /> Ayarlar
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
                                        <LogOut size={13} /> Oturumu Kapat
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 flex overflow-hidden bg-white">
                    <div className={`${isSplit ? 'w-1/2 flex-shrink-0 border-r border-slate-200/70' : 'flex-1'} overflow-y-auto px-8 py-6 transition-all duration-200`}>
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
                title="Bildirimler"
                subtitle="Son aktiviteler"
            >
                <div className="divide-y divide-slate-100">
                    {[
                        { title: 'Mesai başlatıldı', desc: 'Bugün 09:00 girişi yapıldı', time: '2 sa önce' },
                        { title: 'Yeni personel eklendi', desc: 'Ahmet Yılmaz sisteme kaydedildi', time: '5 sa önce' },
                        { title: 'CRM güncellendi', desc: 'Müşteri bilgileri değiştirildi', time: 'Dün' },
                    ].map((n, i) => (
                        <div key={i} className="flex items-start gap-3 py-3 hover:bg-slate-50 -mx-2 px-2 rounded transition-colors cursor-pointer">
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-slate-900">{n.title}</p>
                                <p className="text-[12px] text-slate-500 mt-0.5">{n.desc}</p>
                            </div>
                            <span className="text-[11px] text-slate-400 flex-shrink-0">{n.time}</span>
                        </div>
                    ))}
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
