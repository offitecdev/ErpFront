import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, CheckCircle, Clock, File02 as FileText, Plus, Save01 as Save, SearchLg as Search } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { articleApi, inventoryApi } from '../../lib/api/inventory';
import { maintenanceApi, regieApi } from '../../lib/api/maintenance';
import type { InventoryArticle, InventoryLocation } from '../../types/inventory';
import type { CustomerLite, MaterialInput, PersonLite, ServiceCallDto, ServiceReportDto, TaskStatus } from '../../types/maintenance';
import { fmtDate, MaterialsEditor, money, personName, SignatureModal, splitLines, StatCard, StatusPill, STATUS_LABEL } from './MaintenanceShared';

import { t } from '@/i18n/translate';

const normalizeRows = <T,>(value: any): T[] => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.customers)) return value.customers;
    return [];
};

const emptyCall = {
    customerId: '',
    reportedIssue: '',
    assignedTechId: '',
    alternativeTechId: '',
    siteName: '',
    priority: 'NORMAL',
};

const emptyReport = {
    workDone: '',
    workingMinutes: 60,
    gasAmount: 0,
    isWarranty: false,
    observations: '',
    recommendations: '',
    beforePhotoUrls: '',
    afterPhotoUrls: '',
    fileUrls: '',
};

export const RegieOperations = () => {
    const [calls, setCalls] = useState<ServiceCallDto[]>([]);
    const [reports, setReports] = useState<ServiceReportDto[]>([]);
    const [customers, setCustomers] = useState<CustomerLite[]>([]);
    const [employees, setEmployees] = useState<PersonLite[]>([]);
    const [articles, setArticles] = useState<InventoryArticle[]>([]);
    const [locations, setLocations] = useState<InventoryLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<TaskStatus | ''>('');
    const [callForm, setCallForm] = useState(emptyCall);
    const [reportCall, setReportCall] = useState<ServiceCallDto | null>(null);
    const [reportForm, setReportForm] = useState(emptyReport);
    const [materials, setMaterials] = useState<MaterialInput[]>([]);
    const [signReport, setSignReport] = useState<ServiceReportDto | null>(null);

    const load = async () => {
        setLoading(true);
        const [callRows, reportRows, customerRes, employeeRes, articleRows, locationRows] = await Promise.allSettled([
            regieApi.listCalls(status),
            regieApi.listReports(),
            maintenanceApi.listOptionCustomers(),
            maintenanceApi.listTechnicians(),
            articleApi.list({ onlyActive: true }) as Promise<InventoryArticle[]>,
            inventoryApi.listLocations(),
        ]);

        if (callRows.status === 'fulfilled') {
            setCalls(callRows.value);
        } else {
            toast.error(callRows.reason?.response?.data?.error ||t('auto.regie_cagrilari_yuklenemedi'));
            setCalls([]);
        }

        if (reportRows.status === 'fulfilled') {
            setReports(reportRows.value);
        } else {
            setReports([]);
        }

        setCustomers(customerRes.status === 'fulfilled' ? normalizeRows<CustomerLite>(customerRes.value) : []);
        setEmployees(employeeRes.status === 'fulfilled' ? normalizeRows<PersonLite>(employeeRes.value) : []);
        setArticles(articleRows.status === 'fulfilled' ? articleRows.value : []);
        setLocations(locationRows.status === 'fulfilled' ? locationRows.value : []);
        setLoading(false);
    };

    useEffect(() => {
        void load();
    }, [status]);

    const stats = useMemo(() => {
        const open = calls.filter((call) => call.status !== 'COMPLETED' && call.status !== 'CANCELLED').length;
        const unsigned = reports.filter((report) => !report.isSigned).length;
        const billable = reports.filter((report) => report.isSigned && !report.isWarranty && !report.linkedOrderId).length;
        const billed = reports.filter((report) => report.linkedOrderId).length;
        return { open, unsigned, billable, billed };
    }, [calls, reports]);

    const filteredCalls = calls.filter((call) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return [
            call.customer?.companyName,
            call.reportedIssue,
            call.siteName,
            personName(call.technician),
        ].some((value) => value?.toLowerCase().includes(q));
    });

    const createCall = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!callForm.customerId || !callForm.reportedIssue.trim()) {
            toast.error(t('auto.musteri_ve_ariza_aciklamasi_zorunludur'));
            return;
        }
        setSaving(true);
        try {
            const alternativeTechId = callForm.alternativeTechId && callForm.alternativeTechId !== callForm.assignedTechId
                ? callForm.alternativeTechId
                : null;

            await regieApi.createCall({
                customerId: callForm.customerId,
                reportedIssue: callForm.reportedIssue,
                assignedTechId: callForm.assignedTechId || null,
                alternativeTechId,
                siteName: callForm.siteName || null,
                priority: callForm.priority,
            });
            toast.success(t('auto.regie_cagrisi_olusturuldu'));
            setCallForm(emptyCall);
            setShowForm(false);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.cagri_olusturulamadi'));
        } finally {
            setSaving(false);
        }
    };

    const openReport = (call: ServiceCallDto) => {
        setReportCall(call);
        setReportForm(emptyReport);
        setMaterials([]);
    };

    const submitReport = async () => {
        if (!reportCall) return;
        if (!reportForm.workDone.trim()) {
            toast.error(t('auto.yapilan_is_zorunludur'));
            return;
        }
        if (materials.some((row) => !row.articleId || !row.sourceLocationId || row.quantity <= 0)) {
            toast.error(t('auto.malzeme_satirlarinda_urun_depo_ve_miktar_zorunlu'));
            return;
        }

        setSaving(true);
        try {
            await regieApi.submitReport({
                callId: reportCall.id,
                workDone: reportForm.workDone,
                workingMinutes: Number(reportForm.workingMinutes || 0),
                gasAmount: Number(reportForm.gasAmount || 0),
                isWarranty: Boolean(reportForm.isWarranty),
                observations: reportForm.observations,
                recommendations: reportForm.recommendations,
                beforePhotoUrls: splitLines(reportForm.beforePhotoUrls),
                afterPhotoUrls: splitLines(reportForm.afterPhotoUrls),
                fileUrls: splitLines(reportForm.fileUrls),
                materials,
            });
            toast.success(t('auto.regie_raporu_kaydedildi_imza_bekleniyor'));
            setReportCall(null);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.regie_raporu_kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    const sign = async (signatureBase64: string) => {
        if (!signReport) return;
        setSaving(true);
        try {
            const result = await regieApi.signReport(signReport.id, signatureBase64);
            toast.success(result.message ||t('auto.regie_raporu_imzalandi'));
            if (result.promptForBilling && window.confirm(t('auto.garanti_disi_regie_raporu_icin_is_emri_fatura_ol'))) {
                const bill = await regieApi.createBill(signReport.id);
                toast.success(t('auto.work_order_created', { number: bill.workOrder.orderNumber }));
            }
            setSignReport(null);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.rapor_imzalanamadi'));
        } finally {
            setSaving(false);
        }
    };

    const createBill = async (report: ServiceReportDto) => {
        setSaving(true);
        try {
            const result = await regieApi.createBill(report.id);
            toast.success(t('auto.work_order_created', { number: result.workOrder.orderNumber }));
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.is_emri_olusturulamadi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('nav.maintenance')}
                title={t('auto.regie_ve_ariza_operasyonlari')}
                description={t('auto.plan_disi_servis_cagrilarini_sahada_kullanilan_m')}
                actions={
                    <>
                        <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('auto.cagri_ara')} className="w-[220px] pl-8" />
                        </div>
                        <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | '')} className="w-[150px]">
                            <option value="">{t('auto.tum_durumlar')}</option>
                            {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                        </Select>
                        <Button variant={showForm ? 'secondary' : 'primary'} icon={<Plus size={13} />} onClick={() => setShowForm(!showForm)}>{t('auto.yeni_cagri')}</Button>
                    </>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                    label={t('auto.acik_cagri')}
                    value={stats.open}
                    icon={<Clock size={14} />}
                    tone={stats.open ? 'warning' : 'neutral'}
                    sub={t('auto.ongoing_calls')}
                />
                <StatCard
                    label={t('maintenance.dashboard.unsignedReports')}
                    value={stats.unsigned}
                    icon={<AlertTriangle size={14} />}
                    tone={stats.unsigned ? 'warning' : 'neutral'}
                    sub={t('maintenance.dashboard.unsignedReportsSub')}
                />
                <StatCard
                    label={t('auto.faturalanabilir_rapor')}
                    value={stats.billable}
                    icon={<FileText size={14} />}
                    sub={t('auto.non_warranty_jobs')}
                />
                <StatCard
                    label={t('auto.is_emrine_baglanan')}
                    value={stats.billed}
                    icon={<CheckCircle size={14} />}
                    tone="success"
                    sub={t('auto.billing_started')}
                />
            </div>

            {showForm && (
                <Card title={t('auto.yeni_regie_cagrisi')} icon={<Plus size={13} />} className="mb-4">
                    <form onSubmit={createCall} className="grid grid-cols-1 gap-3 md:grid-cols-12">
                        <Field label={t('nav.quickActionsGroup.customers')} required className="md:col-span-4">
                            <Select value={callForm.customerId} onChange={(e) => setCallForm({ ...callForm, customerId: e.target.value })}>
                                <option value="">{t('common.select')}</option>
                                {!customers.length && <option value="__no_customers" disabled>{t('crm.customers.noCustomers')}</option>}
                                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
                            </Select>
                        </Field>
                        <Field label={t('maintenance.dashboard.colTechnician')} className="md:col-span-3">
                            <Select value={callForm.assignedTechId} onChange={(e) => setCallForm({ ...callForm, assignedTechId: e.target.value })}>
                                <option value="">{t('common.select')}</option>
                                {!employees.length && <option value="__no_technicians" disabled>{t('auto.teknisyen_rolunde_personel_yok')}</option>}
                                {employees.map((employee) => <option key={employee.id} value={employee.id}>{personName(employee)}</option>)}
                            </Select>
                        </Field>
                        <Field label={t('auto.alternatif')} className="md:col-span-3">
                            <Select value={callForm.alternativeTechId} onChange={(e) => setCallForm({ ...callForm, alternativeTechId: e.target.value })}>
                                <option value="">{t('common.select')}</option>
                                {!employees.length && <option value="__no_technicians" disabled>{t('auto.teknisyen_rolunde_personel_yok')}</option>}
                                {employees.map((employee) => <option key={employee.id} value={employee.id}>{personName(employee)}</option>)}
                            </Select>
                        </Field>
                        <Field label={t('auto.oncelik')} className="md:col-span-2">
                            <Select value={callForm.priority} onChange={(e) => setCallForm({ ...callForm, priority: e.target.value })}>
                                <option value="LOW">{t('auto.dusuk')}</option>
                                <option value="NORMAL">{t('auto.normal')}</option>
                                <option value="HIGH">{t('auto.yuksek')}</option>
                                <option value="URGENT">{t('auto.acil')}</option>
                            </Select>
                        </Field>
                        <Field label={t('auto.saha_lokasyon')} className="md:col-span-4">
                            <Input value={callForm.siteName} onChange={(e) => setCallForm({ ...callForm, siteName: e.target.value })} />
                        </Field>
                        <Field label={t('auto.ariza_aciklamasi')} required className="md:col-span-8">
                            <Textarea rows={3} value={callForm.reportedIssue} onChange={(e) => setCallForm({ ...callForm, reportedIssue: e.target.value })} />
                        </Field>
                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 md:col-span-12">
                            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
                            <Button type="submit" loading={saving} icon={<Save size={13} />}>{t('common.save')}</Button>
                        </div>
                    </form>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="xl:col-span-7">
                    <Card title={t('auto.regie_calls_count', { count: filteredCalls.length })} icon={<Clock size={13} />} noPadding>
                        {loading ? (
                            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />)}</div>
                        ) : filteredCalls.length === 0 ? (
                            <EmptyState icon={<Clock size={32} />} title={t('auto.regie_cagrisi_yok')} description={t('auto.plan_disi_servis_cagrilari_burada_listelenir')} />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">{t('auto.cagri_ariza')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('maintenance.dashboard.colTechnician')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('common.status')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('auto.rapor_durumu')}</th>
                                            <th className="px-3 py-2 text-right font-semibold">{t('common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredCalls.map((call) => (
                                            <tr key={call.id} className="hover:bg-slate-50/70">
                                                <td className="px-3 py-2">
                                                    <div className="font-semibold text-slate-900">{call.customer?.companyName || call.customerId}</div>
                                                    <div className="line-clamp-2 text-[11px] text-slate-500">{call.reportedIssue}</div>
                                                    <div className="mt-0.5 text-[10.5px] text-slate-400">{fmtDate(call.callDate,"DD.MM.YYYY HH:mm")} - {call.siteName || '-'}</div>
                                                </td>
                                                <td className="px-3 py-2 text-slate-600">{personName(call.technician)}</td>
                                                <td className="px-3 py-2"><StatusPill status={call.status} /></td>
                                                <td className="px-3 py-2 text-slate-500">{call.report ? (call.report.isSigned ?t('auto.imzali') :t('auto.imza_bekliyor')) : '-'}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {!call.report && call.status !== 'CANCELLED' && (
                                                        <Button variant="secondary" size="sm" icon={<FileText size={12} />} onClick={() => openReport(call)}>{t('auto.rapor')}</Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>

                <div className="xl:col-span-5">
                    <Card title={t('auto.regie_raporlari')} icon={<FileText size={13} />} noPadding>
                        {reports.length === 0 ? (
                            <EmptyState icon={<FileText size={28} />} title={t('auto.rapor_yok')} description={t('auto.regie_cagrisi_raporlaninca_burada_gorunur')} />
                        ) : (
                            <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">
                                {reports.map((report) => {
                                    const materialCost = (report.usedMaterials || []).reduce((sum, row) => sum + row.quantity * row.unitCost, 0);
                                    return (
                                        <div key={report.id} className="px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-[13px] font-semibold text-slate-900">{report.call?.customer?.companyName || report.callId}</div>
                                                    <div className="mt-0.5 text-[11px] text-slate-500">{fmtDate(report.createdAt,"DD.MM.YYYY HH:mm")} - {personName(report.technician)}</div>
                                                </div>
                                                <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold ${report.isSigned ?"border-emerald-200 bg-emerald-50 text-emerald-800" :"border-amber-200 bg-amber-50 text-amber-800"}`}>
                                                    {report.isSigned ?t('auto.imzali') :t('auto.imza_bekliyor')}
                                                </span>
                                            </div>
                                            <p className="mt-2 line-clamp-2 text-[12px] text-slate-600">{report.workDone}</p>
                                            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                                                <span>{t('auto.calisma')}{report.workingMinutes}{t('common.minute')}</span>
                                                <span>{t('auto.gaz')}{report.gasAmount}</span>
                                                <span>{t('auto.malzeme')}{money(materialCost)}</span>
                                            </div>
                                            <div className="mt-3 flex gap-2">
                                                {!report.isSigned && <Button size="sm" icon={<CheckCircle size={12} />} onClick={() => setSignReport(report)}>{t('auto.imzala')}</Button>}
                                                {report.isSigned && !report.isWarranty && !report.linkedOrderId && (
                                                    <Button size="sm" variant="secondary" loading={saving} onClick={() => createBill(report)}>{t('auto.is_emri')}</Button>
                                                )}
                                                {report.linkedOrderId && <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">{t('auto.faturalandi')}</span>}
                                                {report.isWarranty && <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">{t('auto.garanti')}</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <Modal
                open={!!reportCall}
                title={t('auto.regie_raporu')}
                description={reportCall ? `${reportCall.customer?.companyName || ''} - ${dayjs(reportCall.callDate).format('DD.MM.YYYY')}` : undefined}
                onClose={() => setReportCall(null)}
                width="full"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setReportCall(null)}>{t('common.cancel')}</Button>
                        <Button loading={saving} icon={<Save size={13} />} onClick={submitReport}>{t('auto.raporu_kaydet')}</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    <div className="space-y-3 xl:col-span-7">
                        <Field label={t('auto.yapilan_is')} required>
                            <Textarea rows={4} value={reportForm.workDone} onChange={(e) => setReportForm({ ...reportForm, workDone: e.target.value })} />
                        </Field>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <Field label={t('auto.calisma_suresi_dk')}><Input type="number" min="0" value={reportForm.workingMinutes} onChange={(e) => setReportForm({ ...reportForm, workingMinutes: Number(e.target.value) })} /></Field>
                            <Field label={t('auto.gaz_miktari')}><Input type="number" min="0" step="0.01" value={reportForm.gasAmount} onChange={(e) => setReportForm({ ...reportForm, gasAmount: Number(e.target.value) })} /></Field>
                            <label className="flex items-end">
                                <span className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-700">
                                    <input type="checkbox" checked={reportForm.isWarranty} onChange={(e) => setReportForm({ ...reportForm, isWarranty: e.target.checked })} />{t('auto.garanti_kapsaminda')}</span>
                            </label>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Field label={t('auto.gozlemler')}><Textarea rows={3} value={reportForm.observations} onChange={(e) => setReportForm({ ...reportForm, observations: e.target.value })} /></Field>
                            <Field label={t('auto.oneriler')}><Textarea rows={3} value={reportForm.recommendations} onChange={(e) => setReportForm({ ...reportForm, recommendations: e.target.value })} /></Field>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <Field label={t('auto.oncesi_url')}><Textarea rows={2} value={reportForm.beforePhotoUrls} onChange={(e) => setReportForm({ ...reportForm, beforePhotoUrls: e.target.value })} /></Field>
                            <Field label={t('auto.sonrasi_url')}><Textarea rows={2} value={reportForm.afterPhotoUrls} onChange={(e) => setReportForm({ ...reportForm, afterPhotoUrls: e.target.value })} /></Field>
                            <Field label={t('auto.ek_dosya_url')}><Textarea rows={2} value={reportForm.fileUrls} onChange={(e) => setReportForm({ ...reportForm, fileUrls: e.target.value })} /></Field>
                        </div>
                    </div>
                    <div className="xl:col-span-5">
                        <MaterialsEditor rows={materials} setRows={setMaterials} articles={articles} locations={locations} />
                    </div>
                </div>
            </Modal>

            <SignatureModal
                open={!!signReport}
                title={t('auto.regie_raporu_imzasi')}
                loading={saving}
                onClose={() => setSignReport(null)}
                onSign={sign}
            />
        </div>
    );
};
