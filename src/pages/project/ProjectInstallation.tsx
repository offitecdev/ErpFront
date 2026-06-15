import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowLeft, ArrowRight, Calendar, CheckCircle, Clipboard, Clock, PackagePlus, Plus, Receipt, Save01 as Save, SearchLg as Search, Trash01 as Trash } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { projectApi } from '../../lib/api/project';
import type { AppointmentDto, ProjectMaterial } from '../../types/project';
import { SignatureModal } from '../maintenance/MaintenanceShared';

import { t } from '@/i18n/translate';

type InstallationAppointment = AppointmentDto & {
    salesOrder?: { id: string; orderNumber: string; parentSalesOrderId?: string | null; revisionNumber?: number | null; tender?: any } | null;
    project?: any;
};
type InstallationDetailTab = 'reports' | 'costs' | 'materials';
type InstallationMaterialMode = 'used' | 'extra';
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

const dayKey = (value?: string | null) => value ? dayjs(value).format('YYYY-MM-DD') : '';
const eventStart = (appointment: InstallationAppointment) => dayjs(appointment.startTime);
const eventEnd = (appointment: InstallationAppointment) => dayjs(appointment.endTime);

const findReport = (appointment?: InstallationAppointment | null) => {
    if (!appointment?.project?.reports) return null;
    return appointment.project.reports.find((report: any) => {
        const sameDay = dayKey(report.workDate || report.reportDate || report.startedAt) === dayKey(appointment.startTime);
        const sameOrder = (report.salesOrderId || null) === (appointment.salesOrderId || null);
        return sameDay && sameOrder;
    }) || null;
};

const installationState = (appointment: InstallationAppointment, report: any) => {
    if (report || appointment.status === 'COMPLETED') return { label: report?.isSigned ?t('auto.bitti') :t('auto.imza_bekliyor'), tone: 'emerald' };
    if (dayjs().isBefore(eventStart(appointment), 'day')) return { label:t('auto.daha_baslamadi'), tone: 'slate' };
    if (dayjs().isBefore(eventStart(appointment))) return { label:t('auto.bugun_baslayacak'), tone: 'amber' };
    return { label:t('auto.basladi'), tone: 'blue' };
};

const StatusBadge = ({ label, tone }: { label: string; tone: string }) => {
    const styles: Record<string, string> = {
        emerald:"border-emerald-200 bg-emerald-50 text-emerald-800",
        slate:t('auto.border_slate_200_bg_slate_50_text_slate_700'),
        amber:"border-amber-200 bg-amber-50 text-amber-800",
        blue:"border-blue-200 bg-blue-50 text-blue-800",
    };
    return <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${styles[tone] || styles.slate}`}>{label}</span>;
};

const installationDetailTabs: Array<{ key: InstallationDetailTab; label: string }> = [
    { key: 'costs', label:t('auto.harici_giderler') },
    { key: 'reports', label:t('auto.saha_raporlari') },
    { key: 'materials', label:t('nav.materials') },
];

const money = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(Number(value || 0));

const numberFmt = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(Number(value || 0));

const MaterialSearchSelect = ({
    value,
    materials,
    disabled,
    onChange,
}: {
    value: string;
    materials: ProjectMaterial[];
    disabled?: boolean;
    onChange: (materialId: string) => void;
}) => {
    const [query, setQuery] = useState('');
    const [appliedQuery, setAppliedQuery] = useState('');
    const normalizedQuery = appliedQuery.trim().toLocaleLowerCase('tr-TR');
    const selectedMaterial = useMemo(() => materials.find((material) => material.id === value) || null, [materials, value]);
    const filteredMaterials = useMemo(() => {
        const activeMaterials = materials.filter((material) => material.isActive !== false);
        if (!normalizedQuery) return activeMaterials.slice(0, 50);
        return activeMaterials.filter((material) => {
            const haystack = `${material.name || ''} ${material.serialId || ''}`.toLocaleLowerCase('tr-TR');
            return haystack.includes(normalizedQuery);
        }).slice(0, 50);
    }, [materials, normalizedQuery]);
    const options = selectedMaterial && !filteredMaterials.some((material) => material.id === selectedMaterial.id)
        ? [selectedMaterial, ...filteredMaterials]
        : filteredMaterials;

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-2">
                <Input
                    value={query}
                    disabled={disabled || materials.length === 0}
                    placeholder={selectedMaterial ? `${selectedMaterial.name} ara veya degistir` :t('auto.malzeme_ara')}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            setAppliedQuery(query);
                        }
                    }}
                />
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<Search size={13} />}
                    disabled={disabled || materials.length === 0}
                    onClick={() => setAppliedQuery(query)}
                />
            </div>
            <Select
                value={value}
                disabled={disabled || materials.length === 0}
                onChange={(e) => {
                    onChange(e.target.value);
                    setQuery('');
                    setAppliedQuery('');
                }}
            >
                <option value="">{materials.length ?t('auto.malzeme_secin') :t('auto.malzeme_bulunamadi')}</option>
                {options.map((material) => (
                    <option key={material.id} value={material.id}>
                        {material.name} ({material.serialId ||t('auto.kod_yok')}{") - stok"}{numberFmt(material.stockQuantity)}
                    </option>
                ))}
            </Select>
            {materials.length > 0 && normalizedQuery && options.length === 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">{t('auto.arama_sonucu_yok')}</div>
            )}
        </div>
    );
};

const scopedInstallationRecords = <T extends { salesOrderId?: string | null }>(records: T[] | undefined, appointment: InstallationAppointment) => {
    const orderId = appointment.salesOrderId || appointment.salesOrder?.id || null;
    return (records || []).filter((record) => (record.salesOrderId || null) === orderId);
};

const getInstallationUsedMaterials = (appointment: InstallationAppointment) => {
    const tender = appointment.salesOrder?.tender || appointment.project?.tender;
    return [
        ...(tender?.usedMaterials || []).map((usage: any) => ({
            id: `usage-${usage.id}`,
            material: usage.material,
            quantity: Number(usage.quantity || 0),
            unitCost: Number(usage.unitCost || usage.material?.unitCost || 0),
            source: tender?.tenderNumber ||t('auto.teklif'),
            note: usage.description,
        })),
        ...((tender?.positions || []).flatMap((position: any) =>
            (position.materialMappings || []).map((mapping: any) => ({
                id: `mapping-${mapping.id}`,
                material: mapping.material,
                quantity: Number(mapping.quantityMultiplier || 0),
                unitCost: Number(mapping.material?.unitCost || 0),
                source: `${position.positionNumber ||t('auto.pozisyon')} - ${position.shortDescription || ''}`,
                note: '',
            }))
        )),
    ].filter((item) => item.quantity > 0);
};

const sumInstallationCosts = (appointment: InstallationAppointment) => {
    const expenses = scopedInstallationRecords(appointment.project?.expenses, appointment);
    const materials = scopedInstallationRecords(appointment.project?.extraMaterials, appointment);
    const reports = scopedInstallationRecords(appointment.project?.reports, appointment);
    const expenseTotal = expenses.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const materialTotal = materials.reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const overtimeTotal = reports.reduce((sum: number, item: any) => sum + Number(item.overtimeCost || 0), 0);
    return { expenses, materials, reports, expenseTotal, materialTotal, overtimeTotal, total: expenseTotal + materialTotal + overtimeTotal };
};

const InstallationDetailCard = ({
    selected,
    selectedReport,
    canFinish,
    materials,
    saving,
    operations,
    setOperations,
    technicalNotes,
    setTechnicalNotes,
    expenseRows,
    setExpenseRows,
    materialRows,
    setMaterialRows,
    usedMaterialRows,
    setUsedMaterialRows,
    onSubmit,
    onSignOnly,
    onOpenSignature,
}: {
    selected: InstallationAppointment;
    selectedReport: any;
    canFinish: boolean;
    materials: ProjectMaterial[];
    saving: boolean;
    operations: string[];
    setOperations: StateSetter<string[]>;
    technicalNotes: string;
    setTechnicalNotes: StateSetter<string>;
    expenseRows: Array<{ expenseType: string; amount: number; description: string }>;
    setExpenseRows: StateSetter<Array<{ expenseType: string; amount: number; description: string }>>;
    materialRows: Array<{ materialId: string; quantity: number; description: string }>;
    setMaterialRows: StateSetter<Array<{ materialId: string; quantity: number; description: string }>>;
    usedMaterialRows: Array<{ materialId: string; quantity: number; description: string }>;
    setUsedMaterialRows: StateSetter<Array<{ materialId: string; quantity: number; description: string }>>;
    onSubmit: () => void;
    onSignOnly: () => void;
    onOpenSignature: () => void;
}) => {
    const [activeTab, setActiveTab] = useState<InstallationDetailTab>('reports');
    const [materialMode, setMaterialMode] = useState<InstallationMaterialMode>('used');
    const costs = sumInstallationCosts(selected);
    const usedMaterials = getInstallationUsedMaterials(selected);
    const disabled = Boolean(selectedReport) || !canFinish || saving;
    const activeMaterialRows = materialMode === 'used' ? usedMaterialRows : materialRows;
    const setActiveMaterialRows = materialMode === 'used' ? setUsedMaterialRows : setMaterialRows;

    return (
        <Card title={t('auto.teknisyen_montaj_ekrani')} icon={<Clipboard size={13} />}>
            <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold text-slate-500">{selected.salesOrder?.orderNumber}</div>
                            <div className="truncate text-[15px] font-semibold text-slate-950">{selected.project?.projectName}</div>
                            <div className="mt-1 text-[12px] text-slate-600">{selected.project?.customer?.companyName}</div>
                        </div>
                        <StatusBadge {...installationState(selected, selectedReport)} />
                    </div>
                    <div className="mt-2 text-[12px] text-slate-600">{eventStart(selected).format("DD.MM.YYYY HH:mm")} - {eventEnd(selected).format('HH:mm')}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.harici_gider')}</div>
                        <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(costs.expenseTotal)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.malzeme')}</div>
                        <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(costs.materialTotal)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.ek_iscilik')}</div>
                        <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(costs.overtimeTotal)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="text-[11px] font-semibold uppercase text-slate-500">{t('common.total')}</div>
                        <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(costs.total)}</div>
                    </div>
                </div>

                <div className="overflow-x-auto border-b border-slate-200">
                    <div className="flex min-w-max items-center gap-6 px-1">
                        {installationDetailTabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`relative whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
                                    activeTab === tab.key
                                        ?t('auto.text_brand_700_after_absolute_after_inset_x_0_af')
                                        :t('auto.text_slate_600_hover_text_slate_950')
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {selectedReport && activeTab === 'reports' && (
                    <div className="space-y-3">
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('auto.bu_montaj_bitirildi_imza_durumu')}{selectedReport.isSigned ?t('auto.imzali') :t('auto.imzasiz_geldi')}
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700">
                            <div className="font-semibold text-slate-900">{dayjs(selectedReport.startedAt).format('HH:mm')} - {dayjs(selectedReport.endedAt).format('HH:mm')}</div>
                            <div className="mt-1 whitespace-pre-wrap">{selectedReport.operationsDone}</div>
                            {selectedReport.technicalNotes && <div className="mt-1 text-slate-500">{selectedReport.technicalNotes}</div>}
                        </div>
                        {!selectedReport.isSigned && (
                            <div className="flex justify-end">
                                <Button icon={<CheckCircle size={13} />} loading={saving} onClick={onSignOnly}>{t('auto.sadece_imza_al')}</Button>
                            </div>
                        )}
                    </div>
                )}

                {!selectedReport && activeTab === 'reports' && (
                    <div className="space-y-4">
                        {!canFinish && (
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">{t('auto.randevu_gunu_gelmeden_montaj_baslatilamaz')}</div>
                        )}
                        <div className="rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                                <span>{t('auto.yapilan_isler')}</span>
                                <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} disabled={disabled} onClick={() => setOperations([...operations, ''])}>{t('auto.madde')}</Button>
                            </div>
                            <div className="space-y-2 p-3">
                                {operations.map((item, index) => (
                                    <div key={index} className="grid grid-cols-[1fr_32px] gap-2">
                                        <Input value={item} onChange={(e) => setOperations(operations.map((row, i) => i === index ? e.target.value : row))} disabled={disabled} />
                                        <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={disabled || operations.length === 1} onClick={() => setOperations(operations.filter((_, i) => i !== index))} />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Field label={t('auto.teknik_notlar')}>
                            <Textarea rows={3} value={technicalNotes} disabled={disabled} onChange={(e) => setTechnicalNotes(e.target.value)} />
                        </Field>
                        <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="secondary" disabled={disabled} loading={saving} icon={<Save size={13} />} onClick={onSubmit}>{t('auto.bitir')}</Button>
                            <Button disabled={disabled} loading={saving} icon={<CheckCircle size={13} />} onClick={onOpenSignature}>{t('auto.imza_al_ve_bitir')}</Button>
                        </div>
                    </div>
                )}

                {activeTab === 'costs' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="rounded-lg border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">{t('auto.harici_giderler')}</div>
                            {costs.expenses.length === 0 ? (
                                <div className="px-3 py-6 text-center text-[12px] text-slate-500">{t('auto.gider_yok')}</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {costs.expenses.map((expense: any) => (
                                        <div key={expense.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                            <div>
                                                <div className="font-semibold text-slate-800">{expense.expenseType}</div>
                                                {expense.description && <div className="mt-0.5 text-slate-500">{expense.description}</div>}
                                            </div>
                                            <span className="font-mono font-semibold text-slate-900">{money(expense.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                                <span className="flex items-center gap-1.5"><Receipt size={13} />{t('auto.harici_gider_ekle')}</span>
                                <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} disabled={disabled} onClick={() => setExpenseRows([...expenseRows, { expenseType:t('auto.diger'), amount: 0, description: '' }])}>{t('auto.satir')}</Button>
                            </div>
                            <div className="space-y-2 p-3">
                                {expenseRows.map((row, index) => (
                                    <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_32px]">
                                        <Select value={row.expenseType} disabled={disabled} onChange={(e) => setExpenseRows(expenseRows.map((item, i) => i === index ? { ...item, expenseType: e.target.value } : item))}>
                                            {[t('auto.nakliye'),t('auto.ekipman_kiralama'),t('auto.dis_hizmetler'),t('auto.taseron'),t('auto.diger')].map((type) => <option key={type} value={type}>{type}</option>)}
                                        </Select>
                                        <Input type="number" min="0" step="0.01" value={row.amount} disabled={disabled} onChange={(e) => setExpenseRows(expenseRows.map((item, i) => i === index ? { ...item, amount: Number(e.target.value) } : item))} />
                                        <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={disabled || expenseRows.length === 1} onClick={() => setExpenseRows(expenseRows.filter((_, i) => i !== index))} />
                                        <Input className="md:col-span-3" value={row.description} disabled={disabled} placeholder={t('common.description')} onChange={(e) => setExpenseRows(expenseRows.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'materials' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="rounded-lg border border-slate-200 bg-white">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                                <div className="text-[12px] font-semibold text-slate-700">{t('nav.materials')}</div>
                                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                                    {[
                                        { key: 'used' as const, label:t('auto.kullanilan') },
                                        { key: 'extra' as const, label: 'Ek' },
                                    ].map((tab) => (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => setMaterialMode(tab.key)}
                                            className={`rounded px-2.5 py-1 text-[11px] font-semibold ${materialMode === tab.key ?t('auto.bg_white_text_slate_950_shadow_xs') :t('auto.text_slate_600_hover_text_slate_950')}`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {materialMode === 'used' && (usedMaterials.length === 0 ? (
                                <div className="px-3 py-6 text-center text-[12px] text-slate-500">{t('auto.kullanilan_malzeme_yok')}</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {usedMaterials.map((item: any) => (
                                        <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-slate-800">{item.material?.name ||t('auto.malzeme')}</div>
                                                <div className="mt-0.5 text-slate-500">{item.material?.serialId || '-'} · {numberFmt(item.quantity)}{t('auto.adet')}{item.source}</div>
                                                {item.note && <div className="mt-0.5 text-slate-500">{item.note}</div>}
                                            </div>
                                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{t('auto.dahil')}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                            {materialMode === 'extra' && (costs.materials.length === 0 ? (
                                <div className="px-3 py-6 text-center text-[12px] text-slate-500">{t('auto.ek_malzeme_yok')}</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {costs.materials.map((item: any) => (
                                        <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-slate-800">{item.material?.name ||t('auto.malzeme')}</div>
                                                <div className="mt-0.5 text-slate-500">{numberFmt(item.quantity)}{t('auto.adet_x')}{money(item.unitPrice)}</div>
                                                {item.description && <div className="mt-0.5 text-slate-500">{item.description}</div>}
                                            </div>
                                            <span className="shrink-0 font-mono font-semibold text-slate-900">{money(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                                <span className="flex items-center gap-1.5"><PackagePlus size={13} /> {materialMode === 'used' ?t('auto.kullanilan_malzeme_ekle') :t('auto.ek_malzeme_ekle')}</span>
                                <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} disabled={disabled} onClick={() => setActiveMaterialRows([...activeMaterialRows, { materialId: '', quantity: 1, description: '' }])}>{t('auto.satir')}</Button>
                            </div>
                            <div className="space-y-2 p-3">
                                {activeMaterialRows.map((row, index) => (
                                    <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_100px_32px]">
                                        <MaterialSearchSelect
                                            value={row.materialId}
                                            materials={materials}
                                            disabled={disabled}
                                            onChange={(materialId) => setActiveMaterialRows((current) => {
                                                const next = current.map((item, i) => i === index ? { ...item, materialId } : item);
                                                return materialId && index === current.length - 1 ? [...next, { materialId: '', quantity: 1, description: '' }] : next;
                                            })}
                                        />
                                        <Input type="number" min="0" step="0.01" value={row.quantity} disabled={disabled} onChange={(e) => setActiveMaterialRows(activeMaterialRows.map((item, i) => i === index ? { ...item, quantity: Number(e.target.value) } : item))} />
                                        <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={disabled || activeMaterialRows.length === 1} onClick={() => setActiveMaterialRows(activeMaterialRows.filter((_, i) => i !== index))} />
                                        <Input className="md:col-span-3" value={row.description} disabled={disabled} placeholder={t('common.description')} onChange={(e) => setActiveMaterialRows(activeMaterialRows.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};

export const ProjectInstallation = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { appointmentId } = useParams();
    const isCalendarView = pathname.includes('/calendar');
    const [weekAnchor, setWeekAnchor] = useState(dayjs().format('YYYY-MM-DD'));
    const [appointments, setAppointments] = useState<InstallationAppointment[]>([]);
    const [selected, setSelected] = useState<InstallationAppointment | null>(null);
    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [signatureOpen, setSignatureOpen] = useState(false);
    const [signatureMode, setSignatureMode] = useState<'complete' | 'sign-report'>('complete');
    const [operations, setOperations] = useState<string[]>(['']);
    const [technicalNotes, setTechnicalNotes] = useState('');
    const [expenseRows, setExpenseRows] = useState([{ expenseType:t('auto.diger'), amount: 0, description: '' }]);
    const [materialRows, setMaterialRows] = useState([{ materialId: '', quantity: 1, description: '' }]);
    const [usedMaterialRows, setUsedMaterialRows] = useState([{ materialId: '', quantity: 1, description: '' }]);

    const weekStart = useMemo(() => dayjs(weekAnchor).startOf('week').add(1, 'day'), [weekAnchor]);
    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => weekStart.add(index, 'day')), [weekStart]);
    const hours = Array.from({ length: 12 }, (_, index) => 7 + index);

    const load = async () => {
        setLoading(true);
        try {
            const rows = appointmentId
                ? [await projectApi.getMyInstallation(appointmentId)]
                : await projectApi.listMyInstallations(weekStart.format('YYYY-MM-DD'), weekStart.add(6, 'day').format('YYYY-MM-DD'));
            setAppointments(rows as InstallationAppointment[]);
            setSelected((current) => {
                if (appointmentId) return rows[0] as InstallationAppointment || null;
                if (current) return (rows as InstallationAppointment[]).find((row) => row.id === current.id) || rows[0] as InstallationAppointment || null;
                return rows[0] as InstallationAppointment || null;
            });
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.montajlar_yuklenemedi'));
            setAppointments([]);
            setSelected(null);
        }
        try {
            setMaterials(await projectApi.materials());
        } catch {
            setMaterials([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        void load();
    }, [weekStart.valueOf(), appointmentId]);

    useEffect(() => {
        setOperations(['']);
        setTechnicalNotes('');
        setExpenseRows([{ expenseType:t('auto.diger'), amount: 0, description: '' }]);
        setMaterialRows([{ materialId: '', quantity: 1, description: '' }]);
        setUsedMaterialRows([{ materialId: '', quantity: 1, description: '' }]);
    }, [selected?.id]);

    const tasksByDayHour = useMemo(() => {
        const map = new Map<string, InstallationAppointment[]>();
        appointments.forEach((appointment) => {
            const start = eventStart(appointment);
            const key = `${start.format('YYYY-MM-DD')}-${start.hour()}`;
            map.set(key, [...(map.get(key) || []), appointment]);
        });
        return map;
    }, [appointments]);

    const selectedReport = findReport(selected);
    const canFinish = selected && !selectedReport && !dayjs().isBefore(eventStart(selected), 'day');

    const submit = async (signatureBase64?: string) => {
        if (!selected) return;
        const cleanOperations = operations.map((item) => item.trim()).filter(Boolean);
        if (!cleanOperations.length) {
            toast.error(t('auto.yapilan_islerden_en_az_bir_madde_girin'));
            return;
        }
        setSaving(true);
        try {
            const result = await projectApi.completeInstallation(selected.id, {
                operationsDoneItems: cleanOperations,
                technicalNotes,
                endedAt: new Date().toISOString(),
                signatureBase64,
                expenses: expenseRows
                    .filter((row) => row.expenseType && Number(row.amount) > 0)
                    .map((row) => ({ ...row, amount: Number(row.amount || 0) })),
                materials: materialRows
                    .filter((row) => row.materialId && Number(row.quantity) > 0)
                    .map((row) => ({ ...row, quantity: Number(row.quantity || 0) })),
                usedMaterials: usedMaterialRows
                    .filter((row) => row.materialId && Number(row.quantity) > 0)
                    .map((row) => ({ ...row, quantity: Number(row.quantity || 0) })),
            });
            if (result.overtimeWarning) toast.warning(result.overtimeWarning);
            toast.success(result.message ||t('auto.montaj_tamamlandi'));
            if (result.addonOrder) toast.success(`Ek sipariş otomatik oluşturuldu: ${result.addonOrder.orderNumber}`);
            setSignatureOpen(false);
            await load();
            navigate('/projects/installation/tasks');
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.montaj_tamamlanamadi'));
        } finally {
            setSaving(false);
        }
    };

    const signExistingReport = async (signatureBase64: string) => {
        if (!selectedReport) return;
        setSaving(true);
        try {
            await projectApi.signReport(selectedReport.id, signatureBase64);
            toast.success(t('auto.musteri_imzasi_alindi'));
            setSignatureOpen(false);
            await load();
            navigate('/projects/installation/tasks');
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('auto.imza_kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Proje"
                title={appointmentId ?t('auto.teknisyen_montaj_ekrani') : isCalendarView ?t('nav.technicianInstallationCalendar') :t('nav.technicianInstallations')}
                description={appointmentId ?t('auto.saha_raporu_harici_gider_malzeme_ve_musteri_imza') :t('auto.size_atanmis_proje_montaj_randevulari_burada_gor')}
                actions={appointmentId ? (
                    <Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/projects/installation/calendar')}>{t('auto.takvime_don')}</Button>
                ) : (
                    <div className="flex items-center gap-2">
                        <input type="date" value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value || dayjs().format('YYYY-MM-DD'))} className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] font-semibold outline-none" />
                        <Button variant="secondary" size="sm" icon={<ArrowLeft size={12} />} onClick={() => setWeekAnchor(dayjs(weekAnchor).subtract(1, 'week').format('YYYY-MM-DD'))} />
                        <Button variant="secondary" size="sm" onClick={() => setWeekAnchor(dayjs().format('YYYY-MM-DD'))}>{t('auto.bugun')}</Button>
                        <Button variant="secondary" size="sm" icon={<ArrowRight size={12} />} onClick={() => setWeekAnchor(dayjs(weekAnchor).add(1, 'week').format('YYYY-MM-DD'))} />
                    </div>
                )}
            />

            <div className={`grid grid-cols-1 gap-4 ${!appointmentId && isCalendarView ?t('auto.xl_grid_cols_minmax_0_1_2fr_420px') : ''}`}>
                {!appointmentId && isCalendarView && (
                    <Card title={t('nav.technicianInstallationCalendar')} icon={<Calendar size={13} />} noPadding>
                        {loading ? <div className="m-4 h-72 animate-pulse rounded bg-slate-100" /> : appointments.length === 0 ? (
                            <EmptyState icon={<Calendar size={32} />} title={t('auto.montaj_yok')} description={t('auto.bu_hafta_size_atanmis_proje_montaji_bulunmuyor')} />
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="min-w-[900px]">
                                    <div className="grid grid-cols-[70px_repeat(7,minmax(110px,1fr))] border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                                        <div className="px-2 py-2">{t('auto.saat')}</div>
                                        {weekDays.map((day) => (
                                            <div key={day.format('YYYY-MM-DD')} className="border-l border-slate-200 px-2 py-2">
                                                <div>{day.format('ddd')}</div>
                                                <div className="text-slate-900">{day.format('DD.MM')}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {hours.map((hour) => (
                                        <div key={hour} className="grid min-h-[72px] grid-cols-[70px_repeat(7,minmax(110px,1fr))] border-b border-slate-100">
                                            <div className="px-2 py-2 font-mono text-[11px] text-slate-400">{String(hour).padStart(2, '0')}:00</div>
                                            {weekDays.map((day) => {
                                                const key = `${day.format('YYYY-MM-DD')}-${hour}`;
                                                const rows = tasksByDayHour.get(key) || [];
                                                return (
                                                    <div key={key} className="border-l border-slate-100 p-1">
                                                        {rows.map((appointment) => {
                                                            const report = findReport(appointment);
                                                            const state = installationState(appointment, report);
                                                            return (
                                                                <button key={appointment.id} type="button" onClick={() => navigate(`/projects/installation/tasks/${appointment.id}`)} className="mb-1 w-full rounded border border-blue-200 bg-blue-50 px-2 py-1 text-left text-[11px] text-blue-900 hover:bg-blue-100">
                                                                    <div className="truncate font-semibold">{appointment.project?.customer?.companyName || appointment.project?.projectName ||t('auto.montaj')}</div>
                                                                    <div className="truncate opacity-80">{eventStart(appointment).format('HH:mm')} - {eventEnd(appointment).format('HH:mm')}</div>
                                                                    <div className="mt-1"><StatusBadge label={state.label} tone={state.tone} /></div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>
                )}

                {!appointmentId && (
                    <Card title={t('nav.technicianInstallations')} icon={<Clipboard size={13} />} noPadding>
                        {loading ? <div className="m-4 h-72 animate-pulse rounded bg-slate-100" /> : appointments.length === 0 ? (
                            <EmptyState icon={<Clipboard size={32} />} title={t('auto.montaj_yok')} description={t('auto.secili_haftada_montaj_kaydi_yok')} />
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {appointments.map((appointment) => {
                                    const report = findReport(appointment);
                                    const state = installationState(appointment, report);
                                    return (
                                        <button key={appointment.id} type="button" onClick={() => navigate(`/projects/installation/tasks/${appointment.id}`)} className="w-full px-4 py-3 text-left transition-colors hover:bg-slate-50">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-[13.5px] font-semibold text-slate-900">{appointment.salesOrder?.orderNumber || appointment.project?.projectName}</div>
                                                    <div className="mt-1 text-[12px] text-slate-600">{appointment.project?.customer?.companyName || '-'}</div>
                                                    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                                                        <Clock size={12} />
                                                        {eventStart(appointment).format("DD.MM.YYYY HH:mm")} - {eventEnd(appointment).format('HH:mm')}
                                                    </div>
                                                </div>
                                                <StatusBadge label={state.label} tone={state.tone} />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                )}

                {appointmentId && selected && (
                    <InstallationDetailCard
                        selected={selected}
                        selectedReport={selectedReport}
                        canFinish={Boolean(canFinish)}
                        materials={materials}
                        saving={saving}
                        operations={operations}
                        setOperations={setOperations}
                        technicalNotes={technicalNotes}
                        setTechnicalNotes={setTechnicalNotes}
                        expenseRows={expenseRows}
                        setExpenseRows={setExpenseRows}
                        materialRows={materialRows}
                        setMaterialRows={setMaterialRows}
                        usedMaterialRows={usedMaterialRows}
                        setUsedMaterialRows={setUsedMaterialRows}
                        onSubmit={() => submit()}
                        onSignOnly={() => {
                            setSignatureMode('sign-report');
                            setSignatureOpen(true);
                        }}
                        onOpenSignature={() => {
                            setSignatureMode('complete');
                            setSignatureOpen(true);
                        }}
                    />
                )}
            </div>

            <SignatureModal
                open={signatureOpen}
                title={t('auto.proje_montaj_musteri_imzasi')}
                loading={saving}
                onClose={() => setSignatureOpen(false)}
                onSign={(signatureBase64) => signatureMode === 'sign-report' ? signExistingReport(signatureBase64) : submit(signatureBase64)}
            />
        </div>
    );
};
