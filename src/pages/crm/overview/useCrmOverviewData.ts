import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { tenderApi } from '../../../lib/api/tender';
import { projectApi, type SalesOrderDto } from '../../../lib/api/project';
import { maintenanceApi } from '../../../lib/api/maintenance';
import { notificationApi, type NotificationDto } from '../../../lib/api/notifications';
import { meetingApi, type MeetingActivityDto } from '../../../lib/api/meetings';
import { fetchStaffDirectory } from '../../../lib/api/directory';
import type { TenderListItem } from '../../../types/tender';
import type { MaintenanceTaskDto } from '../../../types/maintenance';
import type { AppointmentDto } from '../../../types/project';
import {
    APPROACHING_DEADLINE_DAYS,
    criticalOffers,
    daysUntilExpiry,
    estimatedValueOf,
    isOfferOpen,
    orderedTenderIds,
    periodRange,
    type CriticalOffer,
    type EmployeeLite,
    type OverviewFilters,
} from './overviewShared';

dayjs.extend(isoWeek);

export interface KpiMoney {
    count: number;
    /** Sum in the ORIGINAL offer currencies is meaningless — every addend is
        pre-converted to CHF by the caller-supplied convert fn. */
    totalChf: number;
}

export interface CrmOverviewStats {
    openOffers: KpiMoney;
    approachingDeadline: KpiMoney;
    pendingApproval: KpiMoney;
    salesWon: KpiMoney;
    estimatedSales: KpiMoney;
    delayedTasks: number;
    /** created-offer delta vs the previous month ("3 more offers than last month") */
    offersCreatedInPeriod: number;
    offersCreatedInPrevPeriod: number;
    salesWonPrevChf: number;
}

export interface CrmOverviewData {
    loading: boolean;
    error: string | null;
    tenders: TenderListItem[];
    /** tenders after the user/role filter (period-independent snapshot lists). */
    filteredTenders: TenderListItem[];
    orders: SalesOrderDto[];
    filteredOrders: SalesOrderDto[];
    employees: EmployeeLite[];
    roles: string[];
    /** Lazily fetch the employee list (called when a people filter opens). */
    loadEmployees: () => void;
    tasks: MaintenanceTaskDto[];
    weekAppointments: AppointmentDto[];
    weekTasks: MaintenanceTaskDto[];
    notifications: NotificationDto[];
    /** Backend meeting activities (meetings + tasks) around today. */
    meetings: MeetingActivityDto[];
    /** Refetch ONLY the meetings section (partial update, no skeleton). */
    refreshMeetings: () => void;
    /** Tender ids that already have a sales order (from ALL orders, unfiltered). */
    orderedIds: Set<string>;
    critical: CriticalOffer[];
    stats: CrmOverviewStats;
    /** Silent full refetch — updates in place, never flips back to the skeleton. */
    refresh: () => void;
}

const asArray = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    const obj = value as { items?: unknown; data?: unknown } | null | undefined;
    if (Array.isArray(obj?.items)) return obj.items as T[];
    if (Array.isArray(obj?.data)) return obj.data as T[];
    return [];
};

const MEETING_RANGE = () => ({
    start: dayjs().subtract(30, 'day').toISOString(),
    end: dayjs().add(60, 'day').toISOString(),
});

/**
 * Tiered loading:
 *  - PRIMARY (tenders + orders + meetings) gates the skeleton — it is the data
 *    the KPI cards and charts are made of.
 *  - SECONDARY (maintenance tasks, week appointments, notifications) streams in
 *    afterwards and fills its sections without blocking first paint.
 *  - Employees are fetched ONLY when a people filter is opened (lazy + cached).
 * Every refresh path updates in place; the skeleton shows only before the very
 * first primary payload.
 */
export const useCrmOverviewData = (
    filters: OverviewFilters,
    convertToDisplay: (amount: number, from?: string | null) => number,
): CrmOverviewData => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [tenders, setTenders] = useState<TenderListItem[]>([]);
    const [orders, setOrders] = useState<SalesOrderDto[]>([]);
    const [meetings, setMeetings] = useState<MeetingActivityDto[]>([]);
    const [employees, setEmployees] = useState<EmployeeLite[]>([]);
    const [tasks, setTasks] = useState<MaintenanceTaskDto[]>([]);
    const [weekAppointments, setWeekAppointments] = useState<AppointmentDto[]>([]);
    const [notifications, setNotifications] = useState<NotificationDto[]>([]);

    // ── Primary wave: the numbers the page is about ──
    useEffect(() => {
        let cancelled = false;
        const meetingRange = MEETING_RANGE();
        Promise.all([
            tenderApi.list().catch(() => [] as TenderListItem[]),
            projectApi.listSalesOrders().catch(() => [] as SalesOrderDto[]),
            meetingApi.list(meetingRange.start, meetingRange.end).catch(() => [] as MeetingActivityDto[]),
        ])
            .then(([tenderRows, orderRows, meetingRows]) => {
                if (cancelled) return;
                setTenders(asArray<TenderListItem>(tenderRows));
                setOrders(asArray<SalesOrderDto>(orderRows));
                setMeetings(asArray<MeetingActivityDto>(meetingRows));
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                const e = err as { response?: { data?: { error?: string } }; message?: string };
                setError(e?.response?.data?.error || e?.message || 'load failed');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    // ── Secondary wave: agenda extras — never blocks the skeleton ──
    useEffect(() => {
        let cancelled = false;
        const taskStart = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
        const taskEnd = dayjs().add(14, 'day').format('YYYY-MM-DD');
        const weekStart = dayjs().startOf('isoWeek');
        const weekEnd = weekStart.add(6, 'day').endOf('day');

        maintenanceApi
            .listTasks(taskStart, taskEnd, { calendar: true })
            .then((rows) => {
                if (!cancelled) setTasks(asArray<MaintenanceTaskDto>(rows));
            })
            .catch(() => undefined);
        projectApi
            .listAppointments(weekStart.toISOString(), weekEnd.toISOString(), { calendar: true })
            .then((rows) => {
                if (!cancelled) setWeekAppointments(asArray<AppointmentDto>(rows));
            })
            .catch(() => undefined);
        notificationApi
            .list({ limit: 8 })
            .then((rows) => {
                if (!cancelled) setNotifications(asArray<NotificationDto>(rows));
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    // ── Employees: fetched only when a people filter actually opens ──
    const employeesRequested = useRef(false);
    const loadEmployees = useCallback(() => {
        if (employeesRequested.current) return;
        employeesRequested.current = true;
        fetchStaffDirectory()
            .then((rows) => setEmployees(rows as EmployeeLite[]))
            .catch(() => {
                // Allow a retry on the next open if the request failed.
                employeesRequested.current = false;
            });
    }, []);

    const refreshMeetings = useCallback(() => {
        const meetingRange = MEETING_RANGE();
        meetingApi
            .list(meetingRange.start, meetingRange.end)
            .then((rows) => setMeetings(asArray<MeetingActivityDto>(rows)))
            .catch(() => undefined);
    }, []);

    const roles = useMemo(
        () => [...new Set(employees.map((e) => e.roleName).filter(Boolean) as string[])].sort(),
        [employees],
    );

    // User/role filter resolves to a set of employee ids ('' = no restriction).
    const allowedEmployeeIds = useMemo(() => {
        if (filters.userId) return new Set([filters.userId]);
        if (filters.role) {
            return new Set(employees.filter((e) => e.roleName === filters.role).map((e) => e.id));
        }
        return null;
    }, [filters.userId, filters.role, employees]);

    const filteredTenders = useMemo(
        () => (allowedEmployeeIds ? tenders.filter((t) => allowedEmployeeIds.has(t.createdByEmployeeId)) : tenders),
        [tenders, allowedEmployeeIds],
    );

    const filteredOrders = useMemo(
        () => (allowedEmployeeIds ? orders.filter((o) => allowedEmployeeIds.has(o.createdByEmployeeId)) : orders),
        [orders, allowedEmployeeIds],
    );

    const filteredTasks = useMemo(
        () =>
            allowedEmployeeIds
                ? tasks.filter((task) => (task.assignedTechId ? allowedEmployeeIds.has(task.assignedTechId) : false))
                : tasks,
        [tasks, allowedEmployeeIds],
    );

    // Stage classification must see every order (a colleague may have converted
    // the offer), so the set is built from the unfiltered order list.
    const orderedIds = useMemo(() => orderedTenderIds(orders), [orders]);

    const critical = useMemo(() => criticalOffers(filteredTenders, orders), [filteredTenders, orders]);

    const stats = useMemo<CrmOverviewStats>(() => {
        const { start, end } = periodRange();
        const prevStart = start.subtract(1, 'month');
        const prevEnd = prevStart.endOf('month');
        const inRange = (iso: string | null | undefined, from: dayjs.Dayjs, to: dayjs.Dayjs) =>
            !!iso && !dayjs(iso).isBefore(from) && !dayjs(iso).isAfter(to);

        const sumKpi = (rows: TenderListItem[]): KpiMoney => ({
            count: rows.length,
            totalChf: rows.reduce((acc, t) => acc + convertToDisplay(t.grandTotal || 0, t.currency), 0),
        });

        const open = filteredTenders.filter((t) => isOfferOpen(t, orderedIds));
        const approaching = open.filter((t) => {
            const days = daysUntilExpiry(t);
            return days !== null && days >= 0 && days <= APPROACHING_DEADLINE_DAYS;
        });
        const pending = open.filter((t) => t.status === 'Draft');

        // "Sales won" = accepted offers of the period + orders without a linked
        // offer (direct orders), so a converted offer is never counted twice.
        const acceptedInPeriod = filteredTenders.filter((t) => inRange(t.offerAcceptedAt, start, end));
        const acceptedInPrev = filteredTenders.filter((t) => inRange(t.offerAcceptedAt, prevStart, prevEnd));
        const acceptedIds = new Set(filteredTenders.filter((t) => t.offerAcceptedAt).map((t) => t.id));
        const directOrders = (from: dayjs.Dayjs, to: dayjs.Dayjs) =>
            filteredOrders.filter((o) => inRange(o.createdAt, from, to) && !(o.tenderId && acceptedIds.has(o.tenderId)));

        const salesWonChf =
            acceptedInPeriod.reduce((acc, t) => acc + convertToDisplay(t.grandTotal || 0, t.currency), 0) +
            directOrders(start, end).reduce((acc, o) => acc + convertToDisplay(o.totalAmount || 0, 'CHF'), 0);
        const salesWonPrevChf =
            acceptedInPrev.reduce((acc, t) => acc + convertToDisplay(t.grandTotal || 0, t.currency), 0) +
            directOrders(prevStart, prevEnd).reduce((acc, o) => acc + convertToDisplay(o.totalAmount || 0, 'CHF'), 0);

        const estimated: KpiMoney = {
            count: open.length,
            totalChf: open.reduce((acc, t) => acc + convertToDisplay(estimatedValueOf(t, orderedIds), t.currency), 0),
        };

        const today = dayjs().startOf('day');
        const delayedTasks = filteredTasks.filter(
            (task) =>
                (task.status === 'PENDING' || task.status === 'IN_PROGRESS') &&
                dayjs(task.plannedDate).isBefore(today),
        ).length;

        return {
            openOffers: sumKpi(open),
            approachingDeadline: sumKpi(approaching),
            pendingApproval: sumKpi(pending),
            salesWon: { count: acceptedInPeriod.length + directOrders(start, end).length, totalChf: salesWonChf },
            estimatedSales: estimated,
            delayedTasks,
            offersCreatedInPeriod: filteredTenders.filter((t) => inRange(t.createdAt, start, end)).length,
            offersCreatedInPrevPeriod: filteredTenders.filter((t) => inRange(t.createdAt, prevStart, prevEnd)).length,
            salesWonPrevChf,
        };
    }, [filteredTenders, filteredOrders, filteredTasks, convertToDisplay, orderedIds]);

    const weekTasks = useMemo(() => {
        const weekStart = dayjs().startOf('isoWeek');
        const weekEnd = weekStart.add(6, 'day').endOf('day');
        return tasks.filter((task) => {
            const day = dayjs(task.plannedDate);
            return day.isAfter(weekStart.subtract(1, 'day')) && day.isBefore(weekEnd);
        });
    }, [tasks]);

    return {
        loading,
        error,
        tenders,
        filteredTenders,
        orders,
        filteredOrders,
        employees,
        roles,
        loadEmployees,
        tasks: filteredTasks,
        weekAppointments,
        weekTasks,
        notifications,
        meetings,
        refreshMeetings,
        orderedIds,
        critical,
        stats,
        refresh: () => setReloadKey((k) => k + 1),
    };
};
