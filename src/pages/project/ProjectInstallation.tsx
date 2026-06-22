import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowLeft, ArrowRight, Clipboard, Clock, PackagePlus, Plus, Receipt, Save01 as Save, SearchLg as Search, Trash01 as Trash } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { SlidePanel } from '../../components/layout/SlidePanel';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { ReportImageUploader } from '../../components/ui-shared/ReportImageUploader';
import { projectApi, deliveryReportApi } from '../../lib/api/project';
import { useAuthStore } from '../../store/authStore';
import type { AppointmentDto, ProjectMaterial } from '../../types/project';
import { DeliveryReportTab } from './DeliveryReportTab';
import { TechnicianGetSignature } from './TechnicianGetSignature';
import { buildOrderAttachments } from './reportAttachments';
import type { SignatureSnapshot, DeliveryReportDto } from '../../lib/api/project';

import { t } from '@/i18n/translate';

const money = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(Number(value || 0));

const numberFmt = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(Number(value || 0));

const cleanText = (value: unknown) => String(value ?? '').trim();
const cleanLabel = (value: string) => value.replace(/^[\s:.\-]+|[\s:.\-]+$/g, '').trim();
const dateFmt = (value?: string | null) => {
    if (!value) return '-';
    const date = dayjs(value);
    return date.isValid() ? date.format('DD.MM.YYYY') : '-';
};
const timeFmt = (value?: string | null) => {
    if (!value) return '-';
    const date = dayjs(value);
    return date.isValid() ? date.format('HH:mm') : '-';
};
const minutesBetweenValues = (start?: string | null, end?: string | null) => {
    if (!start || !end) return 0;
    const started = dayjs(start);
    const ended = dayjs(end);
    if (!started.isValid() || !ended.isValid()) return 0;
    return Math.max(0, ended.diff(started, 'minute'));
};
const durationFmt = (minutes?: number | null) => {
    const total = Math.max(0, Math.round(Number(minutes || 0)));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return `${hours} sa ${mins} dk`;
    if (hours) return `${hours} sa`;
    return `${mins} dk`;
};
const personName = (person?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) =>
    cleanText([person?.firstName, person?.lastName].filter(Boolean).join(' ')) || cleanText(person?.email) || '-';
const reportDateValue = (report: any) => report?.workDate || report?.reportDate || report?.startedAt || null;
const operationItems = (report: any): string[] => {
    const fromItems = Array.isArray(report?.operationsDoneItems) ? report.operationsDoneItems : [];
    const rows = fromItems.length ? fromItems : cleanText(report?.operationsDone).split(/\r?\n/);
    return rows.map((item: any) => cleanText(item).replace(/^[-\s]+/, '')).filter(Boolean);
};
const reportImages = (report: any): string[] =>
    (Array.isArray(report?.images) ? report.images : []).map((image: any) => image?.imageData || image?.url || image?.imageUrl).filter(Boolean);
const appointmentOrderId = (appointment: any) => appointment.salesOrderId || appointment.salesOrder?.id || null;
const isPrimaryAppointmentOrder = (appointment: any) => {
    const orderId = appointmentOrderId(appointment);
    return Boolean(orderId && appointment.project?.salesOrders?.[0]?.id === orderId);
};
const matchesAppointmentScope = (record: any, appointment: any) => {
    if (!record) return false;
    if (record.appointmentId && record.appointmentId === appointment.id) return true;
    const orderId = appointmentOrderId(appointment);
    const recordOrderId = record.salesOrderId || null;
    if (orderId && recordOrderId === orderId) return true;
    if (isPrimaryAppointmentOrder(appointment) && recordOrderId === null) return true;
    return !orderId && recordOrderId === null;
};
const reportWorkedMinutes = (report: any) =>
    Number(report?.workedMinutes || 0) || minutesBetweenValues(report?.startedAt, report?.endedAt);

const orderFieldReports = (appointment: any) => {
    return ((appointment.project?.reports || []) as any[]).filter((report) => matchesAppointmentScope(report, appointment));
};
const buildFieldSnapshot = (appointment: any, report: any): SignatureSnapshot => ({
    title: t('signatures.tabs.field'),
    customerName: appointment.project?.customer?.companyName,
    projectName: appointment.project?.projectName,
    meta: [
        { label: t('signatures.field.workDate'), value: dateFmt(reportDateValue(report)) },
        { label: t('projects.delivery.pdf.technician'), value: personName(report.employee || appointment.assignedTechnician) },
        { label: t('projects.delivery.pdf.commission'), value: appointment.salesOrder?.orderNumber || '-' },
    ],
    sections: [
        {
            heading: t('projects.randevu_saat_planlari'),
            rows: [
                { label: t('projects.delivery.pdf.executionDate'), value: dateFmt(appointment.startTime) },
                { label: cleanLabel(t('projects.planlanan')), value: `${timeFmt(appointment.startTime)} - ${timeFmt(appointment.endTime)} / ${durationFmt(minutesBetweenValues(appointment.startTime, appointment.endTime))}` },
                { label: `${t('common.start')} / ${t('common.end')}`, value: `${timeFmt(report.startedAt)} - ${timeFmt(report.endedAt)}` },
                { label: t('common.total'), value: durationFmt(reportWorkedMinutes(report)) },
                { label: cleanLabel(t('projects.fazla_calisma')), value: durationFmt(report.overtimeMinutes) },
            ],
        },
        {
            heading: t('projects.yapilan_isler'),
            rows: (operationItems(report).length ? operationItems(report) : ['-']).map((item, index) => ({ label: `${index + 1}. ${item}` })),
        },
        ...(report.technicalNotes ? [{
            heading: t('projects.teknik_notlar'),
            rows: [{ label: report.technicalNotes }],
        }] : []),
    ],
    images: reportImages(report),
});
const orderDeliveryReports = (appointment: any, deliveryReports: DeliveryReportDto[]) => {
    return (deliveryReports || []).filter((report) => matchesAppointmentScope(report, appointment));
};
// Mirrors the admin general report: every field report plus the delivery
// checklist summaries for the order, stored on the signature request.
const buildGeneralSnapshot = (appointment: any, deliveryReports: DeliveryReportDto[]): SignatureSnapshot => {
    const reports = orderFieldReports(appointment);
    const deliveries = orderDeliveryReports(appointment, deliveryReports);
    const sortedReports = [...reports].sort((a, b) => String(reportDateValue(a) || '').localeCompare(String(reportDateValue(b) || '')));
    const fieldSummaryRows = sortedReports.map((report) => ({
        label: `${dateFmt(reportDateValue(report))} - ${personName(report.employee)}`,
        value: `${timeFmt(report.startedAt)}-${timeFmt(report.endedAt)} / ${durationFmt(reportWorkedMinutes(report))}`,
    }));
    const workSections = sortedReports.map((report) => ({
        heading: `${t('projects.yapilan_isler')} - ${dateFmt(reportDateValue(report))}`,
        rows: [
            ...(operationItems(report).length ? operationItems(report) : ['-']).map((item, index) => ({ label: `${index + 1}. ${item}` })),
            ...(report.technicalNotes ? [{ label: `${t('projects.teknik_notlar')}: ${report.technicalNotes}` }] : []),
        ],
    }));
    const overtimeRows = sortedReports.map((report) => {
        const planned = Number(report.plannedMinutesForDay || 0);
        const worked = reportWorkedMinutes(report);
        const max = planned ? Math.ceil(planned * 1.15) : 0;
        return {
            label: dateFmt(reportDateValue(report)),
            value: `${cleanLabel(t('projects.planlanan'))}: ${durationFmt(planned)} / ${cleanLabel(t('projects.azami'))}: ${durationFmt(max)} / ${t('common.total')}: ${durationFmt(worked)} / ${cleanLabel(t('projects.fazla_calisma'))}: ${durationFmt(report.overtimeMinutes)}`,
        };
    });
    const deliverySections = deliveries.flatMap((d) => {
        const cats: string[] = [];
        for (const x of d.responses || []) { const k = x.category?.trim() || t('projects.delivery.uncategorized'); if (!cats.includes(k)) cats.push(k); }
        return cats.map((c) => ({
            heading: `${d.checklistName || t('projects.delivery.pdf.title')} · ${c}`,
            rows: (d.responses || []).filter((x) => (x.category?.trim() || t('projects.delivery.uncategorized')) === c).map((x) => ({ label: x.label, status: x.status, value: x.measurement || undefined })),
        }));
    });
    return {
        title: t('projects.general.button'),
        customerName: appointment.project?.customer?.companyName,
        projectName: appointment.project?.projectName,
        meta: [
            { label: t('projects.delivery.pdf.commission'), value: appointment.salesOrder?.orderNumber || '-' },
            { label: t('signatures.general.allFieldReports', { count: sortedReports.length }), value: deliveries.length ? `${deliveries.length} ${t('signatures.tabs.delivery')}` : '-' },
            { label: t('projects.delivery.pdf.reportDate'), value: dateFmt(new Date().toISOString()) },
        ],
        sections: [
            { heading: t('projects.saha_raporlari'), rows: fieldSummaryRows.length ? fieldSummaryRows : [{ label: '-' }] },
            ...workSections,
            { heading: t('projects.15_uzeri_fazla_calisma'), rows: overtimeRows.length ? overtimeRows : [{ label: '-' }] },
            ...deliverySections,
        ],
        images: sortedReports.flatMap(reportImages),
    };
};
import { useTranslation } from 'react-i18next';

const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick(t => t + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};

type InstallationAppointment = AppointmentDto & {
    salesOrder?: { id: string; orderNumber: string; parentSalesOrderId?: string | null; revisionNumber?: number | null; tender?: any } | null;
    project?: any;
};
type InstallationDetailTab = 'reports' | 'delivery' | 'general' | 'overtime' | 'costs' | 'materials';
type InstallationMaterialMode = 'used' | 'extra';
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

const dayKey = (value?: string | null) => value ? dayjs(value).format('YYYY-MM-DD') : '';
const eventStart = (appointment: InstallationAppointment) => dayjs(appointment.startTime);
const eventEnd = (appointment: InstallationAppointment) => dayjs(appointment.endTime);
const isoWeekStart = (value: string) => {
    const date = dayjs(value);
    const day = date.day();
    return date.subtract(day === 0 ? 6 : day - 1, 'day').startOf('day');
};

const findReport = (appointment?: InstallationAppointment | null) => {
    if (!appointment?.project?.reports) return null;
    return appointment.project.reports.find((report: any) => {
        const sameDay = dayKey(report.workDate || report.reportDate || report.startedAt) === dayKey(appointment.startTime);
        return sameDay && matchesAppointmentScope(report, appointment);
    }) || null;
};

const installationState = (appointment: InstallationAppointment, report: any) => {
    if (report || appointment.status === 'COMPLETED') return { label: report?.isSigned ?t('projects.bitti') :t('projects.imza_bekliyor'), tone: 'emerald' };
    if (dayjs().isBefore(eventStart(appointment), 'day')) return { label:t('projects.daha_baslamadi'), tone: 'slate' };
    if (dayjs().isBefore(eventStart(appointment))) return { label:t('projects.bugun_baslayacak'), tone: 'amber' };
    return { label:t('projects.basladi'), tone: 'blue' };
};

const StatusBadge = ({ label, tone }: { label: string; tone: string }) => {
    const styles: Record<string, string> = {
        emerald:"border-emerald-200 bg-emerald-50 text-emerald-800",
        slate:'border-slate-200 bg-slate-50 text-slate-700',
        amber:"border-amber-200 bg-amber-50 text-amber-800",
        blue:"border-blue-200 bg-blue-50 text-blue-800",
    };
    return <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${styles[tone] || styles.slate}`}>{label}</span>;
};

const getInstallationDetailTabs = (): Array<{ key: InstallationDetailTab; label: string }> => [
    { key: 'reports', label:t('projects.saha_raporlari') },
    { key: 'delivery', label:t('projects.delivery.tab') },
    { key: 'general', label:t('projects.general.button') },
    { key: 'overtime', label:t('projects.mesai') },
    { key: 'costs', label:t('projects.harici_giderler') },
    { key: 'materials', label:t('nav.materials') },
];

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
        <div className="min-w-0 space-y-1.5">
            <div className="grid grid-cols-[minmax(0,1fr)_32px] gap-1.5">
                <Input
                    value={query}
                    disabled={disabled || materials.length === 0}
                    placeholder={selectedMaterial ? t('projects.malzeme_ara_veya_degistir', { name: selectedMaterial.name }) :t('projects.malzeme_ara')}
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
                <option value="">{materials.length ?t('projects.malzeme_secin') :t('projects.malzeme_bulunamadi')}</option>
                {options.map((material) => (
                    <option key={material.id} value={material.id}>
                        {material.name} ({material.serialId ||t('projects.kod_yok')}) - {t('projects.stok')}: {numberFmt(material.stockQuantity)}
                    </option>
                ))}
            </Select>
            {materials.length > 0 && normalizedQuery && options.length === 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">{t('projects.arama_sonucu_yok')}</div>
            )}
        </div>
    );
};

const scopedInstallationRecords = <T extends { salesOrderId?: string | null }>(records: T[] | undefined, appointment: InstallationAppointment) => {
    return (records || []).filter((record) => matchesAppointmentScope(record, appointment));
};

const orderAppointments = (appointment: InstallationAppointment, availableAppointments: InstallationAppointment[] = []) => {
    const currentProjectId = appointment.projectId || appointment.project?.id || null;
    const source = [
        ...((appointment.project?.appointments || []) as InstallationAppointment[]),
        ...availableAppointments,
        appointment,
    ];
    const seen = new Set<string>();
    return source
        .filter((row) => {
            if (!row?.id || seen.has(row.id)) return false;
            const rowProjectId = row.projectId || row.project?.id || null;
            if (currentProjectId && rowProjectId && rowProjectId !== currentProjectId) return false;
            if (!matchesAppointmentScope(row, appointment)) return false;
            seen.add(row.id);
            return true;
        })
        .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
};

const appointmentTechnicianNames = (appointment: InstallationAppointment) => {
    const names = [
        personName(appointment.assignedTechnician),
        ...((appointment.technicianAssignments || []).map((row) => personName(row.technician))),
    ].filter((name) => name && name !== '-');
    return Array.from(new Set(names)).join(', ') || '-';
};

const getInstallationUsedMaterials = (appointment: InstallationAppointment) => {
    const tender = appointment.salesOrder?.tender || appointment.project?.tender;
    return [
        ...(tender?.usedMaterials || []).map((usage: any) => ({
            id: `usage-${usage.id}`,
            material: usage.material,
            quantity: Number(usage.quantity || 0),
            unitCost: Number(usage.unitCost || usage.material?.unitCost || 0),
            source: tender?.tenderNumber ||t('projects.teklif'),
            note: usage.description,
        })),
        ...((tender?.positions || []).flatMap((position: any) =>
            (position.materialMappings || []).map((mapping: any) => ({
                id: `mapping-${mapping.id}`,
                material: mapping.material,
                quantity: Number(mapping.quantityMultiplier || 0),
                unitCost: Number(mapping.material?.unitCost || 0),
                source: `${position.positionNumber ||t('projects.pozisyon')} - ${position.shortDescription || ''}`,
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

const reportPlannedMinutes = (report: any) => Number(report?.plannedMinutesForDay || 0);
const reportOvertimeMinutes = (report: any) => Number(report?.overtimeMinutes || 0);

const OvertimeStat = ({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) => (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`mt-0.5 font-mono text-[12.5px] font-semibold ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
    </div>
);

// Read-only overtime card for one field report/day.
const OvertimeCard = ({ report }: { report: any }) => {
    const overtime = reportOvertimeMinutes(report);
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-900"><Clock size={12} />{dateFmt(reportDateValue(report))}</div>
                {overtime > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">+{durationFmt(overtime)}</span>}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
                <OvertimeStat label={cleanLabel(t('projects.planlanan'))} value={durationFmt(reportPlannedMinutes(report))} />
                <OvertimeStat label={t('projects.mesai_calisilan')} value={durationFmt(reportWorkedMinutes(report))} />
                <OvertimeStat label={cleanLabel(t('projects.fazla_calisma'))} value={durationFmt(overtime)} tone={overtime > 0 ? 'amber' : undefined} />
                <OvertimeStat label={t('projects.mesai_ucret')} value={money(report?.overtimeCost)} />
            </div>
        </div>
    );
};

// Right-hand detail for a single appointment in the general-report table.
const AppointmentDetailPanel = ({ appointment, deliveryReports }: { appointment: InstallationAppointment; deliveryReports: DeliveryReportDto[] }) => {
    const report = findReport(appointment);
    const deliveries = orderDeliveryReports(appointment, deliveryReports).filter((d) => matchesAppointmentScope(d, appointment));
    const ops = report ? operationItems(report) : [];
    const imgs = report ? reportImages(report) : [];
    const overtime = report ? reportOvertimeMinutes(report) : 0;
    return (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
            <div>
                <div className="font-mono text-[11px] font-semibold text-slate-500">{appointment.salesOrder?.orderNumber || '-'}</div>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900"><Clock size={12} />{eventStart(appointment).format('DD.MM.YYYY HH:mm')} - {eventEnd(appointment).format('HH:mm')}</div>
                <div className="mt-1 text-[12px] text-slate-600">{appointmentTechnicianNames(appointment)}</div>
            </div>
            {!report ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-5 text-center text-[12px] text-slate-500">{t('projects.henuz_bitmedi')}</div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <OvertimeStat label={`${t('common.start')}/${t('common.end')}`} value={`${timeFmt(report.startedAt)}-${timeFmt(report.endedAt)}`} />
                        <OvertimeStat label={t('common.total')} value={durationFmt(reportWorkedMinutes(report))} />
                        <OvertimeStat label={cleanLabel(t('projects.planlanan'))} value={durationFmt(reportPlannedMinutes(report))} />
                        <OvertimeStat label={cleanLabel(t('projects.fazla_calisma'))} value={durationFmt(overtime)} tone={overtime > 0 ? 'amber' : undefined} />
                    </div>
                    <div>
                        <div className="mb-1 text-[11.5px] font-semibold text-slate-600">{t('projects.yapilan_isler')}</div>
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700">
                            {ops.length ? <ul className="list-disc space-y-0.5 pl-4">{ops.map((o, i) => <li key={i}>{o}</li>)}</ul> : '-'}
                            {report.technicalNotes && <div className="mt-1.5 text-slate-500">{report.technicalNotes}</div>}
                        </div>
                    </div>
                    {imgs.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                            {imgs.map((src, i) => (
                                <a key={i} href={src} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200 bg-white"><img src={src} alt="" className="h-full w-full object-cover" /></a>
                            ))}
                        </div>
                    )}
                    {deliveries.length > 0 && (
                        <div className="space-y-1.5">
                            <div className="text-[11.5px] font-semibold text-slate-600">{t('projects.delivery.tab')}</div>
                            {deliveries.map((d) => (
                                <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-[12px]">
                                    <span className="truncate font-semibold text-slate-800">{d.checklistName || t('projects.delivery.pdf.title')}</span>
                                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${d.isSigned ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{d.isSigned ? t('projects.delivery.statusSigned') : t('projects.delivery.statusUnsigned')}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

const InstallationDetailCard = ({
    selected,
    appointments,
    selectedReport,
    canFinish,
    materials,
    saving,
    operations,
    setOperations,
    technicalNotes,
    setTechnicalNotes,
    reportImages,
    setReportImages,
    expenseRows,
    setExpenseRows,
    materialRows,
    setMaterialRows,
    usedMaterialRows,
    setUsedMaterialRows,
    deliveryReports,
    onSubmit,
    onReload,
}: {
    selected: InstallationAppointment;
    appointments: InstallationAppointment[];
    selectedReport: any;
    canFinish: boolean;
    materials: ProjectMaterial[];
    saving: boolean;
    deliveryReports: DeliveryReportDto[];
    operations: string[];
    setOperations: StateSetter<string[]>;
    technicalNotes: string;
    setTechnicalNotes: StateSetter<string>;
    reportImages: string[];
    setReportImages: StateSetter<string[]>;
    expenseRows: Array<{ expenseType: string; amount: number; description: string }>;
    setExpenseRows: StateSetter<Array<{ expenseType: string; amount: number; description: string }>>;
    materialRows: Array<{ materialId: string; quantity: number; description: string }>;
    setMaterialRows: StateSetter<Array<{ materialId: string; quantity: number; description: string }>>;
    usedMaterialRows: Array<{ materialId: string; quantity: number; description: string }>;
    setUsedMaterialRows: StateSetter<Array<{ materialId: string; quantity: number; description: string }>>;
    onSubmit: () => void;
    onReload: () => void;
}) => {
    const [activeTab, setActiveTab] = useState<InstallationDetailTab>('reports');
    const [materialMode, setMaterialMode] = useState<InstallationMaterialMode>('used');
    const [generalDetailId, setGeneralDetailId] = useState<string | null>(null);
    const [drawer, setDrawer] = useState<null | 'costs' | 'materials'>(null);
    const costs = sumInstallationCosts(selected);
    const usedMaterials = getInstallationUsedMaterials(selected);
    const finished = Boolean(selectedReport);
    const disabled = finished || !canFinish || saving;
    const activeMaterialRows = materialMode === 'used' ? usedMaterialRows : materialRows;
    const setActiveMaterialRows = materialMode === 'used' ? setUsedMaterialRows : setMaterialRows;
    const relatedAppointments = orderAppointments(selected, appointments);
    const overtimeReports = [...costs.reports].sort((a: any, b: any) => String(reportDateValue(a) || '').localeCompare(String(reportDateValue(b) || '')));
    const generalDetail = relatedAppointments.find((row) => row.id === generalDetailId) || relatedAppointments[0] || null;

    // Extracted so the same editors can be shown in their tab and in the
    // slide-in (from the right) drawers opened from the field reports tab.
    const costsContent = (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">{t('projects.harici_giderler')}</div>
                {costs.expenses.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[12px] text-slate-500">{t('projects.gider_yok')}</div>
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
                    <span className="flex items-center gap-1.5"><Receipt size={13} />{t('projects.harici_gider_ekle')}</span>
                    <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} disabled={disabled} onClick={() => setExpenseRows([...expenseRows, { expenseType: t('projects.diger'), amount: 0, description: '' }])}>{t('projects.satir')}</Button>
                </div>
                <div className="space-y-2 p-3">
                    <div className="hidden grid-cols-[1fr_120px_32px] gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
                        <span>{t('projects.colType')}</span>
                        <span>{t('projects.colAmount')}</span>
                        <span />
                    </div>
                    {expenseRows.map((row, index) => (
                        <div key={index} className="grid min-w-0 grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_110px_32px]">
                            <Select value={row.expenseType} disabled={disabled} onChange={(e) => setExpenseRows(expenseRows.map((item, i) => i === index ? { ...item, expenseType: e.target.value } : item))}>
                                {[{k:'transport', v:'Nakliye'}, {k:'equipmentRental', v:'Ekipman Kiralama'}, {k:'externalServices', v:'Dış hizmetler'}, {k:'subcontractor', v:'Taşeron'}, {k:'other', v:'Diğer'}].map((x) => <option key={x.v} value={x.v}>{t(`projects.expenseTypes.${x.k as "transport" | "equipmentRental" | "externalServices" | "subcontractor" | "other"}`)}</option>)}
                            </Select>
                            <Input type="number" min="0" step="0.01" value={row.amount} disabled={disabled} placeholder="0.00" aria-label={t('projects.colAmount')} onChange={(e) => setExpenseRows(expenseRows.map((item, i) => i === index ? { ...item, amount: Number(e.target.value) } : item))} />
                            <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={disabled || expenseRows.length === 1} onClick={() => setExpenseRows(expenseRows.filter((_, i) => i !== index))} />
                            <Input className="md:col-span-3 min-w-0" value={row.description} disabled={disabled} placeholder={t('common.description')} onChange={(e) => setExpenseRows(expenseRows.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const materialsContent = (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                    <div className="text-[12px] font-semibold text-slate-700">{t('nav.materials')}</div>
                    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                        {[
                            { key: 'used' as const, label:t('projects.kullanilan') },
                            { key: 'extra' as const, label:t('projects.ek') },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setMaterialMode(tab.key)}
                                className={`rounded px-2.5 py-1 text-[11px] font-semibold ${materialMode === tab.key ?'bg-white text-slate-950 shadow-xs' :'text-slate-600 hover:text-slate-950'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                {materialMode === 'used' && (usedMaterials.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[12px] text-slate-500">{t('projects.kullanilan_malzeme_yok')}</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {usedMaterials.map((item: any) => (
                            <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                <div className="min-w-0">
                                    <div className="font-semibold text-slate-800">{item.material?.name ||t('projects.malzeme')}</div>
                                    <div className="mt-0.5 text-slate-500">{item.material?.serialId || '-'} · {numberFmt(item.quantity)}{t('projects.adet')}{item.source}</div>
                                    {item.note && <div className="mt-0.5 text-slate-500">{item.note}</div>}
                                </div>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{t('projects.dahil')}</span>
                            </div>
                        ))}
                    </div>
                ))}
                {materialMode === 'extra' && (costs.materials.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[12px] text-slate-500">{t('projects.ek_malzeme_yok')}</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {costs.materials.map((item: any) => (
                            <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                <div className="min-w-0">
                                    <div className="font-semibold text-slate-800">{item.material?.name ||t('projects.malzeme')}</div>
                                    <div className="mt-0.5 text-slate-500">{numberFmt(item.quantity)}{t('projects.adet_x')}{money(item.unitPrice)}</div>
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
                    <span className="flex items-center gap-1.5"><PackagePlus size={13} /> {materialMode === 'used' ?t('projects.kullanilan_malzeme_ekle') :t('projects.ek_malzeme_ekle')}</span>
                    <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} disabled={disabled} onClick={() => setActiveMaterialRows([...activeMaterialRows, { materialId: '', quantity: 1, description: '' }])}>{t('projects.satir')}</Button>
                </div>
                <div className="space-y-2 p-3">
                    <div className="hidden grid-cols-[1fr_100px_32px] gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
                        <span>{t('projects.colMaterial')}</span>
                        <span>{t('projects.colQty')}</span>
                        <span />
                    </div>
                    {activeMaterialRows.map((row, index) => (
                        <div key={index} className="grid min-w-0 grid-cols-1 items-start gap-2 md:grid-cols-[minmax(0,1fr)_84px_32px]">
                            <MaterialSearchSelect
                                value={row.materialId}
                                materials={materials}
                                disabled={disabled}
                                onChange={(materialId) => setActiveMaterialRows((current) => {
                                    const next = current.map((item, i) => i === index ? { ...item, materialId } : item);
                                    return materialId && index === current.length - 1 ? [...next, { materialId: '', quantity: 1, description: '' }] : next;
                                })}
                            />
                            <Input type="number" min="0" step="0.01" value={row.quantity} disabled={disabled} placeholder="1" aria-label={t('projects.colQty')} onChange={(e) => setActiveMaterialRows(activeMaterialRows.map((item, i) => i === index ? { ...item, quantity: Number(e.target.value) } : item))} />
                            <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={disabled || activeMaterialRows.length === 1} onClick={() => setActiveMaterialRows(activeMaterialRows.filter((_, i) => i !== index))} />
                            <Input className="md:col-span-3 min-w-0" value={row.description} disabled={disabled} placeholder={t('common.description')} onChange={(e) => setActiveMaterialRows(activeMaterialRows.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <Card>
            <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold text-slate-500">{selected.salesOrder?.orderNumber || '-'}</div>
                            <div className="truncate text-[15px] font-semibold text-slate-950">{selected.project?.customer?.companyName || selected.project?.projectName || '-'}</div>
                            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-600">
                                <Clock size={12} />
                                {eventStart(selected).format("DD.MM.YYYY HH:mm")} - {eventEnd(selected).format('HH:mm')}
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                            <StatusBadge {...installationState(selected, selectedReport)} />
                            {!finished && (
                                <Button variant="primary" icon={<Save size={13} />} loading={saving} disabled={!canFinish || saving} onClick={onSubmit}>{t('projects.finish_and_send')}</Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-end justify-between gap-3 border-b border-slate-200">
                    <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto px-1">
                        {getInstallationDetailTabs().map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`relative whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
                                    activeTab === tab.key
                                        ?'text-brand-700 after:absolute after:inset-x-0 after:-bottom-px after:border-b-2 after:border-brand-600'
                                        :'text-slate-600 hover:text-slate-950'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {selectedReport && activeTab === 'reports' && (
                    <div className="space-y-3">
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('projects.bu_montaj_bitirildi_imza_durumu')}{selectedReport.isSigned ?t('projects.imzali') :t('projects.imzasiz_geldi')}
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700">
                            <div className="font-semibold text-slate-900">{dayjs(selectedReport.startedAt).format('HH:mm')} - {dayjs(selectedReport.endedAt).format('HH:mm')}</div>
                            <div className="mt-1 whitespace-pre-wrap">{selectedReport.operationsDone}</div>
                            {selectedReport.technicalNotes && <div className="mt-1 text-slate-500">{selectedReport.technicalNotes}</div>}
                            {Array.isArray(selectedReport.images) && selectedReport.images.length > 0 && (
                                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                                    {selectedReport.images.map((image: any) => (
                                        <a key={image.id} href={image.imageData} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200 bg-white">
                                            <img src={image.imageData} alt="" className="h-full w-full object-cover" />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                        {!selectedReport.isSigned && (
                            <div className="flex flex-wrap justify-end gap-2">
                                <TechnicianGetSignature reportType="FIELD" reportId={selectedReport.id} projectId={selected.project?.id} title={`${selected.salesOrder?.orderNumber || selected.project?.projectName || ''} - ${t('signatures.tabs.field')}`} snapshot={buildFieldSnapshot(selected, selectedReport)} attachments={buildOrderAttachments(selected)} label={t('projects.sadece_imza_al')} onDone={onReload} />
                            </div>
                        )}
                    </div>
                )}

                {!selectedReport && activeTab === 'reports' && (
                    <div className="space-y-4">
                        {!canFinish && (
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">{t('projects.randevu_gunu_gelmeden_montaj_baslatilamaz')}</div>
                        )}
                        <div className="rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                                <span>{t('projects.yapilan_isler')}</span>
                                <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} disabled={disabled} onClick={() => setOperations([...operations, ''])}>{t('projects.madde')}</Button>
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
                        <Field label={t('projects.teknik_notlar')}>
                            <Textarea rows={3} value={technicalNotes} disabled={disabled} onChange={(e) => setTechnicalNotes(e.target.value)} />
                        </Field>
                        <Field label={t('projects.rapor_gorselleri')} hint={t('projects.gorseller_opsiyonel')}>
                            <ReportImageUploader value={reportImages} onChange={setReportImages} disabled={disabled} />
                        </Field>
                        {/* External expenses & materials slide in from the right. */}
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="secondary" icon={<Receipt size={13} />} disabled={disabled} onClick={() => setDrawer('costs')}>{t('projects.harici_giderler')}</Button>
                            <Button type="button" variant="secondary" icon={<PackagePlus size={13} />} disabled={disabled} onClick={() => setDrawer('materials')}>{t('nav.materials')}</Button>
                        </div>
                        {/* No per-report finish button: edits auto-save locally; the
                            "Finish & Send" button in the header sends to the manager
                            and only then unlock signatures. */}
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">{t('projects.imza_finish_hint')}</div>
                    </div>
                )}

                {activeTab === 'general' && (
                    <div className="space-y-3">
                    <div className="flex items-center justify-end">
                        {/* Get general report (signature) — unlocks only after Finish. */}
                        <TechnicianGetSignature
                            reportType="GENERAL"
                            projectId={selected.project?.id}
                            title={`${selected.salesOrder?.orderNumber || selected.project?.projectName || ''} - ${t('projects.general.button')}`}
                            snapshot={buildGeneralSnapshot(selected, deliveryReports)}
                            attachments={buildOrderAttachments(selected)}
                            label={t('projects.genel_rapor_al')}
                            disabled={!finished}
                            onDone={onReload}
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                        {/* Left: every order appointment, row by row. */}
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                                <div className="text-[12px] font-semibold text-slate-700">{t('projects.randevu_saat_planlari')}</div>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{relatedAppointments.length}</span>
                            </div>
                            <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
                                {relatedAppointments.map((appointment) => {
                                    const row = {
                                        ...appointment,
                                        project: appointment.project || selected.project,
                                        salesOrder: appointment.salesOrder || selected.salesOrder,
                                    } as InstallationAppointment;
                                    const report = findReport(row);
                                    const state = installationState(row, report);
                                    const active = (generalDetail?.id || null) === row.id;
                                    return (
                                        <button key={row.id} type="button" onClick={() => setGeneralDetailId(row.id)} className={`flex w-full flex-col gap-2 px-3 py-2.5 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-900">
                                                    <Clock size={12} />
                                                    {eventStart(row).format("DD.MM.YYYY HH:mm")} - {eventEnd(row).format('HH:mm')}
                                                </div>
                                                <div className="mt-1 truncate text-[12px] text-slate-600">{appointmentTechnicianNames(row)}</div>
                                                {row.notes && <div className="mt-1 text-[11.5px] text-slate-500">{row.notes}</div>}
                                            </div>
                                            <StatusBadge label={state.label} tone={state.tone} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {/* Right: details for the clicked appointment (incl. overtime). */}
                        {generalDetail ? (
                            <AppointmentDetailPanel
                                appointment={{ ...generalDetail, project: generalDetail.project || selected.project, salesOrder: generalDetail.salesOrder || selected.salesOrder } as InstallationAppointment}
                                deliveryReports={deliveryReports}
                            />
                        ) : (
                            <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-10 text-center text-[12.5px] text-slate-500">{t('projects.randevu_secin')}</div>
                        )}
                    </div>
                    </div>
                )}

                {activeTab === 'overtime' && (
                    overtimeReports.length === 0 ? (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-[12.5px] text-slate-500">{t('projects.mesai_yok')}</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {overtimeReports.map((report: any) => <OvertimeCard key={report.id} report={report} />)}
                        </div>
                    )
                )}

                {activeTab === 'costs' && costsContent}

                {activeTab === 'materials' && materialsContent}

                {activeTab === 'delivery' && (
                    <DeliveryReportTab appointment={selected} attachments={buildOrderAttachments(selected)} onChanged={onReload} />
                )}
            </div>

            {/* Slide-in (from the right) editors opened from the field reports tab. */}
            <SlidePanel open={drawer === 'costs'} onClose={() => setDrawer(null)} title={t('projects.harici_giderler')} width={560}>
                {costsContent}
            </SlidePanel>
            <SlidePanel open={drawer === 'materials'} onClose={() => setDrawer(null)} title={t('nav.materials')} width={620}>
                {materialsContent}
            </SlidePanel>
        </Card>
    );
};

// Technician-side autosave: the in-progress field report is kept in localStorage
// (keyed by appointment) so a refresh never loses work. It is NOT sent to the
// manager until "Finish & Send"; the draft is cleared once the report is sent.
const DRAFT_PREFIX = 'offitec:install-draft:';
type InstallationDraft = {
    operations: string[];
    technicalNotes: string;
    reportImages: string[];
    expenseRows: Array<{ expenseType: string; amount: number; description: string }>;
    materialRows: Array<{ materialId: string; quantity: number; description: string }>;
    usedMaterialRows: Array<{ materialId: string; quantity: number; description: string }>;
};
const loadInstallationDraft = (id?: string | null): InstallationDraft | null => {
    if (!id) return null;
    try { const raw = localStorage.getItem(DRAFT_PREFIX + id); return raw ? (JSON.parse(raw) as InstallationDraft) : null; } catch { return null; }
};
const saveInstallationDraft = (id: string, draft: InstallationDraft) => {
    try { localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(draft)); }
    catch { try { localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify({ ...draft, reportImages: [] })); } catch { /* quota — ignore */ } }
};
const clearInstallationDraft = (id?: string | null) => { if (id) { try { localStorage.removeItem(DRAFT_PREFIX + id); } catch { /* ignore */ } } };

export const ProjectInstallation = () => {
    useLanguageRefresh();
    const navigate = useNavigate();
    const { appointmentId } = useParams();
    const [weekAnchor, setWeekAnchor] = useState(dayjs().format('YYYY-MM-DD'));
    const [appointments, setAppointments] = useState<InstallationAppointment[]>([]);
    const [selected, setSelected] = useState<InstallationAppointment | null>(null);
    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [operations, setOperations] = useState<string[]>(['']);
    const [technicalNotes, setTechnicalNotes] = useState('');
    const [reportImages, setReportImages] = useState<string[]>([]);
    const [expenseRows, setExpenseRows] = useState([{ expenseType: t('projects.diger'), amount: 0, description: '' }]);
    const [materialRows, setMaterialRows] = useState([{ materialId: '', quantity: 1, description: '' }]);
    const [usedMaterialRows, setUsedMaterialRows] = useState([{ materialId: '', quantity: 1, description: '' }]);
    const [deliveryReports, setDeliveryReports] = useState<DeliveryReportDto[]>([]);
    const [reloadKey, setReloadKey] = useState(0);

    // Tenant context is set asynchronously by fetchProfile() after app start; the
    // axios interceptor reads it for the X-Tenant-Id header. `user.id` and
    // `selectedTenantId` are written together once the profile resolves, so gating
    // the fetch on `userId` guarantees the tenant header is attached — otherwise a
    // hard refresh can fire the list request before the tenant is known and come
    // back empty (the page then only fills in after navigating away and back).
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const userId = useAuthStore((s) => s.user?.id);

    const weekStart = useMemo(() => isoWeekStart(weekAnchor), [weekAnchor]);

    // Guards against out-of-order responses: only the newest load may write state,
    // so a slow early (wrong-tenant/empty) response can't clobber a good one.
    const loadSeq = useRef(0);

    const load = async () => {
        const seq = ++loadSeq.current;
        setLoading(true);
        try {
            const rows = appointmentId
                ? [await projectApi.getMyInstallation(appointmentId)]
                : await projectApi.listMyInstallations(weekStart.format('YYYY-MM-DD'), weekStart.add(6, 'day').format('YYYY-MM-DD'));
            if (seq !== loadSeq.current) return;
            setAppointments(rows as InstallationAppointment[]);
            setSelected((current) => {
                if (appointmentId) return rows[0] as InstallationAppointment || null;
                if (current) return (rows as InstallationAppointment[]).find((row) => row.id === current.id) || rows[0] as InstallationAppointment || null;
                return rows[0] as InstallationAppointment || null;
            });
        } catch (error: any) {
            if (seq !== loadSeq.current) return;
            toast.error(error.response?.data?.error ||t('projects.montajlar_yuklenemedi'));
            setAppointments([]);
            setSelected(null);
        }
        try {
            const mats = await projectApi.materials();
            if (seq === loadSeq.current) setMaterials(mats);
        } catch {
            if (seq === loadSeq.current) setMaterials([]);
        }
        if (seq === loadSeq.current) setLoading(false);
    };

    const reloadAll = () => { void load(); setReloadKey((key) => key + 1); };

    useEffect(() => {
        // Wait until the auth profile (and tenant) has resolved before fetching,
        // then reload whenever the resolved tenant changes.
        if (!userId || !selectedTenantId) return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart.valueOf(), appointmentId, selectedTenantId, userId]);

    // Delivery reports for the order back the general-report preview button.
    useEffect(() => {
        const projectId = selected?.project?.id;
        if (!projectId) { setDeliveryReports([]); return; }
        deliveryReportApi.list({ projectId }).then(setDeliveryReports).catch(() => setDeliveryReports([]));
    }, [selected?.project?.id, reloadKey]);

    const selectedReport = findReport(selected);
    const canFinish = selected && !selectedReport && !dayjs().isBefore(eventStart(selected), 'day');

    // Restore the technician's local draft (or reset to blanks) when switching
    // appointment. Once the report is sent there is nothing to edit.
    useEffect(() => {
        const draft = !selectedReport ? loadInstallationDraft(selected?.id) : null;
        setOperations(draft?.operations?.length ? draft.operations : ['']);
        setTechnicalNotes(draft?.technicalNotes || '');
        setReportImages(Array.isArray(draft?.reportImages) ? draft.reportImages : []);
        setExpenseRows(draft?.expenseRows?.length ? draft.expenseRows : [{ expenseType: t('projects.diger'), amount: 0, description: '' }]);
        setMaterialRows(draft?.materialRows?.length ? draft.materialRows : [{ materialId: '', quantity: 1, description: '' }]);
        setUsedMaterialRows(draft?.usedMaterialRows?.length ? draft.usedMaterialRows : [{ materialId: '', quantity: 1, description: '' }]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.id, Boolean(selectedReport)]);

    // Persist the in-progress draft as the technician edits (not while finished).
    useEffect(() => {
        if (!selected?.id || selectedReport) return;
        saveInstallationDraft(selected.id, { operations, technicalNotes, reportImages, expenseRows, materialRows, usedMaterialRows });
    }, [selected?.id, selectedReport, operations, technicalNotes, reportImages, expenseRows, materialRows, usedMaterialRows]);

    const submit = async (signatureBase64?: string) => {
        if (!selected) return;
        const cleanOperations = operations.map((item) => item.trim()).filter(Boolean);
        if (!cleanOperations.length) {
            toast.error(t('projects.yapilan_islerden_en_az_bir_madde_girin'));
            return;
        }
        setSaving(true);
        try {
            const result = await projectApi.completeInstallation(selected.id, {
                operationsDoneItems: cleanOperations,
                technicalNotes,
                images: reportImages,
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
            toast.success(result.message ||t('projects.montaj_tamamlandi'));
            if (result.addonOrder) toast.success(t('projects.addonOrderCreated', { orderNumber: result.addonOrder.orderNumber }));
            clearInstallationDraft(selected.id);
            // Stay on the appointment so the now-sent report shows and the
            // signature actions unlock (signatures are disabled until Finish).
            await load();
            setReloadKey((key) => key + 1);
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('projects.montaj_tamamlanamadi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Proje"
                title={appointmentId ?t('projects.teknisyen_montaj_ekrani') :t('nav.technicianInstallations')}
                description={appointmentId ?t('projects.saha_raporu_harici_gider_malzeme_ve_musteri_imza') :t('projects.size_atanmis_proje_montaj_randevulari_burada_gor')}
                actions={appointmentId ? (
                    <Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/projects/installation/tasks')}>{t('projects.takvime_don')}</Button>
                ) : (
                    <div className="flex items-center gap-2">
                        <input type="date" value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value || dayjs().format('YYYY-MM-DD'))} className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] font-semibold outline-none" />
                        <Button variant="secondary" size="sm" icon={<ArrowLeft size={12} />} onClick={() => setWeekAnchor(dayjs(weekAnchor).subtract(1, 'week').format('YYYY-MM-DD'))} />
                        <Button variant="secondary" size="sm" onClick={() => setWeekAnchor(dayjs().format('YYYY-MM-DD'))}>{t('projects.bugun')}</Button>
                        <Button variant="secondary" size="sm" icon={<ArrowRight size={12} />} onClick={() => setWeekAnchor(dayjs(weekAnchor).add(1, 'week').format('YYYY-MM-DD'))} />
                    </div>
                )}
            />

            <div className="grid grid-cols-1 gap-4">
                {!appointmentId && (
                    <Card title={t('nav.technicianInstallations')} icon={<Clipboard size={13} />} noPadding>
                        {loading ? <div className="m-4 h-72 animate-pulse rounded bg-slate-100" /> : appointments.length === 0 ? (
                            <EmptyState icon={<Clipboard size={32} />} title={t('projects.montaj_yok')} description={t('projects.secili_haftada_montaj_kaydi_yok')} />
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

                {/* Detail route: show a skeleton while the appointment loads and a
                    clear retry/back state if it fails — otherwise a hard refresh on
                    this URL would render a blank page before/if the fetch resolves. */}
                {appointmentId && !selected && loading && (
                    <Card title={t('projects.teknisyen_montaj_ekrani')} icon={<Clipboard size={13} />}>
                        <div className="h-72 animate-pulse rounded bg-slate-100" />
                    </Card>
                )}

                {appointmentId && !selected && !loading && (
                    <Card title={t('projects.teknisyen_montaj_ekrani')} icon={<Clipboard size={13} />}>
                        <EmptyState
                            icon={<Clipboard size={32} />}
                            title={t('projects.montaj_yok')}
                            description={t('projects.secili_haftada_montaj_kaydi_yok')}
                            action={(
                                <div className="flex items-center gap-2">
                                    <Button variant="secondary" size="sm" onClick={() => reloadAll()}>{t('common.refresh')}</Button>
                                    <Button variant="secondary" size="sm" icon={<ArrowLeft size={12} />} onClick={() => navigate('/projects/installation/tasks')}>{t('projects.takvime_don')}</Button>
                                </div>
                            )}
                        />
                    </Card>
                )}

                {appointmentId && selected && (
                    <InstallationDetailCard
                        selected={selected}
                        appointments={appointments}
                        selectedReport={selectedReport}
                        canFinish={Boolean(canFinish)}
                        materials={materials}
                        saving={saving}
                        operations={operations}
                        setOperations={setOperations}
                        technicalNotes={technicalNotes}
                        setTechnicalNotes={setTechnicalNotes}
                        reportImages={reportImages}
                        setReportImages={setReportImages}
                        expenseRows={expenseRows}
                        setExpenseRows={setExpenseRows}
                        materialRows={materialRows}
                        setMaterialRows={setMaterialRows}
                        usedMaterialRows={usedMaterialRows}
                        setUsedMaterialRows={setUsedMaterialRows}
                        deliveryReports={deliveryReports}
                        onSubmit={() => submit()}
                        onReload={reloadAll}
                    />
                )}
            </div>
        </div>
    );
};
