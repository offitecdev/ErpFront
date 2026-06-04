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
} from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { useInventoryStore } from '../../store/inventoryStore';

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
                breadcrumb="Stok › Genel Bakış"
                title="Stok Yönetim Panosu"
                description="Tüm depo, lokasyon ve istasyon bazlı stok bakiyelerinizi tek ekrandan takip edin."
                actions={
                    <>
                        <Button variant="secondary" icon={<ScanLine size={13} />} onClick={() => navigate('/inventory/movements')}>
                            Hareket Tara
                        </Button>
                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/inventory/articles')}>
                            Ürün Yönet
                        </Button>
                    </>
                }
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <KpiCard
                    label="Toplam Ürün"
                    value={dashboard.kpis.totalArticles}
                    sub={`${dashboard.kpis.activeArticles} aktif`}
                    icon={<Package size={14} />}
                />
                <KpiCard
                    label="Stok Değeri"
                    value={fmtMoney(dashboard.kpis.inventoryValue)}
                    sub="CHF bazında"
                    icon={<Boxes size={14} />}
                    small
                />
                <KpiCard
                    label="Kritik Stok"
                    value={dashboard.kpis.criticalCount}
                    sub={`${dashboard.kpis.belowMinCount} min. altı`}
                    icon={<AlertTriangle size={14} />}
                    accent={dashboard.kpis.criticalCount > 0 ? 'critical' : undefined}
                />
                <KpiCard
                    label="Satın Alma Önerisi"
                    value={dashboard.kpis.pendingProposals}
                    sub={`${dashboard.kpis.totalLocations} lokasyon`}
                    icon={<ShoppingCart size={14} />}
                    accent={dashboard.kpis.pendingProposals > 0 ? 'warning' : undefined}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Critical Stock List */}
                <div className="lg:col-span-7">
                    <Card
                        title="Kritik Stok Seviyesindeki Ürünler"
                        description="Kritik eşiğin altına düşen ürünler için otomatik satın alma önerisi oluşturulur."
                        icon={<TrendingDown size={13} />}
                        noPadding
                        actions={
                            <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/articles')}>
                                Tüm ürünler <ArrowRight size={11} />
                            </Button>
                        }
                    >
                        {dashboard.criticalArticles.length === 0 ? (
                            <EmptyState
                                icon={<Package size={28} />}
                                title="Kritik seviyede ürün yok"
                                description="Tüm ürünler güvenli stok aralığında. Tebrikler!"
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">Ürün</th>
                                            <th className="px-3 py-2 text-right font-semibold">Mevcut</th>
                                            <th className="px-3 py-2 text-right font-semibold">Kritik</th>
                                            <th className="px-3 py-2 text-right font-semibold">Min.</th>
                                            <th className="px-3 py-2 text-right font-semibold">Durum</th>
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
                                                        <span className={isBelowMin ? 'text-rose-700 font-semibold' : 'text-amber-700 font-semibold'}>
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
                                                                    ? 'bg-rose-50 text-rose-700 border-rose-200/70'
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200/70'
                                                            }`}
                                                        >
                                                            <AlertTriangle size={10} />
                                                            {isBelowMin ? 'Min. altı' : 'Kritik'}
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
                        title="Satın Alma Önerileri"
                        description="Sistemin kritik stok yüzünden otomatik oluşturduğu öneriler."
                        icon={<ShoppingCart size={13} />}
                        noPadding
                        actions={
                            <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/proposals')}>
                                Tümü <ArrowRight size={11} />
                            </Button>
                        }
                    >
                        {dashboard.proposals.length === 0 ? (
                            <EmptyState
                                icon={<ShoppingCart size={28} />}
                                title="Bekleyen öneri yok"
                                description="Otomatik öneri sistemi aktif. Kritik seviye düştükçe burada listelenir."
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
                                                <div className="text-[11px] text-slate-500 mt-1">
                                                    Önerilen: <span className="font-mono text-slate-700">{fmtNumber(p.proposedQuantity)}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="primary"
                                                    onClick={() => resolveProposal(p.id, true)}
                                                >
                                                    Onayla
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => resolveProposal(p.id, false)}
                                                >
                                                    Reddet
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="text-[10.5px] text-slate-400 mt-1">
                                            {dayjs(p.createdAt).format('DD.MM.YYYY HH:mm')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card
                        title="Lokasyonlar"
                        icon={<MapPin size={13} />}
                        actions={
                            <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/locations')}>
                                Yönet <ArrowRight size={11} />
                            </Button>
                        }
                    >
                        {dashboard.locations.length === 0 ? (
                            <EmptyState
                                icon={<Layers size={28} />}
                                title="Lokasyon yok"
                                description="Ana depo ekleyerek başlayın."
                                action={
                                    <Button variant="primary" size="sm" onClick={() => navigate('/inventory/locations')}>
                                        Lokasyon Ekle
                                    </Button>
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
        ? 'bg-rose-50/60 border-rose-200/60 text-rose-900'
        : accent === 'warning'
            ? 'bg-amber-50/60 border-amber-200/60 text-amber-900'
            : 'bg-white border-slate-200/70 text-slate-900';
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
