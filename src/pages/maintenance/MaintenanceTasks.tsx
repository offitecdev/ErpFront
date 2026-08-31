import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import DatePicker from 'antd/es/date-picker';
import AntSelect from 'antd/es/select';
import { AlertTriangle, Calendar, CheckCircle, FilterLines, Plus, Save01 as Save, Send01 as Send, Trash01 as Trash, User01 as UserIcon, XClose } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { SlidingTopTabs } from '../../components/ui-shared/SlidingTopTabs';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { MaintenanceReportDto, MaintenanceTaskDto, PersonLite } from '../../types/maintenance';
import { ensureMaintenanceLocale, fmtDate, personName, StatusPill } from './MaintenanceShared';
import { MaintenanceReportsPanel } from './MaintenanceReports';

import { t } from '@/i18n/translate';
import { useTranslation } from 'react-i18next';

type WorkspaceView = 'tasks' | 'reports';
type DetailTab = 'overview' | 'appointment' | 'mail' | 'signature' | 'approval';

const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick((tick) => tick + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};

const REPORTS_SEEN_KEY = 'maintenance:reportsSeenAt';
type MaintenanceDateRange = { start: dayjs.Dayjs; end: dayjs.Dayjs };
type AppointmentOptionInput = { date: string; time: string; durationMinutes: number };
type AssignmentFormState = {
    plannedDate: string;
    responsibleTechId: string;
    technicianIds: string[];
};
type MailFormState = {
    to: string;
    fromName: string;
    fromEmail: string;
    subject: string;
    message: string;
};
type TaskWarning = {
    id: string;
    taskId: string;
    tab: DetailTab;
    title: string;
    message: string;
    tone: 'danger' | 'warning';
};
type SideAlert = {
    id: number;
    title: string;
    message: string;
    detail?: string;
    tone: 'danger' | 'warning' | 'success';
};

const normalizeRows = <T,>(value: any): T[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];

const toDateRange = (start: dayjs.Dayjs, end: dayjs.Dayjs): MaintenanceDateRange => ({
    start,
    end,
});

const initialRange = () => {
    const start = dayjs().startOf('week').add(1, 'day');
    return toDateRange(start, start.add(6, 'day'));
};

const taskTechnicianIds = (task: MaintenanceTaskDto) => {
    const ids = new Set<string>();
    if (task.assignedTechId) ids.add(task.assignedTechId);
    if (task.alternativeTechId) ids.add(task.alternativeTechId);
    (task.assignments || []).forEach((assignment) => ids.add(assignment.technicianId));
    return [...ids];
};

const taskTechnicianNames = (task: MaintenanceTaskDto) => {
    const people = new Map<string, PersonLite>();
    if (task.technician) people.set(task.technician.id, task.technician);
    if (task.alternativeTechnician) people.set(task.alternativeTechnician.id, task.alternativeTechnician);
    (task.assignments || []).forEach((assignment) => {
        if (assignment.technician) people.set(assignment.technician.id, assignment.technician);
    });
    return [...people.values()].map(personName).join(', ') ||t('auto.atanmamis');
};

const approvedOptions = (tasks: MaintenanceTaskDto[]) =>
    tasks.flatMap((task) => (task.appointmentOptions || [])
        .filter((option) => option.status === 'APPROVED')
        .map((option) => ({ task, option })));

const isExpiredMaintenance = (task: MaintenanceTaskDto) =>
    task.status !== 'COMPLETED'
    && task.status !== 'CANCELLED'
    && dayjs(task.plannedDate).startOf('day').isBefore(dayjs().startOf('day'));

const optionToTimes = (option: AppointmentOptionInput) => {
    const start = dayjs(`${option.date}T${option.time}`);
    return {
        startTime: start.toISOString(),
        endTime: start.add(option.durationMinutes, 'minute').toISOString(),
    };
};

const optionInterval = (option: AppointmentOptionInput) => {
    const start = dayjs(`${option.date}T${option.time}`);
    return { start, end: start.add(option.durationMinutes, 'minute') };
};

const taskInterval = (task: MaintenanceTaskDto) => {
    if (!task.scheduledStartTime || !task.scheduledEndTime) return null;
    return { start: dayjs(task.scheduledStartTime), end: dayjs(task.scheduledEndTime) };
};

const intervalsOverlap = (a: { start: dayjs.Dayjs; end: dayjs.Dayjs }, b: { start: dayjs.Dayjs; end: dayjs.Dayjs }) =>
    a.start.isBefore(b.end) && a.end.isAfter(b.start);

const taskCustomerId = (task: MaintenanceTaskDto) => task.contract?.customerId || task.contract?.customer?.id || '';

const optionLabel = (interval: { start: dayjs.Dayjs; end: dayjs.Dayjs }) =>
    `${interval.start.format("DD.MM.YYYY HH:mm")} - ${interval.end.format('HH:mm')}`;

const buildTaskWarnings = (
    task: MaintenanceTaskDto | null,
    allTasks: MaintenanceTaskDto[],
    options: AppointmentOptionInput[] = [],
): TaskWarning[] => {
    if (!task) return [];
    const warnings: TaskWarning[] = [];
    const technicianIds = taskTechnicianIds(task);
    const customerId = taskCustomerId(task);

    options.forEach((option, index) => {
        const current = optionInterval(option);
        const duplicateOption = options.find((other, otherIndex) => otherIndex !== index && intervalsOverlap(current, optionInterval(other)));
        if (duplicateOption) {
            warnings.push({
                id: `option-overlap-${index}`,
                taskId: task.id,
                tab: 'appointment',
                title: t('auto.option_conflicts_with_another_option', { number: index + 1 }),
                message: t('auto.option_conflicts_with_plan', { range: optionLabel(current) }),
                tone: 'danger',
            });
        }

        allTasks.filter((row) => row.id !== task.id && row.status !== 'CANCELLED').forEach((row) => {
            const hasTechnicianConflict = taskTechnicianIds(row).some((id) => technicianIds.includes(id));
            const hasCustomerConflict = customerId && taskCustomerId(row) === customerId;
            const rowInterval = taskInterval(row);
            const approvedOptions = (row.appointmentOptions || []).filter((rowOption) => rowOption.status === 'PENDING' || rowOption.status === 'APPROVED');
            const hasOptionConflict = approvedOptions.some((rowOption) => intervalsOverlap(current, { start: dayjs(rowOption.startTime), end: dayjs(rowOption.endTime) }));
            const hasTaskConflict = rowInterval ? intervalsOverlap(current, rowInterval) : false;
            if ((hasTechnicianConflict || hasCustomerConflict) && (hasTaskConflict || hasOptionConflict)) {
                warnings.push({
                    id: `task-conflict-${index}-${row.id}`,
                    taskId: row.id,
                    tab: 'appointment',
                    title: hasTechnicianConflict ?t('auto.teknisyen_cakismasi') :t('auto.musteri_cakismasi'),
                    message: t('auto.appointment_conflict_message', {
                        range: optionLabel(current),
                        target: row.contract?.customer?.companyName || row.contract?.title ||t('auto.baska_plan'),
                    }),
                    tone: 'danger',
                });
            }
        });
    });

    return warnings;
};

const TechnicianRoster = ({
    employees,
    selectedIds,
    responsibleId,
    onChange,
    onResponsibleChange,
}: {
    employees: PersonLite[];
    selectedIds: string[];
    responsibleId: string;
    onChange: (ids: string[]) => void;
    onResponsibleChange: (id: string) => void;
}) => {
    const available = employees.filter((employee) => !selectedIds.includes(employee.id));

    const addTechnician = (id: string) => {
        if (!id) return;
        const nextIds = [...selectedIds, id];
        onChange(nextIds);
        if (!responsibleId) onResponsibleChange(id);
    };

    const removeTechnician = (id: string) => {
        const nextIds = selectedIds.filter((selectedId) => selectedId !== id);
        onChange(nextIds);
        if (responsibleId === id) onResponsibleChange(nextIds[0] || '');
    };

    return (
        <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <span className="text-[12px] font-semibold text-slate-700">{t('auto.teknisyen_ekibi')}</span>
                <div className="flex items-center gap-2">
                    <AntSelect
                        showSearch
                        value={undefined}
                        className="h-8 min-w-[190px] text-[12px]"
                        placeholder={t('auto.teknisyen_ara')}
                        options={available.map((employee) => ({ value: employee.id, label: personName(employee) }))}
                        onChange={(value) => addTechnician(String(value || ''))}
                        optionFilterProp="label"
                    />
                    <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500" title={t('auto.teknisyen_ekle')}>
                        <Plus size={13} />
                    </span>
                </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
                {employees.length === 0 ? (
                    <div className="px-3 py-3 text-[12px] text-slate-500">{t('auto.teknisyen_rolunde_personel_yok')}</div>
                ) : selectedIds.length === 0 ? (
                    <div className="px-3 py-3 text-[12px] text-slate-500">{t('auto.henuz_teknisyen_eklenmedi')}</div>
                ) : selectedIds.map((id) => {
                    const employee = employees.find((row) => row.id === id);
                    if (!employee) return null;
                    const isResponsible = responsibleId === id;
                    return (
                        <div key={id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0">
                            <div className="flex min-w-0 items-center gap-2">
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] ring-1 ${isResponsible ?t('auto.bg_amber_50_ring_amber_300') :t('auto.bg_sky_50_ring_sky_200')}`} aria-hidden="true">
                                        <UserIcon size={14} />
                                    </span>
                                <div className="min-w-0">
                                    <div className="truncate text-[12.5px] font-semibold text-slate-800">{personName(employee)}</div>
                                    <div className="truncate text-[11px] text-slate-400">{employee.email ||t('maintenance.dashboard.colTechnician')}</div>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => onResponsibleChange(id)}
                                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${isResponsible ?"border-emerald-200 bg-emerald-50 text-emerald-700" :t('auto.border_slate_200_bg_white_text_slate_500_hover_b')}`}
                                >
                                    {isResponsible ?t('auto.sorumlu') :t('auto.sorumlu_yap')}
                                </button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeTechnician(id)}>-</Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const MaintenanceTasks = () => {
    useLanguageRefresh();
    const { taskId } = useParams();
    if (taskId) return <MaintenanceTaskDetail taskId={taskId} />;
    return <MaintenanceWorkspace />;
};

const MaintenanceWorkspace = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const view: WorkspaceView = searchParams.get('view') === 'reports' ? 'reports' : 'tasks';

    const [reports, setReports] = useState<MaintenanceReportDto[]>([]);
    const [reportsLoaded, setReportsLoaded] = useState(false);
    const [seenAt, setSeenAt] = useState<number>(() => Number(localStorage.getItem(REPORTS_SEEN_KEY) || 0));

    const loadReports = useCallback(async () => {
        try {
            const rows = await maintenanceApi.listReports();
            setReports(rows);
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.bakim_raporlari_yuklenemedi'));
        } finally {
            setReportsLoaded(true);
        }
    }, []);

    useEffect(() => {
        void loadReports();
    }, [loadReports]);

    const newestReportAt = useMemo(
        () => reports.reduce((max, report) => Math.max(max, new Date(report.createdAt).getTime() || 0), 0),
        [reports],
    );
    const hasNewReports = reportsLoaded && newestReportAt > seenAt;

    const markReportsSeen = () => {
        if (newestReportAt > seenAt) {
            localStorage.setItem(REPORTS_SEEN_KEY, String(newestReportAt));
            setSeenAt(newestReportAt);
        }
    };

    // Clear the badge when the reports tab is open and new reports have loaded.
    useEffect(() => {
        if (view === 'reports' && reportsLoaded) markReportsSeen();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, reportsLoaded, newestReportAt]);

    const changeView = (next: WorkspaceView) => {
        const params = new URLSearchParams(searchParams);
        if (next === 'reports') params.set('view', 'reports');
        else params.delete('view');
        setSearchParams(params, { replace: true });
        if (next === 'reports') markReportsSeen();
    };

    const tabs: Array<{ key: WorkspaceView; label: string; showDot?: boolean }> = [
        { key: 'tasks', label:t('nav.maintenanceTasks') },
        { key: 'reports', label:t('nav.maintenanceReports'), showDot: hasNewReports },
    ];

    return (
        <div>
            <PageHeader
                breadcrumb={t('nav.maintenance')}
                title={view === 'reports' ?t('nav.maintenanceReports') :t('nav.maintenanceTasks')}
                description={view === 'reports'
                    ?t('auto.saha_raporlarini_kullanilan_malzemeleri_risk_not')
                    :t('auto.bakim_gorevleri_icin_sorumlu_teknisyenleri_atayi')}
            />

            <div className="ofi-quote-tabs-strip mb-4 min-w-0 overflow-x-auto border-b border-slate-200 px-1 pt-1 dark:border-white/15">
                <SlidingTopTabs activeKey={view} className="flex min-w-max items-stretch gap-1">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        data-tab-key={tab.key}
                        type="button"
                        aria-current={view === tab.key ? 'page' : undefined}
                        onClick={() => changeView(tab.key)}
                        className={`ofi-quote-tab relative -mb-px inline-flex items-center rounded-t-md border border-b-0 px-4 py-2.5 text-[12.5px] transition-colors ${view === tab.key
                            ? 'ofi-quote-tab-active border-slate-200 bg-[#eef2fb] font-bold text-[#1f2654]'
                            : 'border-transparent font-medium text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-[#1f2654] dark:text-white/70'
                        }`}
                    >
                        {tab.label}
                        {tab.showDot && (
                            <span
                                title={t('auto.yeni_rapor_var')}
                                className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center"
                            >
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                            </span>
                        )}
                    </button>
                ))}
                </SlidingTopTabs>
            </div>

            {view === 'reports'
                ? <MaintenanceReportsPanel reports={reports} loading={!reportsLoaded} onReload={loadReports} />
                : <MaintenanceTaskList />}
        </div>
    );
};

const MaintenanceTaskList = () => {
    ensureMaintenanceLocale();
    const navigate = useNavigate();
    const [appliedRange, setAppliedRange] = useState<MaintenanceDateRange>(() => initialRange());
    const [pickerRange, setPickerRange] = useState<MaintenanceDateRange | null>(() => initialRange());
    const [tasks, setTasks] = useState<MaintenanceTaskDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<MaintenanceTaskDto | null>(null);
    const [approvalNoticeClosed, setApprovalNoticeClosed] = useState(() => localStorage.getItem('approvalNoticeClosed') === 'true');
    const [page, setPage] = useState(1);
    const pageSize = 15;

    const range = useMemo(() => ({
        start: appliedRange.start.startOf('day'),
        end: appliedRange.end.endOf('day'),
    }), [appliedRange]);

    const load = async () => {
        setLoading(true);
        try {
            const rows = await maintenanceApi.listTasks(range.start.format('YYYY-MM-DD'), range.end.format('YYYY-MM-DD'));
            setTasks(rows);
            setSelectedTask((current) => current ? rows.find((task) => task.id === current.id) || current : current);
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.bakim_takvimi_yuklenemedi'));
            setTasks([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [range.start.valueOf(), range.end.valueOf()]);

    const applyRange = (nextRange: MaintenanceDateRange | null = pickerRange) => {
        if (!nextRange?.start || !nextRange?.end) return;
        const normalized = nextRange.start.isAfter(nextRange.end)
            ? toDateRange(nextRange.end, nextRange.start)
            : toDateRange(nextRange.start, nextRange.end);
        setAppliedRange(normalized);
        setPickerRange(normalized);
    };

    const openTaskWorkspace = (task: MaintenanceTaskDto, tab: DetailTab = 'appointment') => {
        if (isExpiredMaintenance(task)) {
            toast.error(t('auto.suresi_dolmus_bakim_uzerinde_islem_yapilamaz'));
            return;
        }
        navigate(`/maintenance/tasks/${task.id}?tab=${tab}`);
    };

    const sortedTasks = useMemo(() => {
        return [...tasks].sort((a, b) => dayjs(a.plannedDate).valueOf() - dayjs(b.plannedDate).valueOf());
    }, [tasks]);

    const paginatedTasks = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sortedTasks.slice(start, start + pageSize);
    }, [sortedTasks, page]);

    const grouped = useMemo(() => {
        const map = new Map<string, MaintenanceTaskDto[]>();
        paginatedTasks.forEach((task) => {
            const key = dayjs(task.plannedDate).format('YYYY-MM-DD');
            map.set(key, [...(map.get(key) || []), task]);
        });
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [paginatedTasks]);

    const approvals = approvedOptions(tasks);

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                <DatePicker.RangePicker
                    value={pickerRange ? [pickerRange.start, pickerRange.end] : null}
                    onChange={(dates) => {
                        if (!dates?.[0] || !dates[1]) {
                            setPickerRange(null);
                            return;
                        }

                        applyRange({ start: dates[0], end: dates[1] });
                    }}
                    format="DD.MM.YYYY"
                    allowClear={false}
                    size="middle"
                />
            </div>

            {approvals.length > 0 && !approvalNoticeClosed && (
                <div className={t('auto.mb_4_rounded_lg_px_4_py_3_text_white_shadow_sm_b')}>
                    <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white text-lg font-black text-orange-500">!</span>
                        <div className="min-w-0">
                            <div className="text-[13px] font-semibold">{t('auto.onay_noktasi')}</div>
                            <div className="text-[12px] text-white/90">
                                {approvals.length}{t('auto.musteri_randevu_yaniti_alindi')}</div>
                        </div>
                        <button
                            type="button"
                            className="ml-auto flex h-7 w-7 items-center justify-center rounded text-white hover:bg-white/15"
                            onClick={() => { setApprovalNoticeClosed(true); localStorage.setItem('approvalNoticeClosed', 'true'); }}
                            title={t('common.close')}
                        >
                            <XClose size={16} />
                        </button>
                    </div>
                </div>
            )}

            <Card title={`${fmtDate(range.start.toISOString())} - ${fmtDate(range.end.toISOString())}`} description={t('auto.selected_plan_range_count', { count: tasks.length })} icon={<FilterLines size={13} />} noPadding>
                {loading ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />)}</div>
                ) : grouped.length === 0 ? (
                    <EmptyState icon={<Calendar size={32} />} title={t('auto.bu_aralikta_gorev_yok')} description={t('auto.sozlesme_olusturunca_periyodik_bakim_gorevleri_b')} />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[980px]">
                            <div className="grid grid-cols-[150px_minmax(260px,1.4fr)_240px_160px_140px_150px] border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] font-semibold text-slate-500">
                                <div>{t('common.date')}</div>
                                <div>{t('auto.musteri_ve_is')}</div>
                                <div>{t('maintenance.dashboard.colTechnician')}</div>
                                <div>{t('common.status')}</div>
                                <div>{t('auto.saat')}</div>
                                <div className="text-right">{t('common.actions')}</div>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {grouped.flatMap(([day, rows]) => rows.map((task) => {
                                    const approved = task.appointmentOptions?.some((option) => option.status === 'APPROVED');
                                    const managerApproved = Boolean(task.managerApprovedAt);
                                    const expired = isExpiredMaintenance(task);
                                    const selected = selectedTask?.id === task.id;
                                    return (
                                        <div
                                            key={task.id}
                                            onClick={() => !expired && openTaskWorkspace(task, 'overview')}
                                            className={`grid grid-cols-[150px_minmax(260px,1.4fr)_240px_160px_140px_150px] items-center px-4 py-3 text-[13px] transition-colors ${expired ?t('auto.bg_slate_50_text_slate_400') : selected ?t('auto.cursor_pointer_bg_brand_primary_alt_40') :"cursor-pointer hover:bg-slate-50/70"}`}
                                        >
                                            <div>
                                                <div className={`font-semibold ${expired ? 'text-slate-500' : 'text-slate-900'}`}>{dayjs(day).format('DD.MM.YYYY')}</div>
                                                <div className="mt-0.5 text-[11px] capitalize text-slate-500">{dayjs(day).format('dddd')}</div>
                                            </div>
                                            <div className="min-w-0 pr-4">
                                                <div className="block max-w-full text-left">
                                                    <span className={`block truncate font-semibold ${expired ? 'text-slate-500' : 'text-slate-900'}`}>{task.contract?.customer?.companyName || task.contract?.title ||t('auto.musteri_bilgisi_yok')}</span>
                                                </div>
                                                <div className="mt-0.5 truncate text-[12px] text-slate-500">{task.contract?.contractCode} · {task.contract?.title}</div>
                                                {approved && (
                                                    <div className={`mt-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${managerApproved ?t('auto.bg_emerald_50_text_emerald_700') :t('auto.bg_red_50_text_red_700')}`}>
                                                        {managerApproved ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                                                        {managerApproved ?t('auto.onaylandi') :t('auto.secim_isleniyor')}
                                                    </div>
                                                )}
                                                {expired && <div className="mt-1 inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600"><AlertTriangle size={11} />{t('auto.suresi_dolmus_bakim')}</div>}
                                            </div>
                                            <div className="min-w-0 pr-3 text-slate-600">
                                                <div className="flex min-w-0 items-center gap-1.5">
                                                    <UserIcon size={12} className="shrink-0 text-slate-400" />
                                                    <span className="truncate">{taskTechnicianNames(task)}</span>
                                                </div>
                                            </div>
                                            <div>{expired ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{t('auto.suresi_dolmus')}</span> : <StatusPill status={task.status} />}</div>
                                            <div className="text-[12px] text-slate-600">
                                                {task.scheduledStartTime && task.scheduledEndTime
                                                    ? `${dayjs(task.scheduledStartTime).format('HH:mm')} - ${dayjs(task.scheduledEndTime).format('HH:mm')}`
                                                    :t('auto.saat_yok')}
                                            </div>
                                            <div className="flex justify-end gap-1">
                                                {!expired && <span className="text-[12px] font-semibold text-slate-500">{t('auto.ac')}</span>}
                                            </div>
                                        </div>
                                    );
                                }))}
                            </div>
                            <div className="flex items-center justify-between border-t border-slate-100 p-4">
                                <span className="text-[12px] text-slate-500">
                                    {sortedTasks.length}{t('auto.kayittan')}{(page - 1) * pageSize + 1} - {Math.min(page * pageSize, sortedTasks.length)}{t('auto.arasi_gosteriliyor')}</span>
                                <div className="flex items-center gap-1">
                                    <Button type="button" variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('auto.onceki')}</Button>
                                    <Button type="button" variant="secondary" size="sm" disabled={page * pageSize >= sortedTasks.length} onClick={() => setPage(p => p + 1)}>{t('auto.sonraki')}</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};

const getDetailTabs = (): Array<{ key: DetailTab; label: string }> => [
    { key: 'appointment', label:t('auto.randevu') },
    { key: 'mail', label:t('auto.mail') },
    { key: 'signature', label:t('auto.imzalar') },
    { key: 'approval', label:t('auto.manuel_onay') },
];

const MaintenanceTaskDetail = ({ taskId }: { taskId: string }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = (searchParams.get('tab') as DetailTab) || 'appointment';
    const [activeTab, setActiveTab] = useState<DetailTab>(getDetailTabs().some((tab) => tab.key === initialTab) ? initialTab : 'appointment');
    const [task, setTask] = useState<MaintenanceTaskDto | null>(null);
    const [allTasks, setAllTasks] = useState<MaintenanceTaskDto[]>([]);
    const [employees, setEmployees] = useState<PersonLite[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [editForm, setEditForm] = useState<AssignmentFormState>({
        plannedDate: '',
        responsibleTechId: '',
        technicianIds: [],
    });
    const [mailForm, setMailForm] = useState<MailFormState>({
        to: '',
        fromName:t('auto.offitec_erp'),
        fromEmail: '',
        subject: '',
        message:t('auto.lutfen_size_uygun_bakim_randevusunu_secin'),
    });
    const [options, setOptions] = useState<AppointmentOptionInput[]>([]);
    const [signatureLoading, setSignatureLoading] = useState<string | null>(null);

    const loadDetail = async () => {
        setLoading(true);
        try {
            const [taskRow, techRows] = await Promise.all([
                maintenanceApi.getTask(taskId),
                maintenanceApi.listTechnicians(),
            ]);
            setTask(taskRow);
            setEmployees(normalizeRows<PersonLite>(techRows));
            const technicianIds = taskTechnicianIds(taskRow);
            const responsibleTechId = taskRow.assignedTechId || technicianIds[0] || '';
            const activeOptions = (taskRow.appointmentOptions || []).filter((option) => option.status === 'PENDING' || option.status === 'APPROVED');
            setEditForm({
                plannedDate: dayjs(taskRow.plannedDate).format('YYYY-MM-DD'),
                responsibleTechId,
                technicianIds,
            });
            setMailForm({
                to: taskRow.contract?.customer?.mainEmail || '',
                fromName:t('auto.offitec_erp'),
                fromEmail: '',
                subject: `${taskRow.contract?.contractCode || ''} Bakım randevusu`,
                message:t('auto.lutfen_size_uygun_bakim_randevusunu_secin'),
            });
            setOptions(activeOptions.length
                ? activeOptions.map((option) => ({
                    date: dayjs(option.startTime).format('YYYY-MM-DD'),
                    time: dayjs(option.startTime).format('HH:mm'),
                    durationMinutes: Math.max(30, dayjs(option.endTime).diff(dayjs(option.startTime), 'minute')),
                }))
                : []);
            const start = dayjs(taskRow.plannedDate).subtract(7, 'day').format('YYYY-MM-DD');
            const end = dayjs(taskRow.plannedDate).add(14, 'day').format('YYYY-MM-DD');
            setAllTasks(await maintenanceApi.listTasks(start, end));
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.bakim_detayi_yuklenemedi'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadDetail();
    }, [taskId]);

    const filledOptions = useMemo(() => options.map((opt) => ({ ...opt, date: opt.date || editForm.plannedDate })), [options, editForm.plannedDate]);
    const warnings = useMemo(() => buildTaskWarnings(task, allTasks, filledOptions), [task, allTasks, filledOptions]);
    const hasBlockingWarnings = warnings.some((warning) => warning.tone === 'danger');

    const showSideAlert = (input: Omit<SideAlert, 'id'>) => {
        toast.error(input.message, { description: input.detail, className: 'custom-toast' });
    };

    const fillOptionDate = (opt: AppointmentOptionInput) => ({
        ...opt,
        date: editForm.plannedDate,
    });

    const changeTab = (tab: DetailTab) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    const saveTask = async () => {
        if (!task) return;
        if (isExpiredMaintenance(task)) return toast.error(t('auto.suresi_dolmus_bakim_uzerinde_islem_yapilamaz'));
        if (hasBlockingWarnings) {
            const warning = warnings.find((row) => row.tone === 'danger')!;
            showSideAlert({ title: warning.title, message: warning.message, detail: `İlgili bakım: ${task.contract?.contractCode || task.id}`, tone: 'danger' });
            return;
        }
        const technicianIds = [
            editForm.responsibleTechId,
            ...editForm.technicianIds.filter((id) => id !== editForm.responsibleTechId),
        ].filter(Boolean);
        const filledOpts = options.map(fillOptionDate);
        const validOptions = filledOpts.filter((opt) => opt.date && opt.time);
        if (validOptions.length === 0) {
            toast.error(t('auto.en_az_bir_randevu_opsiyonu_ekleyin'), { className: 'custom-toast' });
            return;
        }
        setSaving(true);
        try {
            await maintenanceApi.updateTask(task.id, {
                plannedDate: editForm.plannedDate,
                technicianIds,
                assignedTechId: editForm.responsibleTechId || null,
            });
            await maintenanceApi.saveAppointmentOptionsDraft(task.id, validOptions.map(optionToTimes));
            toast.success(t('auto.randevu_opsiyonlari_basariyla_kaydedildi'));
            await loadDetail();
        } catch (error: any) {
            const message = error.response?.data?.error ||t('auto.gorev_guncellenemedi');
            showSideAlert({ title:t('auto.kaydetme_hatasi'), message, detail: `İlgili bakım: ${task.contract?.contractCode || task.id}`, tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const sendProposal = async () => {
        if (!task) return;
        if (isExpiredMaintenance(task)) return toast.error(t('auto.suresi_dolmus_bakim_uzerinde_islem_yapilamaz'));
        if (!mailForm.to.trim()) return toast.error(t('auto.alici_e_posta_zorunludur'));
        if (hasBlockingWarnings) {
            const warning = warnings.find((row) => row.tone === 'danger')!;
            showSideAlert({ title: warning.title, message: warning.message, detail: `İlgili bakım: ${task.contract?.contractCode || task.id}`, tone: 'danger' });
            return;
        }
        setSaving(true);
        try {
            await maintenanceApi.sendAppointmentOptions(task.id, {
                ...mailForm,
                options: options.map(fillOptionDate).map(optionToTimes),
            });
            toast.success(t('auto.randevu_onerileri_gonderildi'));
            await loadDetail();
            changeTab('approval');
        } catch (error: any) {
            const message = error.response?.data?.error ||t('auto.randevu_onerileri_gonderilemedi');
            showSideAlert({ title:t('auto.sunucu_cakisma_uyarisi'), message, detail: `İlgili bakım: ${task.contract?.contractCode || task.id}`, tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const approveOption = async (optionId: string) => {
        if (!task) return;
        setSaving(true);
        try {
            const res = await maintenanceApi.approveAppointmentOption(task.id, optionId);
            setTask(res.task);
            toast.success(t('auto.yonetici_onayi_verildi'));
            await loadDetail();
            changeTab('approval');
        } catch (error: any) {
            const message = error.response?.data?.error ||t('auto.yonetici_onayi_verilemedi');
            showSideAlert({ title:t('auto.onay_cakismasi'), message, detail: `İlgili bakım: ${task.contract?.contractCode || task.id}`, tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const requestReportSignature = async (channel: 'technician' | 'mail' | 'both') => {
        if (!task?.report) return;
        setSignatureLoading(channel);
        try {
            await maintenanceApi.requestReportSignature(task.report.id, {
                channel,
                to: task.contract?.customer?.mainEmail || undefined,
                fromEmail: mailForm.fromEmail || undefined,
                fromName: mailForm.fromName || undefined,
                subject: `${task.contract?.contractCode || ''} Bakım raporu imzası`,
            });
            toast.success(channel === 'technician'
                ?t('auto.teknisyene_imza_bildirimi_gonderildi')
                : channel === 'mail'
                    ?t('auto.musteriye_imza_maili_gonderildi')
                    :t('auto.imza_istegi_gonderildi'));
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.imza_istegi_gonderilemedi'));
        } finally {
            setSignatureLoading(null);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Bakım / Randevu"
                title={task ? `${task.contract?.contractCode || ''} ${task.contract?.customer?.companyName || task.contract?.title ||t('nav.maintenance')}` :t('auto.bakim_randevusu')}
                description={t('auto.randevu_opsiyonlari_mail_musteri_secimi_ve_manue')}
            />

            {loading || !task ? (
                <Card><div className="h-64 animate-pulse rounded bg-slate-100" /></Card>
            ) : (
                <>
                    <TaskWorkspace
                        task={task}
                        allTasks={allTasks}
                        activeTab={activeTab}
                        employees={employees}
                        editForm={editForm}
                        mailForm={mailForm}
                        options={options}
                        saving={saving}
                        signatureLoading={signatureLoading}
                        onRequestReportSignature={requestReportSignature}
                        onTabChange={changeTab}
                        onEditFormChange={setEditForm}
                        onMailFormChange={setMailForm}
                        onOptionsChange={(next) => {
                            const filled = next.map(fillOptionDate);
                            const nextWarnings = buildTaskWarnings(task, allTasks, filled).filter((warning) => warning.tone === 'danger');
                            if (nextWarnings.length) {
                                showSideAlert({
                                    title: nextWarnings[0].title,
                                    message: nextWarnings[0].message,
                                    detail: `İlgili bakım: ${task.contract?.contractCode || task.id}`,
                                    tone: 'danger',
                                });
                                return;
                            }
                            setOptions(next);
                        }}
                        onSaveTask={saveTask}
                        onSendProposal={sendProposal}
                        onApproveOption={approveOption}
                    />
                </>
            )}
        </div>
    );
};

const TaskWorkspace = ({
    task,
    allTasks,
    activeTab,
    employees,
    editForm,
    mailForm,
    options,
    saving,
    signatureLoading,
    onRequestReportSignature,
    onTabChange,
    onEditFormChange,
    onMailFormChange,
    onOptionsChange,
    onSaveTask,
    onSendProposal,
    onApproveOption,
}: {
    task: MaintenanceTaskDto | null;
    allTasks: MaintenanceTaskDto[];
    activeTab: DetailTab;
    employees: PersonLite[];
    editForm: AssignmentFormState;
    mailForm: MailFormState;
    options: AppointmentOptionInput[];
    saving: boolean;
    signatureLoading: string | null;
    onRequestReportSignature: (channel: 'technician' | 'mail' | 'both') => void;
    onTabChange: (tab: DetailTab) => void;
    onEditFormChange: (form: AssignmentFormState) => void;
    onMailFormChange: (form: MailFormState) => void;
    onOptionsChange: (options: AppointmentOptionInput[]) => void;
    onSaveTask: () => void;
    onSendProposal: () => void;
    onApproveOption: (optionId: string) => void;
}) => {
    const disabled = !task || isExpiredMaintenance(task);
    const updateOption = (index: number, next: Partial<AppointmentOptionInput>) =>
        onOptionsChange(options.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row));
    const selectedIds = editForm.technicianIds;
    const activeOptions = (task?.appointmentOptions || []).filter((option) => option.status === 'PENDING' || option.status === 'APPROVED');
    const approvedOption = activeOptions.find((option) => option.status === 'APPROVED');

    return (
        <Card title={t('auto.bakim_randevu_detayi')} icon={<Calendar size={13} />}>
            {!task ? (
                <EmptyState icon={<Calendar size={28} />} title={t('auto.bakim_secin')} description={t('auto.listeden_bir_bakim_secildiginde_randevu_ve_mail_')} />
            ) : (
                <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="font-mono text-[11px] font-semibold text-slate-500">{task.contract?.contractCode}</div>
                                <div className="truncate text-[15px] font-semibold text-slate-950">{task.contract?.customer?.companyName || task.contract?.title ||t('nav.maintenance')}</div>
                                <div className="mt-1 truncate text-[12px] text-slate-500">{fmtDate(task.plannedDate)} · {task.contract?.title}</div>
                            </div>
                            {disabled ? (
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{t('auto.suresi_dolmus')}</span>
                            ) : <StatusPill status={task.status} />}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1 md:grid-cols-4">
                        {getDetailTabs().map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => onTabChange(tab.key)}
                                className={`rounded-md px-3 py-2 text-[12.5px] font-semibold transition-colors ${activeTab === tab.key ?t('auto.bg_white_text_slate_950_shadow_xs') :t('auto.text_slate_600_hover_text_slate_950')}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {disabled && (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">{t('auto.suresi_dolmus_bakim_uzerinde_islem_yapilamaz')}</div>
                    )}

                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
                                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.bakim_plani')}</div>
                                    <div className="mt-2 text-[16px] font-semibold text-slate-950">{task.contract?.contractCode || task.id}</div>
                                    <div className="mt-1 text-[12px] text-slate-500">{task.contract?.title || '-'}</div>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                                    <div className="text-[11px] font-semibold uppercase text-emerald-700">{t('auto.onay')}</div>
                                    <div className="mt-2 text-[16px] font-semibold text-emerald-900">{task.managerApprovedAt ?t('auto.onaylandi') : approvedOption ?t('auto.secim_alindi') :t('auto.secim_bekliyor')}</div>
                                    <div className="mt-1 text-[12px] text-emerald-700">{approvedOption ? optionLabel({ start: dayjs(approvedOption.startTime), end: dayjs(approvedOption.endTime) }) :t('auto.uygun_opsiyon_bekleniyor')}</div>
                                </div>
                                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                                    <div className="text-[11px] font-semibold uppercase text-sky-700">{t('maintenance.dashboard.colTechnician')}</div>
                                    <div className="mt-2 text-[16px] font-semibold text-sky-950">{taskTechnicianNames(task)}</div>
                                    <div className="mt-1 text-[12px] text-sky-700">{task.assignedTechId ?t('auto.sorumlu_atandi') :t('auto.sorumlu_secilmedi')}</div>
                                </div>
                            </div>
                            <aside className="rounded-lg border border-slate-200 bg-white p-4">
                                <div className="text-[11px] font-semibold uppercase text-slate-500">{t('nav.quickActionsGroup.customers')}</div>
                                <div className="mt-2 text-[14px] font-semibold text-slate-900">{task.contract?.customer?.companyName || '-'}</div>
                                <div className="mt-1 text-[12px] text-slate-500">{task.contract?.customer?.mainEmail ||t('auto.e_posta_yok')}</div>
                            </aside>
                        </div>
                    )}

                    {activeTab === 'appointment' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Field label={t('auto.plan_tarihi')}>
                                    <Input type="date" value={editForm.plannedDate} disabled={disabled} onChange={(event) => onEditFormChange({ ...editForm, plannedDate: event.target.value })} />
                                </Field>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-sm font-medium text-secondary">{t('common.status')}</span>
                                    <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
                                        <StatusPill status={task.status} />
                                    </div>
                                </div>
                            </div>

                            <TechnicianRoster
                                employees={employees}
                                selectedIds={selectedIds}
                                responsibleId={editForm.responsibleTechId}
                                onChange={(ids) => onEditFormChange({
                                    ...editForm,
                                    technicianIds: ids,
                                    responsibleTechId: ids.includes(editForm.responsibleTechId) ? editForm.responsibleTechId : ids[0] || '',
                                })}
                                onResponsibleChange={(id) => onEditFormChange({
                                    ...editForm,
                                    responsibleTechId: id,
                                    technicianIds: editForm.technicianIds.includes(id) ? editForm.technicianIds : [id, ...editForm.technicianIds].filter(Boolean),
                                })}
                            />

                            <div className="rounded-lg border border-slate-200">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                                    <span className="text-[12px] font-semibold text-slate-700">{t('auto.randevu_opsiyonlari')}</span>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            icon={<Plus size={12} />}
                                            disabled={disabled}
                                            onClick={() => {
                                                onOptionsChange([...options, { date: editForm.plannedDate, time: '', durationMinutes: 60 }]);
                                            }}
                                        >{t('auto.opsiyon_ekle')}</Button>
                                    </div>
                                </div>
                                <div className="space-y-2 p-3">
                                    {options.map((option, index) => (
                                        <div key={index} className="grid grid-cols-1 gap-2 rounded-md border border-slate-100 bg-slate-50/60 p-2 sm:grid-cols-[130px_110px_1fr_40px] sm:items-center">
                                            <Input type="time" value={option.time} disabled={disabled} onChange={(event) => updateOption(index, { time: event.target.value })} />
                                            <Select value={String(option.durationMinutes)} disabled={disabled} onChange={(event) => updateOption(index, { durationMinutes: Number(event.target.value) })}>
                                                <option value="30">{t('auto.30_dk')}</option>
                                                <option value="60">{t('auto.60_dk')}</option>
                                                <option value="90">{t('auto.90_dk')}</option>
                                                <option value="120">{t('auto.120_dk')}</option>
                                            </Select>
                                            <div className="text-right text-[12.5px] font-semibold text-slate-500 sm:pr-2">
                                                {option.time ? `${option.time} - ${dayjs(`2020-01-01T${option.time}`).add(option.durationMinutes, 'minute').format('HH:mm')}` : ''}
                                            </div>
                                            <Button type="button" variant="ghost" size="sm" icon={<Trash size={12} />} disabled={disabled} onClick={() => onOptionsChange(options.filter((_, rowIndex) => rowIndex !== index))} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button className="w-fit" loading={saving} icon={<Save size={13} />} disabled={disabled} onClick={onSaveTask}>{t('auto.opsiyonlari_kaydet')}</Button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'mail' && (
                        <div className="space-y-3">
                            <Field label={t('auto.alici')}><Input value={mailForm.to} disabled={disabled} onChange={(event) => onMailFormChange({ ...mailForm, to: event.target.value })} /></Field>
                            <Field label={t('auto.konu')}><Input value={mailForm.subject} disabled={disabled} onChange={(event) => onMailFormChange({ ...mailForm, subject: event.target.value })} /></Field>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Field label={t('settings.mail.senderName')}><Input value={mailForm.fromName} disabled={disabled} onChange={(event) => onMailFormChange({ ...mailForm, fromName: event.target.value })} /></Field>
                                <Field label={t('settings.mail.senderEmail')}><Input value={mailForm.fromEmail} disabled={disabled} onChange={(event) => onMailFormChange({ ...mailForm, fromEmail: event.target.value })} /></Field>
                            </div>
                            <Field label={t('auto.mesaj')}><Textarea rows={4} value={mailForm.message} disabled={disabled} onChange={(event) => onMailFormChange({ ...mailForm, message: event.target.value })} /></Field>
                            <div className="flex justify-end">
                                <Button className="w-fit" loading={saving} icon={<Send size={13} />} disabled={disabled} onClick={onSendProposal}>{t('auto.mail_gonder')}</Button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'signature' && (
                        <div className="space-y-3">
                            {!task.report ? (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] font-medium text-amber-800">{t('auto.imza_istegi_icin_once_rapor_gerekir')}</div>
                            ) : (
                                <div className="rounded-lg border border-slate-200">
                                    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                                        <div className="min-w-0">
                                            <div className="text-[12.5px] font-semibold text-slate-900">{fmtDate(task.report.createdAt,"DD.MM.YYYY HH:mm")} · {t('auto.bakim_raporu')}</div>
                                            <div className="mt-0.5 text-[11px] text-slate-500">
                                                {task.report.isSigned
                                                    ? `${t('auto.imzali')} · ${fmtDate(task.report.signedAt,"DD.MM.YYYY HH:mm")}`
                                                    :t('auto.imza_bekliyor')}
                                            </div>
                                        </div>
                                        {task.report.isSigned ? (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                                <CheckCircle size={11} />{t('auto.imzali')}
                                            </span>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                <Button type="button" size="sm" variant="secondary" loading={signatureLoading === 'technician'} disabled={disabled} onClick={() => onRequestReportSignature('technician')}>{t('auto.teknisyene_gonder')}</Button>
                                                <Button type="button" size="sm" variant="secondary" loading={signatureLoading === 'mail'} disabled={disabled} icon={<Send size={12} />} onClick={() => onRequestReportSignature('mail')}>{t('auto.musteriye_mail_gonder')}</Button>
                                                <Button type="button" size="sm" loading={signatureLoading === 'both'} disabled={disabled} onClick={() => onRequestReportSignature('both')}>{t('auto.ikisine_gonder')}</Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'approval' && (
                        <div className="space-y-3">
                            {task.managerApprovedAt ? (
                                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">
                                    <CheckCircle size={14} />{t('auto.randevu_onaylandi')}{fmtDate(task.managerApprovedAt,"DD.MM.YYYY HH:mm")}
                                </div>
                            ) : approvedOption ? (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">{t('auto.secim_alinmis_gorunuyor_otomatik_onay_bilgisi_ta')}</div>
                            ) : (
                                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">{t('auto.musteri_henuz_secim_yapmadi_gerekirse_musteri_ye')}</div>
                            )}

                            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                                {activeOptions.length === 0 ? (
                                    <div className="px-3 py-4 text-[12px] text-slate-500">{t('auto.onaylanabilecek_randevu_opsiyonu_yok')}</div>
                                ) : activeOptions.map((option, index) => {
                                    const interval = { start: dayjs(option.startTime), end: dayjs(option.endTime) };
                                    const optionWarnings = task ? buildTaskWarnings(task, allTasks, [{
                                        date: interval.start.format('YYYY-MM-DD'),
                                        time: interval.start.format('HH:mm'),
                                        durationMinutes: interval.end.diff(interval.start, 'minute'),
                                    }]).filter((warning) => warning.tone === 'danger') : [];
                                    const canApprove = !disabled && !optionWarnings.length && !task.managerApprovedAt;
                                    return (
                                        <div key={option.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                                            <div className="min-w-0">
                                                <div className="text-[12px] font-semibold text-slate-900">{t('auto.option_number_with_range', { number: index + 1, range: optionLabel(interval) })}</div>
                                                <div className="mt-0.5 text-[11px] text-slate-500">{option.status === 'APPROVED' ?t('auto.secilmis_opsiyon') :t('auto.musteri_icin_secilebilir')}</div>
                                                {optionWarnings[0] && <div className="mt-1 text-[11px] font-semibold text-red-600">{optionWarnings[0].message}</div>}
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={option.status === 'APPROVED' ? 'primary' : 'secondary'}
                                                icon={<CheckCircle size={12} />}
                                                disabled={!canApprove}
                                                loading={saving}
                                                onClick={() => onApproveOption(option.id)}
                                            >{t('auto.musteri_adina_onayla')}</Button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                </div>
            )}
        </Card>
    );
};
