import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';

import { Check, CheckCircle, ChevronLeft, ChevronRight, Mail01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { maintenanceApi } from '@/lib/api/maintenance';
import { mailApi, projectApi, type ProjectPickerDto } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import { SheetShell } from './shells';
import { CcComboField, CustomerComboField, StaticComboField } from './CustomerPicker';
import { ListBrowseModal } from './ListBrowseModal';
import { MailComposePanel } from './MailComposePanel';
import { PeoplePickerModal } from './PeoplePickerModal';
import { personName, type CustomerLite, type PickedPerson } from '../calendarShared';

type WizardStep = 1 | 2 | 3 | 4;
type Anim = 'rise' | 'right' | 'left';
const animClass: Record<Anim, string> = {
    rise: 'ofi-rise-in',
    right: 'ofi-slide-in-right',
    left: 'ofi-slide-in-left',
};

type TechnicianRow = { id: string; firstName?: string; lastName?: string; email?: string | null; roleName?: string | null };

const FIELD_CLASS =
    'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#07145c]/40 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-[#d48f16]/50';

const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

const appointmentTechIds = (appointment: any): string[] => {
    const ids = new Set<string>();
    if (appointment?.assignedTechId) ids.add(appointment.assignedTechId);
    if (appointment?.assignedTechnician?.id) ids.add(appointment.assignedTechnician.id);
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        const id = assignment.technicianId || assignment.technician?.id;
        if (id) ids.add(id);
    });
    return Array.from(ids);
};

const taskTechIds = (task: any): string[] => {
    const ids = new Set<string>();
    if (task?.technician?.id) ids.add(task.technician.id);
    if (task?.alternativeTechnician?.id) ids.add(task.alternativeTechnician.id);
    (task?.assignments || []).forEach((assignment: any) => {
        const id = assignment.technicianId || assignment.technician?.id;
        if (id) ids.add(id);
    });
    return Array.from(ids);
};

export type WizardPrefill = {
    date?: dayjs.Dayjs;
    /* Slot click: take the clicked time too, not just the day. Without it the
       wizard keeps its 09:00–11:00 default (midnight is a real slot value, so
       the hour alone cannot tell the two cases apart). */
    withTime?: boolean;
    customer?: CustomerLite | null;
    projectId?: string | null;
    salesOrderId?: string | null;
};

/* The big four-step "create appointment" window:
   scope (customer → project → order, single choices auto-picked) → date/time →
   technicians → CC + summary. Next/back slide the step content sideways. */
export const AppointmentWizard = ({ open, onClose, prefill, onSaved }: {
    open: boolean;
    onClose: () => void;
    prefill?: WizardPrefill | null;
    onSaved: () => void;
}) => {
    const userEmail = useAuthStore((state) => state.user?.email);

    const [step, setStep] = useState<WizardStep>(1);
    const [anim, setAnim] = useState<Anim>('rise');
    const [view, setView] = useState<'form' | 'success' | 'mail'>('form');

    const [customer, setCustomer] = useState<CustomerLite | null>(null);
    const [projects, setProjects] = useState<ProjectPickerDto[] | null>(null);
    /* Full project list, fetched lazily the first time "view all" opens. */
    const [allProjects, setAllProjects] = useState<ProjectPickerDto[] | null>(null);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [salesOrderId, setSalesOrderId] = useState<string | null>(null);
    const [projectBrowseOpen, setProjectBrowseOpen] = useState(false);
    const [orderBrowseOpen, setOrderBrowseOpen] = useState(false);
    /* Bumped to pop the next combo's list open right after a selection. */
    const [projectComboToken, setProjectComboToken] = useState(0);
    const [orderComboToken, setOrderComboToken] = useState(0);

    const [date, setDate] = useState(() => dayjs().format('YYYY-MM-DD'));
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('11:00');
    const [notes, setNotes] = useState('');

    const [technicians, setTechnicians] = useState<TechnicianRow[]>([]);
    const [techLoading, setTechLoading] = useState(false);
    const [busyTechIds, setBusyTechIds] = useState<Set<string>>(() => new Set());
    const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);

    const [cc, setCc] = useState<PickedPerson[]>([]);
    const [ccModalOpen, setCcModalOpen] = useState(false);
    /* "Send via e-mail" — saving jumps straight into the drafted mail. */
    const [sendMailAfter, setSendMailAfter] = useState(false);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [mailTo, setMailTo] = useState('');
    const [mailSubject, setMailSubject] = useState('');
    const [mailBody, setMailBody] = useState('');
    const [mailSending, setMailSending] = useState(false);
    const [mailError, setMailError] = useState<string | null>(null);
    const [mailSent, setMailSent] = useState(false);

    // Fresh start on every open, seeded from the prefill context if given.
    useEffect(() => {
        if (!open) return;
        setStep(1);
        setAnim('rise');
        setView('form');
        setCustomer(prefill?.customer ?? null);
        setProjects(null);
        setProjectId(prefill?.projectId ?? null);
        setSalesOrderId(prefill?.salesOrderId ?? null);
        const base = prefill?.date ?? dayjs();
        setDate(base.format('YYYY-MM-DD'));
        setStartTime(prefill?.withTime ? base.format('HH:mm') : '09:00');
        // A late slot (+2h) would roll past midnight and read as "end before
        // start", so the last hours of the day clamp to 23:59.
        const prefillEnd = base.add(2, 'hour');
        setEndTime(prefill?.withTime ? (prefillEnd.isSame(base, 'day') ? prefillEnd.format('HH:mm') : '23:59') : '11:00');
        setNotes('');
        setSelectedTechIds([]);
        setCc([]);
        setSendMailAfter(false);
        setProjectComboToken(0);
        setOrderComboToken(0);
        setSaving(false);
        setError(null);
        setMailSent(false);
        setMailError(null);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Projects are fetched ONLY once a customer is chosen, and only the first 7
    // (the combo shows no more). No customer — no request, no loading state:
    // clearing the customer also has to clear a stuck shimmer, and a cancelled
    // in-flight fetch skips its finally, so loading is reset here explicitly.
    useEffect(() => {
        setAllProjects(null);
        if (!open || !customer) {
            setProjects(null);
            setProjectsLoading(false);
            return;
        }
        let cancelled = false;
        setProjectsLoading(true);
        projectApi.listPicker(customer.id, 7)
            .then((rows) => { if (!cancelled) setProjects(rows); })
            .catch(() => { if (!cancelled) setProjects([]); })
            .finally(() => { if (!cancelled) setProjectsLoading(false); });
        return () => { cancelled = true; };
    }, [open, customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // "View all" fetches the complete list once per customer, on demand.
    useEffect(() => {
        if (!projectBrowseOpen || !customer || allProjects !== null) return;
        let cancelled = false;
        projectApi.listPicker(customer.id)
            .then((rows) => { if (!cancelled) setAllProjects(rows); })
            .catch(() => { if (!cancelled) setAllProjects([]); })
        return () => { cancelled = true; };
    }, [projectBrowseOpen, customer?.id, allProjects]); // eslint-disable-line react-hooks/exhaustive-deps

    // Addon orders (a parent order's extensions) are not appointment targets:
    // the picker only ever offers top-level orders, no new orders are created.
    const topOrders = (row: ProjectPickerDto | null | undefined) =>
        (row?.salesOrders || []).filter((order) => !order.parentSalesOrderId);

    // A single project / order needs no click — it is selected on arrival.
    // With several to choose from, the list pops open by itself instead.
    useEffect(() => {
        if (!projects) return;
        if (projects.length === 1) setProjectId((current) => current ?? projects[0].id);
        else if (projects.length > 1 && !projectId) setProjectComboToken((token) => token + 1);
    }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

    const project = useMemo(() => (projects || []).find((row) => row.id === projectId) || null, [projects, projectId]);
    const orders = topOrders(project);

    useEffect(() => {
        if (!project) { setSalesOrderId(null); return; }
        const available = topOrders(project);
        const alreadyChosen = Boolean(salesOrderId && available.some((order) => order.id === salesOrderId));
        setSalesOrderId((current) => {
            if (current && available.some((order) => order.id === current)) return current;
            return available.length === 1 ? available[0].id : null;
        });
        // Several orders and nothing pre-chosen → pop the order list open.
        if (available.length > 1 && !alreadyChosen) setOrderComboToken((token) => token + 1);
    }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Technician options load once per open; availability re-checks per day/time.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setTechLoading(true);
        projectApi.listTechnicians()
            .then((rows) => { if (!cancelled) setTechnicians(Array.isArray(rows) ? rows as TechnicianRow[] : []); })
            .catch(() => { if (!cancelled) setTechnicians([]); })
            .finally(() => { if (!cancelled) setTechLoading(false); });
        return () => { cancelled = true; };
    }, [open]);

    useEffect(() => {
        if (!open || step !== 3) return;
        let cancelled = false;
        const windowStart = dayjs(`${date}T${startTime}`).valueOf();
        const windowEnd = dayjs(`${date}T${endTime}`).valueOf();
        Promise.all([
            projectApi.listAppointments(date, date, { calendar: true }).catch(() => []),
            maintenanceApi.listTasks(date, date, { calendar: true }).catch(() => []),
        ]).then(([appointments, tasks]) => {
            if (cancelled) return;
            const busy = new Set<string>();
            (appointments as any[]).forEach((appointment) => {
                const aStart = dayjs(appointment.startTime).valueOf();
                const aEnd = dayjs(appointment.endTime || appointment.startTime).valueOf();
                if (rangesOverlap(aStart, aEnd, windowStart, windowEnd)) {
                    appointmentTechIds(appointment).forEach((id) => busy.add(id));
                }
            });
            (tasks as any[]).forEach((task) => {
                const tStart = dayjs(task.scheduledStartTime || task.plannedDate).valueOf();
                const tEnd = task.scheduledEndTime ? dayjs(task.scheduledEndTime).valueOf() : tStart + 60 * 60 * 1000;
                if (rangesOverlap(tStart, tEnd, windowStart, windowEnd)) {
                    taskTechIds(task).forEach((id) => busy.add(id));
                }
            });
            setBusyTechIds(busy);
        });
        return () => { cancelled = true; };
    }, [open, step, date, startTime, endTime]);

    if (!open) return null;

    const stepTitles: Record<WizardStep, string> = {
        1: t('calendar.wizard.stepScope'),
        2: t('calendar.wizard.stepTime'),
        3: t('calendar.wizard.stepTeam'),
        4: t('calendar.wizard.stepConfirm'),
    };

    const timesValid = dayjs(`${date}T${endTime}`).isAfter(dayjs(`${date}T${startTime}`));
    const canNext =
        step === 1 ? Boolean(customer && projectId && (orders.length === 0 || salesOrderId))
            : step === 2 ? timesValid
                : step === 3 ? selectedTechIds.length > 0
                    : true;

    const go = (next: WizardStep) => {
        setAnim(next > step ? 'right' : 'left');
        setStep(next);
        setError(null);
    };

    const ccEmails = cc.map((person) => person.email).filter((email): email is string => Boolean(email));

    const submit = async () => {
        if (!projectId) return;
        setSaving(true);
        setError(null);
        try {
            await projectApi.createAppointment(projectId, {
                salesOrderId,
                technicianIds: selectedTechIds,
                startTime: dayjs(`${date}T${startTime}`).toISOString(),
                endTime: dayjs(`${date}T${endTime}`).toISOString(),
                notes: notes.trim() || undefined,
                ccEmails,
            });
            onSaved();
            if (sendMailAfter) openMail();
            else setView('success');
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || t('calendar.wizard.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const openMail = () => {
        const dateLabel = dayjs(`${date}T${startTime}`).format('DD.MM.YYYY');
        setMailTo(customer?.mainEmail || '');
        setMailSubject(t('calendar.wizard.mailSubject', { customer: customer?.companyName || '', date: dateLabel }));
        setMailBody([
            t('calendar.wizard.mailGreeting'),
            '',
            t('calendar.wizard.mailLine', {
                date: dateLabel,
                start: startTime,
                end: endTime,
            }),
            project ? `${t('calendar.detail.project')}: ${project.projectName}` : null,
            salesOrderId ? `${t('calendar.detail.order')}: ${orders.find((order) => order.id === salesOrderId)?.orderNumber || ''}` : null,
            notes.trim() ? `${t('calendar.detail.notes')}: ${notes.trim()}` : null,
            '',
            t('calendar.wizard.mailClosing'),
        ].filter((line) => line !== null).join('\n'));
        setMailSent(false);
        setMailError(null);
        setView('mail');
    };

    const sendMail = async () => {
        setMailSending(true);
        setMailError(null);
        try {
            const settings = await mailApi.getSettings().catch(() => null);
            await mailApi.send({
                fromEmail: settings?.fromEmail || userEmail || undefined,
                fromName: settings?.fromName || undefined,
                to: mailTo.trim(),
                cc: ccEmails,
                subject: mailSubject.trim(),
                text: mailBody,
            });
            setMailSent(true);
        } catch (err: any) {
            setMailError(err?.response?.data?.error || err?.message || t('calendar.wizard.saveFailed'));
        } finally {
            setMailSending(false);
        }
    };

    const summaryRow = (label: string, value?: string | null) => value ? (
        <div className="flex items-baseline gap-3 py-0.5">
            <span className="w-32 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{label}</span>
            <span className="min-w-0 flex-1 text-[13px] text-slate-800 dark:text-white/90">{value}</span>
        </div>
    ) : null;

    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title={t('calendar.wizard.title')}
            subtitle={view === 'form' ? `${step}/4 · ${stepTitles[step]}` : undefined}
            width={1400}
            height="min(820px, 94vh)"
            footer={view === 'form' ? (
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4].map((item) => (
                            <span key={item} className={`h-1.5 rounded-full transition-all ${item === step ? 'w-6 bg-[#07145c] dark:bg-[#d48f16]' : item < step ? 'w-3 bg-[#07145c]/40 dark:bg-[#d48f16]/40' : 'w-3 bg-slate-200 dark:bg-white/15'}`} />
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        {error && <span className="max-w-[380px] truncate text-[12px] font-semibold text-red-600 dark:text-red-400">{error}</span>}
                        <button
                            type="button"
                            onClick={() => go(Math.max(1, step - 1) as WizardStep)}
                            disabled={step === 1}
                            className="flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                        >
                            <ChevronLeft size={14} />
                            {t('common.back')}
                        </button>
                        {step < 4 ? (
                            <button
                                type="button"
                                onClick={() => go((step + 1) as WizardStep)}
                                disabled={!canNext}
                                className="flex h-9 items-center gap-1 rounded-md bg-[#07145c] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {t('common.next')}
                                <ChevronRight size={14} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={submit}
                                disabled={saving || !canNext}
                                className="h-9 rounded-md bg-[#07145c] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {saving ? t('common.saving') : t('calendar.wizard.create')}
                            </button>
                        )}
                    </div>
                </div>
            ) : undefined}
        >
            {view === 'success' && (
                <div className="ofi-rise-in flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
                    <CheckCircle size={44} className="text-emerald-500" />
                    <div>
                        <div className="text-[15px] font-bold text-slate-900 dark:text-white">{t('calendar.wizard.savedTitle')}</div>
                        <div className="mt-1 text-[13px] text-slate-500 dark:text-white/60">
                            {customer?.companyName} · {dayjs(`${date}T${startTime}`).format('DD MMMM YYYY')} {startTime}–{endTime}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={openMail}
                            className="flex h-9 items-center gap-1.5 rounded-md border border-[#E3E7F0] bg-white px-3.5 text-[12.5px] font-semibold text-[#07145c] transition-colors hover:bg-[#F7F8FC] dark:border-white/10 dark:bg-white/6 dark:text-[#d48f16] dark:hover:bg-white/10"
                        >
                            <Mail01 size={14} />
                            {t('calendar.wizard.sendMail')}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 rounded-md bg-[#07145c] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c]"
                        >
                            {t('common.close')}
                        </button>
                    </div>
                </div>
            )}

            {view === 'mail' && (
                <div className="ofi-slide-in-right flex min-h-0 flex-1 flex-col">
                    <MailComposePanel
                        to={mailTo}
                        onToChange={setMailTo}
                        cc={ccEmails}
                        onEditCc={() => setCcModalOpen(true)}
                        subject={mailSubject}
                        onSubjectChange={setMailSubject}
                        body={mailBody}
                        onBodyChange={setMailBody}
                        onSend={sendMail}
                        onSkip={onClose}
                        sending={mailSending}
                        error={mailError}
                        sent={mailSent}
                    />
                </div>
            )}

            {view === 'form' && (
                <div key={step} className={`${animClass[anim]} flex min-h-0 flex-1 flex-col p-5 md:p-7`}>
                    {step === 1 && (
                        <div className="mx-auto w-full max-w-[980px] space-y-5">
                            <div>
                                <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.picker.customer')}</span>
                                {/* No autoFocus: focusing would pop the list open while the
                                    sheet is still sliding up. It opens on the first click. */}
                                <CustomerComboField
                                    selected={customer}
                                    onSelect={(picked) => {
                                        if (picked?.id !== customer?.id) {
                                            setProjectId(null);
                                            setSalesOrderId(null);
                                        }
                                        setCustomer(picked);
                                    }}
                                />
                                <div className="mt-1 text-[11px] text-slate-400 dark:text-white/35">{t('calendar.picker.selectCustomerHint')}</div>
                            </div>

                            <div>
                                <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.wizard.project')}</span>
                                {projectsLoading ? (
                                    <div className="ofi-shimmer h-9 rounded-md bg-slate-100 dark:bg-white/5" />
                                ) : (
                                    <StaticComboField
                                        disabled={!customer}
                                        openToken={projectComboToken}
                                        selectedId={projectId}
                                        selectedLabel={project?.projectName ?? null}
                                        options={(projects || []).map((row) => ({
                                            id: row.id,
                                            label: row.projectName,
                                            meta: t('calendar.wizard.orderCount', { count: topOrders(row).length }),
                                        }))}
                                        onPick={setProjectId}
                                        onViewAll={() => setProjectBrowseOpen(true)}
                                        viewAllLabel={t('calendar.picker.viewAll')}
                                        placeholder={customer ? t('calendar.picker.searchProject') : t('calendar.picker.customerFirst')}
                                        emptyText={t('calendar.wizard.noProjects')}
                                    />
                                )}
                            </div>

                            <div>
                                <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.wizard.order')}</span>
                                {project && orders.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-[12px] text-slate-400 dark:border-white/15 dark:text-white/40">
                                        {t('calendar.wizard.noOrders')}
                                    </div>
                                ) : (
                                    <StaticComboField
                                        disabled={!project}
                                        openToken={orderComboToken}
                                        selectedId={salesOrderId}
                                        selectedLabel={orders.find((order) => order.id === salesOrderId)?.orderNumber ?? null}
                                        options={orders.map((order) => ({ id: order.id, label: order.orderNumber, meta: order.status }))}
                                        onPick={setSalesOrderId}
                                        onViewAll={() => setOrderBrowseOpen(true)}
                                        placeholder={project ? t('calendar.picker.searchOrder') : t('calendar.picker.projectFirst')}
                                        emptyText={t('calendar.wizard.noOrders')}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="mx-auto w-full max-w-[980px] space-y-5">
                            <label className="block">
                                <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.wizard.date')}</span>
                                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={FIELD_CLASS} />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.wizard.start')}</span>
                                    <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={FIELD_CLASS} />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.wizard.end')}</span>
                                    <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={FIELD_CLASS} />
                                </label>
                            </div>
                            {!timesValid && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
                                    {t('calendar.wizard.timeInvalid')}
                                </div>
                            )}
                            <label className="block">
                                <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.detail.notes')}</span>
                                <textarea
                                    value={notes}
                                    onChange={(event) => setNotes(event.target.value)}
                                    rows={4}
                                    className="w-full resize-none rounded-md border border-slate-200 bg-white p-3 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#07145c]/40 dark:border-white/15 dark:bg-white/5 dark:text-white"
                                />
                            </label>
                        </div>
                    )}

                    {step === 3 && (
                        <div>
                            <div className="mb-2 text-[12.5px] text-slate-500 dark:text-white/60">{t('calendar.wizard.teamHint')}</div>
                            <table data-inv-table data-unstyled-table className="w-full">
                                <thead>
                                    <tr>
                                        <th className="w-10" />
                                        <th className="text-left">{t('calendar.picker.name')}</th>
                                        <th className="w-44 text-left">{t('calendar.picker.role')}</th>
                                        <th className="w-36 text-left">{t('calendar.wizard.availability')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {techLoading && <tr><td colSpan={4} className="py-8 text-center text-[13px] text-slate-400">{t('common.loading')}</td></tr>}
                                    {!techLoading && technicians.length === 0 && (
                                        <tr><td colSpan={4} className="py-8 text-center text-[13px] text-slate-400">{t('common.noData')}</td></tr>
                                    )}
                                    {!techLoading && technicians.map((tech) => {
                                        const busy = busyTechIds.has(tech.id);
                                        const active = selectedTechIds.includes(tech.id);
                                        return (
                                            <tr
                                                key={tech.id}
                                                onClick={() => {
                                                    if (busy) return;
                                                    setSelectedTechIds((current) => active ? current.filter((id) => id !== tech.id) : [...current, tech.id]);
                                                }}
                                                className={`transition-colors ${busy ? 'opacity-45' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                            >
                                                <td>
                                                    <span className={`flex size-[18px] items-center justify-center rounded-[5px] border transition-colors ${active ? 'border-[#07145c] bg-[#07145c] text-white dark:border-[#d48f16] dark:bg-[#d48f16] dark:text-[#151616]' : 'border-slate-300 bg-white dark:border-white/25 dark:bg-transparent'}`}>
                                                        {active && <Check size={12} />}
                                                    </span>
                                                </td>
                                                <td className="text-slate-800 dark:text-white">{personName(tech) || tech.id}</td>
                                                <td className="text-slate-500 dark:text-white/60">{tech.roleName || '—'}</td>
                                                <td>
                                                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${busy
                                                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300'
                                                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300'}`}>
                                                        {busy ? t('calendar.wizard.busy') : t('calendar.wizard.free')}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="grid gap-5 lg:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-white/10">
                                <div className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.wizard.summary')}</div>
                                {summaryRow(t('calendar.picker.customer'), customer?.companyName)}
                                {summaryRow(t('calendar.wizard.project'), project?.projectName)}
                                {summaryRow(t('calendar.wizard.order'), orders.find((order) => order.id === salesOrderId)?.orderNumber || (orders.length === 0 ? t('calendar.wizard.noOrders') : undefined))}
                                {summaryRow(t('calendar.wizard.date'), dayjs(`${date}T${startTime}`).format('DD MMMM YYYY, dddd'))}
                                {summaryRow(t('calendar.wizard.timeRange'), `${startTime} – ${endTime}`)}
                                {summaryRow(
                                    t('calendar.wizard.stepTeam'),
                                    technicians.filter((tech) => selectedTechIds.includes(tech.id)).map((tech) => personName(tech)).join(', '),
                                )}
                                {summaryRow(t('calendar.detail.notes'), notes.trim() || undefined)}
                            </div>
                            <div>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.detail.cc')}</span>
                                    <button type="button" onClick={() => setCcModalOpen(true)} className="text-[11.5px] font-semibold text-[#07145c] hover:underline dark:text-[#d48f16]">
                                        {cc.length ? t('calendar.mail.editCc') : t('calendar.mail.addCc')}
                                    </button>
                                </div>
                                <CcComboField value={cc} onChange={setCc} onOpenAll={() => setCcModalOpen(true)} />
                                {cc.length === 0 ? (
                                    <div className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[12px] text-slate-400 dark:border-white/15 dark:text-white/40">
                                        {t('calendar.wizard.ccEmpty')}
                                    </div>
                                ) : (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {cc.map((person) => (
                                            <span key={person.key} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1.5 text-[11.5px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
                                                {person.name}{person.email && person.email !== person.name ? ` · ${person.email}` : ''}
                                                <button
                                                    type="button"
                                                    aria-label={t('common.delete')}
                                                    onClick={() => setCc((current) => current.filter((row) => row.key !== person.key))}
                                                    className="flex size-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/15 dark:hover:text-white"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setSendMailAfter((current) => !current)}
                                    className="mt-4 flex w-full items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                                >
                                    <span className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${sendMailAfter ? 'border-[#07145c] bg-[#07145c] text-white dark:border-[#d48f16] dark:bg-[#d48f16] dark:text-[#151616]' : 'border-slate-300 bg-white dark:border-white/25 dark:bg-transparent'}`}>
                                        {sendMailAfter && <Check size={12} />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-white/90">
                                            <Mail01 size={13} className="text-[#07145c] dark:text-[#d48f16]" />
                                            {t('calendar.wizard.sendMailOption')}
                                        </span>
                                        <span className="block text-[11px] text-slate-500 dark:text-white/50">{t('calendar.wizard.sendMailOptionHint')}</span>
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <ListBrowseModal
                open={projectBrowseOpen}
                onClose={() => setProjectBrowseOpen(false)}
                title={t('calendar.wizard.allProjects')}
                columns={[t('calendar.wizard.project'), t('calendar.todaySheet.status'), t('calendar.wizard.order')]}
                rows={(allProjects ?? projects ?? []).map((row) => ({
                    id: row.id,
                    primary: row.projectName,
                    secondary: row.status,
                    meta: t('calendar.wizard.orderCount', { count: topOrders(row).length }),
                }))}
                onPick={(id) => {
                    // A row picked from the full list may not be in the 7-row
                    // combo slice — merge it in so the selection resolves.
                    const picked = (allProjects ?? []).find((row) => row.id === id);
                    if (picked && !(projects ?? []).some((row) => row.id === id)) {
                        setProjects((current) => [picked, ...(current ?? [])]);
                    }
                    setProjectId(id);
                    setProjectBrowseOpen(false);
                }}
            />

            <ListBrowseModal
                open={orderBrowseOpen}
                onClose={() => setOrderBrowseOpen(false)}
                title={t('calendar.wizard.allOrders')}
                columns={[t('calendar.wizard.order'), t('calendar.todaySheet.status'), '']}
                rows={orders.map((order) => ({ id: order.id, primary: order.orderNumber, secondary: order.status, meta: null }))}
                onPick={(id) => { setSalesOrderId(id); setOrderBrowseOpen(false); }}
            />

            <PeoplePickerModal
                open={ccModalOpen}
                onClose={() => setCcModalOpen(false)}
                mode="cc"
                initial={cc}
                onConfirm={(picked) => { setCc(picked); setCcModalOpen(false); }}
            />
        </SheetShell>
    );
};
