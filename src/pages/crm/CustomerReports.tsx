import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Eye, FileDownload02 as DownloadIcon } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import { customerApi } from '../../lib/api/customer';
import type { CustomerOrderDto } from '../../lib/api/customer';
import { projectApi, deliveryReportApi, type ServiceReportDto, type DeliveryReportDto } from '../../lib/api/project';
import type { ProjectDto } from '../../types/project';
import { Button } from '../../components/ui-shared/Button';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { FILTER_INPUT_CLASS, SectionCard, TableStateRow } from '../../components/ui-shared/TableKit';
import { ReportPdfSheet } from './detail/ReportPdfSheet';

/**
 * ── KUNDENBERICHTE ──────────────────────────────────────────────────────────
 *
 * Drei Ansichten (Rapporte / Gesamtbericht / Abnahmebericht), alle als Tabelle.
 * Gesamt- und Abnahmebericht hängen am AUFTRAG, nicht mehr am Projekt: die
 * Zeilen sind Aufträge des Kunden, und die Berichte werden auf den jeweiligen
 * `salesOrderId` eingegrenzt.
 *
 * Vorschau und Export benutzen denselben Generator: die Vorschau lässt ihn mit
 * `output: 'blob'` laufen und zeigt das Ergebnis in einem aufsteigenden Blatt,
 * der Export lädt dieselbe Datei herunter.
 *
 * Laden: die Auftragsliste ist kundenbezogen und liefert zugleich die
 * Projekt-Ids, mit denen die Abnahmeberichte eingegrenzt werden — der frühere
 * mandantenweite Projektabruf entfällt dadurch. Die Rapport- und
 * Abnahmelisten selbst kommen weiterhin mandantenweit vom Server (dafür fehlt
 * ein kundenbezogener Endpunkt), Projekte werden aber je Id nur EINMAL geholt
 * und danach wiederverwendet.
 */

const money = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

/** Dauer in der gewählten Sprache — die Einheiten kommen aus der Übersetzung. */
const durationFmt = (minutes?: number | null) => {
    const total = Math.max(0, Math.round(Number(minutes || 0)));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    const h = `${hours} ${t('common.hoursShort')}`;
    return mins ? `${h} ${mins} ${t('common.minutesShort')}` : h;
};

type ReportView = 'field' | 'general' | 'delivery';
type DateRange = { start: string; end: string };

// Field-report visuals for an order, gathered from the project's reports.
const gatherDeliveryImages = (project: ProjectDto, report: DeliveryReportDto): Array<{ imageData: string }> => {
    const reports = ((project as any).reports || []) as any[];
    return reports
        .filter((r) => !report.salesOrderId || (r.salesOrderId || null) === report.salesOrderId)
        .flatMap((r) => (Array.isArray(r.images) ? r.images : []))
        .filter((img: any) => img?.imageData)
        .map((img: any) => ({ imageData: img.imageData }));
};

const deliveryTechnicianName = (project: ProjectDto, report: DeliveryReportDto): string => {
    const appt = ((project as any).appointments || []).find((a: any) => a.id === report.appointmentId);
    const tech = appt?.assignedTechnician;
    return tech ? `${tech.firstName || ''} ${tech.lastName || ''}`.trim() : '';
};

/** Unterschrift vorhanden? Das ist der Status, den die Berichtstabellen zeigen. */
const SignatureChip = ({ signed }: { signed: boolean }) => (
    <StatusChip variant={signed ? 'active' : 'warning'}>
        {signed ? t('projects.delivery.statusSigned') : t('projects.delivery.statusUnsigned')}
    </StatusChip>
);

export const CustomerReports: React.FC<{ customerId: string }> = ({ customerId }) => {
    const [view, setView] = useState<ReportView>('field');

    // Aufträge des Kunden: Zeilen für Gesamt-/Abnahmebericht und zugleich die
    // Quelle der Projekt-Ids für die Eingrenzung.
    const [orders, setOrders] = useState<CustomerOrderDto[]>([]);
    const [ordersLoaded, setOrdersLoaded] = useState(false);

    const [reports, setReports] = useState<ServiceReportDto[]>([]);
    const [reportsLoading, setReportsLoading] = useState(true);

    const [deliveryReports, setDeliveryReports] = useState<DeliveryReportDto[]>([]);
    const [deliveryLoaded, setDeliveryLoaded] = useState(false);

    const [ranges, setRanges] = useState<Record<string, DateRange>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    // Spaltenfilter — greifen sofort beim Tippen, ohne Absende-Knopf.
    const [dateFilter, setDateFilter] = useState('');
    const [orderFilter, setOrderFilter] = useState('');

    // Vorschau
    const [sheetOpen, setSheetOpen] = useState(false);
    const [sheetTitle, setSheetTitle] = useState('');
    const [sheetSubtitle, setSheetSubtitle] = useState('');
    const [sheetBlob, setSheetBlob] = useState<Blob | null>(null);
    const [sheetLoading, setSheetLoading] = useState(false);
    const downloadRef = useRef<(() => void) | null>(null);

    // Projekte werden je Id nur einmal geholt; Vorschau und Export danach sofort.
    const projectCache = useRef(new Map<string, ProjectDto>());
    const getProject = useCallback(async (projectId: string): Promise<ProjectDto> => {
        const cached = projectCache.current.get(projectId);
        if (cached) return cached;
        const project = await projectApi.getById(projectId);
        projectCache.current.set(projectId, project);
        return project;
    }, []);

    useEffect(() => {
        projectCache.current.clear();
        setOrdersLoaded(false);
        setDeliveryLoaded(false);
        let cancelled = false;

        void (async () => {
            try {
                const rows = await customerApi.listOrders(customerId);
                if (cancelled) return;
                setOrders(rows);
                const defStart = dayjs().startOf('month').format('YYYY-MM-DD');
                const defEnd = dayjs().format('YYYY-MM-DD');
                setRanges(Object.fromEntries(rows.map((o) => [o.id, { start: defStart, end: defEnd }])));
                setOrdersLoaded(true);
            } catch (error: any) {
                if (!cancelled) toast.error(error.response?.data?.error || t('projects.errorLoad'));
            }
        })();

        void (async () => {
            setReportsLoading(true);
            try {
                const all = await projectApi.listAllReports({});
                if (!cancelled) setReports(all.filter((r) => r.project?.customer?.id === customerId));
            } catch (error: any) {
                if (!cancelled) toast.error(error.response?.data?.error || t('projects.errorLoad'));
            } finally {
                if (!cancelled) setReportsLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [customerId]);

    // Abnahmeberichte erst beim Öffnen der Ansicht, eingegrenzt über die
    // Projekt-Ids der Aufträge.
    useEffect(() => {
        if (view !== 'delivery' || deliveryLoaded || !ordersLoaded) return;
        let cancelled = false;
        void (async () => {
            try {
                const projectIds = new Set(orders.map((o) => o.projectId).filter(Boolean) as string[]);
                const orderIds = new Set(orders.map((o) => o.id));
                const all = await deliveryReportApi.list();
                if (cancelled) return;
                setDeliveryReports(all.filter((r) =>
                    (r.salesOrderId && orderIds.has(r.salesOrderId))
                    || (r.projectId && projectIds.has(r.projectId))));
                setDeliveryLoaded(true);
            } catch (error: any) {
                if (!cancelled) toast.error(error.response?.data?.error || t('projects.errorLoad'));
            }
        })();
        return () => { cancelled = true; };
    }, [view, deliveryLoaded, ordersLoaded, orders]);

    const orderNumberOf = (report: ServiceReportDto) =>
        report.salesOrder?.orderNumber ? localizeTenderNumbersInText(report.salesOrder.orderNumber) : '';

    /** Spaltenfilter: Arbeitstag und Auftrag, beide als Teiltreffer. */
    const visibleReports = useMemo(() => {
        const date = dateFilter.trim().toLowerCase();
        const order = orderFilter.trim().toLowerCase();
        return reports.filter((r) => {
            if (date) {
                const shown = dayjs(r.workDate).format('DD.MM.YYYY');
                if (!shown.toLowerCase().includes(date) && !String(r.workDate).toLowerCase().includes(date)) return false;
            }
            if (order) {
                const haystack = `${orderNumberOf(r)} ${r.project?.projectName ?? ''}`.toLowerCase();
                if (!haystack.includes(order)) return false;
            }
            return true;
        });
    }, [reports, dateFilter, orderFilter]);

    const visibleDeliveries = useMemo(() => {
        const date = dateFilter.trim().toLowerCase();
        const order = orderFilter.trim().toLowerCase();
        return deliveryReports.filter((r) => {
            if (date) {
                const shown = dayjs(r.sentAt || r.createdAt).format('DD.MM.YYYY');
                if (!shown.toLowerCase().includes(date)) return false;
            }
            if (order) {
                const haystack = `${r.orderNumber ?? ''} ${r.projectName ?? ''} ${r.checklistName ?? ''}`.toLowerCase();
                if (!haystack.includes(order)) return false;
            }
            return true;
        });
    }, [deliveryReports, dateFilter, orderFilter]);

    const visibleOrders = useMemo(() => {
        const order = orderFilter.trim().toLowerCase();
        if (!order) return orders;
        return orders.filter((o) =>
            `${o.orderNumber} ${o.project?.projectName ?? ''}`.toLowerCase().includes(order));
    }, [orders, orderFilter]);

    const openSheet = (title: string, subtitle: string) => {
        setSheetTitle(title);
        setSheetSubtitle(subtitle);
        setSheetBlob(null);
        setSheetLoading(true);
        setSheetOpen(true);
    };

    /** Rapport eines Tages: Vorschau als Blob, Export über denselben Generator. */
    const previewFieldReport = async (row: ServiceReportDto) => {
        openSheet(t('services.tabField'), `${dayjs(row.workDate).format('DD.MM.YYYY')} · ${orderNumberOf(row) || '—'}`);
        setBusyId(row.id);
        try {
            const project = await getProject(row.projectId);
            const fullReport = (project.reports || []).find((r: any) => r.id === row.id) || row;
            const appointment = (project.appointments || []).find((a: any) => a.id === (fullReport as any).appointmentId) || null;
            const { exportFieldReportPdf } = await import('../../utils/pdf/fieldReportPdf');
            const blob = await exportFieldReportPdf(project, fullReport, { appointment, output: 'blob' }) as Blob | null;
            setSheetBlob(blob ?? null);
            downloadRef.current = () => { void exportFieldReportPdf(project, fullReport, { appointment }); };
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('services.toastPdfError'));
            setSheetOpen(false);
        } finally {
            setBusyId(null);
            setSheetLoading(false);
        }
    };

    /** Gesamtbericht eines AUFTRAGS: nur dessen Rapporte im gewählten Zeitraum. */
    const generalReportFor = async (order: CustomerOrderDto, preview: boolean) => {
        if (!order.projectId) {
            toast.error(t('crm.orderWithoutProject'));
            return;
        }
        const range = ranges[order.id];
        if (!range?.start || !range?.end) {
            toast.error(t('projects.general.selectRange'));
            return;
        }
        if (preview) {
            openSheet(t('services.tabGeneral'), `${localizeTenderNumbersInText(order.orderNumber)} · ${dayjs(range.start).format('DD.MM.YYYY')} – ${dayjs(range.end).format('DD.MM.YYYY')}`);
        }
        setBusyId(order.id);
        try {
            const project = await getProject(order.projectId);
            // Auf den Auftrag eingegrenzt — der Generator liest `project.reports`.
            const scoped = {
                ...project,
                reports: ((project as any).reports || []).filter((r: any) => (r.salesOrderId || null) === order.id),
            } as ProjectDto;
            const { exportProjectGeneralReportPdf } = await import('../../utils/pdf/projectReportPdf');
            const options = { startDate: range.start, endDate: range.end };
            if (preview) {
                const blob = await exportProjectGeneralReportPdf(scoped, { ...options, output: 'blob' }) as Blob | null;
                setSheetBlob(blob ?? null);
                downloadRef.current = () => { void exportProjectGeneralReportPdf(scoped, options); };
            } else {
                await exportProjectGeneralReportPdf(scoped, options);
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('projects.genel_rapor_olusturulamadi'));
            if (preview) setSheetOpen(false);
        } finally {
            setBusyId(null);
            setSheetLoading(false);
        }
    };

    const deliveryReportFor = async (row: DeliveryReportDto, preview: boolean) => {
        if (preview) {
            openSheet(t('projects.delivery.adminTitle'), `${row.orderNumber ? localizeTenderNumbersInText(row.orderNumber) : row.checklistName || '—'}`);
        }
        setBusyId(row.id);
        try {
            const project = row.projectId ? await getProject(row.projectId) : null;
            const { exportDeliveryReportPdf } = await import('../../utils/pdf/deliveryReportPdf');
            const params = {
                report: row,
                project,
                fieldImages: project ? gatherDeliveryImages(project, row) : [],
                preparedBy: project ? deliveryTechnicianName(project, row) : '',
            };
            if (preview) {
                const blob = await exportDeliveryReportPdf({ ...params, output: 'blob' }) as Blob | null;
                setSheetBlob(blob ?? null);
                downloadRef.current = () => { void exportDeliveryReportPdf(params); };
            } else {
                await exportDeliveryReportPdf(params);
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('services.toastPdfError'));
            if (preview) setSheetOpen(false);
        } finally {
            setBusyId(null);
            setSheetLoading(false);
        }
    };

    const TabButton = ({ id, label }: { id: ReportView; label: string }) => (
        <button
            type="button"
            onClick={() => setView(id)}
            className={`rounded-[2px] px-3 py-1.5 text-[12.5px] font-semibold transition ${
                view === id ? 'bg-[#1f2654] text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10'
            }`}
        >
            {label}
        </button>
    );

    /** Filterzeile — dieselben zwei Felder für alle drei Ansichten. */
    const filterRow = (dateLabel: string, orderColSpan: number, trailingColSpan: number) => (
        <tr data-filter-row>
            <th className="pb-1.5">
                <input
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}
                    placeholder={dateLabel}
                    className={FILTER_INPUT_CLASS}
                />
            </th>
            <th colSpan={orderColSpan} className="pb-1.5">
                <input
                    value={orderFilter}
                    onChange={(event) => setOrderFilter(event.target.value)}
                    placeholder={t('crm.orderNumber')}
                    className={FILTER_INPUT_CLASS}
                />
            </th>
            <th colSpan={trailingColSpan} />
        </tr>
    );

    return (
        <div>
            <div className="mb-2 inline-flex items-center gap-1 rounded-[2px] border border-slate-200 bg-white p-1 dark:border-white/15 dark:bg-white/5">
                <TabButton id="field" label={t('services.tabField')} />
                <TabButton id="general" label={t('services.tabGeneral')} />
                <TabButton id="delivery" label={t('projects.delivery.adminTab')} />
            </div>

            {view === 'field' && (
                <SectionCard title={`${t('services.tabField')} (${visibleReports.length})`}>
                    <table data-inv-table data-unstyled-table className="w-full">
                        <thead>
                            <tr>
                                <th className="w-40 text-left">{t('services.colWorkDate')}</th>
                                <th className="text-left">{t('crm.orderNumber')}</th>
                                <th className="w-28 text-right">{t('services.colAppointmentTime')}</th>
                                <th className="w-28 text-right">{t('services.colWorkedHours')}</th>
                                <th className="w-28 text-right">{t('services.colOvertime')}</th>
                                <th className="w-28 text-right">{t('services.colHourlyRate')}</th>
                                <th className="w-28 text-right">{t('services.colExtraFee')}</th>
                                <th className="w-32 text-left">{t('common.status')}</th>
                                <th className="w-24 text-right">PDF</th>
                            </tr>
                            {filterRow(t('services.colWorkDate'), 1, 7)}
                        </thead>
                        <tbody>
                            {(reportsLoading || visibleReports.length === 0) && (
                                <TableStateRow colSpan={9} loading={reportsLoading} emptyText={t('services.noFieldReports')} />
                            )}
                            {!reportsLoading && visibleReports.map((r) => (
                                <tr key={r.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    {/* Arbeitstag mit Uhrzeit */}
                                    <td className="font-medium text-slate-800 dark:text-white">
                                        {dayjs(r.workDate).format('DD.MM.YYYY')}
                                        {r.startedAt && r.endedAt && (
                                            <span className="ml-1.5 text-[11px] font-normal text-slate-500 dark:text-white/50">
                                                {dayjs(r.startedAt).format('HH:mm')}–{dayjs(r.endedAt).format('HH:mm')}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <div className="font-medium text-slate-800 dark:text-white">{orderNumberOf(r) || '—'}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-white/50">{r.project?.projectName || '—'}</div>
                                    </td>
                                    <td className="text-right text-slate-600 dark:text-white/70">{durationFmt(r.plannedMinutesForDay)}</td>
                                    <td className="text-right text-slate-800 dark:text-white">{durationFmt(r.workedMinutes)}</td>
                                    <td className="text-right text-slate-600 dark:text-white/70">{r.overtimeMinutes > 0 ? durationFmt(r.overtimeMinutes) : '—'}</td>
                                    <td className="text-right font-mono tabular-nums text-slate-600 dark:text-white/70">{money(r.overtimeHourlyRate)}</td>
                                    <td className="text-right font-mono tabular-nums font-medium text-slate-800 dark:text-white">{money(r.overtimeCost)}</td>
                                    <td><SignatureChip signed={Boolean(r.isSigned)} /></td>
                                    <td className="text-right">
                                        <Button variant="ghost" size="sm" icon={<Eye size={13} />} disabled={busyId === r.id} onClick={() => void previewFieldReport(r)}>
                                            {busyId === r.id ? '…' : t('projects.general.preview')}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SectionCard>
            )}

            {view === 'general' && (
                <SectionCard title={`${t('services.tabGeneral')} (${visibleOrders.length})`}>
                    <table data-inv-table data-unstyled-table className="w-full">
                        <thead>
                            <tr>
                                <th className="w-44 text-left">{t('crm.orderNumber')}</th>
                                <th className="text-left">{t('nav.projects')}</th>
                                <th className="w-[150px] text-left">{t('services.colStart')}</th>
                                <th className="w-[150px] text-left">{t('services.colEnd')}</th>
                                <th className="w-52 text-right">PDF</th>
                            </tr>
                            {filterRow(t('common.date'), 1, 3)}
                        </thead>
                        <tbody>
                            {(!ordersLoaded || visibleOrders.length === 0) && (
                                <TableStateRow colSpan={5} loading={!ordersLoaded} emptyText={t('crm.noOrders')} />
                            )}
                            {visibleOrders.map((order) => (
                                <tr key={order.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td className="font-mono text-[13px] font-semibold text-slate-800 dark:text-white">
                                        {localizeTenderNumbersInText(order.orderNumber)}
                                    </td>
                                    <td className="text-slate-600 dark:text-white/70">{order.project?.projectName || '—'}</td>
                                    <td>
                                        <input
                                            type="date"
                                            value={ranges[order.id]?.start || ''}
                                            onChange={(e) => setRanges((prev) => ({ ...prev, [order.id]: { ...prev[order.id], start: e.target.value } }))}
                                            className={FILTER_INPUT_CLASS}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="date"
                                            value={ranges[order.id]?.end || ''}
                                            onChange={(e) => setRanges((prev) => ({ ...prev, [order.id]: { ...prev[order.id], end: e.target.value } }))}
                                            className={FILTER_INPUT_CLASS}
                                        />
                                    </td>
                                    <td className="text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Button variant="ghost" size="sm" icon={<Eye size={13} />} disabled={busyId === order.id} onClick={() => void generalReportFor(order, true)}>
                                                {t('projects.general.preview')}
                                            </Button>
                                            <Button variant="secondary" size="sm" icon={<DownloadIcon size={13} />} disabled={busyId === order.id} onClick={() => void generalReportFor(order, false)}>
                                                {busyId === order.id ? '…' : 'PDF'}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SectionCard>
            )}

            {view === 'delivery' && (
                <SectionCard title={`${t('projects.delivery.adminTitle')} (${visibleDeliveries.length})`}>
                    <table data-inv-table data-unstyled-table className="w-full">
                        <thead>
                            <tr>
                                <th className="w-40 text-left">{t('projects.delivery.colSentAt')}</th>
                                <th className="text-left">{t('crm.orderNumber')}</th>
                                <th className="w-56 text-left">{t('projects.delivery.colChecklist')}</th>
                                <th className="w-32 text-left">{t('common.status')}</th>
                                <th className="w-52 text-right">PDF</th>
                            </tr>
                            {filterRow(t('projects.delivery.colSentAt'), 1, 3)}
                        </thead>
                        <tbody>
                            {(!deliveryLoaded || visibleDeliveries.length === 0) && (
                                <TableStateRow colSpan={5} loading={!deliveryLoaded} emptyText={t('projects.delivery.noReports')} />
                            )}
                            {visibleDeliveries.map((r) => (
                                <tr key={r.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td className="text-slate-600 dark:text-white/70">{dayjs(r.sentAt || r.createdAt).format('DD.MM.YYYY HH:mm')}</td>
                                    <td>
                                        <div className="font-medium text-slate-800 dark:text-white">
                                            {r.orderNumber ? localizeTenderNumbersInText(r.orderNumber) : '—'}
                                        </div>
                                        <div className="text-[11px] text-slate-500 dark:text-white/50">{r.projectName || '—'}</div>
                                    </td>
                                    <td className="truncate text-slate-600 dark:text-white/70">{r.checklistName || '—'}</td>
                                    <td><SignatureChip signed={Boolean(r.isSigned)} /></td>
                                    <td className="text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Button variant="ghost" size="sm" icon={<Eye size={13} />} disabled={busyId === r.id} onClick={() => void deliveryReportFor(r, true)}>
                                                {t('projects.general.preview')}
                                            </Button>
                                            <Button variant="secondary" size="sm" icon={<DownloadIcon size={13} />} disabled={busyId === r.id} onClick={() => void deliveryReportFor(r, false)}>
                                                {busyId === r.id ? '…' : 'PDF'}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SectionCard>
            )}

            <ReportPdfSheet
                open={sheetOpen}
                title={sheetTitle}
                subtitle={sheetSubtitle}
                blob={sheetBlob}
                loading={sheetLoading}
                onClose={() => { setSheetOpen(false); setSheetBlob(null); }}
                onDownload={() => downloadRef.current?.()}
            />
        </div>
    );
};

export default CustomerReports;
