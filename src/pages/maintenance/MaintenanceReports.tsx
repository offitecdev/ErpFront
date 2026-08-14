import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Edit01, File02 as FileText, Mail01 as Mail, Save01 as Save, SearchLg as Search } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Textarea } from '../../components/ui-shared/Field';
import { Button } from '../../components/ui-shared/Button';
import { ReportsSheet } from '../project/features/components/detail/reports/ReportsSheet';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { MaintenanceReportDto } from '../../types/maintenance';
import { arrayFromUnknown, fmtDate, money, personName, StatCard } from './MaintenanceShared';

import { t } from '@/i18n/translate';

type ReportEditForm = {
    operationsDone: string;
    observations: string;
    recommendations: string;
    riskNotes: string;
};

export const MaintenanceReportsPanel = ({
    reports,
    loading,
    onReload,
}: {
    reports: MaintenanceReportDto[];
    loading: boolean;
    onReload: () => Promise<void> | void;
}) => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState<MaintenanceReportDto | null>(null);
    const [editForm, setEditForm] = useState<ReportEditForm>({ operationsDone: '', observations: '', recommendations: '', riskNotes: '' });
    const [saving, setSaving] = useState(false);
    const pageSize = 15;

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

    const openEdit = (report: MaintenanceReportDto) => {
        setEditForm({
            operationsDone: report.operationsDone || '',
            observations: report.observations || '',
            recommendations: report.recommendations || '',
            riskNotes: report.riskNotes || '',
        });
        setEditing(report);
    };

    const saveEdit = async () => {
        if (!editing) return;
        if (!editForm.operationsDone.trim()) return toast.error(t('auto.yapilan_islemler_zorunludur'));
        setSaving(true);
        try {
            await maintenanceApi.updateReport(editing.id, {
                operationsDone: editForm.operationsDone,
                observations: editForm.observations,
                recommendations: editForm.recommendations,
                riskNotes: editForm.riskNotes,
            });
            toast.success(t('auto.bakim_raporu_guncellendi'));
            setEditing(null);
            await onReload();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.bakim_raporu_guncellenemedi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="pb-8">
            <div className="mb-4 flex items-center justify-end">
                <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('auto.rapor_ara')} className="ofi-light-search-input w-[240px] pl-8 text-slate-950 placeholder:text-slate-400 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-400" />
                </div>
            </div>

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
                                            {!report.isSigned && (
                                                <Button type="button" variant="ghost" size="sm" icon={<Edit01 size={12} />} className="ml-auto" onClick={() => openEdit(report)}>{t('auto.duzenle')}</Button>
                                            )}
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

            <ReportsSheet
                open={Boolean(editing)}
                title={t('auto.rapor_duzenle')}
                subtitle={editing?.task?.contract?.customer?.companyName || editing?.taskId}
                onClose={() => setEditing(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                        <Button loading={saving} icon={<Save size={13} />} onClick={saveEdit}>{t('common.save')}</Button>
                    </>
                }
            >
                <div className="mx-auto w-full max-w-4xl space-y-3 px-5 py-6 md:px-8">
                    <Field label={t('auto.yapilan_islemler')}>
                        <Textarea rows={4} value={editForm.operationsDone} onChange={(e) => setEditForm((form) => ({ ...form, operationsDone: e.target.value }))} />
                    </Field>
                    <Field label={t('auto.gozlemler')}>
                        <Textarea rows={3} value={editForm.observations} onChange={(e) => setEditForm((form) => ({ ...form, observations: e.target.value }))} />
                    </Field>
                    <Field label={t('auto.oneriler')}>
                        <Textarea rows={3} value={editForm.recommendations} onChange={(e) => setEditForm((form) => ({ ...form, recommendations: e.target.value }))} />
                    </Field>
                    <Field label={t('auto.risk_notlari')}>
                        <Textarea rows={2} value={editForm.riskNotes} onChange={(e) => setEditForm((form) => ({ ...form, riskNotes: e.target.value }))} />
                    </Field>
                </div>
            </ReportsSheet>
        </div>
    );
};

const Info = ({ label, value }: { label: string; value: string }) => (
    <div>
        <div className="text-[11px] font-medium text-slate-500">{label}</div>
        <div className="mt-0.5 truncate font-medium text-slate-800">{value}</div>
    </div>
);
