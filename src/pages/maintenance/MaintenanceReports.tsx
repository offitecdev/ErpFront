import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, File02 as FileText, Mail01 as Mail, SearchLg as Search } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Input } from '../../components/ui-shared/Field';
import { Button } from '../../components/ui-shared/Button';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { MaintenanceReportDto } from '../../types/maintenance';
import { arrayFromUnknown, fmtDate, money, personName, StatCard } from './MaintenanceShared';

import { t } from '@/i18n/translate';

export const MaintenanceReports = () => {
    const [reports, setReports] = useState<MaintenanceReportDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 15;

    const load = async () => {
        setLoading(true);
        try {
            setReports(await maintenanceApi.listReports());
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.bakim_raporlari_yuklenemedi'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const filtered = useMemo(() => {
        return reports.filter((report) => {
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return [
                report.operationsDone,
                report.observations,
                report.riskNotes,
                report.task?.contract?.customer?.companyName,
                report.task?.contract?.title,
            ].some((value) => value?.toLowerCase().includes(q));
        });
    }, [reports, search]);

    const paginated = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, page]);

    const stats = useMemo(() => {
        const signed = reports.filter((report) => report.isSigned).length;
        const unsigned = reports.length - signed;
        const materials = reports.reduce((sum, report) => sum + (report.usedMaterials?.length || 0), 0);
        const cost = reports.reduce((sum, report) => sum + (report.usedMaterials || []).reduce((s, mat) => s + mat.quantity * mat.unitCost, 0), 0);
        return { signed, unsigned, materials, cost };
    }, [reports]);

    return (
        <div className="pb-8">
            <PageHeader
                breadcrumb={t('nav.maintenance')}
                title={t('nav.maintenanceReports')}
                description={t('auto.saha_raporlarini_kullanilan_malzemeleri_risk_not')}
                actions={
                    <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('auto.rapor_ara')} className="w-[240px] pl-8" />
                    </div>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                    label={t('auto.imzali_rapor')}
                    value={stats.signed}
                    icon={<CheckCircle size={14} />}
                    tone="success"
                    sub={t('auto.locked_reports')}
                />
                <StatCard
                    label={t('maintenance.dashboard.unsignedReports')}
                    value={stats.unsigned}
                    icon={<AlertTriangle size={14} />}
                    tone={stats.unsigned ? 'warning' : 'neutral'}
                    sub={t('maintenance.dashboard.unsignedReportsSub')}
                />
                <StatCard
                    label={t('auto.kullanilan_malzeme_satiri')}
                    value={stats.materials}
                    icon={<FileText size={14} />}
                    sub={t('auto.added_to_reports')}
                />
                <StatCard
                    label={t('auto.ek_malzeme_maliyeti')}
                    value={money(stats.cost)}
                    icon={<Mail size={14} />}
                    tone="neutral"
                    sub={t('auto.total_cost')}
                />
            </div>

            <Card title={t('auto.maintenance_report_list_count', { count: filtered.length })} icon={<FileText size={13} />} noPadding>
                {loading ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-slate-100" />)}</div>
                ) : filtered.length === 0 ? (
                    <EmptyState icon={<FileText size={32} />} title={t('auto.rapor_yok')} description={t('auto.teknisyen_bakim_ekranindan_rapor_kaydedildiginde')} />
                ) : (
                    <div className="divide-y divide-slate-100">
                        {paginated.map((report) => {
                            const urls = [
                                ...arrayFromUnknown(report.beforePhotoUrls),
                                ...arrayFromUnknown(report.afterPhotoUrls),
                                ...arrayFromUnknown(report.fileUrls),
                            ];
                            const materialTotal = (report.usedMaterials || []).reduce((sum, mat) => sum + mat.quantity * mat.unitCost, 0);
                            return (
                                <div key={report.id} className="grid grid-cols-1 gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-[14px] font-semibold text-slate-900">{report.task?.contract?.customer?.companyName || report.taskId}</h3>
                                            <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${report.isSigned ?"border-emerald-200 bg-emerald-50 text-emerald-800" :"border-amber-200 bg-amber-50 text-amber-800"}`}>
                                                {report.isSigned ?t('auto.imzali') :t('auto.imza_bekliyor')}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-[12px] text-slate-500">
                                            {report.task?.contract?.title} - {fmtDate(report.createdAt,"DD.MM.YYYY HH:mm")} - {personName(report.technician)}
                                        </div>
                                        <p className="mt-3 whitespace-pre-line text-[13px] text-slate-700">{report.operationsDone}</p>
                                        {report.riskNotes && (
                                            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900">
                                                {report.riskNotes}
                                            </div>
                                        )}
                                        {urls.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {urls.slice(0, 6).map((url) => (
                                                    <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-brand-secondary hover:bg-brand-primary_alt">{t('auto.dosya')}</a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
                                        <div className="grid grid-cols-2 gap-2 text-[12px]">
                                            <Info label={t('auto.malzeme')} value={t('auto.row_count', { count: report.usedMaterials?.length || 0 })} />
                                            <Info label={t('auto.maliyet')} value={money(materialTotal)} />
                                            <Info label={t('auto.plan_tarihi')} value={fmtDate(report.task?.plannedDate)} />
                                            <Info label={t('auto.imza_tarihi')} value={report.signedAt ? fmtDate(report.signedAt,"DD.MM.YYYY HH:mm") :t('auto.bekliyor')} />
                                        </div>
                                        {report.usedMaterials && report.usedMaterials.length > 0 && (
                                            <div className="mt-3 space-y-1 border-t border-slate-200 pt-2">
                                                {report.usedMaterials.slice(0, 3).map((material) => (
                                                    <div key={material.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                                                        <span className="truncate">{material.article?.name || material.articleId}</span>
                                                        <span className="font-mono">{material.quantity} x {money(material.unitCost)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {!report.isSigned && (
                                            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">{t('auto.imza_teknisyen_bakim_ekranindan_alinir')}</div>
                                        )}
                                        {report.isSigned && (
                                            <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                                                <Mail size={13} className="mt-0.5" />{t('auto.pdf_path')}{report.pdfUrl ||t('auto.olusturuldu')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {!loading && filtered.length > 0 && (
                    <div className="flex items-center justify-between border-t border-slate-100 p-4">
                        <span className="text-[12px] text-slate-500">
                            {filtered.length}{t('auto.kayittan')}{(page - 1) * pageSize + 1} - {Math.min(page * pageSize, filtered.length)}{t('auto.arasi_gosteriliyor')}</span>
                        <div className="flex items-center gap-1">
                            <Button type="button" variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('auto.onceki')}</Button>
                            <Button type="button" variant="secondary" size="sm" disabled={page * pageSize >= filtered.length} onClick={() => setPage(p => p + 1)}>{t('auto.sonraki')}</Button>
                        </div>
                    </div>
                )}
            </Card>

        </div>
    );
};

const Info = ({ label, value }: { label: string; value: string }) => (
    <div>
        <div className="text-[11px] font-medium text-slate-500">{label}</div>
        <div className="mt-0.5 truncate font-medium text-slate-800">{value}</div>
    </div>
);
