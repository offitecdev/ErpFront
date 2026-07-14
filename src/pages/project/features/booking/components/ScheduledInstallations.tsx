import { Calendar, Clock, User01 as UserRound } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { AppointmentDto } from '@/types/project';

import { appointmentTechnicianNames, formatSlotTimeRange, groupSlotsByDay } from '../utils/bookingSlotUtils';

/**
 * Read-only list of a project's scheduled installations shown to the customer via
 * the public link once the appointments are already planned. Presents each
 * installation's date, time, technician(s) and any notes — no booking action.
 */
export const ScheduledInstallations = ({ appointments }: { appointments: AppointmentDto[] }) => {
    if (appointments.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-6 py-10 text-center">
                <Calendar size={28} className="text-amber-500" />
                <p className="text-sm font-medium text-amber-800">{t('auto.henuz_planlanmis_montaj_yok')}</p>
            </div>
        );
    }

    const days = groupSlotsByDay(appointments);

    return (
        <div className="space-y-6">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                {t('auto.planlanan_montajlar')}
            </div>
            {days.map((day) => (
                <div key={day.key}>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Calendar size={14} className="text-slate-400" />
                        {day.label}
                    </div>
                    <div className="space-y-2">
                        {day.slots.map((appointment) => (
                            <div key={appointment.id} className="rounded-md border border-slate-200 bg-white px-4 py-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                    <Clock size={14} className="text-slate-400" />
                                    {formatSlotTimeRange(appointment)}
                                </div>
                                <div className="mt-1.5 flex items-center gap-2 text-[13px] text-slate-600">
                                    <UserRound size={13} className="shrink-0 text-slate-400" />
                                    <span className="font-medium text-slate-500">{t('auto.teknisyen')}:</span>
                                    <span>{appointmentTechnicianNames(appointment)}</span>
                                </div>
                                {appointment.notes && (
                                    <div className="mt-1.5 text-[12.5px] text-slate-500">{appointment.notes}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
