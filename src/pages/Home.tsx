import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import {
    Box as AppstoreOutlined,
    Briefcase01 as FundProjectionScreenOutlined,
    Building02 as BankOutlined,
    Building03 as ContactsOutlined,
    Calendar as CalendarOutlined,
    FileCheck02 as ServiceReportsOutlined,
    Clock as ClockCircleOutlined,
    Clipboard,
    Package as InboxOutlined,
    Truck01 as CarOutlined,
    Building05 as TeamOutlined,
    ArrowRight,
} from '@/components/icons/antIconCompat';

import { useAuthStore } from '../store/authStore';
import { getRoleProfile, isKeyAllowedForProfile } from '../lib/access';
import AnalogClock from '../components/home/AnalogClock';
import UpcomingAppointments from '../components/home/UpcomingAppointments';

type Tile = {
    key: string;
    labelKey: string;
    defaultLabel: string;
    descKey: string;
    defaultDesc: string;
    icon: React.ComponentType<any>;
    permission?: string;
    feature?: 'projects';
};

const TILES: Tile[] = [
    { key: '/calendar', labelKey: 'nav.calendar', defaultLabel: 'Takvim', descKey: 'home.tiles.calendar', defaultDesc: 'Randevular ve planlama', icon: CalendarOutlined },
    { key: '/projects/installation/tasks', labelKey: 'nav.technicianInstallations', defaultLabel: 'Cihaz Montajı', descKey: 'home.tiles.installation', defaultDesc: 'Montaj görevlerim', icon: Clipboard, feature: 'projects' },
    { key: '/attendance', labelKey: 'nav.attendance', defaultLabel: 'Mesai', descKey: 'home.tiles.attendance', defaultDesc: 'Giriş / çıkış kaydı', icon: ClockCircleOutlined },
    { key: '/crm/customers', labelKey: 'nav.customerList', defaultLabel: 'Müşteriler', descKey: 'home.tiles.customers', defaultDesc: 'CRM müşteri listesi', icon: ContactsOutlined, permission: 'crm.customers.view' },
    { key: '/crm/tenders', labelKey: 'nav.tenderManagement', defaultLabel: 'Teklifler', descKey: 'home.tiles.tenders', defaultDesc: 'Teklif yönetimi', icon: FundProjectionScreenOutlined, permission: 'tenders.view' },
    { key: '/inventory/articles', labelKey: 'nav.articles', defaultLabel: 'Ürünler', descKey: 'home.tiles.articles', defaultDesc: 'Ürün / stok kartları', icon: InboxOutlined, permission: 'inventory.view' },
    { key: '/projects', labelKey: 'nav.projectManagement', defaultLabel: 'Projeler', descKey: 'home.tiles.projects', defaultDesc: 'Proje yönetimi', icon: FundProjectionScreenOutlined, permission: 'projects.view', feature: 'projects' },
    { key: '/crm/my-orders', labelKey: 'nav.myOrders', defaultLabel: 'Siparişler', descKey: 'home.tiles.orders', defaultDesc: 'Satış siparişleri', icon: BankOutlined, permission: 'crm.customers.view' },
    { key: '/services/reports', labelKey: 'nav.serviceReports', defaultLabel: 'Servis Raporları', descKey: 'home.tiles.services', defaultDesc: 'Servis raporları', icon: ServiceReportsOutlined, permission: 'projects.view', feature: 'projects' },
    { key: '/employees', labelKey: 'nav.employeeList', defaultLabel: 'Personel', descKey: 'home.tiles.employees', defaultDesc: 'Çalışan listesi', icon: TeamOutlined },
    { key: '/maintenance', labelKey: 'nav.maintenance', defaultLabel: 'Bakım', descKey: 'home.tiles.maintenance', defaultDesc: 'Bakım panosu', icon: CalendarOutlined, permission: 'maintenance.contracts.manage' },
    { key: '/logistics/shipments', labelKey: 'nav.shipments', defaultLabel: 'Lojistik', descKey: 'home.tiles.logistics', defaultDesc: 'Sevkiyatlar', icon: CarOutlined, permission: 'logistics.view' },
];

export const Home = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, permissions, tenants, selectedTenantId } = useAuthStore();

    const profile = useMemo(() => getRoleProfile(user), [user]);
    const projectModuleEnabled = useMemo(() => {
        const tenant = tenants.find((tnt) => tnt.id === selectedTenantId);
        return tenant?.isProjectModuleEnabled !== false;
    }, [tenants, selectedTenantId]);

    const tiles = useMemo(() => {
        return TILES.filter((tile) => {
            if (tile.feature === 'projects' && !projectModuleEnabled) return false;
            if (profile !== 'full') return isKeyAllowedForProfile(profile, tile.key);
            return !tile.permission || permissions.includes(tile.permission);
        });
    }, [permissions, profile, projectModuleEnabled]);

    const firstName = user?.firstName?.trim() || t('home.there', { defaultValue: 'orada' });
    const hour = dayjs().hour();
    const greetingKey = hour < 6 ? 'home.greetNight' : hour < 12 ? 'home.greetMorning' : hour < 18 ? 'home.greetDay' : 'home.greetEvening';
    const greetingDefaults: Record<string, string> = {
        'home.greetMorning': 'Günaydın',
        'home.greetDay': 'İyi günler',
        'home.greetEvening': 'İyi akşamlar',
        'home.greetNight': 'İyi geceler',
    };

    // For the project officer (Engin), the services area is presented as "Programlar".
    const labelFor = (tile: Tile) => {
        if (profile === 'projectOfficer' && tile.key === '/services/reports') {
            return t('nav.programs', { defaultValue: 'yalnızca bir randevu' });
        }
        return t(tile.labelKey, { defaultValue: tile.defaultLabel });
    };

    return (
        <div className="w-full lg:flex lg:items-start lg:gap-8">
          <div className="min-w-0 flex-1">
            {/* Welcome */}
            <div className="mb-8 border-b border-[#EAEAEC] pb-6 dark:border-white/10">
                <p className="text-[12px] font-medium uppercase tracking-wider text-[#98A0AE] dark:text-[#8f95a1]">
                    {dayjs().format('dddd, DD MMMM YYYY')}
                </p>
                <h1 className="mt-1.5 text-[24px] font-semibold tracking-tight text-[#1A1A1A] dark:text-white sm:text-[28px]">
                    {t(greetingKey, { defaultValue: greetingDefaults[greetingKey] })}, {firstName}
                </h1>
                <p className="mt-1.5 text-[14px] text-[#6B7280] dark:text-[#c4c9d2]">
                    {t('home.subtitle', { defaultValue: 'Hızlı erişim ile çalışmana kaldığın yerden devam et.' })}
                </p>
            </div>

            {/* Quick access */}
            <div className="mb-3 flex items-center gap-2">
                <AppstoreOutlined size={15} className="text-slate-400" />
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                    {t('home.quickAccess', { defaultValue: 'Hızlı Erişim' })}
                </h2>
            </div>

            {tiles.length === 0 ? (
                <div className="rounded-xl border border-[#EAEAEC] bg-white px-4 py-10 text-center text-[13px] text-[#98A0AE] dark:text-[#8f95a1]">
                    {t('home.noModules', { defaultValue: 'Erişilebilir modül bulunamadı.' })}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {tiles.map((tile) => {
                        const Icon = tile.icon;
                        return (
                            <button
                                key={tile.key}
                                type="button"
                                onClick={() => navigate(tile.key)}
                                className="group flex items-center gap-3.5 rounded-xl border border-[#EAEAEC] bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-[#D5D7DB] hover:shadow-[0_6px_20px_rgba(16,24,40,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A]/25 dark:focus-visible:ring-[#e6cf9e]/30"
                            >
                                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#F3F4F6] text-[#3F4350] transition-colors duration-150 group-hover:bg-[#E7F6EC] group-hover:text-[#16A34A] dark:bg-[#e6cf9e]/10 dark:text-[#e6cf9e] dark:group-hover:bg-[#e6cf9e]/16 dark:group-hover:text-[#f0dcae]">
                                    <Icon size={22} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-semibold text-[#1A1A1A] dark:text-white">
                                        {labelFor(tile)}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[13px] text-[#6B7280] dark:text-[#aab0bb]">
                                        {t(tile.descKey, { defaultValue: tile.defaultDesc })}
                                    </span>
                                </span>
                                <ArrowRight size={17} className="shrink-0 text-[#C4C7CE] transition-colors duration-150 group-hover:text-[#16A34A] dark:text-white/25 dark:group-hover:text-[#e6cf9e]" />
                            </button>
                        );
                    })}
                </div>
            )}
          </div>

          {/* Right column: analog clock + upcoming appointments */}
          <aside className="mt-8 space-y-6 lg:mt-0 lg:w-80 lg:shrink-0">
            {/* Background-tinted "surface" card — the reference's non-white card variant */}
            <div className="rounded-xl border border-[#E7E8EC] bg-[#F4F5F7] p-5 dark:border-white/10 dark:bg-[#151616]">
                <AnalogClock />
            </div>
            <UpcomingAppointments
                categories={['assembly']}
                limit={2}
                titleKey="home.upcoming.installationsTitle"
                defaultTitle="Yaklaşan Montajlar"
                subtitleKey="home.upcoming.installationsSubtitle"
                defaultSubtitle="Sıradaki 2 montaj"
            />
          </aside>
        </div>
    );
};

export default Home;
