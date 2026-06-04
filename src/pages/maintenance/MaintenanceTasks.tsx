import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ArrowLeft, ArrowRight, Calendar, Edit01 as Edit, File02 as FileText, FilterLines, Save01 as Save, User01 as UserIcon } from '@untitledui/icons';
import { toast } from 'sonner';
import { parseDate } from '@internationalized/date';
import type { DateValue } from 'react-aria-components';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { DateRangePicker } from '../../components/application/date-picker/date-range-picker';
import { articleApi, inventoryApi } from '../../lib/api/inventory';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { InventoryArticle, InventoryLocation } from '../../types/inventory';
import type { MaintenanceTaskDto, MaterialInput, PersonLite, TaskStatus } from '../../types/maintenance';
import { fmtDate, MaterialsEditor, personName, splitLines, StatusPill, STATUS_LABEL } from './MaintenanceShared';

type ScheduleView = 'list' | 'calendar';
type MaintenanceDateRange = { start: DateValue; end: DateValue };

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

const toDateRange = (start: dayjs.Dayjs, end: dayjs.Dayjs): MaintenanceDateRange => ({
    start: parseDate(start.format('YYYY-MM-DD')),
    end: parseDate(end.format('YYYY-MM-DD')),
});

const initialRange = () => {
    const start = dayjs().startOf('week').add(1, 'day');
    return toDateRange(start, start.add(6, 'day'));
};

export const MaintenanceTasks = () => {
    const [scheduleView, setScheduleView] = useState<ScheduleView>('list');
    const [anchorDate, setAnchorDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [appliedRange, setAppliedRange] = useState<MaintenanceDateRange>(() => initialRange());
    const [pickerRange, setPickerRange] = useState<MaintenanceDateRange | null>(() => initialRange());
    const [tasks, setTasks] = useState<MaintenanceTaskDto[]>([]);
    const [employees, setEmployees] = useState<PersonLite[]>([]);
    const [articles, setArticles] = useState<InventoryArticle[]>([]);
    const [locations, setLocations] = useState<InventoryLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [editTask, setEditTask] = useState<MaintenanceTaskDto | null>(null);
    const [reportTask, setReportTask] = useState<MaintenanceTaskDto | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({ plannedDate: '', assignedTechId: '', alternativeTechId: '', siteName: '', status: 'PENDING' as TaskStatus });
    const [reportForm, setReportForm] = useState(emptyReport);
    const [materials, setMaterials] = useState<MaterialInput[]>([]);
    const [checklist, setChecklist] = useState([
        { label: 'Ekipman genel kontrol', checked: false, required: true },
        { label: 'Filtre / temizlik kontrolü', checked: false, required: true },
        { label: 'Elektrik ve güvenlik kontrolü', checked: false, required: true },
    ]);

    const range = useMemo(() => ({
        start: dayjs(appliedRange.start.toString()).startOf('day'),
        end: dayjs(appliedRange.end.toString()).endOf('day'),
    }), [appliedRange]);

    const load = async () => {
        setLoading(true);
        const [taskRows, employeeRes, articleRows, locationRows] = await Promise.allSettled([
            maintenanceApi.listTasks(range.start.format('YYYY-MM-DD'), range.end.format('YYYY-MM-DD')),
            maintenanceApi.listTechnicians(),
            articleApi.list({ onlyActive: true }) as Promise<InventoryArticle[]>,
            inventoryApi.listLocations(),
        ]);

        if (taskRows.status === 'fulfilled') {
            setTasks(taskRows.value);
        } else {
            toast.error(taskRows.reason?.response?.data?.error || 'Bakım takvimi yüklenemedi.');
            setTasks([]);
        }

        setEmployees(employeeRes.status === 'fulfilled' ? normalizeRows<PersonLite>(employeeRes.value) : []);
        setArticles(articleRows.status === 'fulfilled' ? articleRows.value : []);
        setLocations(locationRows.status === 'fulfilled' ? locationRows.value : []);
        setLoading(false);
    };

    useEffect(() => {
        void load();
    }, [range.start.valueOf(), range.end.valueOf()]);

    const applyRange = (nextRange: MaintenanceDateRange | null = pickerRange) => {
        if (!nextRange?.start || !nextRange?.end) return;
        const start = dayjs(nextRange.start.toString());
        const end = dayjs(nextRange.end.toString());
        const normalized = start.isAfter(end)
            ? toDateRange(end, start)
            : toDateRange(start, end);
        setAppliedRange(normalized);
        setPickerRange(normalized);
        setAnchorDate(normalized.start.toString());
    };

    const applyMonthRange = (month: dayjs.Dayjs) => {
        const next = toDateRange(month.startOf('month'), month.endOf('month'));
        setAppliedRange(next);
        setPickerRange(next);
        setAnchorDate(next.start.toString());
    };

    const openEdit = (task: MaintenanceTaskDto) => {
        setEditTask(task);
        setEditForm({
            plannedDate: dayjs(task.plannedDate).format('YYYY-MM-DD'),
            assignedTechId: task.assignedTechId || '',
            alternativeTechId: task.alternativeTechId || '',
            siteName: task.siteName || task.contract?.siteName || '',
            status: task.status,
        });
    };

    const saveTask = async () => {
        if (!editTask) return;
        setSaving(true);
        try {
            const alternativeTechId = editForm.alternativeTechId && editForm.alternativeTechId !== editForm.assignedTechId
                ? editForm.alternativeTechId
                : null;

            await maintenanceApi.updateTask(editTask.id, {
                plannedDate: editForm.plannedDate,
                assignedTechId: editForm.assignedTechId || null,
                alternativeTechId,
                siteName: editForm.siteName || null,
                status: editForm.status,
            });
            toast.success('Görev güncellendi.');
            setEditTask(null);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Görev güncellenemedi.');
        } finally {
            setSaving(false);
        }
    };

    const openReport = (task: MaintenanceTaskDto) => {
        setReportTask(task);
        setReportForm(emptyReport);
        setMaterials([]);
        setChecklist(checklist.map((item) => ({ ...item, checked: false })));
    };

    const submitReport = async () => {
        if (!reportTask) return;
        if (!reportForm.operationsDone.trim()) {
            toast.error('Yapılan işlemler zorunludur.');
            return;
        }
        const missingMaterial = materials.some((row) => !row.articleId || !row.sourceLocationId || row.quantity <= 0);
        if (missingMaterial) {
            toast.error('Malzeme satırlarında ürün, depo ve miktar zorunludur.');
            return;
        }

        setSaving(true);
        try {
            await maintenanceApi.submitReport({
                taskId: reportTask.id,
                operationsDone: reportForm.operationsDone,
                observations: reportForm.observations,
                recommendations: reportForm.recommendations,
                riskNotes: reportForm.riskNotes,
                checklistJson: checklist,
                beforePhotoUrls: splitLines(reportForm.beforePhotoUrls),
                afterPhotoUrls: splitLines(reportForm.afterPhotoUrls),
                fileUrls: splitLines(reportForm.fileUrls),
                extraMaterials: materials,
            });
            toast.success('Bakım raporu kaydedildi. İmza bekleniyor.');
            setReportTask(null);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Rapor kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    const grouped = useMemo(() => {
        const map = new Map<string, MaintenanceTaskDto[]>();
        tasks.forEach((task) => {
            const key = dayjs(task.plannedDate).format('YYYY-MM-DD');
            map.set(key, [...(map.get(key) || []), task]);
        });
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [tasks]);

    const taskMeta = (task: MaintenanceTaskDto) =>
        [task.contract?.title, task.siteName || task.contract?.siteName]
            .filter(Boolean)
            .join(' · ') || 'Saha bilgisi yok';

    return (
        <div>
            <PageHeader
                breadcrumb="Bakım"
                title="Teknisyen takvimi"
                description="Günlük, haftalık ve aylık bakım planını saha teknisyenlerine göre yönetin."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                            <button
                                type="button"
                                onClick={() => setScheduleView('list')}
                                title="Liste görünümü"
                                className={`flex h-8 w-8 items-center justify-center rounded-md ${scheduleView === 'list' ? 'bg-brand-solid text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                <FilterLines size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setScheduleView('calendar')}
                                title="Takvim görünümü"
                                className={`flex h-8 w-8 items-center justify-center rounded-md ${scheduleView === 'calendar' ? 'bg-brand-solid text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                <Calendar size={13} />
                            </button>
                        </div>
                        <DateRangePicker
                            value={pickerRange}
                            onChange={setPickerRange}
                            onApply={() => applyRange()}
                            onCancel={() => setPickerRange(appliedRange)}
                            size="md"
                        />
                    </div>
                }
            />

            <Card
                title={`${fmtDate(range.start.toISOString())} - ${fmtDate(range.end.toISOString())}`}
                description={`${tasks.length} görev · seçili plan aralığı`}
                icon={<FilterLines size={13} />}
                noPadding
            >
                {loading ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />)}</div>
                ) : grouped.length === 0 ? (
                    <EmptyState icon={<Calendar size={32} />} title="Bu aralıkta görev yok" description="Sözleşme oluşturunca periyodik bakım görevleri burada görünür." />
                ) : scheduleView === 'calendar' ? (
                    <MaintenanceCalendarView
                        anchorDate={anchorDate}
                        tasks={tasks}
                        onAnchorDateChange={setAnchorDate}
                        onMonthRangeChange={applyMonthRange}
                        onOpenEdit={openEdit}
                        onOpenReport={openReport}
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[980px]">
                            <div className="grid grid-cols-[150px_minmax(260px,1.4fr)_210px_140px_150px_140px] border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] font-semibold text-slate-500">
                                <div>Tarih</div>
                                <div>Müşteri ve iş</div>
                                <div>Teknisyen</div>
                                <div>Durum</div>
                                <div>Rapor</div>
                                <div className="text-right">İşlem</div>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {grouped.flatMap(([day, rows]) =>
                                    rows.map((task) => {
                                        const canCreateReport = !task.report && task.status !== 'CANCELLED';

                                        return (
                                            <div
                                                key={task.id}
                                                className="grid grid-cols-[150px_minmax(260px,1.4fr)_210px_140px_150px_140px] items-center px-4 py-3 text-[13px] transition-colors hover:bg-slate-50/70"
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-slate-900">{dayjs(day).format('DD.MM.YYYY')}</div>
                                                    <div className="mt-0.5 text-[11px] capitalize text-slate-500">{dayjs(day).format('dddd')}</div>
                                                </div>
                                                <div className="min-w-0 pr-4">
                                                    <div className="truncate font-semibold text-slate-900">{task.contract?.customer?.companyName || task.contract?.title || 'Müşteri bilgisi yok'}</div>
                                                    <div className="mt-0.5 truncate text-[12px] text-slate-500">{taskMeta(task)}</div>
                                                </div>
                                                <div className="min-w-0 pr-3 text-slate-600">
                                                    <div className="flex min-w-0 items-center gap-1.5">
                                                        <UserIcon size={12} className="shrink-0 text-slate-400" />
                                                        <span className="truncate">{personName(task.technician) === '-' ? 'Atanmamış' : personName(task.technician)}</span>
                                                    </div>
                                                    {task.alternativeTechnician && (
                                                        <div className="mt-0.5 truncate pl-5 text-[11px] text-slate-400">
                                                            Alternatif: {personName(task.alternativeTechnician)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div><StatusPill status={task.status} /></div>
                                                <div className="text-[12px] text-slate-600">
                                                    {task.report ? (task.report.isSigned ? 'İmzalı rapor' : 'İmza bekliyor') : 'Rapor oluşturulmadı'}
                                                </div>
                                                <div className="grid grid-cols-[32px_82px] items-center justify-end gap-1">
                                                    <div className="flex justify-center">
                                                        <Button variant="ghost" size="sm" icon={<Edit size={12} />} onClick={() => openEdit(task)} />
                                                    </div>
                                                    <div className="flex justify-end">
                                                        {canCreateReport ? (
                                                            <Button className="w-[82px]" variant="secondary" size="sm" icon={<FileText size={12} />} onClick={() => openReport(task)}>
                                                                Rapor
                                                            </Button>
                                                        ) : (
                                                            <span className="block h-8 w-[82px]" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            <Modal
                open={!!editTask}
                title="Görev ataması"
                description="Tarih veya teknisyen değişirse sistem otomatik çakışma kontrolü yapar."
                onClose={() => setEditTask(null)}
                width="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditTask(null)}>İptal</Button>
                        <Button loading={saving} icon={<Save size={13} />} onClick={saveTask}>Kaydet</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label="Plan tarihi"><Input type="date" value={editForm.plannedDate} onChange={(e) => setEditForm({ ...editForm, plannedDate: e.target.value })} /></Field>
                    <Field label="Durum">
                        <Select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as TaskStatus })}>
                            {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                        </Select>
                    </Field>
                    <Field label="Teknisyen">
                        <Select value={editForm.assignedTechId} onChange={(e) => setEditForm({ ...editForm, assignedTechId: e.target.value })}>
                            <option value="">Seçiniz</option>
                            {!employees.length && <option value="__no_technicians" disabled>Teknisyen rolünde personel yok</option>}
                            {employees.map((employee) => <option key={employee.id} value={employee.id}>{personName(employee)}</option>)}
                        </Select>
                    </Field>
                    <Field label="Alternatif teknisyen">
                        <Select value={editForm.alternativeTechId} onChange={(e) => setEditForm({ ...editForm, alternativeTechId: e.target.value })}>
                            <option value="">Seçiniz</option>
                            {!employees.length && <option value="__no_technicians" disabled>Teknisyen rolünde personel yok</option>}
                            {employees.map((employee) => <option key={employee.id} value={employee.id}>{personName(employee)}</option>)}
                        </Select>
                    </Field>
                    <Field label="Saha / lokasyon" className="md:col-span-2">
                        <Input value={editForm.siteName} onChange={(e) => setEditForm({ ...editForm, siteName: e.target.value })} />
                    </Field>
                </div>
            </Modal>

            <Modal
                open={!!reportTask}
                title="Bakım raporu"
                description={reportTask ? `${reportTask.contract?.customer?.companyName || ''} - ${fmtDate(reportTask.plannedDate)}` : undefined}
                onClose={() => setReportTask(null)}
                width="full"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setReportTask(null)}>İptal</Button>
                        <Button loading={saving} icon={<Save size={13} />} onClick={submitReport}>Raporu kaydet</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    <div className="space-y-3 xl:col-span-7">
                        <Field label="Yapılan işlemler" required>
                            <Textarea rows={4} value={reportForm.operationsDone} onChange={(e) => setReportForm({ ...reportForm, operationsDone: e.target.value })} />
                        </Field>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <Field label="Teknik gözlemler"><Textarea rows={3} value={reportForm.observations} onChange={(e) => setReportForm({ ...reportForm, observations: e.target.value })} /></Field>
                            <Field label="Öneriler"><Textarea rows={3} value={reportForm.recommendations} onChange={(e) => setReportForm({ ...reportForm, recommendations: e.target.value })} /></Field>
                            <Field label="Risk notları"><Textarea rows={3} value={reportForm.riskNotes} onChange={(e) => setReportForm({ ...reportForm, riskNotes: e.target.value })} /></Field>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <Field label="Servis öncesi URL" hint="Her satıra bir dosya/fotoğraf URL'si"><Textarea rows={2} value={reportForm.beforePhotoUrls} onChange={(e) => setReportForm({ ...reportForm, beforePhotoUrls: e.target.value })} /></Field>
                            <Field label="Servis sonrası URL"><Textarea rows={2} value={reportForm.afterPhotoUrls} onChange={(e) => setReportForm({ ...reportForm, afterPhotoUrls: e.target.value })} /></Field>
                            <Field label="Ek dosya URL"><Textarea rows={2} value={reportForm.fileUrls} onChange={(e) => setReportForm({ ...reportForm, fileUrls: e.target.value })} /></Field>
                        </div>
                    </div>
                    <div className="space-y-4 xl:col-span-5">
                        <div className="rounded-lg border border-slate-200/80">
                            <div className="border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">Standart kontrol listesi</div>
                            <div className="divide-y divide-slate-100">
                                {checklist.map((item, index) => (
                                    <label key={item.label} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px] text-slate-700">
                                        <span>{item.label}{item.required && <span className="ml-1 text-rose-600">*</span>}</span>
                                        <input
                                            type="checkbox"
                                            checked={item.checked}
                                            onChange={(e) => setChecklist(checklist.map((row, i) => i === index ? { ...row, checked: e.target.checked } : row))}
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                        <MaterialsEditor rows={materials} setRows={setMaterials} articles={articles} locations={locations} />
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const calendarDayKey = (value: dayjs.Dayjs | string) => dayjs(value).format('YYYY-MM-DD');

const calendarEventTone = (status: TaskStatus) => {
    if (status === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'IN_PROGRESS') return 'border-blue-200 bg-blue-50 text-blue-800';
    if (status === 'CANCELLED') return 'border-slate-200 bg-slate-50 text-slate-500';
    return 'border-amber-200 bg-amber-50 text-amber-800';
};

const calendarTaskTitle = (task: MaintenanceTaskDto) =>
    task.contract?.customer?.companyName || task.contract?.title || 'Müşteri bilgisi yok';

const calendarTaskSubtitle = (task: MaintenanceTaskDto) =>
    [task.contract?.title, task.siteName || task.contract?.siteName]
        .filter(Boolean)
        .join(' · ') || 'Saha bilgisi yok';

const MaintenanceCalendarView = ({
    anchorDate,
    tasks,
    onAnchorDateChange,
    onMonthRangeChange,
    onOpenEdit,
    onOpenReport,
}: {
    anchorDate: string;
    tasks: MaintenanceTaskDto[];
    onAnchorDateChange: (date: string) => void;
    onMonthRangeChange: (month: dayjs.Dayjs) => void;
    onOpenEdit: (task: MaintenanceTaskDto) => void;
    onOpenReport: (task: MaintenanceTaskDto) => void;
}) => {
    const selected = dayjs(anchorDate || dayjs().format('YYYY-MM-DD'));
    const monthStart = selected.startOf('month');
    const monthEnd = selected.endOf('month');
    const startOffset = (monthStart.day() + 6) % 7;
    const gridStart = monthStart.subtract(startOffset, 'day');
    const days = Array.from({ length: 42 }, (_, index) => gridStart.add(index, 'day'));
    const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

    const tasksByDay = useMemo(() => {
        const map = new Map<string, MaintenanceTaskDto[]>();
        tasks.forEach((task) => {
            const key = calendarDayKey(task.plannedDate);
            map.set(key, [...(map.get(key) || []), task]);
        });
        return map;
    }, [tasks]);

    const selectedTasks = tasksByDay.get(calendarDayKey(selected)) || [];
    const goMonth = (amount: number) => onMonthRangeChange(selected.add(amount, 'month').startOf('month'));

    return (
        <div className="grid grid-cols-1 gap-4 bg-slate-50/40 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-center">
                            <span className="text-[10px] font-semibold uppercase text-slate-500">{selected.format('MMM')}</span>
                            <span className="text-lg font-semibold text-brand-secondary">{selected.format('D')}</span>
                        </div>
                        <div>
                            <h3 className="text-[16px] font-semibold text-slate-900">{monthStart.format('MMMM YYYY')}</h3>
                            <p className="mt-0.5 text-[12px] text-slate-500">
                                {fmtDate(monthStart.toISOString())} - {fmtDate(monthEnd.toISOString())}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <button type="button" className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-slate-50" onClick={() => goMonth(-1)}>
                                <ArrowLeft size={13} />
                            </button>
                            <button type="button" className="h-8 border-x border-slate-200 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => onMonthRangeChange(dayjs().startOf('month'))}>
                                Bugün
                            </button>
                            <button type="button" className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-slate-50" onClick={() => goMonth(1)}>
                                <ArrowRight size={13} />
                            </button>
                        </div>
                        <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700">
                            Ay görünümü
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-center text-[11px] font-semibold text-slate-500">
                    {weekDays.map((day) => (
                        <div key={day} className="border-r border-slate-200 py-2 last:border-r-0">{day}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {days.map((day) => {
                        const key = calendarDayKey(day);
                        const rows = tasksByDay.get(key) || [];
                        const isCurrentMonth = day.month() === selected.month();
                        const isSelected = key === calendarDayKey(selected);
                        const isToday = key === dayjs().format('YYYY-MM-DD');

                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => onAnchorDateChange(key)}
                                className={`min-h-[128px] border-r border-b border-slate-200 p-2 text-left transition-colors last:border-r-0 hover:bg-slate-50 ${isSelected ? 'bg-brand-primary_alt/40' : 'bg-white'} ${!isCurrentMonth ? 'text-slate-300' : 'text-slate-700'}`}
                            >
                                <div className="mb-1 flex items-center justify-between">
                                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${isToday ? 'bg-brand-solid text-white' : isSelected ? 'bg-brand-primary text-brand-secondary' : ''}`}>
                                        {day.date()}
                                    </span>
                                    {rows.length > 0 && <span className="text-[10px] font-medium text-slate-400">{rows.length}</span>}
                                </div>
                                <div className="space-y-1">
                                    {rows.slice(0, 3).map((task) => (
                                        <div key={task.id} className={`rounded border px-1.5 py-1 text-[11px] leading-tight ${calendarEventTone(task.status)}`}>
                                            <div className="truncate font-semibold">{calendarTaskTitle(task)}</div>
                                            <div className="truncate opacity-80">{STATUS_LABEL[task.status]}</div>
                                        </div>
                                    ))}
                                    {rows.length > 3 && (
                                        <div className="px-1.5 text-[11px] font-medium text-slate-500">{rows.length - 3} görev daha</div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <aside className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
                <div className="border-b border-slate-200 px-4 py-3">
                    <h3 className="text-[15px] font-semibold text-slate-900">{selected.format('D MMMM YYYY')}</h3>
                    <p className="mt-0.5 text-[12px] capitalize text-slate-500">{selected.format('dddd')}</p>
                </div>
                <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
                    {selectedTasks.length === 0 ? (
                        <div className="px-4 py-6 text-[13px] text-slate-500">Bu gün için bakım görevi yok.</div>
                    ) : selectedTasks.map((task) => {
                        const canCreateReport = !task.report && task.status !== 'CANCELLED';
                        return (
                            <div key={task.id} className="px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-[13px] font-semibold text-slate-900">{calendarTaskTitle(task)}</div>
                                        <div className="mt-0.5 truncate text-[12px] text-slate-500">{calendarTaskSubtitle(task)}</div>
                                    </div>
                                    <StatusPill status={task.status} />
                                </div>
                                <div className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-600">
                                    <UserIcon size={12} className="text-slate-400" />
                                    {personName(task.technician) === '-' ? 'Atanmamış' : personName(task.technician)}
                                </div>
                                <div className="mt-3 grid grid-cols-[32px_1fr] items-center gap-2">
                                    <Button variant="ghost" size="sm" icon={<Edit size={12} />} onClick={() => onOpenEdit(task)} />
                                    {canCreateReport ? (
                                        <Button variant="secondary" size="sm" icon={<FileText size={12} />} onClick={() => onOpenReport(task)}>
                                            Rapor oluştur
                                        </Button>
                                    ) : (
                                        <span className="text-[12px] text-slate-400">{task.report ? 'Rapor mevcut' : 'Rapor kapalı'}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </aside>
        </div>
    );
};
