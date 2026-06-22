import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowLeft, Calendar, CheckCircle, Clock, File02 as FileText, Package, Plus, Save01 as Save, Trash01 as Trash, User01 as UserIcon } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Textarea } from '../../components/ui-shared/Field';
import { articleApi, inventoryApi } from '../../lib/api/inventory';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { InventoryArticle, InventoryLocation } from '../../types/inventory';
import type { MaintenanceExpenseDto, MaintenanceTaskDto, MaterialInput } from '../../types/maintenance';
import { ensureMaintenanceLocale, fmtDate, MaterialsEditor, personName, SignatureModal, splitLines, StatusPill } from './MaintenanceShared';

import { t } from '@/i18n/translate';
import { useTranslation } from 'react-i18next';

type TechTab = 'checklist' | 'costs' | 'signature';

const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick((tick) => tick + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};

const getTabs = (): Array<{ key: TechTab; label: string }> => [
    { key: 'checklist', label:t('auto.kontrol_listesi') },
    { key: 'costs', label:t('auto.malzeme_ve_gider') },
    { key: 'signature', label:t('auto.imza') },
];

const defaultChecklist = () => [
    { label:t('auto.ekipman_genel_durum_kontrolu'), checked: false, required: true },
    { label:t('auto.elektrik_baglantilari_ve_guvenlik_kontrolu'), checked: false, required: true },
    { label:t('auto.filtre_serpantin_ve_hava_akisi_kontrolu'), checked: false, required: true },
    { label:t('auto.gaz_basinc_degerleri_kontrolu'), checked: false, required: false },
    { label:t('auto.drenaj_ve_kacak_kontrolu'), checked: false, required: true },
    { label:t('auto.calisma_testi_ve_musteri_bilgilendirmesi'), checked: false, required: true },
];

const emptyReport = {
    operationsDone: '',
    observations: '',
    recommendations: '',
    riskNotes: '',
    beforePhotoUrls: '',
    afterPhotoUrls: '',
    fileUrls: '',
};

const normalizeRows = <T,>(value: any): T[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];

const eventStart = (task: MaintenanceTaskDto) => dayjs(task.scheduledStartTime || task.plannedDate);
const eventEnd = (task: MaintenanceTaskDto) => task.scheduledEndTime ? dayjs(task.scheduledEndTime) : eventStart(task).add(1, 'hour');
const isExpiredMaintenance = (task: MaintenanceTaskDto) =>
    task.status !== 'COMPLETED'
    && task.status !== 'CANCELLED'
    && dayjs(task.plannedDate).startOf('day').isBefore(dayjs().startOf('day'));

const expenseTotal = (expenses?: MaintenanceExpenseDto[]) =>
    (expenses || []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

export const MaintenanceTechnician = () => {
    useLanguageRefresh();
    ensureMaintenanceLocale();
    const navigate = useNavigate();
    const { taskId } = useParams();
    const [weekAnchor] = useState(dayjs().format('YYYY-MM-DD'));
    const [tasks, setTasks] = useState<MaintenanceTaskDto[]>([]);
    const [articles, setArticles] = useState<InventoryArticle[]>([]);
    const [locations, setLocations] = useState<InventoryLocation[]>([]);
    const [selectedTask, setSelectedTask] = useState<MaintenanceTaskDto | null>(null);
    const [activeTab, setActiveTab] = useState<TechTab>('checklist');
    const [reportForm, setReportForm] = useState(emptyReport);
    const [checklist, setChecklist] = useState(defaultChecklist());
    const [materials, setMaterials] = useState<MaterialInput[]>([]);
    const [expenses, setExpenses] = useState([
        { expenseType:t('auto.harici_gider'), amount: 0, description: '' },
        { expenseType:t('auto.15_ek_iscilik_calisma'), amount: 0, description: '' },
    ]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [signingReportId, setSigningReportId] = useState<string | null>(null);

    const weekStart = useMemo(() => dayjs(weekAnchor).startOf('week').add(1, 'day'), [weekAnchor]);

    const load = async () => {
        setLoading(true);
        const taskRequest = taskId
            ? maintenanceApi.getMyTask(taskId)
            : maintenanceApi.listMyTasks(weekStart.format('YYYY-MM-DD'), weekStart.add(6, 'day').format('YYYY-MM-DD'));
        const [taskRows, articleRows, locationRows] = await Promise.allSettled([
            taskRequest,
            articleApi.list({ onlyActive: true }) as Promise<InventoryArticle[]>,
            inventoryApi.listLocations(),
        ]);
        if (taskRows.status === 'fulfilled') {
            const rows = Array.isArray(taskRows.value) ? taskRows.value : [taskRows.value];
            setTasks(rows);
            setSelectedTask((current) => {
                if (taskId) return rows[0] || null;
                if (!current) return rows[0] || null;
                return rows.find((task) => task.id === current.id) || rows[0] || null;
            });
        } else {
            toast.error(taskRows.reason?.response?.data?.error ||t('auto.teknisyen_gorevleri_yuklenemedi'));
            setTasks([]);
        }
        setArticles(articleRows.status === 'fulfilled' ? articleRows.value : []);
        setLocations(locationRows.status === 'fulfilled' ? normalizeRows<InventoryLocation>(locationRows.value) : []);
        setLoading(false);
    };

    useEffect(() => {
        void load();
    }, [weekStart.valueOf(), taskId]);

    useEffect(() => {
        if (selectedTask?.report) {
            setReportForm({
                operationsDone: selectedTask.report.operationsDone || '',
                observations: selectedTask.report.observations || '',
                recommendations: selectedTask.report.recommendations || '',
                riskNotes: selectedTask.report.riskNotes || '',
                beforePhotoUrls: Array.isArray(selectedTask.report.beforePhotoUrls) ? selectedTask.report.beforePhotoUrls.join('\n') : '',
                afterPhotoUrls: Array.isArray(selectedTask.report.afterPhotoUrls) ? selectedTask.report.afterPhotoUrls.join('\n') : '',
                fileUrls: Array.isArray(selectedTask.report.fileUrls) ? selectedTask.report.fileUrls.join('\n') : '',
            });
            if (Array.isArray(selectedTask.report.checklistJson) && selectedTask.report.checklistJson.length > 0) {
                setChecklist(selectedTask.report.checklistJson as any);
            }
            if (selectedTask.report.usedMaterials && selectedTask.report.usedMaterials.length > 0) {
                setMaterials(selectedTask.report.usedMaterials.map(m => ({
                    articleId: m.articleId,
                    quantity: m.quantity,
                    unitCost: m.unitCost,
                    sourceLocationId: m.sourceLocationId || '',
                })));
            }
            if (selectedTask.report.expenses && selectedTask.report.expenses.length > 0) {
                setExpenses(selectedTask.report.expenses.map(e => ({
                    expenseType: e.expenseType,
                    amount: e.amount,
                    description: e.description || '',
                })));
            }
        } else {
            setReportForm(emptyReport);
            setChecklist(defaultChecklist());
            setMaterials([]);
            setExpenses([
                { expenseType:t('auto.harici_gider'), amount: 0, description: '' },
                { expenseType:t('auto.15_ek_iscilik_calisma'), amount: 0, description: '' },
            ]);
        }
    }, [selectedTask]);

    const submitReport = async () => {
        if (!selectedTask) return;
        if (isExpiredMaintenance(selectedTask)) return toast.error(t('auto.suresi_dolmus_bakim_uzerinde_islem_yapilamaz'));
        if (!reportForm.operationsDone.trim()) return toast.error(t('auto.yapilan_islemler_zorunludur'));
        if (checklist.some((item) => item.required && !item.checked)) return toast.error(t('auto.zorunlu_kontrol_maddelerini_tamamlayin'));
        const missingMaterial = materials.some((row) => !row.articleId || !row.sourceLocationId || row.quantity <= 0);
        if (missingMaterial) return toast.error(t('auto.malzeme_satirlarinda_urun_depo_ve_miktar_zorunlu'));
        const cleanExpenses = expenses
            .filter((expense) => expense.expenseType.trim() && Number(expense.amount) > 0)
            .map((expense) => ({
                expenseType: expense.expenseType.trim(),
                amount: Number(expense.amount || 0),
                description: expense.description.trim(),
            }));

        setSaving(true);
        try {
            await maintenanceApi.submitReport({
                taskId: selectedTask.id,
                operationsDone: reportForm.operationsDone,
                observations: reportForm.observations,
                recommendations: reportForm.recommendations,
                riskNotes: reportForm.riskNotes,
                checklistJson: checklist,
                beforePhotoUrls: splitLines(reportForm.beforePhotoUrls),
                afterPhotoUrls: splitLines(reportForm.afterPhotoUrls),
                fileUrls: splitLines(reportForm.fileUrls),
                extraMaterials: materials,
                expenses: cleanExpenses,
            });
            toast.success(t('auto.bakim_raporu_kaydedildi_imza_bekleniyor'));
            await load();
            setActiveTab('signature');
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.rapor_kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    const sign = async (signatureBase64: string) => {
        if (!signingReportId) return;
        if (selectedTask && isExpiredMaintenance(selectedTask)) {
            toast.error(t('auto.suresi_dolmus_bakim_uzerinde_islem_yapilamaz'));
            return;
        }
        setSaving(true);
        try {
            await maintenanceApi.sendReportToManager(signingReportId, signatureBase64);
            toast.success(t('auto.rapor_imzalandi_ve_gonderildi'));
            setSigningReportId(null);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.rapor_yoneticiye_gonderilemedi'));
        } finally {
            setSaving(false);
        }
    };

    const sendWithoutSignature = async () => {
        if (!selectedTask?.report) return;
        if (isExpiredMaintenance(selectedTask)) {
            toast.error(t('auto.suresi_dolmus_bakim_uzerinde_islem_yapilamaz'));
            return;
        }
        setSaving(true);
        try {
            await maintenanceApi.sendReportToManager(selectedTask.report.id);
            toast.success(t('auto.rapor_imzasiz_gonderildi'));
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.rapor_yoneticiye_gonderilemedi'));
        } finally {
            setSaving(false);
        }
    };

    const selectedTaskExpired = selectedTask ? isExpiredMaintenance(selectedTask) : false;

    return (
        <div>
            <PageHeader
                breadcrumb={t('nav.maintenance')}
                title={taskId ?t('auto.teknisyen_bakim_ekrani') :t('auto.teknisyen_takvimi')}
                description={taskId ?t('auto.bakim_detayini_kontrol_listesini_giderleri_ve_mu') :t('auto.atanmis_bakim_gorevlerinizi_takvimden_secin')}
                actions={
                    taskId ? (
                        <Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/maintenance/technician/tasks')}>{t('auto.listeye_don')}</Button>
                    ) : null
                }
            />

            <div className="grid grid-cols-1 gap-4">
                {!taskId && <Card title={t('auto.haftanin_gorevleri')} icon={<FileText size={13} />} noPadding>
                    {loading ? (
                        <div className="m-4 h-72 animate-pulse rounded bg-slate-100" />
                    ) : tasks.length === 0 ? (
                        <EmptyState icon={<FileText size={32} />} title={t('auto.gorev_yok')} description={t('auto.bu_hafta_icin_atanmis_bir_gorev_bulunamadi')} />
                    ) : (
                        <div className="max-h-[800px] overflow-y-auto divide-y divide-slate-100">
                            {tasks.map(task => (
                                <button key={task.id} type="button" onClick={() => navigate(`/maintenance/technician/tasks/${task.id}`)} className="w-full text-left p-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="font-semibold text-[13.5px] text-slate-900 leading-tight">
                                                {task.contract?.customer?.companyName || task.contract?.title ||t('nav.maintenance')}
                                            </div>
                                            <StatusPill status={task.status} />
                                        </div>
                                        <div className="flex flex-col gap-1 text-[12px] text-slate-600">
                                            {task.contract?.contractCode && (
                                                <div className="flex items-center gap-1.5">
                                                    <FileText size={12} className="text-slate-400" />
                                                    <span>{t('auto.sozlesme_no')}{task.contract.contractCode}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1.5">
                                                <Calendar size={12} className="text-slate-400" />
                                                <span>{fmtDate(eventStart(task).toISOString(),t('auto.dd_mm_yyyy_dddd'))}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={12} className="text-slate-400" />
                                                <span>{eventStart(task).format('HH:mm')} - {eventEnd(task).format('HH:mm')}</span>
                                            </div>
                                            {isExpiredMaintenance(task) && (
                                                <div className="text-red-500 font-semibold mt-1">{t('auto.suresi_dolmus')}</div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </Card>}

                {taskId && <Card title={t('auto.bakim_gorevi')} icon={<FileText size={13} />}>
                    {!selectedTask ? (
                        <EmptyState icon={<FileText size={28} />} title={t('auto.gorev_secin')} description={t('auto.takvimden_bir_bakim_secildiginde_detaylar_burada')} />
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-mono text-[11px] font-semibold text-slate-500">{selectedTask.contract?.contractCode}</div>
                                        <div className="truncate text-[15px] font-semibold text-slate-950">{selectedTask.contract?.customer?.companyName || selectedTask.contract?.title}</div>
                                        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                                            <UserIcon size={12} />
                                            {personName(selectedTask.technician) ||t('maintenance.dashboard.colTechnician')}
                                        </div>
                                    </div>
                                    {selectedTaskExpired ? (
                                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{t('auto.suresi_dolmus')}</span>
                                    ) : <StatusPill status={selectedTask.status} />}
                                </div>
                                {selectedTaskExpired && (
                                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">{t('auto.suresi_dolmus_bakim_uzerinde_islem_yapilamaz')}</div>
                                )}
                                <div className="mt-2 text-[12px] text-slate-600">
                                    {fmtDate(eventStart(selectedTask).toISOString(),"DD.MM.YYYY HH:mm")} - {eventEnd(selectedTask).format('HH:mm')}
                                </div>
                            </div>

                            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
                                {getTabs().map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setActiveTab(tab.key)}
                                        className={`rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${activeTab === tab.key ?t('auto.bg_white_text_slate_950_shadow_xs') :t('auto.text_slate_600_hover_text_slate_950')}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {activeTab === 'checklist' && (
                                <div className="space-y-3">
                                    <Field label={t('auto.yapilan_islemler')} required>
                                        <Textarea rows={4} value={reportForm.operationsDone} onChange={(e) => setReportForm({ ...reportForm, operationsDone: e.target.value })} disabled={Boolean(selectedTask.report) || selectedTaskExpired} />
                                    </Field>
                                    <div className="rounded-lg border border-slate-200">
                                        <div className="border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">{t('auto.kontrol_maddeleri')}</div>
                                        <div className="divide-y divide-slate-100">
                                            {checklist.map((item, index) => (
                                                <label key={item.label} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px] text-slate-700">
                                                    <span>{item.label}{item.required && <span className="ml-1 text-rose-600">*</span>}</span>
                                                    <input type="checkbox" checked={item.checked} disabled={Boolean(selectedTask.report) || selectedTaskExpired} onChange={(e) => setChecklist(checklist.map((row, i) => i === index ? { ...row, checked: e.target.checked } : row))} />
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        <Field label={t('auto.teknik_gozlemler')}><Textarea rows={2} value={reportForm.observations} onChange={(e) => setReportForm({ ...reportForm, observations: e.target.value })} disabled={Boolean(selectedTask.report) || selectedTaskExpired} /></Field>
                                        <Field label={t('auto.oneriler')}><Textarea rows={2} value={reportForm.recommendations} onChange={(e) => setReportForm({ ...reportForm, recommendations: e.target.value })} disabled={Boolean(selectedTask.report) || selectedTaskExpired} /></Field>
                                        <Field label={t('auto.risk_notlari')}><Textarea rows={2} value={reportForm.riskNotes} onChange={(e) => setReportForm({ ...reportForm, riskNotes: e.target.value })} disabled={Boolean(selectedTask.report) || selectedTaskExpired} /></Field>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'costs' && (
                                <div className="space-y-4">
                                    <MaterialsEditor rows={materials} setRows={setMaterials} articles={articles} locations={locations} />
                                    <div className="rounded-lg border border-slate-200">
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                                            <span className="flex items-center gap-1.5">
                                                <Package size={13} />{t('auto.harici_gider_ve_ek_calisma')}</span>
                                            {!selectedTask.report && !selectedTaskExpired && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    icon={<Plus size={12} />}
                                                    onClick={() => setExpenses([...expenses, { expenseType:t('auto.harici_gider'), amount: 0, description: '' }])}
                                                >{t('auto.satir')}</Button>
                                            )}
                                        </div>
                                        <div className="space-y-2 p-3">
                                            {expenses.map((expense, index) => (
                                                <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_32px]">
                                                    <Input value={expense.expenseType} onChange={(e) => setExpenses(expenses.map((row, i) => i === index ? { ...row, expenseType: e.target.value } : row))} disabled={Boolean(selectedTask.report) || selectedTaskExpired} />
                                                    <Input type="number" min="0" step="0.01" value={expense.amount} onChange={(e) => setExpenses(expenses.map((row, i) => i === index ? { ...row, amount: Number(e.target.value) } : row))} disabled={Boolean(selectedTask.report) || selectedTaskExpired} />
                                                    <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={Boolean(selectedTask.report) || selectedTaskExpired} onClick={() => setExpenses(expenses.filter((_, i) => i !== index))} />
                                                    <Textarea className="md:col-span-3" rows={2} value={expense.description} onChange={(e) => setExpenses(expenses.map((row, i) => i === index ? { ...row, description: e.target.value } : row))} disabled={Boolean(selectedTask.report) || selectedTaskExpired} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-700">{t('auto.kayitli_gider_toplami')}{expenseTotal(selectedTask.report?.expenses || selectedTask.expenses).toFixed(2)} CHF
                                    </div>
                                </div>
                            )}

                            {activeTab === 'signature' && (
                                <div className="space-y-3">
                                    {selectedTaskExpired ? (
                                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">{t('auto.suresi_dolmus_bakim_uzerinde_imza_alinamaz')}</div>
                                    ) : !selectedTask.report ? (
                                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{t('auto.imza_almadan_once_bakim_raporunu_kaydedin')}</div>
                                    ) : selectedTask.report.isSigned ? (
                                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('auto.imza_alindi')}{fmtDate(selectedTask.report.signedAt,"DD.MM.YYYY HH:mm")}
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                            <Button variant="secondary" className="w-fit" loading={saving} disabled={selectedTaskExpired} onClick={sendWithoutSignature}>{t('auto.imzasiz_yoneticiye_gonder')}</Button>
                                            <Button className="w-fit" icon={<CheckCircle size={13} />} loading={saving} disabled={selectedTaskExpired} onClick={() => setSigningReportId(selectedTask.report!.id)}>{t('auto.musteri_imzasi_al')}</Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!selectedTask.report && !selectedTaskExpired && (
                                <div className="flex justify-end">
                                    <Button className="w-fit" loading={saving} icon={<Save size={13} />} onClick={submitReport}>{t('auto.raporu_kaydet')}</Button>
                                </div>
                            )}
                            {selectedTask.report && !selectedTask.report.isSigned && (
                                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                                    <CheckCircle size={13} />{t('auto.rapor_kaydedildi_musteri_imzasi_bekliyor')}</div>
                            )}
                        </div>
                    )}
                </Card>}
            </div>

            <SignatureModal
                open={Boolean(signingReportId)}
                title={t('auto.bakim_musteri_imzasi')}
                loading={saving}
                onClose={() => setSigningReportId(null)}
                onSign={sign}
            />
        </div>
    );
};
