import dayjs from 'dayjs';

// Hierarchical view helpers: costs and extra materials are entered through field
// reports, so the lists group each record under the report it came from.
// Matching order: shared appointmentId first, then same work day, else "unassigned".

export type ReportRecordGroup<T> = {
    key: string;
    report: any | null;
    items: T[];
};

const recordDay = (value?: string | null) => (value ? dayjs(value).format('YYYY-MM-DD') : null);

export const groupRecordsByReport = <T extends { appointmentId?: string | null }>(
    reports: any[],
    records: T[],
    dateOf: (record: T) => string | null | undefined,
): { groups: Array<ReportRecordGroup<T>>; unassigned: T[] } => {
    const sortedReports = [...reports].sort((a: any, b: any) =>
        dayjs(b.workDate || b.reportDate || b.startedAt).valueOf() - dayjs(a.workDate || a.reportDate || a.startedAt).valueOf());

    const groups = sortedReports.map((report: any) => ({
        key: report.id as string,
        report,
        items: [] as T[],
    }));
    const byAppointment = new Map<string, ReportRecordGroup<T>>();
    const byDay = new Map<string, ReportRecordGroup<T>>();
    groups.forEach((group) => {
        if (group.report.appointmentId) byAppointment.set(group.report.appointmentId, group);
        const day = recordDay(group.report.workDate || group.report.reportDate);
        // First report of a day wins; later duplicates only match via appointmentId.
        if (day && !byDay.has(day)) byDay.set(day, group);
    });

    const unassigned: T[] = [];
    records.forEach((record) => {
        const viaAppointment = record.appointmentId ? byAppointment.get(record.appointmentId) : undefined;
        if (viaAppointment) {
            viaAppointment.items.push(record);
            return;
        }
        const day = recordDay(dateOf(record));
        const viaDay = day ? byDay.get(day) : undefined;
        if (viaDay) {
            viaDay.items.push(record);
            return;
        }
        unassigned.push(record);
    });

    return { groups, unassigned };
};
