import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Calendar, File02 as ClipboardList, Plus, Save01 as Save, SearchLg as Search, X as XIcon } from '@untitledui/icons';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { maintenanceApi } from '../../lib/api/maintenance';
import type { MaintenanceContractDto, MaintenancePeriod, PersonLite, CustomerLite } from '../../types/maintenance';
import { fmtDate, PERIOD_LABEL, personName, StatCard } from './MaintenanceShared';

const emptyForm = {
    customerId: '',
    title: '',
    period: 'QUARTERLY' as MaintenancePeriod,
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().add(1, 'year').format('YYYY-MM-DD'),
    siteName: '',
    equipmentInfo: '',
    serviceScope: '',
    assignedTechId: '',
    alternativeTechId: '',
    reminderDaysBefore: 7,
    inApp: true,
    email: true,
    sms: false,
    push: false,
};

const normalizeRows = <T,>(value: any): T[] => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.customers)) return value.customers;
    return [];
};

export const MaintenanceContracts = () => {
    const [contracts, setContracts] = useState<MaintenanceContractDto[]>([]);
    const [customers, setCustomers] = useState<CustomerLite[]>([]);
    const [employees, setEmployees] = useState<PersonLite[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState(emptyForm);

    const load = async () => {
        setLoading(true);
        const [contractRows, customerRes, employeeRes] = await Promise.allSettled([
            maintenanceApi.listContracts(),
            maintenanceApi.listOptionCustomers(),
            maintenanceApi.listTechnicians(),
        ]);

        if (contractRows.status === 'fulfilled') {
            setContracts(contractRows.value);
        } else {
            toast.error(contractRows.reason?.response?.data?.error || 'Bakım sözleşmeleri yüklenemedi.');
            setContracts([]);
        }

        if (customerRes.status === 'fulfilled') {
            setCustomers(normalizeRows<CustomerLite>(customerRes.value));
        } else {
            setCustomers([]);
        }

        if (employeeRes.status === 'fulfilled') {
            setEmployees(normalizeRows<PersonLite>(employeeRes.value));
        } else {
            setEmployees([]);
        }

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
            contract.title,
            contract.customer?.companyName,
            contract.siteName,
            contract.equipmentInfo,
        ].some((value) => value?.toLowerCase().includes(q));
    });

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!form.customerId || !form.title || !form.startDate || !form.endDate) {
            toast.error('Müşteri, başlık ve tarih aralığı zorunludur.');
            return;
        }

        setSaving(true);
        try {
            const alternativeTechId = form.alternativeTechId && form.alternativeTechId !== form.assignedTechId
                ? form.alternativeTechId
                : null;

            await maintenanceApi.createContract({
                customerId: form.customerId,
                title: form.title,
                period: form.period,
                startDate: form.startDate,
                endDate: form.endDate,
                siteName: form.siteName,
                equipmentInfo: form.equipmentInfo,
                serviceScope: form.serviceScope,
                assignedTechId: form.assignedTechId || null,
                alternativeTechId,
                reminderDaysBefore: Number(form.reminderDaysBefore || 7),
                notificationChannels: {
                    inApp: form.inApp,
                    email: form.email,
                    sms: form.sms,
                    push: form.push,
                },
            });
            toast.success('Bakım sözleşmesi ve periyodik görevler oluşturuldu.');
            setForm(emptyForm);
            setShowForm(false);
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Sözleşme oluşturulamadı.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Bakım"
                title="Bakım sözleşmeleri"
                description="Müşteri bazlı periyodik bakım sözleşmelerini ve otomatik görev planlarını yönetin."
                actions={
                    <>
                        <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sözleşme ara" className="w-[220px] pl-8" />
                        </div>
                        <Button variant={showForm ? 'secondary' : 'primary'} icon={showForm ? <XIcon size={13} /> : <Plus size={13} />} onClick={() => setShowForm(!showForm)}>
                            {showForm ? 'Kapat' : 'Yeni sözleşme'}
                        </Button>
                    </>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                    label="Aktif sözleşme"
                    value={stats.active}
                    icon={<ClipboardList size={14} />}
                    tone="success"
                    sub="Süresi geçerli"
                />
                <StatCard
                    label="Planlanmış görev"
                    value={stats.taskCount}
                    icon={<Calendar size={14} />}
                    sub="Otomatik üretilen"
                />
                <StatCard
                    label="İmzalı rapor"
                    value={stats.signed}
                    icon={<Save size={14} />}
                    tone="neutral"
                    sub="Kilitlenen rapor"
                />
                <StatCard
                    label="Süresi dolan sözleşme"
                    value={stats.expired}
                    icon={<AlertTriangle size={14} />}
                    tone={stats.expired ? 'danger' : 'neutral'}
                    sub="Bitiş tarihi geçti"
                />
            </div>

            {showForm && (
                <Card title="Yeni bakım sözleşmesi" icon={<Plus size={13} />} className="mb-4">
                    <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-12">
                        <Field label="Müşteri" required className="md:col-span-4">
                            <Select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                                <option value="">Seçiniz</option>
                                {!customers.length && <option value="__no_customers" disabled>Müşteri bulunamadı</option>}
                                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
                            </Select>
                        </Field>
                        <Field label="Sözleşme başlığı" required className="md:col-span-5">
                            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn. HVAC periyodik bakım" />
                        </Field>
                        <Field label="Periyot" className="md:col-span-3">
                            <Select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as MaintenancePeriod })}>
                                {Object.entries(PERIOD_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </Select>
                        </Field>
                        <Field label="Başlangıç" required className="md:col-span-3">
                            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                        </Field>
                        <Field label="Bitiş" required className="md:col-span-3">
                            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                        </Field>
                        <Field label="Saha / lokasyon" className="md:col-span-3">
                            <Input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
                        </Field>
                        <Field label="Hatırlatma günü" className="md:col-span-3">
                            <Input type="number" min="0" value={form.reminderDaysBefore} onChange={(e) => setForm({ ...form, reminderDaysBefore: Number(e.target.value) })} />
                        </Field>
                        <Field label="Sorumlu teknisyen" className="md:col-span-3">
                            <Select value={form.assignedTechId} onChange={(e) => setForm({ ...form, assignedTechId: e.target.value })}>
                                <option value="">Seçiniz</option>
                                {!employees.length && <option value="__no_technicians" disabled>Teknisyen rolünde personel yok</option>}
                                {employees.map((employee) => <option key={employee.id} value={employee.id}>{personName(employee)}</option>)}
                            </Select>
                        </Field>
                        <Field label="Alternatif teknisyen" className="md:col-span-3">
                            <Select value={form.alternativeTechId} onChange={(e) => setForm({ ...form, alternativeTechId: e.target.value })}>
                                <option value="">Seçiniz</option>
                                {!employees.length && <option value="__no_technicians" disabled>Teknisyen rolünde personel yok</option>}
                                {employees.map((employee) => <option key={employee.id} value={employee.id}>{personName(employee)}</option>)}
                            </Select>
                        </Field>
                        <div className="grid grid-cols-2 gap-2 md:col-span-6 md:grid-cols-4">
                            {[
                                ['inApp', 'Sistem içi'],
                                ['email', 'E-posta'],
                                ['sms', 'SMS'],
                                ['push', 'Push'],
                            ].map(([key, label]) => (
                                <label key={key} className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={Boolean((form as any)[key])}
                                        onChange={(e) => setForm({ ...form, [key]: e.target.checked } as typeof form)}
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                        <Field label="Hizmet kapsamı" className="md:col-span-6">
                            <Textarea rows={3} value={form.serviceScope} onChange={(e) => setForm({ ...form, serviceScope: e.target.value })} placeholder="Bakım türü, SLA, kontrol kapsamı" />
                        </Field>
                        <Field label="Ekipman listesi" className="md:col-span-6">
                            <Textarea rows={3} value={form.equipmentInfo} onChange={(e) => setForm({ ...form, equipmentInfo: e.target.value })} placeholder="Cihaz, seri no, lokasyon" />
                        </Field>
                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 md:col-span-12">
                            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>İptal</Button>
                            <Button type="submit" loading={saving} icon={<Save size={13} />}>Kaydet</Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card title={`Sözleşmeler - ${filtered.length}`} icon={<ClipboardList size={13} />} noPadding>
                {loading ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />)}</div>
                ) : filtered.length === 0 ? (
                    <EmptyState icon={<ClipboardList size={32} />} title="Sözleşme yok" description="Yeni sözleşme oluşturarak otomatik bakım planını başlatın." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Sözleşme / saha</th>
                                    <th className="px-3 py-2 text-left font-semibold">Müşteri</th>
                                    <th className="px-3 py-2 text-left font-semibold">Bakım periyodu</th>
                                    <th className="px-3 py-2 text-left font-semibold">Geçerlilik tarihi</th>
                                    <th className="px-3 py-2 text-left font-semibold">Teknisyen</th>
                                    <th className="px-3 py-2 text-right font-semibold">Görev sayısı</th>
                                    <th className="px-3 py-2 text-left font-semibold">Sonraki görev</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((contract) => {
                                    const nextTask = (contract.tasks || [])
                                        .filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
                                        .sort((a, b) => dayjs(a.plannedDate).valueOf() - dayjs(b.plannedDate).valueOf())[0];
                                    const tech = nextTask?.technician || contract.tasks?.find((task) => task.technician)?.technician;
                                    const isExpired = dayjs(contract.endDate).isBefore(dayjs(), 'day');
                                    return (
                                        <tr key={contract.id} className="hover:bg-slate-50/70">
                                            <td className="px-3 py-2">
                                                <div className="font-semibold text-slate-900">{contract.title}</div>
                                                <div className="text-[11px] text-slate-500">{contract.siteName || '-'}</div>
                                            </td>
                                            <td className="px-3 py-2 text-slate-700">{contract.customer?.companyName || contract.customerId}</td>
                                            <td className="px-3 py-2 text-slate-600">{PERIOD_LABEL[contract.period]}</td>
                                            <td className="px-3 py-2">
                                                <div className="font-mono text-[11.5px]">{fmtDate(contract.startDate)} - {fmtDate(contract.endDate)}</div>
                                                {isExpired && <div className="mt-0.5 text-[11px] font-medium text-rose-700">Süresi doldu</div>}
                                            </td>
                                            <td className="px-3 py-2 text-slate-600">{personName(tech)}</td>
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
        </div>
    );
};
