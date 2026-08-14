import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { toast } from 'sonner';

import { projectApi, type CompleteInstallationInput } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { PersonLite } from '@/types/maintenance';
import type { MailSettingDto, ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { orderPayloadId, scopedRecords } from '../../../utils/projectOrderScope';
import {
    canManagerFinishAppointment,
    isAppointmentAwaitingTechnician,
} from '../../../utils/projectAppointments';
import { AppointmentMailPanel } from './schedule/AppointmentMailPanel';
import { AppointmentWizard } from './schedule/AppointmentWizard';
import { BottomSheet } from './schedule/BottomSheet';
import { DayPopup } from './schedule/DayPopup';
import { ScheduleCalendar } from './schedule/ScheduleCalendar';
import {
    appointmentClientLabel,
    appointmentTechIds,
    dayKey,
    type CalendarView,
} from './schedule/scheduleShared';

dayjs.extend(isoWeek);

type DayPopupState = { date: string; initialAppointment: any | null } | null;

// Appointment planning, reduced to one full-width Outlook-style calendar below
// the section tabs. Everything else happens in the bottom-sheet pop-ups: the
// day view (hosting the step-by-step wizard and the mail composer as slide-in
// views) plus the standalone create/mail sheets from the header buttons.
export const AppointmentList = ({
    project,
    order,
    isPrimary,
    settings = null,
    userEmail = '',
    onSaved,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    materials?: ProjectMaterial[];
    settings?: MailSettingDto | null;
    userEmail?: string;
    onSaved: () => Promise<void>;
}) => {
    const [view, setView] = useState<CalendarView>('week');
    const [cursor, setCursor] = useState(() => dayKey(dayjs()));
    const [technicianFilter, setTechnicianFilter] = useState('');
    const [technicians, setTechnicians] = useState<PersonLite[]>([]);
    const [tenantAppointments, setTenantAppointments] = useState<any[]>([]);
    // Bumped after every mutation so the tenant range refetches — the calendar
    // updates in place, never through a page reload.
    const [refreshTick, setRefreshTick] = useState(0);
    const [createOpen, setCreateOpen] = useState(false);
    const [mailOpen, setMailOpen] = useState(false);
    const [dayPopup, setDayPopup] = useState<DayPopupState>(null);

    const salesOrderId = orderPayloadId(order);

    const appointments = useMemo(
        () => [...scopedRecords(project.appointments, order, isPrimary, project.salesOrders)]
            .sort((a: any, b: any) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()),
        [project.appointments, project.salesOrders, order, isPrimary],
    );
    const mineIds = useMemo(() => new Set(appointments.map((appointment: any) => appointment.id)), [appointments]);

    useEffect(() => {
        projectApi.listTechnicians()
            .then(setTechnicians)
            .catch(() => setTechnicians([]));
    }, []);

    // Visible range of the current view (week, or the month view's 6-week grid).
    const range = useMemo(() => {
        const day = dayjs(cursor);
        if (view === 'week') {
            const start = day.startOf('isoWeek');
            return { start: dayKey(start), end: dayKey(start.add(6, 'day')) };
        }
        const start = day.startOf('month').startOf('isoWeek');
        return { start: dayKey(start), end: dayKey(start.add(41, 'day')) };
    }, [cursor, view]);

    // Tenant-wide plans for the range, so other orders' bookings surface while
    // planning. Fails silently for roles that cannot list them.
    useEffect(() => {
        let cancelled = false;
        projectApi.listAppointments(range.start, range.end, { calendar: true })
            .then((list) => { if (!cancelled) setTenantAppointments(list as any[]); })
            .catch(() => { if (!cancelled) setTenantAppointments([]); });
        return () => { cancelled = true; };
    }, [range.start, range.end, refreshTick]);

    const others = useMemo(
        () => tenantAppointments.filter((appointment: any) => !mineIds.has(appointment.id)),
        [tenantAppointments, mineIds],
    );

    const byTechnician = useCallback((list: any[]) => (
        technicianFilter
            ? list.filter((appointment: any) => appointmentTechIds(appointment).includes(technicianFilter))
            : list
    ), [technicianFilter]);

    const refreshAll = useCallback(async () => {
        await onSaved();
        setRefreshTick((tick) => tick + 1);
    }, [onSaved]);

    const clientLabel = useCallback(
        (appointment: any) => appointmentClientLabel(appointment, mineIds.has(appointment.id) ? project : null),
        [mineIds, project],
    );

    const removeAppointment = async (appointment: any) => {
        await projectApi.deleteAppointment(appointment.id);
        await refreshAll();
    };

    // One-click manager finish (the detailed variant lives in the field reports).
    const managerFinish = async (appointment: any) => {
        const payload: CompleteInstallationInput = {
            operationsDoneItems: [t('projects.managerCompletedDefault')],
            technicalNotes: '',
            startedAt: appointment.startTime,
            endedAt: new Date().toISOString(),
            expenses: [],
            materials: [],
            usedMaterials: [],
        };
        try {
            const result = await projectApi.completeAppointmentAsManager(appointment.id, payload);
            toast.success(result.message || t('auto.montaj_yonetici_tarafindan_bitirildi'));
            if (result.addonOrder) toast.success(`${t('projects.addonOrder')}: ${result.addonOrder.orderNumber}`);
            if (result.overtimeWarning) toast.warning(result.overtimeWarning);
            void refreshAll();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.montaj_bitirilemedi'));
            throw e;
        }
    };

    const dayAppointments = (date: string, list: any[]) =>
        list.filter((appointment: any) => dayKey(dayjs(appointment.startTime)) === date);

    return (
        <>
            <ScheduleCalendar
                view={view}
                onViewChange={setView}
                cursor={cursor}
                onCursorChange={setCursor}
                appointments={byTechnician(appointments)}
                otherAppointments={byTechnician(others)}
                technicians={technicians}
                technicianFilter={technicianFilter}
                onTechnicianFilter={setTechnicianFilter}
                clientLabel={clientLabel}
                onCreate={() => setCreateOpen(true)}
                onSendMail={() => setMailOpen(true)}
                onDayClick={(date) => setDayPopup({ date, initialAppointment: null })}
                onAppointmentClick={(appointment) =>
                    setDayPopup({ date: dayKey(dayjs(appointment.startTime)), initialAppointment: appointment })}
            />

            {dayPopup && (
                <DayPopup
                    date={dayPopup.date}
                    project={project}
                    order={order}
                    salesOrderId={salesOrderId}
                    technicians={technicians}
                    settings={settings}
                    userEmail={userEmail}
                    mine={dayAppointments(dayPopup.date, appointments)}
                    others={dayAppointments(dayPopup.date, others)}
                    allAppointments={appointments}
                    initialAppointment={dayPopup.initialAppointment}
                    onClose={() => setDayPopup(null)}
                    onSaved={refreshAll}
                    onDelete={removeAppointment}
                    onManagerFinish={managerFinish}
                    canManagerFinish={(appointment) =>
                        isAppointmentAwaitingTechnician(project, appointment)
                        && canManagerFinishAppointment(project, appointment)}
                />
            )}

            {createOpen && !dayPopup && (
                <BottomSheet
                    open
                    onClose={() => setCreateOpen(false)}
                    title={t('projects.schedule.createAppointment')}
                    subtitle={project.customer?.companyName || undefined}
                >
                    <AppointmentWizard
                        project={project}
                        salesOrderId={salesOrderId}
                        technicians={technicians}
                        initialDate={dayKey(dayjs())}
                        onSaved={refreshAll}
                        onClose={() => setCreateOpen(false)}
                    />
                </BottomSheet>
            )}

            {mailOpen && !dayPopup && (
                <BottomSheet
                    open
                    onClose={() => setMailOpen(false)}
                    title={t('projects.schedule.sendEmail')}
                    subtitle={project.customer?.mainEmail || undefined}
                >
                    <AppointmentMailPanel
                        project={project}
                        order={order}
                        appointments={appointments}
                        settings={settings}
                        userEmail={userEmail}
                        onClose={() => setMailOpen(false)}
                    />
                </BottomSheet>
            )}
        </>
    );
};
