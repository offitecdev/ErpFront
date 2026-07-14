import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    CalendarPlus01 as CalendarPlus,
    Edit01 as Pencil,
    File05 as FileText,
    Mail01 as Mail,
    Plus,
    Trash01 as Trash2,
    XClose as X,
} from '@/components/icons/antIconCompat';

import { Button } from '@/components/ui-shared/Button';
import { Field, Input, Select } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { projectApi } from '@/lib/api/project';
import { tenderApi } from '@/lib/api/tender';
import { useAuthStore } from '@/store/authStore';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';
import { useTenderStore } from '@/store/tenderStore';
import type { OfferScheduleSlotDto, TenderMaterialUsageDto } from '@/types/tender';
import type { ProjectMaterial } from '@/types/project';
import { t } from '@/i18n/translate';
import { toCurrencyCode } from '@/utils/currency';
import { localizeTenderNumber } from '@/utils/tenderNumber';
import {
    flattenTenderTreeForPdf,
    fmtNumber,
    type TreeNode,
} from '../../tenderDetailUtils';
import { useMoneyFormat } from '../../utils/useMoneyFormat';
import { RichTextMarkdownEditor, looksLikeRichHtml } from '../../TenderRichText';
import { MailDraftsDrawer } from '../mail/MailDraftsDrawer';
import type { TenderPdfTotals } from '@/utils/pdf/tenderPdf';

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
};

type TenderSettingsTabKey = 'mail' | 'schedule' | 'overtime' | 'materials';

type TenderSettingsModalProps = {
    open: boolean;
    onClose: () => void;
    tenderId: string;
    tree: TreeNode[];
    grandTotal: number;
    /** Belge düzeyi indirim özeti (mail PDF'inde indirim satırı için). */
    pdfTotals?: TenderPdfTotals | null;
    initialTab?: TenderSettingsTabKey;
    inline?: boolean;
    hideTabs?: boolean;
    overtimeHourlyRate: number;
    onOvertimeHourlyRateChange: (value: number) => void;
    onChanged: () => Promise<void>;
};

export const TenderSettingsModal: React.FC<TenderSettingsModalProps> = ({ open, onClose, tenderId, tree, grandTotal, pdfTotals, initialTab = 'mail', inline = false, hideTabs = false, overtimeHourlyRate, onOvertimeHourlyRateChange, onChanged }) => {
    const { detail, activities } = useTenderStore();
    // Prices in the modal (position list, material costs) follow the offer's currency.
    const fmtMoney = useMoneyFormat();
    const { user } = useAuthStore();
    const { settings } = usePdfSettingsStore();
    const [slots, setSlots] = useState<OfferScheduleSlotDto[]>([]);
    const [slotForm, setSlotForm] = useState({ date: dayjs().format('YYYY-MM-DD'), start: '09:00', end: '17:00', notes: '' });
    const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TenderSettingsTabKey>(initialTab);
    const [localOvertimeRate, setLocalOvertimeRate] = useState(overtimeHourlyRate || 0);
    const [availableMaterials, setAvailableMaterials] = useState<ProjectMaterial[]>([]);
    const [tenderMaterials, setTenderMaterials] = useState<TenderMaterialUsageDto[]>([]);
    const [materialForm, setMaterialForm] = useState({ materialId: '', quantity: 1, description: '' });
    const [materialLoading, setMaterialLoading] = useState(false);
    const [materialSaving, setMaterialSaving] = useState(false);
    const [form, setForm] = useState({
        fromName:t('tenders.offitec_erp'),
        fromEmail: user?.email || '',
        to: '',
        subject: '',
        message:t('tenders.merhaba_teklifimizi_pdf_olarak_ekte_iletiyoruz_p'),
    });
    const [loading, setLoading] = useState(false);
    // Side pop-up with the database-backed, tenant-wide mail drafts. Stays open
    // until explicitly closed.
    const [draftsOpen, setDraftsOpen] = useState(false);

    const loadSlots = async () => {
        if (!open) return;
        try {
            setSlots(await tenderApi.getScheduleSlots(tenderId));
        } catch {
            setSlots([]);
        }
    };

    const loadMaterials = async () => {
        if (!open) return;
        setMaterialLoading(true);
        try {
            const [materials, usages] = await Promise.all([
                projectApi.materials(),
                tenderApi.getMaterials(tenderId),
            ]);
            setAvailableMaterials(materials);
            setTenderMaterials(usages);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.materials_yuklenemedi'));
        } finally {
            setMaterialLoading(false);
        }
    };

    useEffect(() => {
        if (!open || !detail) return;
        setActiveTab(initialTab);
        setLocalOvertimeRate(overtimeHourlyRate || 0);
        setForm((prev) => ({
            ...prev,
            to: detail.tender.customerEmail || '',
            subject: t('tenders.tender_email_subject', { number: localizeTenderNumber(detail.tender.tenderNumber) }),
        }));
    }, [open, detail?.tender.id, overtimeHourlyRate, initialTab]);

    // Fetch each tab's data lazily, only when that tab is actually shown. The Mail
    // tab (the only one surfaced from the tender workspace) needs neither schedule
    // slots nor materials, so switching to it no longer fires those network calls.
    useEffect(() => {
        if (!open || !detail) return;
        if (activeTab === 'schedule') void loadSlots();
        else if (activeTab === 'materials') void loadMaterials();
    }, [open, detail?.tender.id, activeTab]);

    const selectedTenderMaterial = useMemo(
        () => availableMaterials.find((material) => material.id === materialForm.materialId) || null,
        [availableMaterials, materialForm.materialId]
    );

    const addTenderMaterial = async () => {
        if (!materialForm.materialId) return toast.error(t('tenders.material_select'));
        const quantity = Number(materialForm.quantity || 0);
        if (quantity <= 0) return toast.error(t('tenders.quantity_0dan_buyuk_olmali'));
        setMaterialSaving(true);
        try {
            const res = await tenderApi.mapMaterial(tenderId, materialForm.materialId, quantity, materialForm.description);
            setTenderMaterials((prev) => [res.usage, ...prev]);
            setAvailableMaterials((prev) => prev.map((material) =>
                material.id === materialForm.materialId
                    ? { ...material, stockQuantity: Math.max(0, Number(material.stockQuantity || 0) - quantity) }
                    : material
            ));
            setMaterialForm({ materialId: '', quantity: 1, description: '' });
            toast.success(t('tenders.material_added_fiyata_dahil_edilmedi'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.material_eklenemedi'));
        } finally {
            setMaterialSaving(false);
        }
    };

    const removeTenderMaterial = async (usage: TenderMaterialUsageDto) => {
        setMaterialSaving(true);
        try {
            await tenderApi.removeMaterialMapping(tenderId, usage.id);
            setTenderMaterials((prev) => prev.filter((item) => item.id !== usage.id));
            setAvailableMaterials((prev) => prev.map((material) =>
                material.id === usage.materialId
                    ? { ...material, stockQuantity: Number(material.stockQuantity || 0) + Number(usage.quantity || 0) }
                    : material
            ));
            toast.success(t('tenders.material_kaldirildi'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.material_kaldirilamadi'));
        } finally {
            setMaterialSaving(false);
        }
    };
    void removeTenderMaterial;

    const resetSlotForm = () => {
        setEditingSlotId(null);
        setSlotForm({ date: dayjs().format('YYYY-MM-DD'), start: '09:00', end: '17:00', notes: '' });
    };

    const saveSlot = async () => {
        const startTime = dayjs(`${slotForm.date}T${slotForm.start}`).toISOString();
        const endTime = dayjs(`${slotForm.date}T${slotForm.end}`).toISOString();
        if (!dayjs(endTime).isAfter(dayjs(startTime))) return toast.error(t('tenders.bitis_saati_baslangictan_sonra_olmalidir'));
        try {
            if (editingSlotId) {
                await tenderApi.updateScheduleSlot(tenderId, editingSlotId, { startTime, endTime, notes: slotForm.notes });
                toast.success(t('tenders.appointment_updated'));
            } else {
                await tenderApi.createScheduleSlot(tenderId, { startTime, endTime, notes: slotForm.notes });
                toast.success(t('tenders.appointment_added'));
            }
            resetSlotForm();
            await loadSlots();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.appointment_kaydedilemedi'));
        }
    };

    const send = async () => {
        if (!detail) return;
        setLoading(true);
        try {
            onOvertimeHourlyRateChange(Math.max(0, Number(localOvertimeRate || 0)));
            const overtimeNoteText = `Not: Planlanan gÃ¼nlÃ¼k Ã§alÄ±ÅŸma sÃ¼resinin %15 Ã¼zerindeki fazla Ã§alÄ±ÅŸmalar ${localOvertimeRate} CHF/saat Ã¼zerinden ayrÄ±ca hesaplanÄ±r.`;
            // The message may now be rich HTML; append the note in kind.
            const overtimeNote = Number(localOvertimeRate || 0) > 0
                ? (looksLikeRichHtml(form.message) ? `<br><br>${overtimeNoteText}` : `\n\n${overtimeNoteText}`)
                : '';
            const { buildTenderPdfBytes } = await import('@/utils/pdf/tenderPdf');
            const pdfBytes = await buildTenderPdfBytes({
                tenderNumber: detail.tender.tenderNumber,
                version: detail.tender.version,
                createdAt: detail.tender.createdAt,
                validUntil: detail.tender.validUntil,
                customerName: detail.tender.customerName || '',
                customerAddress: detail.tender.customerAddress,
                customerEmail: detail.tender.customerEmail,
                customerPhone: detail.tender.customerPhone,
                createdByName: detail.tender.createdByName,
                activities,
                positions: flattenTenderTreeForPdf(tree),
                grandTotal,
                totals: pdfTotals ?? null,
            }, { ...settings, currency: toCurrencyCode((detail.tender as { currency?: string | null }).currency) });
            const res = await tenderApi.sendOfferMail(tenderId, {
                ...form,
                message: `${form.message}${overtimeNote}`,
                attachments: [{
                    filename: `${localizeTenderNumber(detail.tender.tenderNumber, 'de')}.pdf`,
                    contentType: 'application/pdf',
                    contentBase64: bytesToBase64(pdfBytes),
                }],
            });
            toast.success(res.message ||t('tenders.tender_maili_gonderildi'));
            await onChanged();
            onClose();
        } catch (e: any) {
            toast.error(e.response?.data?.error || e.message ||t('tenders.tender_maili_gonderilemedi'));
        } finally {
            setLoading(false);
        }
    };

    const tabs = [
        { key: 'mail' as const, label:t('tenders.mail') },
        { key: 'overtime' as const, label:t('tenders.additional_fee') },
        { key: 'schedule' as const, label:t('tenders.appointment') },
        { key: 'materials' as const, label:t('nav.materials') },
    ];

    const usedMaterials = tenderMaterials.map((item) => ({
        id: item.id,
        serialLabel: item.material?.serialId || '-',
        name: item.material?.name ||t('tenders.material'),
        quantity: item.quantity || 0,
        unit: 'adet',
        unitPrice: item.unitCost || 0,
        total: Number(item.quantity || 0) * Number(item.unitCost || 0),
    }));

    const content = (
        <div className={inline ?"flex flex-col" :"flex h-full min-h-[calc(100dvh-9rem)] flex-col"}>
                {!hideTabs && (
                    <div className="mb-6 flex items-center gap-8 border-b border-slate-200">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`border-b-2 px-0 pb-3 pt-1 text-sm font-semibold transition-colors ${
                                activeTab === tab.key ?"border-blue-700 text-blue-700" :"border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                    </div>
                )}

                {activeTab === 'mail' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-end">
                            <button
                                type="button"
                                title={t('tenders.mail_drafts')}
                                onClick={() => setDraftsOpen(true)}
                                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors ${
                                    draftsOpen
                                        ? 'border-blue-700 bg-blue-50 text-blue-700'
                                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
                                }`}
                            >
                                <FileText size={13} />
                                {t('tenders.mail_drafts')}
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('settings.mail.senderName')}><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                            <Field label={t('settings.mail.senderEmail')}><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
                        </div>
                        <Field label={t('tenders.alici')}><Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
                        <Field label={t('tenders.konu')}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-sm font-medium text-secondary">{t('tenders.additional_mesaj')}</span>
                            <RichTextMarkdownEditor
                                value={form.message}
                                onChange={(message) => setForm((prev) => ({ ...prev, message }))}
                                minHeight={220}
                                placeholder=""
                            />
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{t('tenders.mail_gondermek_opsiyoneldir_order_olusturmak_i')}</div>
                    </div>
                )}

                {activeTab === 'schedule' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                        <div className="xl:col-span-2">
                            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
                                <Field label={t('common.date')}><Input type="date" value={slotForm.date} onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })} /></Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label={t('common.start')}><Input type="time" value={slotForm.start} onChange={(e) => setSlotForm({ ...slotForm, start: e.target.value })} /></Field>
                                    <Field label={t('common.end')}><Input type="time" value={slotForm.end} onChange={(e) => setSlotForm({ ...slotForm, end: e.target.value })} /></Field>
                                </div>
                                <Field label={t('tenders.note')}><Input value={slotForm.notes} onChange={(e) => setSlotForm({ ...slotForm, notes: e.target.value })} /></Field>
                                <div className="flex gap-2">
                                    <Button className="flex-1" icon={<CalendarPlus size={13} />} onClick={saveSlot}>
                                        {editingSlotId ?t('tenders.randevuyu_update') :t('tenders.appointment_add')}
                                    </Button>
                                    {editingSlotId && (
                                        <Button variant="secondary" icon={<X size={13} />} onClick={resetSlotForm}>{t('common.cancel')}</Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="xl:col-span-3">
                            <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                                {slots.length === 0 && <div className="px-3 py-10 text-center text-[12px] text-slate-400">{t('tenders.appointment_not_found')}</div>}
                                {slots.map((slot) => (
                                    <div key={slot.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[12.5px]">
                                        <div>
                                            <div className="font-medium text-slate-800">{dayjs(slot.startTime).format('DD.MM.YYYY')}</div>
                                            <div className="text-slate-500">{dayjs(slot.startTime).format('HH:mm')} - {dayjs(slot.endTime).format('HH:mm')}</div>
                                            {slot.notes && <div className="mt-1 text-[11.5px] text-slate-400">{slot.notes}</div>}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                                                onClick={() => {
                                                    setEditingSlotId(slot.id);
                                                    setSlotForm({
                                                        date: dayjs(slot.startTime).format('YYYY-MM-DD'),
                                                        start: dayjs(slot.startTime).format('HH:mm'),
                                                        end: dayjs(slot.endTime).format('HH:mm'),
                                                        notes: slot.notes || '',
                                                    });
                                                }}
                                            >
                                                <Pencil size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                onClick={async () => {
                                                    await tenderApi.deleteScheduleSlot(tenderId, slot.id);
                                                    if (editingSlotId === slot.id) resetSlotForm();
                                                    await loadSlots();
                                                }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'overtime' && (
                    <div className="max-w-xl space-y-4">
                        <Field label={t('tenders.15_uzeri_fazla_work_saat_ucreti_chf')}>
                            <Input
                                type="number"
                                value={localOvertimeRate}
                                onChange={(event) => setLocalOvertimeRate(Number(event.target.value) || 0)}
                                placeholder="0"
                            />
                        </Field>
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">{t('tenders.bu_field_empty_when_empty_ya_da_0_girilirse_15_uze')}</div>
                        <Button onClick={() => { onOvertimeHourlyRateChange(Math.max(0, Number(localOvertimeRate || 0))); toast.success(t('tenders.fazla_work_saat_ucreti_hazir')); }}>{t('tenders.ucreti_uygula')}</Button>
                    </div>
                )}

                {activeTab === 'materials' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-md border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2">
                                <h3 className="text-[12px] font-semibold text-slate-800">{t('tenders.used_materials')}</h3>
                                <p className="mt-0.5 text-[11px] text-slate-500">{t('tenders.bu_fiyatlar_gorunur_ancak_tender_toplamina_dahil')}</p>
                            </div>
                            {usedMaterials.length === 0 ? (
                                <div className="px-3 py-8 text-center text-[12px] text-slate-400">{t('tenders.used_material_not_found')}</div>
                            ) : (
                                <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                                    {usedMaterials.map((item) => (
                                        <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                                            <div className="min-w-0">
                                                <div className="truncate text-[12.5px] font-medium text-slate-800">{item.name}</div>
                                                <div className="mt-0.5 text-[11px] font-mono text-slate-500">
                                                    {item.serialLabel} Â· {fmtNumber(item.quantity)} {item.unit} x {fmtMoney(item.unitPrice)}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="font-mono text-[12px] font-semibold text-slate-800">{fmtMoney(item.total)}</div>
                                                <div className="text-[10px] text-slate-400">{t('tenders.dahil_not')}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2">
                                <h3 className="text-[12px] font-semibold text-slate-800">{t('nav.materials')}</h3>
                                <p className="mt-0.5 text-[11px] text-slate-500">{t('tenders.material_stock_duser_price_only_info_amacli')}</p>
                            </div>
                            <div className="space-y-3 p-3">
                                <Field label={t('tenders.material')}>
                                    <Select
                                        value={materialForm.materialId}
                                        onChange={(event) => setMaterialForm({ ...materialForm, materialId: event.target.value })}
                                        disabled={materialLoading || materialSaving}
                                    >
                                        <option value="">{t('tenders.material_select')}</option>
                                        {availableMaterials.map((material) => (
                                            <option key={material.id} value={material.id}>
                                                {material.serialId} Â· {material.name}{t('tenders.mevcut')}{fmtNumber(material.stockQuantity)}{t('tenders.adet')}</option>
                                        ))}
                                    </Select>
                                </Field>
                                {selectedTenderMaterial && (
                                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                                        <div className="flex items-center justify-between gap-3">
                                            <span>{selectedTenderMaterial.name}</span>
                                            <span className="font-mono">{fmtMoney(selectedTenderMaterial.unitCost)}</span>
                                        </div>
                                        <div className="mt-1 font-mono text-[11px] text-slate-500">{t('tenders.stock')}{fmtNumber(selectedTenderMaterial.stockQuantity)}{t('tenders.adet')}</div>
                                    </div>
                                )}
                                <Field label={t('common.quantity')}>
                                    <Input type="number" min={1} step="1" value={materialForm.quantity} onChange={(event) => setMaterialForm({ ...materialForm, quantity: Number(event.target.value) || 0 })} />
                                </Field>
                                <Field label={t('common.description')}>
                                    <Input value={materialForm.description} onChange={(event) => setMaterialForm({ ...materialForm, description: event.target.value })} />
                                </Field>
                                <Button className="w-full" icon={<Plus size={13} />} loading={materialSaving} disabled={!materialForm.materialId || materialForm.quantity <= 0} onClick={addTenderMaterial}>{t('tenders.material_add')}</Button>
                            </div>
                        </div>
                    </div>
                )}

                {(!inline || activeTab === 'mail') && (
                <div className={`${inline ? 'mt-6' : 'mt-auto'} flex items-center justify-end gap-2 border-t border-slate-200 pt-4`}>
                    {!inline && <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>}
                    {activeTab === 'mail' && (
                        <Button variant="primary" loading={loading} icon={<Mail size={13} />} onClick={send}>{t('tenders.pdf_ile_tender_maili_gonder')}</Button>
                    )}
                </div>
                )}

                {/* Side pop-up: database-backed mail drafts, shared by all offers. */}
                <MailDraftsDrawer
                    open={draftsOpen}
                    onClose={() => setDraftsOpen(false)}
                    currentSubject={form.subject}
                    currentMessage={form.message}
                    onApply={(draft) => setForm((prev) => ({ ...prev, subject: draft.subject, message: draft.message || '' }))}
                />
        </div>
    );

    if (inline) {
        if (!open) return null;
        return (
            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                {content}
            </div>
        );
    }

    return (
        <Modal
            open={open}
            title={t('tenders.tender_settings')}
            description={t('tenders.mail_additional_fee_ve_appointment_ayarlarini_tek_place_y')}
            onClose={onClose}
            placement="drawer"
            drawerWidth="wide"
            closeOnBackdrop={false}
            closeOnEscape={false}
        >
            {content}
        </Modal>
    );
};
