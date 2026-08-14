import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { ChevronDown, ChevronUp, File02 as FileIcon, Plus, Save01 as Save, Trash01 as Trash } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { CELL_INPUT_CLASS, SectionCard } from '@/components/ui-shared/TableKit';
import { ComboCell } from '@/pages/inventory/components/ComboCell';
import { ReportImageUploader } from '@/components/ui-shared/ReportImageUploader';
import { ChecklistTemplateModal } from '@/components/checklists/ChecklistTemplateModal';
import {
    checklistApi,
    deliveryReportApi,
    type ChecklistTemplateDto,
    type DeliveryReportDto,
    type DeliveryResponseItem,
    type DeliveryStatus,
} from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';

import { orderPayloadId } from '../../../utils/projectOrderScope';

const newId = () => Math.random().toString(36).slice(2, 10);

const STATUS_OPTIONS: Array<{ value: Exclude<DeliveryStatus, null>; labelKey: string; tone: string }> = [
    { value: 'YES', labelKey: 'projects.delivery.yes', tone: 'text-emerald-700' },
    { value: 'NO', labelKey: 'projects.delivery.no', tone: 'text-rose-700' },
    { value: 'NA', labelKey: 'projects.delivery.na', tone: 'text-slate-500' },
];

/**
 * Madde ekleme satırı — saha raporundaki malzeme arama kutusuyla aynı dilde:
 * yazınca kayıtlı listelerdeki (taslak dahil) maddeler önerilir, seçim doğrudan
 * rapora eklenir; eşleşme yoksa Enter yazılan metni bu rapora ÖZGÜ yeni madde
 * olarak ekler (taslağa eklenmedikçe yalnız bu raporda kalır).
 */
const AddCheckRow = ({ colSpan, templates, onAdd }: {
    colSpan: number;
    templates: ChecklistTemplateDto[];
    onAdd: (label: string, measurement?: boolean) => void;
}) => {
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);

    const query = text.trim().toLowerCase();
    const pool = templates.flatMap((tpl) =>
        (Array.isArray(tpl.items) ? tpl.items : []).map((item) => ({ tplName: tpl.name, item })));
    const matches = pool
        .filter(({ item }) => item.label && (!query || item.label.toLowerCase().includes(query)))
        .slice(0, 7);

    const commitNew = () => {
        const label = text.trim();
        if (!label) return;
        onAdd(label, true);
        setText('');
    };

    return (
        <tr>
            <td colSpan={colSpan}>
                <ComboCell
                    open={open}
                    onOpenChange={setOpen}
                    value={text}
                    onChange={setText}
                    options={matches.map(({ tplName, item }, index) => ({
                        id: `${index}`,
                        label: item.label,
                        meta: tplName,
                    }))}
                    loading={false}
                    onSelect={(option) => {
                        const found = matches[Number(option.id)];
                        if (found) onAdd(found.item.label, Boolean(found.item.measurement));
                        setText('');
                    }}
                    keepOpenOnSelect
                    placeholder={t('projects.delivery.addCheckPlaceholder')}
                    emptyText={t('projects.delivery.addCheck')}
                    actions={[{
                        key: 'new',
                        icon: <Plus size={12} />,
                        label: t('projects.delivery.addCheck'),
                        onSelect: commitNew,
                    }]}
                />
            </td>
        </tr>
    );
};

/**
 * Teslim/Übergabe raporu editörü — yeniden kuruldu (kullanıcı isteği):
 *  - Rapor, TEK TEK eklenebilen kontrol listesi TÜRLERİNDEN oluşur; her liste
 *    yalnızca ADIYLA başlıklı DAR bir tablodur (kategori/alt başlık yok) ve
 *    sonundaki satırdan kesintisiz yeni kontrol maddesi eklenir.
 *  - "Listeler" bölümü kayıtlı şablonları (taslak dahil) kolay seçimle sunar;
 *    "Yeni liste" büyük popup'ta oluşturulur ve anında rapora eklenir.
 *  - Rapora FOTO eklenebilir (report.images) — saha görsellerinden bağımsız.
 *  - Kaydet, popup başlığındaki sabit (kaydırmayla kaybolmayan) düğmedir
 *    (`actionsHost` portalı); host verilmezse altta çizilir.
 * Değişiklikler YEREL tutulur ve Kaydet ile tek istekte yazılır.
 */
export const DeliveryChecklistView = ({
    project,
    order,
    appointment,
    onChanged,
    actionsHost,
}: {
    project: ProjectDto;
    order: { id: string } | null;
    appointment: any;
    /** Informs the sheet when the report appears/changes (drives its PDF glyph). */
    onChanged?: (report: DeliveryReportDto | null) => void;
    /** Popup başlığındaki sabit aksiyon alanı — Kaydet buraya portallanır. */
    actionsHost?: HTMLElement | null;
}) => {
    const [report, setReport] = useState<DeliveryReportDto | null>(null);
    const [responses, setResponses] = useState<DeliveryResponseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [templates, setTemplates] = useState<ChecklistTemplateDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [templateModal, setTemplateModal] = useState(false);
    /** Aşağı okla genişletilmiş satırlar: tam genişlik açıklama alanı açılır. */
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const toggleExpanded = (id: string) => setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const adopt = (row: DeliveryReportDto | null) => {
        setReport(row);
        setResponses(((row?.responses || []) as DeliveryResponseItem[]).map((x) => ({ ...x })));
        setNotes(row?.notes || '');
        setImages((row?.images || []).map((img) => img.imageData).filter(Boolean));
        onChanged?.(row);
    };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([
            deliveryReportApi.getByAppointment(appointment.id).catch(() => null),
            checklistApi.list().catch(() => [] as ChecklistTemplateDto[]),
        ]).then(([row, tpls]) => {
            if (cancelled) return;
            adopt(row);
            setTemplates(tpls);
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appointment.id]);

    // ── Rapordaki listeler: kategori = liste adı (eski kayıtlar da böyle akar) ──
    const checklists = useMemo(() => {
        const names: string[] = [];
        for (const row of responses) {
            const key = row.category?.trim() || report?.checklistName || t('projects.delivery.uncategorized');
            if (!names.includes(key)) names.push(key);
        }
        return names.map((name) => ({
            name,
            items: responses.filter((row) => (row.category?.trim() || report?.checklistName || t('projects.delivery.uncategorized')) === name),
        }));
    }, [responses, report?.checklistName]);

    const addedNames = useMemo(() => new Set(checklists.map((c) => c.name)), [checklists]);

    const addTemplate = (tpl: ChecklistTemplateDto) => {
        const rows: DeliveryResponseItem[] = (Array.isArray(tpl.items) ? tpl.items : []).map((item) => ({
            id: newId(),
            category: tpl.name,
            label: item.label,
            status: null,
            measurement: '',
            measurementEnabled: Boolean(item.measurement),
        }));
        if (rows.length === 0) return;
        setResponses((prev) => [...prev, ...rows]);
    };

    const addCheck = (checklistName: string, label: string, measurementEnabled = true) => {
        setResponses((prev) => [...prev, {
            id: newId(),
            category: checklistName,
            label,
            status: null,
            measurement: '',
            measurementEnabled,
        }]);
    };

    const removeChecklist = (checklistName: string) => {
        setResponses((prev) => prev.filter((row) =>
            (row.category?.trim() || report?.checklistName || t('projects.delivery.uncategorized')) !== checklistName));
    };

    const removeCheck = (id: string) => setResponses((rows) => rows.filter((r) => r.id !== id));
    const setStatus = (id: string, status: DeliveryStatus) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    const setMeasurement = (id: string, measurement: string) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, measurement } : r)));

    const save = async () => {
        if (responses.length === 0) return toast.error(t('projects.delivery.needChecklist'));
        setSaving(true);
        try {
            const imagePayload = images.map((imageData) => ({ imageData }));
            let updated: DeliveryReportDto;
            if (report) {
                updated = await deliveryReportApi.update(report.id, {
                    responses,
                    notes: notes.trim() || null,
                    checklistName: checklists[0]?.name || report.checklistName,
                    images: imagePayload,
                });
            } else {
                updated = await deliveryReportApi.create({
                    projectId: project.id,
                    salesOrderId: orderPayloadId(order as any),
                    appointmentId: appointment.id,
                    checklistName: checklists[0]?.name || null,
                    responses,
                    notes: notes.trim() || null,
                    images: imagePayload,
                });
            }
            adopt(updated);
            toast.success(t('projects.delivery.admin.saved'));
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.delivery.admin.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const saveButton = (
        <Button variant="primary" size="sm" icon={<Save size={13} />} loading={saving} disabled={loading} onClick={() => void save()}>
            {t('common.save')}
        </Button>
    );

    if (loading) {
        return <div className="h-40 animate-pulse rounded-[3px] bg-slate-100" />;
    }

    // Rapora henüz eklenmemiş şablonlar — "kolay seçim" bölümü.
    const availableTemplates = templates.filter((tpl) => !addedNames.has(tpl.name));

    return (
        <div className="space-y-5">
            {actionsHost ? createPortal(saveButton, actionsHost) : null}

            {report?.isSigned && (
                <div className="rounded-[3px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('projects.delivery.admin.signedNote')}</div>
            )}

            {/* ── Rapordaki listeler: liste adı başlıklı DAR tablolar ── */}
            {checklists.map((checklist) => (
                <SectionCard
                    key={checklist.name}
                    title={checklist.name}
                    action={(
                        <button
                            type="button"
                            title={t('projects.delivery.removeChecklist')}
                            aria-label={t('projects.delivery.removeChecklist')}
                            onClick={() => removeChecklist(checklist.name)}
                            className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600"
                        >
                            <Trash size={13} />
                        </button>
                    )}
                >
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <tbody>
                            {checklist.items.map((row) => {
                                const expanded = expandedIds.has(row.id);
                                return (
                                <Fragment key={row.id}>
                                <tr>
                                    <td className="text-slate-800 dark:text-white">{row.label}</td>
                                    <td className="w-52">
                                        <div className="flex items-center gap-3">
                                            {STATUS_OPTIONS.map((opt) => (
                                                <label key={opt.value} className="flex items-center gap-1 text-[12.5px] font-medium">
                                                    <input type="radio" name={`dlv-${row.id}`} checked={row.status === opt.value} onChange={() => setStatus(row.id, opt.value)} />
                                                    <span className={opt.tone}>{t(opt.labelKey)}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="w-44">
                                        {expanded ? (
                                            <span className="text-[11.5px] text-slate-400 dark:text-white/40">↓</span>
                                        ) : (
                                            <input
                                                type="text"
                                                value={row.measurement}
                                                placeholder={t('projects.delivery.measurementPlaceholder')}
                                                onChange={(e) => setMeasurement(row.id, e.target.value)}
                                                className={CELL_INPUT_CLASS}
                                            />
                                        )}
                                    </td>
                                    <td className="w-16">
                                        <div className="flex items-center justify-end gap-1">
                                            {/* Aşağı ok: satırı genişletir, açıklamaya TAM genişlik verir. */}
                                            <button
                                                type="button"
                                                title={t('projects.delivery.expandRow')}
                                                aria-label={t('projects.delivery.expandRow')}
                                                aria-expanded={expanded}
                                                onClick={() => toggleExpanded(row.id)}
                                                className="ofi-rs-iconbtn inline-flex size-6 items-center justify-center rounded-[2px] border transition-colors"
                                            >
                                                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                            </button>
                                            <button
                                                type="button"
                                                title={t('common.delete')}
                                                aria-label={t('common.delete')}
                                                onClick={() => removeCheck(row.id)}
                                                className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600"
                                            >
                                                <Trash size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                {expanded && (
                                    <tr>
                                        <td colSpan={4}>
                                            <textarea
                                                rows={3}
                                                autoFocus
                                                value={row.measurement}
                                                placeholder={t('projects.delivery.measurementPlaceholder')}
                                                onChange={(e) => setMeasurement(row.id, e.target.value)}
                                                className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-[#1f2654] dark:border-white/15 dark:bg-transparent dark:text-white"
                                            />
                                        </td>
                                    </tr>
                                )}
                                </Fragment>
                                );
                            })}
                            {/* Kesintisiz madde ekleme — arama + rapora özgü yeni madde. */}
                            <AddCheckRow colSpan={4} templates={templates} onAdd={(label, measurement) => addCheck(checklist.name, label, measurement)} />
                        </tbody>
                    </table>
                </SectionCard>
            ))}

            {/* ── Kayıtlı listelerden kolay seçim + yeni liste popup'ı ── */}
            <SectionCard
                title={t('projects.delivery.addChecklist')}
                action={(
                    <div className="flex items-center gap-1.5">
                        {/* Taslaklar ayrı sayfada yönetilir (madde silme dahil). */}
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={<FileIcon size={12} />}
                            onClick={() => window.open(`${window.location.origin}/settings/checklists`, '_blank')}
                        >
                            {t('settings.checklist.drafts')}
                        </Button>
                        <Button variant="secondary" size="sm" icon={<Plus size={12} />} onClick={() => setTemplateModal(true)}>
                            {t('projects.delivery.newChecklist')}
                        </Button>
                    </div>
                )}
            >
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <tbody>
                        {availableTemplates.map((tpl) => (
                            <tr key={tpl.id} className="cursor-pointer hover:bg-slate-50/70 dark:hover:bg-white/5" onClick={() => addTemplate(tpl)}>
                                <td className="font-medium text-slate-800 dark:text-white">
                                    {tpl.name}
                                    {tpl.isActive === false && (
                                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500 dark:bg-white/10 dark:text-white/60">
                                            {t('settings.checklist.draft')}
                                        </span>
                                    )}
                                </td>
                                <td className="w-28 text-right tabular-nums text-slate-500 dark:text-white/60">
                                    {t('settings.checklist.itemsCount', { count: Array.isArray(tpl.items) ? tpl.items.length : 0 })}
                                </td>
                                <td className="w-14">
                                    <div className="flex items-center justify-end">
                                        <span className="ofi-rs-iconbtn inline-flex size-6 items-center justify-center rounded-[2px] border transition-colors">
                                            <Plus size={13} />
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {availableTemplates.length === 0 && (
                            <tr>
                                <td colSpan={3} className="py-4 text-center text-[12.5px] text-slate-400 dark:text-white/50">
                                    {t('projects.delivery.allChecklistsAdded')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </SectionCard>

            {/* ── Foto ekleri — rapora gömülür, saha görsellerinden bağımsız. ── */}
            <SectionCard title={t('projects.delivery.photos')}>
                <div className="p-4">
                    <ReportImageUploader value={images} onChange={setImages} />
                </div>
            </SectionCard>

            <SectionCard title={t('projects.delivery.notes')}>
                <textarea
                    rows={3}
                    className="w-full resize-y bg-white px-4 py-3 text-[13.5px] text-slate-800 outline-none dark:bg-transparent dark:text-white"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </SectionCard>

            {!actionsHost && (
                <div className="flex items-center justify-end border-t border-dashed border-slate-300 pt-3">
                    {saveButton}
                </div>
            )}

            <ChecklistTemplateModal
                open={templateModal}
                template={null}
                onClose={() => setTemplateModal(false)}
                onSaved={(saved) => {
                    // Yeni oluşturulan liste hem şablonlara girer hem rapora eklenir.
                    setTemplates((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)]);
                    addTemplate(saved);
                }}
            />
        </div>
    );
};
