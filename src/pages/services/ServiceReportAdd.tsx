import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ArrowLeft,
    Plus as PlusIcon,
    Trash01 as TrashIcon,
    Save01 as SaveIcon,
} from '@/components/icons/antIconCompat';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { projectApi, type CompleteInstallationInput } from '../../lib/api/project';
import type { ProjectDto, AppointmentDto, ProjectMaterial } from '../../types/project';
import { useAuthStore } from '../../store/authStore';

import { t } from '@/i18n/translate';

const EXPENSE_TYPES = ['Nakliye', 'Ekipman Kiralama', 'Dış hizmetler', 'Taşeron', 'Diğer'];

type MaterialRow = { materialId: string; quantity: number };
type ExpenseRow = { expenseType: string; amount: number; description: string };

export const ServiceReportAdd = () => {
    const navigate = useNavigate();
    const routeParams = useParams();
    const [searchParams] = useSearchParams();
    // When opened from a project (e.g. /projects/:id/reports/new), the project is fixed and the
    // appointment can be preselected; "returnTo" controls where Save / Back navigate.
    const lockedProjectId = routeParams.id || searchParams.get('projectId') || '';
    const presetAppointmentId = searchParams.get('appointmentId') || '';
    const returnTo = searchParams.get('returnTo') || '/services/reports';
    const user = useAuthStore((s) => s.user);
    const isTechnician = useMemo(
        () => !!(user?.roleName?.toLowerCase().includes('teknisyen')
            || (user as any)?.employeeRoles?.some((r: any) => r.role?.roleName?.toLowerCase().includes('teknisyen'))),
        [user],
    );

    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [projectId, setProjectId] = useState('');
    const [project, setProject] = useState<ProjectDto | null>(null);
    const [appointmentId, setAppointmentId] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [operationsDone, setOperationsDone] = useState('');
    const [technicalNotes, setTechnicalNotes] = useState('');
    const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
    const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        void (async () => {
            try {
                setMaterials(await projectApi.materials());
                if (lockedProjectId) {
                    const full = await projectApi.getById(lockedProjectId);
                    setProject(full);
                    setProjectId(full.id);
                    const presetAppt = (full.appointments || []).find((a: any) => a.id === presetAppointmentId);
                    if (presetAppt) {
                        setAppointmentId(presetAppt.id);
                        setStartTime(dayjs(presetAppt.startTime).format('HH:mm'));
                        setEndTime(dayjs(presetAppt.endTime).format('HH:mm'));
                    }
                } else {
                    setProjects(await projectApi.list());
                }
            } catch (e: any) {
                toast.error(e.response?.data?.error || t('projects.errorLoad'));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lockedProjectId, presetAppointmentId]);

    const appointments = useMemo<AppointmentDto[]>(
        () => (project?.appointments || []).slice().sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()),
        [project],
    );
    const selectedAppointment = appointments.find((a) => a.id === appointmentId) || null;

    const onSelectProject = async (id: string) => {
        setProjectId(id);
        setProject(null);
        setAppointmentId('');
        if (!id) return;
        try {
            const full = await projectApi.getById(id);
            setProject(full);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.errorLoad'));
        }
    };

    const onSelectAppointment = (id: string) => {
        setAppointmentId(id);
        const appt = appointments.find((a) => a.id === id);
        if (appt) {
            setStartTime(dayjs(appt.startTime).format('HH:mm'));
            setEndTime(dayjs(appt.endTime).format('HH:mm'));
        }
    };

    const buildIso = (time: string) => {
        const base = selectedAppointment ? dayjs(selectedAppointment.startTime) : dayjs();
        const [h, m] = time.split(':').map((x) => Number(x));
        return base.hour(h || 0).minute(m || 0).second(0).millisecond(0).toISOString();
    };

    const submit = async () => {
        if (!projectId) return toast.error('Proje seçin.');
        if (!appointmentId) return toast.error('Randevu seçin.');
        if (!operationsDone.trim()) return toast.error('Yapılan işleri girin.');

        const startedAt = buildIso(startTime);
        const endedAt = buildIso(endTime);
        if (dayjs(endedAt).valueOf() <= dayjs(startedAt).valueOf()) {
            return toast.error('Bitiş saati başlangıçtan sonra olmalı.');
        }

        const payload: CompleteInstallationInput = {
            operationsDoneItems: operationsDone.split('\n').map((s) => s.trim()).filter(Boolean),
            technicalNotes: technicalNotes.trim() || undefined,
            startedAt,
            endedAt,
            usedMaterials: materialRows
                .filter((r) => r.materialId && Number(r.quantity) > 0)
                .map((r) => ({ materialId: r.materialId, quantity: Number(r.quantity) })),
            expenses: expenseRows
                .filter((r) => r.expenseType && Number(r.amount) > 0)
                .map((r) => ({ expenseType: r.expenseType, amount: Number(r.amount), description: r.description.trim() })),
        };

        setSubmitting(true);
        try {
            // Save only — the PDF is generated later from the project details "PDF" button.
            if (isTechnician) {
                await projectApi.completeInstallation(appointmentId, payload);
            } else {
                await projectApi.completeAppointmentAsManager(appointmentId, payload);
            }
            toast.success('Saha raporu kaydedildi.');
            navigate(returnTo);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Rapor kaydedilemedi.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('nav.serviceReports')}
                title="Yeni Saha Raporu"
                description="Proje ve randevu seçin, yapılan işleri, malzemeleri ve harici giderleri girin."
            />

            <div className="mb-4">
                <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => navigate(returnTo)}>Geri</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-4">
                    <Card title="Rapor bilgileri">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Field label="Proje" required>
                                {lockedProjectId ? (
                                    <Input value={project?.projectName || '…'} disabled readOnly />
                                ) : (
                                    <Select value={projectId} onChange={(e) => void onSelectProject(e.target.value)}>
                                        <option value="">Proje seçin</option>
                                        {projects.map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                                    </Select>
                                )}
                            </Field>
                            <Field label="Randevu (gün)" required>
                                <Select value={appointmentId} disabled={!project} onChange={(e) => onSelectAppointment(e.target.value)}>
                                    <option value="">Randevu seçin</option>
                                    {appointments.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {dayjs(a.startTime).format('DD.MM.YYYY')} · {dayjs(a.startTime).format('HH:mm')}–{dayjs(a.endTime).format('HH:mm')}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Başlangıç saati" required>
                                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                            </Field>
                            <Field label="Bitiş saati" required>
                                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                            </Field>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3">
                            <Field label="Yapılan işler" required hint="Her satır ayrı bir iş kalemi olarak raporlanır.">
                                <Textarea rows={4} value={operationsDone} onChange={(e) => setOperationsDone(e.target.value)} placeholder="0555 kodlu klima borusu takıldı…" />
                            </Field>
                            <Field label="Teknik notlar">
                                <Textarea rows={3} value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} />
                            </Field>
                        </div>
                    </Card>

                    <Card
                        title="Kullanılan malzemeler"
                        actions={<Button variant="secondary" size="sm" icon={<PlusIcon size={13} />} onClick={() => setMaterialRows((rows) => [...rows, { materialId: '', quantity: 1 }])}>Satır</Button>}
                    >
                        {materialRows.length === 0 && <p className="text-[12.5px] text-slate-500">Malzeme eklemek için "Satır" ekleyin.</p>}
                        <div className="space-y-2">
                            {materialRows.map((row, index) => (
                                <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_40px]">
                                    <Select value={row.materialId} onChange={(e) => setMaterialRows((rows) => rows.map((r, i) => i === index ? { ...r, materialId: e.target.value } : r))}>
                                        <option value="">Malzeme seçin</option>
                                        {materials.map((m) => <option key={m.id} value={m.id}>{m.serialId ? `${m.serialId} · ` : ''}{m.name}</option>)}
                                    </Select>
                                    <Input type="number" min={0} step="1" value={row.quantity} onChange={(e) => setMaterialRows((rows) => rows.map((r, i) => i === index ? { ...r, quantity: Number(e.target.value) } : r))} />
                                    <Button variant="ghost" size="sm" icon={<TrashIcon size={13} />} onClick={() => setMaterialRows((rows) => rows.filter((_, i) => i !== index))} />
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card
                        title="Harici giderler"
                        actions={<Button variant="secondary" size="sm" icon={<PlusIcon size={13} />} onClick={() => setExpenseRows((rows) => [...rows, { expenseType: 'Nakliye', amount: 0, description: '' }])}>Satır</Button>}
                    >
                        {expenseRows.length === 0 && <p className="text-[12.5px] text-slate-500">Harici gider eklemek için "Satır" ekleyin.</p>}
                        <div className="space-y-2">
                            {expenseRows.map((row, index) => (
                                <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[160px_120px_1fr_40px]">
                                    <Select value={row.expenseType} onChange={(e) => setExpenseRows((rows) => rows.map((r, i) => i === index ? { ...r, expenseType: e.target.value } : r))}>
                                        {EXPENSE_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                                    </Select>
                                    <Input type="number" min={0} step="0.01" value={row.amount} onChange={(e) => setExpenseRows((rows) => rows.map((r, i) => i === index ? { ...r, amount: Number(e.target.value) } : r))} />
                                    <Input value={row.description} placeholder="Açıklama" onChange={(e) => setExpenseRows((rows) => rows.map((r, i) => i === index ? { ...r, description: e.target.value } : r))} />
                                    <Button variant="ghost" size="sm" icon={<TrashIcon size={13} />} onClick={() => setExpenseRows((rows) => rows.filter((_, i) => i !== index))} />
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card title="Özet">
                        <dl className="space-y-2 text-[12.5px]">
                            <div className="flex justify-between"><dt className="text-slate-500">Proje</dt><dd className="font-medium text-slate-800">{project?.projectName || '—'}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-500">Müşteri</dt><dd className="font-medium text-slate-800">{project?.customer?.companyName || '—'}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-500">Randevu günü</dt><dd className="font-medium text-slate-800">{selectedAppointment ? dayjs(selectedAppointment.startTime).format('DD.MM.YYYY') : '—'}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-500">Malzeme satırı</dt><dd className="font-medium text-slate-800">{materialRows.length}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-500">Gider satırı</dt><dd className="font-medium text-slate-800">{expenseRows.length}</dd></div>
                        </dl>
                        <div className="mt-4">
                            <Button variant="primary" size="md" className="w-full" disabled={submitting} icon={<SaveIcon size={14} />} onClick={() => void submit()}>
                                {submitting ? 'Kaydediliyor…' : 'Kaydet'}
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ServiceReportAdd;
