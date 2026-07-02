import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    CalendarCheck01 as CalendarClock,
    Edit01 as Pencil,
    Save01 as Save,
    Trash01 as Trash2,
    X,
} from '@/components/icons/antIconCompat';
import { Button } from '../../../components/ui-shared/Button';
import { Card } from '../../../components/ui-shared/Card';
import { Field, Input, Select } from '../../../components/ui-shared/Field';
import { tenderApi } from '../../../lib/api/tender';
import { projectApi } from '../../../lib/api/project';
import type { PersonLite } from '../../../types/maintenance';

/**
 * Technician assignment for a proposal (teklif). Before the proposal is
 * converted to a project this edits the proposal schedule slots; afterwards it
 * proxies to the project's appointments so both screens stay in sync against the
 * same records. Either way the backend enforces the exact same conflict rules.
 */

type SlotLike = {
    id: string;
    startTime: string;
    endTime: string;
    notes?: string | null;
    assignedTechId?: string | null;
    assignedTechnician?: PersonLite | null;
    technicianAssignments?: Array<{ technicianId: string; technician?: PersonLite | null }>;
};

type FormState = {
    id: string;
    date: string;
    start: string;
    end: string;
    technicianIds: string[];
    notes: string;
};

const emptyForm = (): FormState => ({
    id: '',
    date: dayjs().format('YYYY-MM-DD'),
    start: '09:00',
    end: '17:00',
    technicianIds: [],
    notes: '',
});

const slotToForm = (slot: SlotLike): FormState => ({
    id: slot.id,
    date: dayjs(slot.startTime).format('YYYY-MM-DD'),
    start: dayjs(slot.startTime).format('HH:mm'),
    end: dayjs(slot.endTime).format('HH:mm'),
    technicianIds: slotTechnicianIds(slot),
    notes: slot.notes || '',
});

const slotTechnicianIds = (slot: SlotLike) => {
    const ids = new Set<string>();
    if (slot?.assignedTechId) ids.add(slot.assignedTechId);
    (slot?.technicianAssignments || []).forEach((assignment) => {
        if (assignment.technicianId) ids.add(assignment.technicianId);
    });
    return Array.from(ids);
};

const slotTechnicianNames = (slot: SlotLike) => {
    const names = new Map<string, string>();
    if (slot?.assignedTechnician) {
        names.set(slot.assignedTechnician.id, `${slot.assignedTechnician.firstName} ${slot.assignedTechnician.lastName}`.trim());
    }
    (slot?.technicianAssignments || []).forEach((assignment) => {
        if (assignment.technician) {
            names.set(assignment.technician.id, `${assignment.technician.firstName} ${assignment.technician.lastName}`.trim());
        }
    });
    return Array.from(names.values()).filter(Boolean).join(', ') || 'Atanmadı';
};

export const TenderTechnicianTab = ({
    tenderId,
    projectId,
    hasCustomer,
    canManage,
    onChanged,
}: {
    tenderId: string;
    projectId?: string | null;
    hasCustomer: boolean;
    canManage: boolean;
    onChanged?: () => void | Promise<void>;
}) => {
    const isProjectMode = Boolean(projectId);
    const [slots, setSlots] = useState<SlotLike[]>([]);
    const [technicians, setTechnicians] = useState<PersonLite[]>([]);
    const [form, setForm] = useState<FormState>(emptyForm());
    const [loading, setLoading] = useState(false);
    const [listLoading, setListLoading] = useState(true);
    const editing = Boolean(form.id);

    const load = useCallback(async () => {
        setListLoading(true);
        try {
            if (isProjectMode && projectId) {
                const project = await projectApi.getById(projectId);
                setSlots(((project.appointments || []) as SlotLike[]).slice().sort((a, b) => a.startTime.localeCompare(b.startTime)));
            } else if (hasCustomer) {
                setSlots(await tenderApi.getScheduleSlots(tenderId));
            } else {
                setSlots([]);
            }
        } catch {
            setSlots([]);
        } finally {
            setListLoading(false);
        }
    }, [isProjectMode, projectId, hasCustomer, tenderId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const fetcher = isProjectMode ? projectApi.listTechnicians : tenderApi.listTechnicians;
        fetcher().then(setTechnicians).catch(() => setTechnicians([]));
    }, [isProjectMode]);

    const submit = async () => {
        const startTime = dayjs(`${form.date}T${form.start}`).toISOString();
        const endTime = dayjs(`${form.date}T${form.end}`).toISOString();
        if (!dayjs(endTime).isAfter(dayjs(startTime))) return toast.error('Bitiş saati başlangıçtan sonra olmalıdır.');
        const technicianIds = [...new Set(form.technicianIds.filter(Boolean))];
        if (!technicianIds.length) return toast.error('En az bir teknisyen seçin.');
        setLoading(true);
        try {
            if (isProjectMode && projectId) {
                if (editing) {
                    await projectApi.updateAppointment(form.id, { assignedTechId: technicianIds[0] || null, technicianIds, startTime, endTime, notes: form.notes });
                } else {
                    await projectApi.createAppointment(projectId, { assignedTechId: technicianIds[0] || null, technicianIds, startTime, endTime, notes: form.notes });
                }
            } else {
                if (editing) {
                    await tenderApi.updateScheduleSlot(tenderId, form.id, { startTime, endTime, notes: form.notes, technicianIds });
                } else {
                    await tenderApi.createScheduleSlot(tenderId, { startTime, endTime, notes: form.notes, technicianIds });
                }
            }
            toast.success(editing ? 'Teknisyen ataması güncellendi.' : 'Teknisyen atandı.');
            setForm(emptyForm());
            await load();
            await onChanged?.();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Teknisyen ataması kaydedilemedi.');
        } finally {
            setLoading(false);
        }
    };

    const remove = async (slot: SlotLike) => {
        if (!confirm('Saat planı silinsin mi? Bu plana bağlı teknisyen atamaları da kaldırılır.')) return;
        try {
            if (isProjectMode) {
                await projectApi.deleteAppointment(slot.id);
            } else {
                await tenderApi.deleteScheduleSlot(tenderId, slot.id);
            }
            if (form.id === slot.id) setForm(emptyForm());
            await load();
            await onChanged?.();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Saat planı silinemedi.');
        }
    };

    const availableTechnicians = useMemo(
        () => technicians.filter((tech) => !form.technicianIds.includes(tech.id)),
        [technicians, form.technicianIds],
    );

    if (!isProjectMode && !hasCustomer) {
        return (
            <Card title="Teknisyen ata" icon={<CalendarClock size={13} />}>
                <div className="px-1 py-6 text-center text-[12.5px] text-slate-500">
                    Teknisyen atamadan önce teklife bir müşteri seçin.
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {isProjectMode && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800">
                    Bu teklif projeye dönüştü. Teknisyen atamaları proje randevularıyla eşitlenir; burada yaptığınız değişiklikler proje ekranına da yansır.
                </div>
            )}
            <Card title="Atanan teknisyenler" icon={<CalendarClock size={13} />} noPadding>
                <div className="divide-y divide-slate-100">
                    {listLoading && <div className="px-4 py-8 text-center text-[12px] text-slate-500">Yükleniyor…</div>}
                    {!listLoading && slots.length === 0 && (
                        <div className="px-4 py-8 text-center text-[12px] text-slate-500">Henüz saat planı yok.</div>
                    )}
                    {!listLoading && slots.map((slot) => (
                        <div key={slot.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[12.5px]">
                            <div>
                                <div className="font-medium text-slate-800">{dayjs(slot.startTime).format('DD.MM.YYYY')}</div>
                                <div className="text-slate-500">
                                    {dayjs(slot.startTime).format('HH:mm')} - {dayjs(slot.endTime).format('HH:mm')}
                                </div>
                                <div className="mt-1 text-[11.5px] font-semibold text-slate-600">Teknisyen: {slotTechnicianNames(slot)}</div>
                                {slot.notes && <div className="mt-1 text-[11.5px] text-slate-500">{slot.notes}</div>}
                            </div>
                            {canManage && (
                                <div className="flex items-center gap-1">
                                    <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700" onClick={() => setForm(slotToForm(slot))}>
                                        <Pencil size={13} />
                                    </button>
                                    <button type="button" className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(slot)}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </Card>

            {canManage && (
                <Card title={editing ? 'Atamayı düzenle' : 'Teknisyen ata'} icon={<CalendarClock size={13} />}>
                    <div>
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-[12px] font-semibold text-slate-700">{editing ? 'Atamayı düzenle' : 'Yeni saat planı ve teknisyen ataması'}</div>
                            {editing && (
                                <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-50" onClick={() => setForm(emptyForm())}>
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                            <Field label="Tarih"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                            <Field label="Başlangıç"><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
                            <Field label="Bitiş"><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
                            <Field label="Teknisyenler">
                                <div className="space-y-2">
                                    <Select value="" onChange={(e) => {
                                        const id = e.target.value;
                                        if (!id) return;
                                        const ids = form.technicianIds.includes(id) ? form.technicianIds : [...form.technicianIds, id];
                                        setForm({ ...form, technicianIds: ids });
                                    }}>
                                        <option value="">Teknisyen ekle</option>
                                        {availableTechnicians.map((tech) => (
                                            <option key={tech.id} value={tech.id}>
                                                {tech.firstName} {tech.lastName}{tech.email ? ` - ${tech.email}` : ''}
                                            </option>
                                        ))}
                                    </Select>
                                    <div className="flex flex-wrap gap-1">
                                        {form.technicianIds.map((id, index) => {
                                            const tech = technicians.find((item) => item.id === id);
                                            return (
                                                <span key={id} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                                    {index === 0 ? 'Sorumlu: ' : ''}{tech ? `${tech.firstName} ${tech.lastName}` : id}
                                                    <button
                                                        type="button"
                                                        className="text-slate-400 hover:text-rose-600"
                                                        onClick={() => setForm({ ...form, technicianIds: form.technicianIds.filter((item) => item !== id) })}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            );
                                        })}
                                        {form.technicianIds.length === 0 && <span className="text-[11px] text-slate-500">Teknisyen seçilmedi</span>}
                                    </div>
                                </div>
                            </Field>
                            <Field label="Not"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                        </div>
                        <Button className="mt-3" loading={loading} icon={<Save size={13} />} onClick={submit}>
                            {editing ? 'Güncelle' : 'Ekle'}
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    );
};
