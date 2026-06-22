import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { AlertTriangle, Calendar, File02 as ClipboardList, Plus, Save01 as Save, SearchLg as Search, Trash01 as Trash, X as XIcon } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { CustomerLite, MaintenanceContractDto, MaintenancePeriod, PersonLite } from '../../types/maintenance';
import { fmtDate, getPeriodLabel, personName, StatCard } from './MaintenanceShared';

import { t } from '@/i18n/translate';
import { useTranslation } from 'react-i18next';

const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick((tick) => tick + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};

const emptyForm = {
    customerId: '',
    title: '',
    period: 'QUARTERLY' as MaintenancePeriod,
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().add(1, 'year').format('YYYY-MM-DD'),
    siteName: '',
    equipmentInfo: '',
    serviceScope: '',
    technicianIds: [] as string[],
    reminderDaysBefore: 7,
    overtimeHourlyRate: 0,
    inApp: true,
    email: true,
    sms: false,
    push: false,
};

type ContractFormState = typeof emptyForm;

const normalizeRows = <T,>(value: any): T[] => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.customers)) return value.customers;
    return [];
};

const contractTechnicianIds = (contract: MaintenanceContractDto) => {
    const ids = new Set<string>();
    (contract.tasks || []).forEach((task) => {
        if (task.assignedTechId) ids.add(task.assignedTechId);
        if (task.alternativeTechId) ids.add(task.alternativeTechId);
        (task.assignments || []).forEach((assignment) => ids.add(assignment.technicianId));
    });
    return [...ids];
};

const technicianNames = (contract: MaintenanceContractDto) => {
    const people = new Map<string, PersonLite>();
    (contract.tasks || []).forEach((task) => {
        if (task.technician) people.set(task.technician.id, task.technician);
        if (task.alternativeTechnician) people.set(task.alternativeTechnician.id, task.alternativeTechnician);
        (task.assignments || []).forEach((assignment) => {
            if (assignment.technician) people.set(assignment.technician.id, assignment.technician);
        });
    });
    return [...people.values()].map(personName).join(', ') ||t('auto.atanmamis');
};

const toForm = (contract: MaintenanceContractDto): ContractFormState => ({
    customerId: contract.customerId,
    title: contract.title,
    period: contract.period,
    startDate: dayjs(contract.startDate).format('YYYY-MM-DD'),
    endDate: dayjs(contract.endDate).format('YYYY-MM-DD'),
    siteName: contract.siteName || '',
    equipmentInfo: contract.equipmentInfo || '',
    serviceScope: contract.serviceScope || '',
    technicianIds: contractTechnicianIds(contract),
    reminderDaysBefore: contract.reminderDaysBefore || 7,
    overtimeHourlyRate: Number(contract.overtimeHourlyRate || 0),
    inApp: Boolean((contract.notificationChannels as any)?.inApp ?? true),
    email: Boolean((contract.notificationChannels as any)?.email ?? true),
    sms: Boolean((contract.notificationChannels as any)?.sms ?? false),
    push: Boolean((contract.notificationChannels as any)?.push ?? false),
});

const TechnicianChecklist = ({
    employees,
    selectedIds,
    onChange,
}: {
    employees: PersonLite[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
}) => (
    <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {employees.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-slate-500">{t('auto.teknisyen_rolunde_personel_yok')}</div>
        ) : employees.map((employee) => {
            const checked = selectedIds.includes(employee.id);
            return (
                <label key={employee.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-[12.5px] last:border-b-0 hover:bg-slate-50">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                            onChange(event.target.checked
                                ? [...selectedIds, employee.id]
                                : selectedIds.filter((id) => id !== employee.id));
                        }}
                    />
                    <span className="min-w-0 flex-1 truncate">{personName(employee)}</span>
                </label>
            );
        })}
    </div>
);

const ContractFormFields = ({
    form,
    setForm,
    customers,
    employees,
    includeCustomer = false,
}: {
    form: ContractFormState;
    setForm: (form: ContractFormState) => void;
    customers: CustomerLite[];
    employees: PersonLite[];
    includeCustomer?: boolean;
}) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        {includeCustomer && (
            <Field label={t('nav.quickActionsGroup.customers')} required className="md:col-span-4">
                <Select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                    <option value="">{t('common.select')}</option>
                    {!customers.length && <option value="__no_customers" disabled>{t('crm.customers.noCustomers')}</option>}
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
                </Select>
            </Field>
        )}
        <Field label={t('auto.sozlesme_basligi')} required className={includeCustomer ? 'md:col-span-5' : 'md:col-span-6'}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('auto.orn_hvac_periyodik_bakim')} />
        </Field>
        <Field label={t('auto.periyot')} className="md:col-span-3">
            <Select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as MaintenancePeriod })}>
                {Object.entries(getPeriodLabel()).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
        </Field>
        <Field label={t('common.start')} required className="md:col-span-3">
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label={t('common.end')} required className="md:col-span-3">
            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </Field>
        <Field label={t('auto.saha_lokasyon')} className="md:col-span-3">
            <Input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
        </Field>
        <Field label={t('auto.hatirlatma_gunu')} className="md:col-span-3">
            <Input type="number" min="0" value={form.reminderDaysBefore} onChange={(e) => setForm({ ...form, reminderDaysBefore: Number(e.target.value) })} />
        </Field>
        <Field label={t('auto.15_ek_iscilik_saat_ucreti')} className="md:col-span-3">
            <Input type="number" min="0" step="0.01" value={form.overtimeHourlyRate} onChange={(e) => setForm({ ...form, overtimeHourlyRate: Number(e.target.value) })} />
        </Field>
        <div className="flex flex-col gap-1.5 md:col-span-6">
            <span className="text-sm font-medium text-secondary">{t('auto.teknisyenler')}</span>
            <TechnicianChecklist employees={employees} selectedIds={form.technicianIds} onChange={(ids) => setForm({ ...form, technicianIds: ids })} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:col-span-6 md:grid-cols-4">
            {[
                ['inApp',t('auto.sistem_ici')],
                ['email',t('common.email')],
                ['sms', 'SMS'],
                ['push',t('auto.push')],
            ].map(([key, label]) => (
                <label key={key} className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-700">
                    <input
                        type="checkbox"
                        checked={Boolean((form as any)[key])}
                        onChange={(e) => setForm({ ...form, [key]: e.target.checked } as ContractFormState)}
                    />
                    {label}
                </label>
            ))}
        </div>
        <Field label={t('auto.hizmet_kapsami')} className="md:col-span-6">
            <Textarea rows={3} value={form.serviceScope} onChange={(e) => setForm({ ...form, serviceScope: e.target.value })} placeholder={t('auto.bakim_turu_sla_kontrol_kapsami')} />
        </Field>
        <Field label={t('auto.ekipman_listesi')} className="md:col-span-6">
            <Textarea rows={3} value={form.equipmentInfo} onChange={(e) => setForm({ ...form, equipmentInfo: e.target.value })} placeholder={t('auto.cihaz_seri_no_lokasyon')} />
        </Field>
    </div>
);

export const MaintenanceContracts = () => {
    useLanguageRefresh();
    const navigate = useNavigate();
    const [contracts, setContracts] = useState<MaintenanceContractDto[]>([]);
    const [employees, setEmployees] = useState<PersonLite[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<MaintenanceContractDto | null>(null);
    const [editForm, setEditForm] = useState(emptyForm);

    const load = async () => {
        setLoading(true);
        const [contractRows, employeeRes] = await Promise.allSettled([
            maintenanceApi.listContracts(),
            maintenanceApi.listTechnicians(),
        ]);
        if (contractRows.status === 'fulfilled') setContracts(contractRows.value);
        else {
            toast.error(contractRows.reason?.response?.data?.error ||t('auto.bakim_sozlesmeleri_yuklenemedi'));
            setContracts([]);
        }
        setEmployees(employeeRes.status === 'fulfilled' ? normalizeRows<PersonLite>(employeeRes.value) : []);
        setLoading(false);
    };

    useEffect(() => {
        void load();
    }, []);

    const stats = useMemo(() => {
        const active = contracts.filter((contract) => contract.isActive && dayjs(contract.endDate).isAfter(dayjs())).length;
        const expired = contracts.filter((contract) => dayjs(contract.endDate).isBefore(dayjs())).length;
        const taskCount = contracts.reduce((sum, contract) => sum + (contract.tasks?.length || 0), 0);
        const signed = contracts.reduce((sum, contract) => sum + (contract.tasks || []).filter((task) => task.report?.isSigned).length, 0);
        return { active, expired, taskCount, signed };
    }, [contracts]);

    const filtered = contracts.filter((contract) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return [
            contract.contractCode,
            contract.title,
            contract.customer?.companyName,
            contract.siteName,
            contract.equipmentInfo,
        ].some((value) => value?.toLowerCase().includes(q));
    });

    const openSheet = (contract: MaintenanceContractDto) => {
        setSelected(contract);
        setEditForm(toForm(contract));
    };

    const saveEdit = async () => {
        if (!selected) return;
        if (!editForm.title || !editForm.startDate || !editForm.endDate) {
            toast.error(t('auto.baslik_ve_tarih_araligi_zorunludur'));
            return;
        }
        setSaving(true);
        try {
            await maintenanceApi.updateContract(selected.id, {
                title: editForm.title,
                period: editForm.period,
                startDate: editForm.startDate,
                endDate: editForm.endDate,
                siteName: editForm.siteName || null,
                equipmentInfo: editForm.equipmentInfo || null,
                serviceScope: editForm.serviceScope || null,
                technicianIds: editForm.technicianIds,
                reminderDaysBefore: Number(editForm.reminderDaysBefore || 7),
                overtimeHourlyRate: Number(editForm.overtimeHourlyRate || 0),
                notificationChannels: {
                    inApp: editForm.inApp,
                    email: editForm.email,
                    sms: editForm.sms,
                    push: editForm.push,
                },
            });
            toast.success(t('auto.sozlesme_guncellendi'));
            setSelected(null);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.sozlesme_guncellenemedi'));
        } finally {
            setSaving(false);
        }
    };

    const archive = async () => {
        if (!selected || !confirm(t('auto.sozlesme_arsivlensin_mi_gorev_ve_rapor_gecmisi_k'))) return;
        setSaving(true);
        try {
            await maintenanceApi.archiveContract(selected.id);
            toast.success(t('auto.sozlesme_arsivlendi'));
            setSelected(null);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.sozlesme_arsivlenemedi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('nav.maintenance')}
                title={t('auto.bakim_sozlesmeleri')}
                description={t('auto.musteri_bazli_periyodik_bakim_sozlesmelerini_ve_')}
                actions={
                    <>
                        <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('auto.sozlesme_ara')} className="ofi-light-search-input w-[220px] pl-8 text-slate-950 placeholder:text-slate-400 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-400" />
                        </div>
                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/maintenance/contracts/new')}>{t('auto.yeni_sozlesme_olustur')}</Button>
                    </>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label={t('maintenance.dashboard.activeContracts')} value={stats.active} icon={<ClipboardList size={14} />} tone="success" sub={t('maintenance.dashboard.validContractsSub')} />
                <StatCard label={t('auto.planlanmis_gorev')} value={stats.taskCount} icon={<Calendar size={14} />} sub={t('auto.automatically_generated')} />
                <StatCard label={t('auto.imzali_rapor')} value={stats.signed} icon={<Save size={14} />} tone="neutral" sub={t('auto.locked_reports')} />
                <StatCard label={t('auto.suresi_dolan_sozlesme')} value={stats.expired} icon={<AlertTriangle size={14} />} tone={stats.expired ? 'danger' : 'neutral'} sub={t('auto.end_date_passed')} />
            </div>

            <Card title={t('auto.contracts_count', { count: filtered.length })} icon={<ClipboardList size={13} />} noPadding>
                {loading ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />)}</div>
                ) : filtered.length === 0 ? (
                    <EmptyState icon={<ClipboardList size={32} />} title={t('maintenance.dashboard.noContracts')} description={t('auto.yeni_sozlesme_olusturarak_otomatik_bakim_planini')} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">{t('auto.kod_sozlesme')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('nav.quickActionsGroup.customers')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('auto.bakim_periyodu')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('auto.gecerlilik_tarihi')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('maintenance.dashboard.colTechnician')}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t('auto.gorev_sayisi')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('auto.sonraki_gorev')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((contract) => {
                                    const nextTask = (contract.tasks || [])
                                        .filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
                                        .sort((a, b) => dayjs(a.plannedDate).valueOf() - dayjs(b.plannedDate).valueOf())[0];
                                    const isExpired = dayjs(contract.endDate).isBefore(dayjs(), 'day');
                                    return (
                                        <tr
                                            key={contract.id}
                                            className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${isExpired ?t('auto.bg_slate_50_50_text_slate_400_opacity_65') : ''}`}
                                            onClick={() => openSheet(contract)}
                                        >
                                            <td className="px-3 py-2">
                                                <div className="font-mono text-[11.5px] font-semibold text-slate-600">{contract.contractCode || '-'}</div>
                                                <div className={`font-semibold ${isExpired ? 'text-slate-500' : 'text-slate-900'}`}>{contract.title}</div>
                                                <div className="text-[11px] text-slate-500">{contract.siteName || '-'}</div>
                                            </td>
                                            <td className="px-3 py-2 text-slate-700">{contract.customer?.companyName || contract.customerId}</td>
                                            <td className="px-3 py-2 text-slate-600">{getPeriodLabel()[contract.period]}</td>
                                            <td className="px-3 py-2">
                                                <div className="font-mono text-[11.5px]">{fmtDate(contract.startDate)} - {fmtDate(contract.endDate)}</div>
                                                {isExpired && <div className="mt-0.5 text-[11px] font-medium text-slate-500">{t('auto.suresi_doldu')}</div>}
                                            </td>
                                            <td className="max-w-[220px] truncate px-3 py-2 text-slate-600">{technicianNames(contract)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{contract.tasks?.length || 0}</td>
                                            <td className="px-3 py-2 text-slate-600">{nextTask ? fmtDate(nextTask.plannedDate) : '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {selected && (
                <div className="fixed inset-0 z-50 flex items-end bg-slate-950/25" onMouseDown={() => setSelected(null)}>
                    <div
                        className="max-h-[88vh] w-full overflow-y-auto rounded-t-[10px] bg-white shadow-2xl"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                            <div>
                                <div className="font-mono text-[11px] font-semibold text-slate-500">{selected.contractCode || '-'}</div>
                                <h2 className="text-[18px] font-semibold text-slate-950">{selected.title}</h2>
                            </div>
                            <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => setSelected(null)}>
                                <XIcon size={16} />
                            </button>
                        </div>
                        <div className="mx-auto max-w-6xl px-5 py-5">
                            <ContractFormFields form={editForm} setForm={setEditForm} customers={[]} employees={employees} />
                            <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
                                <Button variant="secondary" icon={<Trash size={13} />} loading={saving} onClick={archive}>{t('auto.sozlesmeyi_arsivle')}</Button>
                                <div className="flex gap-2">
                                    <Button variant="secondary" onClick={() => setSelected(null)}>{t('common.cancel')}</Button>
                                    <Button variant="primary" loading={saving} icon={<Save size={13} />} onClick={saveEdit}>{t('common.save')}</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const MaintenanceContractCreate = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState<CustomerLite[]>([]);
    const [employees, setEmployees] = useState<PersonLite[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const [customerRes, employeeRes] = await Promise.allSettled([
                maintenanceApi.listOptionCustomers(),
                maintenanceApi.listTechnicians(),
            ]);
            setCustomers(customerRes.status === 'fulfilled' ? normalizeRows<CustomerLite>(customerRes.value) : []);
            setEmployees(employeeRes.status === 'fulfilled' ? normalizeRows<PersonLite>(employeeRes.value) : []);
            setLoading(false);
        };
        void load();
    }, []);

    const submit = async () => {
        if (!form.customerId || !form.title || !form.startDate || !form.endDate) {
            toast.error(t('auto.musteri_baslik_ve_tarih_araligi_zorunludur'));
            return;
        }
        setSaving(true);
        try {
            await maintenanceApi.createContract({
                customerId: form.customerId,
                title: form.title,
                period: form.period,
                startDate: form.startDate,
                endDate: form.endDate,
                siteName: form.siteName,
                equipmentInfo: form.equipmentInfo,
                serviceScope: form.serviceScope,
                technicianIds: form.technicianIds,
                reminderDaysBefore: Number(form.reminderDaysBefore || 7),
                overtimeHourlyRate: Number(form.overtimeHourlyRate || 0),
                notificationChannels: {
                    inApp: form.inApp,
                    email: form.email,
                    sms: form.sms,
                    push: form.push,
                },
            });
            toast.success(t('auto.bakim_sozlesmesi_ve_periyodik_gorevler_olusturul'));
            navigate('/maintenance/contracts');
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.sozlesme_olusturulamadi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('nav.maintenance')}
                title={t('auto.yeni_bakim_sozlesmesi')}
                description={t('auto.musteri_periyot_teknisyenler_ve_bildirim_ayarlar')}
            />
            <Card title={t('auto.sozlesme_bilgileri')} icon={<Plus size={13} />}>
                {loading ? (
                    <div className="h-72 animate-pulse rounded bg-slate-100" />
                ) : (
                    <ContractFormFields form={form} setForm={setForm} customers={customers} employees={employees} includeCustomer />
                )}
                <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <Button variant="secondary" onClick={() => navigate('/maintenance/contracts')}>{t('auto.vazgec')}</Button>
                    <Button variant="primary" loading={saving} icon={<Save size={13} />} onClick={submit}>{t('auto.kaydet_ve_geri_don')}</Button>
                </div>
            </Card>
        </div>
    );
};
