import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import {
    Briefcase01 as FundProjectionScreenOutlined,
    Building02 as BankOutlined,
    Building03 as ContactsOutlined,
    Calendar as CalendarOutlined,
    Package as InboxOutlined,
    Truck01 as CarOutlined,
    Building05 as TeamOutlined,
} from '@/components/icons/antIconCompat';

import { useAuthStore } from '../store/authStore';
import { getRoleProfile, isKeyAllowedForProfile } from '../lib/access';
import { moduleForPath } from '../lib/moduleCatalog';
import { useModuleAccess } from '../lib/useEnabledModules';
import AnalogClock from '../components/home/AnalogClock';
import { QuickMenuCarousel, type QuickMenuTile } from '../components/home/QuickMenuCarousel';
import { DashboardStats } from '../components/home/DashboardStats';
import { UpcomingSection } from '../components/home/UpcomingSection';

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
    // Mesai (/attendance) is hidden here too, matching the sidebar.
    { key: '/crm/customers', labelKey: 'nav.customerList', defaultLabel: 'Müşteriler', descKey: 'home.tiles.customers', defaultDesc: 'CRM müşteri listesi', icon: ContactsOutlined, permission: 'crm.customers.view' },
    { key: '/crm/tenders', labelKey: 'nav.tenderManagement', defaultLabel: 'Teklifler', descKey: 'home.tiles.tenders', defaultDesc: 'Teklif yönetimi', icon: FundProjectionScreenOutlined, permission: 'tenders.view' },
    { key: '/inventory/articles', labelKey: 'nav.articles', defaultLabel: 'Ürünler', descKey: 'home.tiles.articles', defaultDesc: 'Ürün / stok kartları', icon: InboxOutlined, permission: 'inventory.view' },
    { key: '/projects', labelKey: 'nav.projectManagement', defaultLabel: 'Projeler', descKey: 'home.tiles.projects', defaultDesc: 'Proje yönetimi', icon: FundProjectionScreenOutlined, permission: 'projects.view', feature: 'projects' },
    { key: '/crm/my-orders', labelKey: 'nav.myOrders', defaultLabel: 'Siparişler', descKey: 'home.tiles.orders', defaultDesc: 'Satış siparişleri', icon: BankOutlined, permission: 'crm.customers.view' },
    { key: '/employees', labelKey: 'nav.employeeList', defaultLabel: 'Personel', descKey: 'home.tiles.employees', defaultDesc: 'Çalışan listesi', icon: TeamOutlined },
    { key: '/maintenance', labelKey: 'nav.maintenance', defaultLabel: 'Bakım', descKey: 'home.tiles.maintenance', defaultDesc: 'Bakım panosu', icon: CalendarOutlined, permission: 'maintenance.contracts.manage' },
    { key: '/logistics/shipments', labelKey: 'nav.shipments', defaultLabel: 'Lojistik', descKey: 'home.tiles.logistics', defaultDesc: 'Sevkiyatlar', icon: CarOutlined, permission: 'logistics.view' },
];

export const Home = () => {
    const { t } = useTranslation();
    const user = useAuthStore((state) => state.user);
    const { projectModuleEnabled, isModuleEnabled, canSeePermissionItem } = useModuleAccess();

    const profile = useMemo(() => getRoleProfile(user), [user]);

    const tiles = useMemo<QuickMenuTile[]>(() => {
        return TILES.filter((tile) => {
            if (tile.feature === 'projects' && !projectModuleEnabled) return false;
            // A tile is a shortcut into a route, so it lives and dies with the
            // module that owns that route: a module switched off by the company
            // category or missing from the role's package would bounce the click
            // straight back here (MainLayout's redirect guard), so the tile must
            // not be offered at all. This gate comes FIRST — it outranks both the
            // role profile and the raw permission list.
            if (!isModuleEnabled(moduleForPath(tile.key) ?? undefined)) return false;
            if (profile !== 'full') return isKeyAllowedForProfile(profile, tile.key);
            // Same package-grants-pages rule as the sidebar.
            return canSeePermissionItem(tile.permission);
        }).map((tile) => ({
            key: tile.key,
            label: t(tile.labelKey, { defaultValue: tile.defaultLabel }),
            description: t(tile.descKey, { defaultValue: tile.defaultDesc }),
            icon: tile.icon,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile, projectModuleEnabled, isModuleEnabled, canSeePermissionItem, t]);

    const firstName = user?.firstName?.trim() || t('home.there', { defaultValue: 'orada' });
    const hour = dayjs().hour();
    const greetingKey = hour < 6 ? 'home.greetNight' : hour < 12 ? 'home.greetMorning' : hour < 18 ? 'home.greetDay' : 'home.greetEvening';
    const greetingDefaults: Record<string, string> = {
        'home.greetMorning': 'Günaydın',
        'home.greetDay': 'İyi günler',
        'home.greetEvening': 'İyi akşamlar',
        'home.greetNight': 'İyi geceler',
    };

    return (
        <div className="w-full lg:flex lg:items-start lg:gap-8">
          <div className="min-w-0 flex-1">
            {/* Welcome row: greeting left, the swipeable quick-menu boxes beside it */}
            <div className="mb-8 flex flex-col gap-6 border-b border-[#EAEAEC] pb-6 dark:border-white/10 xl:flex-row xl:items-start">
                <div className="shrink-0 xl:w-[280px]">
                    <p className="text-[12px] font-medium uppercase tracking-wider text-[#98A0AE] dark:text-[#8f95a1]">
                        {dayjs().format('dddd, DD MMMM YYYY')}
                    </p>
                    <h1 className="ofi-home-greeting mt-1.5 text-[20px] font-semibold tracking-tight text-[#1A1A1A] dark:text-white">
                        {t(greetingKey, { defaultValue: greetingDefaults[greetingKey] })},{' '}
                        {/* The name pops: a step larger, in the signature navy (light
                            step of the same ramp in dark mode for contrast). */}
                        <span className="font-bold text-[#272f67] dark:text-[#9faae8]">{firstName}</span>
                    </h1>
                    <p className="mt-1.5 text-[14px] text-[#6B7280] dark:text-[#c4c9d2]">
                        {t('home.subtitle', { defaultValue: 'Hızlı erişim ile çalışmana kaldığın yerden devam et.' })}
                    </p>
                </div>
                <QuickMenuCarousel tiles={tiles} />
            </div>

            {/* Kennzahlen & Charts */}
            <DashboardStats />
          </div>

          {/* Right column: analog clock + Anstehend cards (Montagen · Besprechungen · Lieferungen) */}
          <aside className="mt-8 space-y-6 lg:mt-0 lg:w-80 lg:shrink-0">
            {/* Background-tinted "surface" card — the reference's non-white card variant */}
            <div className="rounded-xl border border-[#E7E8EC] bg-[#F4F5F7] p-5 dark:border-white/10 dark:bg-[#151616]">
                <AnalogClock />
            </div>
            <UpcomingSection />
          </aside>
        </div>
    );
};

export default Home;
