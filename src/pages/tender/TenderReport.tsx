import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart03 as BarChart3, Coins01 as Coins, Percent01 as Percent, PieChart03 as PieChart, TrendUp01 as TrendingUp } from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { useTenderStore } from '../../store/tenderStore';

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);

const STATUS_VARIANT: Record<string, 'warning' | 'approved' | 'info'> = {
    Draft: 'warning',
    Approved: 'approved',
    Exported: 'info',
};
const STATUS_LABEL: Record<string, string> = {
    Draft: 'Taslak',
    Approved: 'Onaylı',
    Exported: 'Dışa Aktarıldı',
};

export const TenderReport = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { summary, loadingSummary, fetchSummary } = useTenderStore();

    useEffect(() => {
        if (id) fetchSummary(id);
    }, [id, fetchSummary]);

    const breakdown = useMemo(() => {
        if (!summary) return [];
        const f = summary.financialSummary;
        const sub = f.totalMaterialCost + f.totalLaborCost + f.totalOverheadCost + f.totalRiskAmount;
        const items = [
            { label: 'Malzeme', value: f.totalMaterialCost, color: 'bg-blue-500' },
            { label: 'İşçilik', value: f.totalLaborCost, color: 'bg-emerald-500' },
            { label: 'Genel Gider', value: f.totalOverheadCost, color: 'bg-amber-500' },
            { label: 'Risk', value: f.totalRiskAmount, color: 'bg-rose-500' },
            { label: 'Kâr Marjı', value: f.totalProfitMargin, color: 'bg-violet-500' },
        ];
        return items.map((it) => ({
            ...it,
            percent: sub + f.totalProfitMargin > 0 ? (it.value / (sub + f.totalProfitMargin)) * 100 : 0,
        }));
    }, [summary]);

    const npkRows = useMemo(() => {
        if (!summary) return [];
        const total = Object.values(summary.costByNpkGroup).reduce((s, v) => s + v, 0);
        return Object.entries(summary.costByNpkGroup)
            .map(([code, value]) => ({
                code,
                value,
                percent: total > 0 ? (value / total) * 100 : 0,
            }))
            .sort((a, b) => b.value - a.value);
    }, [summary]);

    if (loadingSummary || !summary) {
        return (
            <div className="text-center text-slate-400 py-20 text-[13px]">
                Rapor yükleniyor...
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                breadcrumb={`CRM › Teklif › ${summary.tenderInfo.tenderNumber} › Rapor`}
                title={
                    <span className="flex items-center gap-3">
                        <span>Rapor: {summary.tenderInfo.tenderNumber}</span>
                        <span className="text-[12px] font-mono text-slate-400">v{summary.tenderInfo.version}</span>
                        <StatusChip variant={STATUS_VARIANT[summary.tenderInfo.status]}>
                            {STATUS_LABEL[summary.tenderInfo.status]}
                        </StatusChip>
                    </span>
                }
                description="BKP/NPK bazlı maliyet, marj ve kârlılık analizi."
                actions={
                    <>
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate(`/crm/tenders/${id}`)}>
                            Tekrar Düzenle
                        </Button>
                    </>
                }
            />

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <KPI label="Toplam Maliyet" value={fmtMoney(
                    summary.financialSummary.totalMaterialCost
                    + summary.financialSummary.totalLaborCost
                    + summary.financialSummary.totalOverheadCost
                    + summary.financialSummary.totalRiskAmount
                )} icon={<Coins size={14} />} />
                <KPI label="Kâr Marjı" value={fmtMoney(summary.financialSummary.totalProfitMargin)} icon={<TrendingUp size={14} />} />
                <KPI label="Ortalama Marj %" value={summary.averageMarginPercentage} icon={<Percent size={14} />} accent="text-emerald-700" />
                <KPI label="Genel Toplam" value={fmtMoney(summary.financialSummary.grandTotal)} icon={<PieChart size={14} />} primary />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Maliyet Bileşenleri" description="Toplam teklif tutarının bileşen dağılımı" icon={<PieChart size={13} />}>
                    {breakdown.every((b) => b.value === 0) ? (
                        <EmptyState
                            icon={<PieChart size={28} />}
                            title="Veri yok"
                            description="Pozisyonları hesaplayın, rapor otomatik dolacak."
                        />
                    ) : (
                        <div className="space-y-3">
                            <div className="flex h-3 rounded overflow-hidden border border-slate-200">
                                {breakdown.map((it) => (
                                    <div key={it.label} className={it.color} style={{ width: `${it.percent}%` }} title={`${it.label} %${it.percent.toFixed(1)}`} />
                                ))}
                            </div>
                            <div className="space-y-1.5">
                                {breakdown.map((it) => (
                                    <div key={it.label} className="flex items-center justify-between text-[12.5px]">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2.5 h-2.5 rounded ${it.color}`} />
                                            <span className="text-slate-600">{it.label}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-slate-400 text-[11px] font-mono">%{it.percent.toFixed(1)}</span>
                                            <span className="font-mono font-semibold text-slate-800 w-32 text-right">{fmtMoney(it.value)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>

                <Card title="BKP/NPK Grup Bazlı Dağılım" description="Hangi yapı maliyet kalemine ne kadar pay gidiyor" icon={<BarChart3 size={13} />}>
                    {npkRows.length === 0 ? (
                        <EmptyState
                            icon={<BarChart3 size={28} />}
                            title="NPK verisi yok"
                            description="Pozisyonlarınıza NPK kodu ekleyin ve hesaplama yapın."
                        />
                    ) : (
                        <div className="space-y-2.5">
                            {npkRows.map((r) => (
                                <div key={r.code}>
                                    <div className="flex items-center justify-between text-[12px] mb-1">
                                        <span className="font-mono text-blue-700">NPK {r.code}</span>
                                        <span className="font-mono font-semibold text-slate-800">{fmtMoney(r.value)}</span>
                                    </div>
                                    <div className="relative h-1.5 bg-slate-100 rounded overflow-hidden">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-blue-600"
                                            style={{ width: `${r.percent}%` }}
                                        />
                                    </div>
                                    <div className="text-right text-[10.5px] text-slate-400 font-mono mt-0.5">
                                        %{r.percent.toFixed(1)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

const KPI: React.FC<{ label: string; value: string; icon: React.ReactNode; accent?: string; primary?: boolean }> = ({ label, value, icon, accent, primary }) => (
    <div className={`border rounded-md px-4 py-3 ${primary ? 'bg-blue-50/60 border-blue-200/60' : 'bg-white border-slate-200/70'}`}>
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            {icon}
            {label}
        </div>
        <div className={`mt-1 text-[18px] font-semibold ${accent || (primary ? 'text-blue-900' : 'text-slate-800')}`}>
            {value}
        </div>
    </div>
);
