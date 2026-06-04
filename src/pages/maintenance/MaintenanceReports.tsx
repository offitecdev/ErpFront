import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, File02 as FileText, Mail01 as Mail, SearchLg as Search } from '@untitledui/icons';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Input } from '../../components/ui-shared/Field';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { MaintenanceReportDto } from '../../types/maintenance';
import { arrayFromUnknown, fmtDate, money, personName, SignatureModal, StatCard } from './MaintenanceShared';

export const MaintenanceReports = () => {
    const [reports, setReports] = useState<MaintenanceReportDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [signReport, setSignReport] = useState<MaintenanceReportDto | null>(null);
    const [signing, setSigning] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            setReports(await maintenanceApi.listReports());
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Bakım raporları yüklenemedi.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const filtered = reports.filter((report) => {
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

    const stats = useMemo(() => {
        const signed = reports.filter((report) => report.isSigned).length;
        const unsigned = reports.length - signed;
        const materials = reports.reduce((sum, report) => sum + (report.usedMaterials?.length || 0), 0);
        const cost = reports.reduce((sum, report) => sum + (report.usedMaterials || []).reduce((s, mat) => s + mat.quantity * mat.unitCost, 0), 0);
        return { signed, unsigned, materials, cost };
    }, [reports]);

    const sign = async (signatureBase64: string) => {
        if (!signReport) return;
        setSigning(true);
        try {
            await maintenanceApi.signReport(signReport.id, signatureBase64);
            toast.success('Rapor imzalandı ve kilitlendi.');
            setSignReport(null);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Rapor imzalanamadı.');
        } finally {
            setSigning(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Bakım"
                title="Bakım raporları"
                description="Saha raporlarını, kullanılan malzemeleri, risk notlarını ve imza durumunu izleyin."
                actions={
                    <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rapor ara" className="w-[240px] pl-8" />
                    </div>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                    label="İmzalı rapor"
                    value={stats.signed}
                    icon={<CheckCircle size={14} />}
                    tone="success"
                    sub="Kilitlenen rapor"
                />
                <StatCard
                    label="İmza bekleyen rapor"
                    value={stats.unsigned}
                    icon={<AlertTriangle size={14} />}
                    tone={stats.unsigned ? 'warning' : 'neutral'}
                    sub="Müşteri imzası yok"
                />
                <StatCard
                    label="Kullanılan malzeme satırı"
                    value={stats.materials}
                    icon={<FileText size={14} />}
                    sub="Raporlara eklenen"
                />
                <StatCard
                    label="Ek malzeme maliyeti"
                    value={money(stats.cost)}
                    icon={<Mail size={14} />}
                    tone="neutral"
                    sub="Toplam maliyet"
                />
            </div>

            <Card title={`Bakım raporu listesi - ${filtered.length}`} icon={<FileText size={13} />} noPadding>
                {loading ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-slate-100" />)}</div>
                ) : filtered.length === 0 ? (
                    <EmptyState icon={<FileText size={32} />} title="Rapor yok" description="Teknisyen takviminden rapor kaydedildiğinde burada görünür." />
                ) : (
                    <div className="divide-y divide-slate-100">
                        {filtered.map((report) => {
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
                                            <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${report.isSigned ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                                {report.isSigned ? 'İmzalı' : 'İmza bekliyor'}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-[12px] text-slate-500">
                                            {report.task?.contract?.title} - {fmtDate(report.createdAt, 'DD.MM.YYYY HH:mm')} - {personName(report.technician)}
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
                                                    <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-brand-secondary hover:bg-brand-primary_alt">
                                                        Dosya
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-3">
                                        <div className="grid grid-cols-2 gap-2 text-[12px]">
                                            <Info label="Malzeme" value={`${report.usedMaterials?.length || 0} satır`} />
                                            <Info label="Maliyet" value={money(materialTotal)} />
                                            <Info label="Plan tarihi" value={fmtDate(report.task?.plannedDate)} />
                                            <Info label="İmza tarihi" value={report.signedAt ? fmtDate(report.signedAt, 'DD.MM.YYYY HH:mm') : 'Bekliyor'} />
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
                                            <Button className="mt-3 w-full" size="sm" icon={<CheckCircle size={13} />} onClick={() => setSignReport(report)}>
                                                Müşteri imzası
                                            </Button>
                                        )}
                                        {report.isSigned && (
                                            <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                                                <Mail size={13} className="mt-0.5" />
                                                PDF yolu: {report.pdfUrl || 'oluşturuldu'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            <SignatureModal
                open={!!signReport}
                title="Bakım raporu imzası"
                loading={signing}
                onClose={() => setSignReport(null)}
                onSign={sign}
            />
        </div>
    );
};

const Info = ({ label, value }: { label: string; value: string }) => (
    <div>
        <div className="text-[11px] font-medium text-slate-500">{label}</div>
        <div className="mt-0.5 truncate font-medium text-slate-800">{value}</div>
    </div>
);
