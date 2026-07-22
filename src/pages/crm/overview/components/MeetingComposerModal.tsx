import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AntSelect from 'antd/es/select';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Building03, Plus, User01, X } from '@/components/icons/antIconCompat';
import { Modal } from '../../../../components/ui-shared/Modal';
import { Button } from '../../../../components/ui-shared/Button';
import { apiClient } from '../../../../lib/axios';
import { meetingApi, type MeetingActivityDto, type MeetingKind } from '../../../../lib/api/meetings';
import { ParticipantPickerModal, type PickedParticipant } from './ParticipantPickerModal';

interface MeetingComposerModalProps {
    open: boolean;
    onClose: () => void;
    /** Called with the created activity after a successful save. */
    onSaved?: (meeting: MeetingActivityDto) => void;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];

interface CustomerOption {
    id: string;
    companyName: string;
}

const inputCls =
    'rounded-xl border border-black/10 bg-white px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-[#07145c]/50 dark:border-white/15 dark:bg-white/5 dark:text-white';

const emptyDraft = () => ({
    kind: 'MEETING' as MeetingKind,
    title: '',
    date: dayjs().format('YYYY-MM-DD'),
    time: dayjs().add(1, 'hour').startOf('hour').format('HH:mm'),
    durationMin: 60,
    customerId: '' as string,
    notes: '',
});

/**
 * "Meeting activity" composer — a side drawer (not a centered dialog) creating a
 * backend MeetingActivity: kind (meeting/task), title, date/time + preset
 * duration, optional related customer, notes, and mixed staff/customer
 * participants via the large picker.
 */
export const MeetingComposerModal: React.FC<MeetingComposerModalProps> = ({ open, onClose, onSaved }) => {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(emptyDraft);
    const [participants, setParticipants] = useState<PickedParticipant[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || customers.length) return;
        apiClient
            .get('/customers', { params: { isActive: true, pageSize: 100, page: 1 } })
            .then((res) => {
                const rows = Array.isArray(res.data) ? res.data : res.data?.items || res.data?.customers || [];
                setCustomers(rows.map((c: CustomerOption) => ({ id: c.id, companyName: c.companyName })));
            })
            .catch(() => setCustomers([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const durationOptions = useMemo(
        () =>
            DURATION_OPTIONS.map((min) => ({
                value: min,
                label:
                    min < 60
                        ? t('crmOverview.agenda.durationMinutes', { count: min, defaultValue: '{{count}} dakika' })
                        : t('crmOverview.agenda.durationHours', {
                              count: min / 60,
                              defaultValue: min % 60 === 0 ? '{{count}} saat' : `${Math.floor(min / 60)} sa ${min % 60} dk`,
                          }),
            })),
        [t],
    );

    const save = async () => {
        if (!draft.title.trim()) {
            toast.error(t('crmOverview.agenda.titleRequired', { defaultValue: 'Başlık gerekli.' }));
            return;
        }
        const start = dayjs(`${draft.date}T${draft.time}`);
        if (!start.isValid()) {
            toast.error(t('crmOverview.agenda.invalidTime', { defaultValue: 'Geçerli bir tarih ve saat seçin.' }));
            return;
        }
        setSaving(true);
        try {
            const meeting = await meetingApi.create({
                kind: draft.kind,
                title: draft.title.trim(),
                notes: draft.notes.trim() || null,
                startTime: start.toISOString(),
                endTime: start.add(draft.durationMin, 'minute').toISOString(),
                customerId: draft.customerId || null,
                participants: participants.map((p) => ({
                    participantType: p.participantType,
                    employeeId: p.participantType === 'EMPLOYEE' ? p.id : null,
                    customerId: p.participantType === 'CUSTOMER' ? p.id : null,
                })),
            });
            toast.success(
                draft.kind === 'MEETING'
                    ? t('crmOverview.agenda.meetingSaved', { defaultValue: 'Toplantı eklendi.' })
                    : t('crmOverview.agenda.taskSaved', { defaultValue: 'Görev eklendi.' }),
            );
            onSaved?.(meeting);
            onClose();
            setDraft(emptyDraft());
            setParticipants([]);
        } catch (error) {
            const e = error as { response?: { data?: { error?: string } } };
            toast.error(e?.response?.data?.error || t('crmOverview.agenda.saveFailed', { defaultValue: 'Aktivite kaydedilemedi.' }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            placement="drawer"
            drawerWidth="md"
            title={t('crmOverview.agenda.composerTitle', { defaultValue: 'Toplantı aktivitesi' })}
            description={t('crmOverview.agenda.composerDesc', {
                defaultValue: 'Toplantı veya görev oluşturun; genel bakışta ve takvimde görünür.',
            })}
            footer={
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>
                        {t('common.cancel', { defaultValue: 'İptal' })}
                    </Button>
                    <Button variant="primary" isLoading={saving} onClick={save}>
                        {t('common.save', { defaultValue: 'Kaydet' })}
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                {/* Kind: meetings are purple, tasks are green */}
                <div className="flex items-center gap-1 rounded-xl bg-black/4 p-1 dark:bg-white/6">
                    {(['MEETING', 'TASK'] as const).map((kind) => {
                        const active = draft.kind === kind;
                        const activeCls =
                            kind === 'MEETING'
                                ? 'bg-white text-violet-700 shadow-sm dark:bg-white/12 dark:text-violet-300'
                                : 'bg-white text-emerald-700 shadow-sm dark:bg-white/12 dark:text-emerald-300';
                        return (
                            <button
                                key={kind}
                                type="button"
                                onClick={() => setDraft((d) => ({ ...d, kind }))}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                                    active ? activeCls : 'text-[#6B7280] dark:text-white/60'
                                }`}
                            >
                                <span className={`size-2 rounded-full ${kind === 'MEETING' ? 'bg-violet-500' : 'bg-emerald-500'}`} />
                                {kind === 'MEETING'
                                    ? t('crmOverview.agenda.kindMeeting', { defaultValue: 'Toplantı' })
                                    : t('crmOverview.agenda.kindTask', { defaultValue: 'Görev' })}
                            </button>
                        );
                    })}
                </div>

                <label className="flex flex-col gap-1 text-[12.5px] font-medium text-[#3F4350] dark:text-[#d9dce3]">
                    {t('crmOverview.agenda.fieldTitle', { defaultValue: 'Başlık' })}
                    <input
                        value={draft.title}
                        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                        placeholder={t('crmOverview.agenda.fieldTitlePlaceholder', { defaultValue: 'Örn. Müşteri araması' })}
                        className={inputCls}
                    />
                </label>

                {/* Related customer (optional) */}
                <label className="flex flex-col gap-1 text-[12.5px] font-medium text-[#3F4350] dark:text-[#d9dce3]">
                    {t('crmOverview.agenda.fieldCustomer', { defaultValue: 'İlgili müşteri (isteğe bağlı)' })}
                    <AntSelect
                        className="[&_.ant-select-selector]:!rounded-xl"
                        showSearch
                        allowClear
                        placeholder={t('crmOverview.agenda.fieldCustomerPlaceholder', { defaultValue: 'Müşteri seçin' })}
                        value={draft.customerId || undefined}
                        onChange={(v) => setDraft((d) => ({ ...d, customerId: v || '' }))}
                        filterOption={(input, option) => String(option?.label || '').toLowerCase().includes(input.toLowerCase())}
                        options={customers.map((c) => ({ value: c.id, label: c.companyName }))}
                    />
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-[12.5px] font-medium text-[#3F4350] dark:text-[#d9dce3]">
                        {t('crmOverview.agenda.fieldDate', { defaultValue: 'Tarih' })}
                        <input
                            type="date"
                            value={draft.date}
                            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                            className={inputCls}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-[12.5px] font-medium text-[#3F4350] dark:text-[#d9dce3]">
                        {t('crmOverview.agenda.fieldTime', { defaultValue: 'Saat' })}
                        <input
                            type="time"
                            value={draft.time}
                            onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                            className={inputCls}
                        />
                    </label>
                </div>

                {/* Duration: preset choices — no free-typing pitfalls */}
                <label className="flex flex-col gap-1 text-[12.5px] font-medium text-[#3F4350] dark:text-[#d9dce3]">
                    {t('crmOverview.agenda.fieldDuration', { defaultValue: 'Süre' })}
                    <AntSelect
                        className="[&_.ant-select-selector]:!rounded-xl"
                        value={draft.durationMin}
                        options={durationOptions}
                        onChange={(v) => setDraft((d) => ({ ...d, durationMin: Number(v) || 60 }))}
                    />
                </label>

                {/* Participants */}
                <div className="flex flex-col gap-1.5">
                    <span className="flex items-center justify-between text-[12.5px] font-medium text-[#3F4350] dark:text-[#d9dce3]">
                        {t('crmOverview.agenda.participants', { defaultValue: 'Katılımcılar' })}
                        <button
                            type="button"
                            onClick={() => setPickerOpen(true)}
                            className="flex items-center gap-1 rounded-lg border border-[#07145c]/25 px-2 py-1 text-[12px] font-semibold text-[#07145c] transition-colors hover:bg-[#07145c]/5 dark:border-[#e6cf9e]/30 dark:text-[#e6cf9e] dark:hover:bg-[#e6cf9e]/10"
                        >
                            <Plus size={13} />
                            {t('crmOverview.agenda.addParticipant', { defaultValue: 'Katılımcı ekle' })}
                        </button>
                    </span>
                    {participants.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-black/10 px-3 py-4 text-center text-[12.5px] text-[#98A0AE] dark:border-white/15">
                            {t('crmOverview.agenda.noParticipants', { defaultValue: 'Henüz katılımcı eklenmedi.' })}
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {participants.map((p) => (
                                <span
                                    key={`${p.participantType}:${p.id}`}
                                    className="flex items-center gap-1.5 rounded-full border border-black/8 bg-black/4 py-1 pl-2 pr-1 text-[12px] font-medium text-[#3F4350] dark:border-white/10 dark:bg-white/6 dark:text-[#d9dce3]"
                                >
                                    {p.participantType === 'EMPLOYEE' ? <User01 size={12} /> : <Building03 size={12} />}
                                    <span className="max-w-[160px] truncate">{p.name}</span>
                                    <button
                                        type="button"
                                        aria-label={t('common.delete', { defaultValue: 'Sil' })}
                                        onClick={() =>
                                            setParticipants((cur) =>
                                                cur.filter((x) => !(x.participantType === p.participantType && x.id === p.id)),
                                            )
                                        }
                                        className="flex size-5 items-center justify-center rounded-full text-[#98A0AE] transition-colors hover:bg-black/8 hover:text-[#1A1A1A] dark:hover:bg-white/10 dark:hover:text-white"
                                    >
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <label className="flex flex-col gap-1 text-[12.5px] font-medium text-[#3F4350] dark:text-[#d9dce3]">
                    {t('crmOverview.agenda.fieldNotes', { defaultValue: 'Not (isteğe bağlı)' })}
                    <textarea
                        rows={3}
                        value={draft.notes}
                        onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                        className={`resize-none ${inputCls}`}
                    />
                </label>
            </div>

            <ParticipantPickerModal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                initial={participants}
                onConfirm={setParticipants}
            />
        </Modal>
    );
};
