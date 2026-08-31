import { useMemo } from 'react';

import { CalendarPage } from '@/pages/calendar/CalendarPage';
import type { MailSettingDto, ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { orderPayloadId } from '../../../utils/projectOrderScope';

/**
 * The project's appointment section IS the calendar page (user request
 * 18.08.2026: "make it exactly the same as the calendar view"). Same rail, same
 * day/week/month grids, same drag-and-drop, same floating cards — the only
 * differences are the ones asked for: no task board ("Checkliste"), no "add
 * task", no "add meeting". One create action is left, and it already knows
 * which project and order the appointment belongs to.
 *
 * The old bottom-sheet planner (ScheduleCalendar + DayPopup + AppointmentWizard)
 * was retired with it.
 */
export const AppointmentList = ({
    project,
    order,
    onChanged,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary?: boolean;
    materials?: ProjectMaterial[];
    settings?: MailSettingDto | null;
    userEmail?: string;
    /* Termin gespeichert/gelöscht. Der Kalender hat seine eigene Liste bereits
       im Hintergrund nachgeladen und eine Meldung gezeigt; die Gastgeberseite
       entwertet hier nur ihre Zwischenspeicher, sie baut sich NICHT neu auf
       (Vorgabe 19.08.2026). */
    onChanged: () => void;
}) => {
    const salesOrderId = orderPayloadId(order);

    const embed = useMemo(() => ({
        prefill: {
            kind: 'appointment' as const,
            customer: project.customer
                ? {
                    id: project.customer.id,
                    companyName: project.customer.companyName,
                    mainEmail: project.customer.mainEmail,
                    mainPhone: project.customer.mainPhone,
                }
                : null,
            projectId: project.id,
            salesOrderId,
        },
        scope: {
            label: [project.customer?.companyName, project.projectNumber || project.projectName, order?.orderNumber]
                .filter(Boolean)
                .join(' · '),
            projectName: project.projectName,
            orderNumber: order?.orderNumber ?? null,
        },
        onChanged,
    }), [
        project.id,
        project.projectName,
        project.projectNumber,
        project.customer,
        order?.orderNumber,
        salesOrderId,
        onChanged,
    ]);

    return <CalendarPage embed={embed} />;
};
