import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { CheckCircle as CheckCircle2, Send01 as Send } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input, Textarea } from '@/components/ui-shared/Field';
import { mailApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { MailSettingDto, ProjectDto, ProjectSalesOrder } from '@/types/project';

import { appointmentStatusKind, leadInstallerName } from './scheduleShared';

const slotLine = (appointment: any) =>
    `• ${dayjs(appointment.startTime).format('DD.MM.YYYY')} ${dayjs(appointment.startTime).format('HH:mm')} – ${dayjs(appointment.endTime).format('HH:mm')}`;

const buildMessage = (project: ProjectDto, selected: any[]) => {
    const greeting = t('projects.schedule.mailGreeting', { name: project.customer?.companyName || '' });
    const outro = t('projects.schedule.mailOutro');
    if (!selected.length) return `${greeting}\n\n${t('projects.schedule.mailIntroNoSlots')}\n\n${outro}`;
    const lines = [...selected]
        .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())
        .map(slotLine)
        .join('\n');
    return `${greeting}\n\n${t('projects.schedule.mailIntro')}\n\n${lines}\n\n${outro}`;
};

// Appointment mail: pick the (open) appointments the mail is about — picking is
// optional, a direct mail without slots is fine — then send the drafted message.
export const AppointmentMailPanel = ({
    project,
    order,
    appointments,
    preselectedId,
    settings,
    userEmail,
    onClose,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    /** This order's plans; only the open (not completed/cancelled) ones are offered. */
    appointments: any[];
    preselectedId?: string | null;
    settings: MailSettingDto | null;
    userEmail: string;
    onClose: () => void;
}) => {
    const openAppointments = useMemo(
        () => appointments
            .filter((appointment: any) => {
                const kind = appointmentStatusKind(appointment);
                return kind !== 'completed' && kind !== 'cancelled';
            })
            .sort((a: any, b: any) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()),
        [appointments],
    );
    const [selectedIds, setSelectedIds] = useState<string[]>(
        () => (preselectedId && openAppointments.some((appointment: any) => appointment.id === preselectedId)
            ? [preselectedId]
            : []),
    );
    const selected = openAppointments.filter((appointment: any) => selectedIds.includes(appointment.id));

    const [to, setTo] = useState(project.customer?.mainEmail || '');
    const [subject, setSubject] = useState(`${order?.orderNumber || project.projectName} - ${t('projects.schedule.mailSubject')}`);
    // The body re-drafts itself as slots are (de)selected — until the user edits
    // it by hand, then their text wins.
    const [messageOverride, setMessageOverride] = useState<string | null>(null);
    const message = messageOverride ?? buildMessage(project, selected);

    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const toggle = (id: string) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    };

    const send = async () => {
        if (!to.trim()) {
            toast.error(`${t('auto.alici')}: ${t('common.required')}`);
            return;
        }
        setSending(true);
        try {
            await mailApi.send({
                fromEmail: settings?.fromEmail || userEmail,
                fromName: settings?.fromName || undefined,
                to: to.trim(),
                subject,
                text: message,
            });
            setSent(true);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.mail_gonderilemedi'));
        } finally {
            setSending(false);
        }
    };

    if (sent) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={30} />
                </span>
                <div className="text-[16px] font-bold text-slate-900">{t('projects.schedule.emailSent')}</div>
                <div className="text-[12.5px] text-slate-500">{to}</div>
                <Button className="mt-2 min-w-[140px]" variant="primary" onClick={onClose}>
                    {t('common.close')}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="ofi-viewport-sheet-scroll min-h-0 w-full flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-6xl space-y-3 p-5 md:p-8">
                {openAppointments.length > 0 && (
                    <div>
                        <div className="mb-1.5 text-[12px] font-semibold text-slate-700">
                            {t('projects.schedule.selectAppointmentsOptional')}
                        </div>
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
                            <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                                <thead>
                                    <tr>
                                        <th className="w-9 text-left" />
                                        <th className="w-32 text-left">{t('common.date')}</th>
                                        <th className="w-32 text-left">{t('projects.schedule.time')}</th>
                                        <th className="text-left">{t('projects.schedule.installer')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {openAppointments.map((appointment: any) => {
                                        const checked = selectedIds.includes(appointment.id);
                                        return (
                                            <tr
                                                key={appointment.id}
                                                onClick={() => toggle(appointment.id)}
                                                className={`cursor-pointer transition-colors ${checked ? 'bg-[#272f67]/[0.05] dark:bg-white/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                            >
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggle(appointment.id)}
                                                        onClick={(event) => event.stopPropagation()}
                                                    />
                                                </td>
                                                <td className="font-semibold tabular-nums text-slate-800 dark:text-white">
                                                    {dayjs(appointment.startTime).format('DD.MM.YYYY')}
                                                </td>
                                                <td className="tabular-nums text-slate-700 dark:text-white/80">
                                                    {dayjs(appointment.startTime).format('HH:mm')} – {dayjs(appointment.endTime).format('HH:mm')}
                                                </td>
                                                <td className="text-slate-500 dark:text-white/60">{leadInstallerName(appointment)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label={t('auto.alici')}>
                        <Input value={to} onChange={(e) => setTo(e.target.value)} />
                    </Field>
                    <Field label={t('auto.konu')}>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </Field>
                </div>
                <Field label={t('auto.mesaj')}>
                    <Textarea
                        rows={8}
                        value={message}
                        onChange={(e) => setMessageOverride(e.target.value)}
                    />
                </Field>
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 dark:border-white/10">
                <Button
                    variant="primary"
                    size="sm"
                    loading={sending}
                    icon={<Send size={13} />}
                    onClick={() => void send()}
                >
                    {t('common.send')}
                </Button>
            </div>
        </div>
    );
};
