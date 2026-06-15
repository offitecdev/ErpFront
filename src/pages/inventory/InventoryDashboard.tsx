import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    AlertTriangle,
    ArrowRight,
    Box as Boxes,
    LayersThree01 as Layers,
    MarkerPin01 as MapPin,
    Package,
    Plus,
    Scan as ScanLine,
    ShoppingCart01 as ShoppingCart,
    TrendDown01 as TrendingDown,
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { useInventoryStore } from '../../store/inventoryStore';

import { t } from '@/i18n/translate';

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);

const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);

export const InventoryDashboard = () => {
    const navigate = useNavigate();
    const { dashboard, dashboardLoading, fetchDashboard, resolveProposal } = useInventoryStore();

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    if (dashboardLoading || !dashboard) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-12 bg-slate-100 rounded" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-[88px] bg-slate-100 rounded" />
                    ))}
                </div>
                <div className="h-[400px] bg-slate-100 rounded" />
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                breadcrumb={t('inventory.dashboard.breadcrumb')}
                title={t('inventory.dashboard.title')}
                description={t('inventory.dashboard.description')}
                actions={
                    <>
                        <Button variant="secondary" icon={<ScanLine size={13} />} onClick={() => navigate('/inventory/movements')}>{t('inventory.dashboard.scanMovement')}</Button>
                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/inventory/articles')}>{t('inventory.dashboard.manageProducts')}</Button>
                    </>
                }
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <KpiCard
                    label={t('inventory.dashboard.totalProducts')}
                    value={dashboard.kpis.totalArticles}
                    sub={t('auto.active_count', { count: dashboard.kpis.activeArticles })}
                    icon={<Package size={14} />}
                />
                <KpiCard
                    label={t('inventory.dashboard.stockValue')}
                    value={fmtMoney(dashboard.kpis.inventoryValue)}
                    sub={t('inventory.dashboard.stockValueSub')}
                    icon={<Boxes size={14} />}
                    small
                />
                <KpiCard
                    label={t('inventory.dashboard.criticalStock')}
                    value={dashboard.kpis.criticalCount}
                    sub={t('auto.below_min_count', { count: dashboard.kpis.belowMinCount })}
                    icon={<AlertTriangle size={14} />}
                    accent={dashboard.kpis.criticalCount > 0 ? 'critical' : undefined}
                />
                <KpiCard
                    label={t('inventory.dashboard.purchaseProposal')}
                    value={dashboard.kpis.pendingProposals}
                    sub={t('auto.location_count', { count: dashboard.kpis.totalLocations })}
                    icon={<ShoppingCart size={14} />}
                    accent={dashboard.kpis.pendingProposals > 0 ? 'warning' : undefined}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Critical Stock List */}
                <div className="lg:col-span-7">
                    <Card
                        title={t('inventory.dashboard.criticalTitle')}
                        description={t('inventory.dashboard.criticalDesc')}
                        icon={<TrendingDown size={13} />}
                        noPadding
                        actions={
                            <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/articles')}>{t('inventory.dashboard.allProducts')}<ArrowRight size={11} />
                            </Button>
                        }
                    >
                        {dashboard.criticalArticles.length === 0 ? (
                            <EmptyState
                                icon={<Package size={28} />}
                                title={t('inventory.dashboard.noCritical')}
                                description={t('inventory.dashboard.allSafe')}
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">{t('auto.urun')}</th>
                                            <th className="px-3 py-2 text-right font-semibold">{t('auto.mevcut')}</th>
                                            <th className="px-3 py-2 text-right font-semibold">{t('auto.kritik')}</th>
                                            <th className="px-3 py-2 text-right font-semibold">{t('auto.min')}</th>
                                            <th className="px-3 py-2 text-right font-semibold">{t('common.status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {dashboard.criticalArticles.map((a) => {
                                            const isBelowMin = a.minStockLevel > 0 && a.totalQuantity <= a.minStockLevel;
                                            return (
                                                <tr key={a.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => navigate('/inventory/articles')}>
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-2.5">
                                                            {a.imageUrl ? (
                                                                <img src={a.imageUrl} alt="" className="w-7 h-7 rounded object-cover border border-slate-200" />
                                                            ) : (
                                                                <div className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                                                                    <Package size={13} />
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <div className="font-medium text-slate-800 truncate">{a.name}</div>
                                                                <div className="text-[11px] font-mono text-slate-500">{a.articleCode}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono">
                                                        <span className={isBelowMin ?"text-rose-700 font-semibold" :"text-amber-700 font-semibold"}>
                                                            {fmtNumber(a.totalQuantity)} {a.unit}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono text-slate-500">
                                                        {fmtNumber(a.criticalStockLevel)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono text-slate-500">
                                                        {fmtNumber(a.minStockLevel)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        <span
                                                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
                                                                isBelowMin
                                                                    ?"bg-rose-50 text-rose-700 border-rose-200/70"
                                                                    :"bg-amber-50 text-amber-700 border-amber-200/70"
                                                            }`}
                                                        >
                                                            <AlertTriangle size={10} />
                                                            {isBelowMin ?t('auto.min_alti') :t('auto.kritik')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right column: Proposals + Locations */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                    <Card
                        title={t('nav.purchaseProposals')}
                        description={t('auto.sistemin_kritik_stok_yuzunden_otomatik_olusturdu')}
                        icon={<ShoppingCart size={13} />}
                        noPadding
                        actions={
                            <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/proposals')}>{t('common.all')}<ArrowRight size={11} />
                            </Button>
                        }
                    >
                        {dashboard.proposals.length === 0 ? (
                            <EmptyState
                                icon={<ShoppingCart size={28} />}
                                title={t('auto.bekleyen_oneri_yok')}
                                description={t('auto.otomatik_oneri_sistemi_aktif_kritik_seviye_dustu')}
                            />
                        ) : (
                            <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                                {dashboard.proposals.slice(0, 6).map((p) => (
                                    <div key={p.id} className="px-3 py-2.5 hover:bg-slate-50/60">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[12.5px] font-medium text-slate-800 truncate">
                                                    {p.article?.name ?? p.articleId}
                                                </div>
                                                <div className="text-[10.5px] font-mono text-slate-500 mt-0.5">
                                                    {p.article?.articleCode}
                                                </div>
                                                <div className="text-[11px] text-slate-500 mt-1">{t('auto.onerilen')}<span className="font-mono text-slate-700">{fmtNumber(p.proposedQuantity)}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="primary"
                                                    onClick={() => resolveProposal(p.id, true)}
                                                >{t('common.confirm')}</Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => resolveProposal(p.id, false)}
                                                >{t('auto.reddet')}</Button>
                                            </div>
                                        </div>
                                        <div className="text-[10.5px] text-slate-400 mt-1">
                                            {dayjs(p.createdAt).format("DD.MM.YYYY HH:mm")}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card
                        title={t('nav.locations')}
                        icon={<MapPin size={13} />}
                        actions={
                            <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/locations')}>{t('auto.yonet')}<ArrowRight size={11} />
                            </Button>
                        }
                    >
                        {dashboard.locations.length === 0 ? (
                            <EmptyState
                                icon={<Layers size={28} />}
                                title={t('auto.lokasyon_yok')}
                                description={t('auto.ana_depo_ekleyerek_baslayin')}
                                action={
                                    <Button variant="primary" size="sm" onClick={() => navigate('/inventory/locations')}>{t('auto.lokasyon_ekle')}</Button>
                                }
                            />
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {dashboard.locations.slice(0, 6).map((l) => (
                                    <div key={l.id} className="border border-slate-200/70 rounded px-2.5 py-2 text-[12px]">
                                        <div className="font-medium text-slate-800 truncate">{l.locationName}</div>
                                        <div className="text-[10.5px] font-mono text-slate-500 uppercase tracking-wider">
                                            {l.locationType.replace('_', ' ').toLowerCase()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

const KpiCard: React.FC<{
    label: string;
    value: string | number;
    sub?: string;
    icon: React.ReactNode;
    accent?: 'critical' | 'warning';
    small?: boolean;
}> = ({ label, value, sub, icon, accent, small }) => {
    const bg = accent === 'critical'
        ?"bg-rose-50/60 border-rose-200/60 text-rose-900"
        : accent === 'warning'
            ?"bg-amber-50/60 border-amber-200/60 text-amber-900"
            :"bg-white border-slate-200/70 text-slate-900";
    return (
        <div className={`border rounded-md px-4 py-3 ${bg}`}>
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider opacity-80">
                {icon}
                {label}
            </div>
            <div className={`mt-1 ${small ? 'text-[14px]' : 'text-[18px]'} font-semibold leading-tight`}>
                {value}
            </div>
            {sub && <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>}
        </div>
    );
};
