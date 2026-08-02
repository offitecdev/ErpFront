import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

import { CheckCircle, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { mailApi } from '@/lib/api/project';
import { meetingApi } from '@/lib/api/meetings';
import { useAuthStore } from '@/store/authStore';
import { SheetShell } from './shells';
import { CcComboField, CustomerComboField, PeopleComboField } from './CustomerPicker';
import { MailComposePanel } from './MailComposePanel';
import { PeoplePickerModal } from './PeoplePickerModal';
import type { CustomerLite, PickedPerson } from '../calendarShared';

const FIELD_CLASS =
    'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#07145c]/40 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-[#d48f16]/50';

/* "New meeting" window: one form (title, time, customer, participants, CC,
   notes), then an optional invitation e-mail step, then done. Participants and
   CC both use the multi-select people window. */
export const MeetingComposer = ({ open, onClose, initialDate, onSaved }: {
    open: boolean;
    onClose: () => void;
    initialDate?: dayjs.Dayjs | null;
    onSaved: () => void;
}) => {
    const userEmail = useAuthStore((state) => state.user?.email);

    const [view, setView] = useState<'form' | 'mail' | 'success'>('form');
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(() => dayjs().format('YYYY-MM-DD'));
    const [startTime, setStartTime] = useState('10:00');
    const [endTime, setEndTime] = useState('11:00');
    const [notes, setNotes] = useState('');
    const [customer, setCustomer] = useState<CustomerLite | null>(null);
    const [participants, setParticipants] = useState<PickedPerson[]>([]);
    const [participantsOpen, setParticipantsOpen] = useState(false);
    const [cc, setCc] = useState<PickedPerson[]>([]);
    const [ccModalOpen, setCcModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [mailTo, setMailTo] = useState('');
    const [mailSubject, setMailSubject] = useState('');
    const [mailBody, setMailBody] = useState('');
    const [mailSending, setMailSending] = useState(false);
    const [mailError, setMailError] = useState<string | null>(null);
    const [mailSent, setMailSent] = useState(false);

    useEffect(() => {
        if (!open) return;
        setView('form');
        setTitle('');
        setDate((initialDate ?? dayjs()).format('YYYY-MM-DD'));
        setStartTime('10:00');
        setEndTime('11:00');
        setNotes('');
        setCustomer(null);
        setParticipants([]);
        setCc([]);
        setSaving(false);
        setError(null);
        setMailSent(false);
        setMailError(null);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const timesValid = dayjs(`${date}T${endTime}`).isAfter(dayjs(`${date}T${startTime}`));
    const canSave = Boolean(title.trim()) && timesValid;
    const ccEmails = cc.map((person) => person.email).filter((email): email is string => Boolean(email));

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            await meetingApi.create({
                kind: 'MEETING',
                title: title.trim(),
                notes: notes.trim() || null,
                startTime: dayjs(`${date}T${startTime}`).toISOString(),
                endTime: dayjs(`${date}T${endTime}`).toISOString(),
                customerId: customer?.id ?? null,
                ccEmails,
                participants: participants
                    .filter((person) => person.type !== 'EMAIL')
                    .map((person) => person.type === 'EMPLOYEE'
                        ? { participantType: 'EMPLOYEE' as const, employeeId: person.id }
                        : { participantType: 'CUSTOMER' as const, customerId: person.id }),
            });
            onSaved();
            // Prefill the invitation right away — sending stays optional.
            const dateLabel = dayjs(`${date}T${startTime}`).format('DD.MM.YYYY');
            setMailTo(participants.map((person) => person.email).filter(Boolean).join(', ') || customer?.mainEmail || '');
            setMailSubject(t('calendar.meeting.mailSubject', { title: title.trim(), date: dateLabel }));
            setMailBody([
                t('calendar.wizard.mailGreeting'),
                '',
                t('calendar.meeting.mailLine', { title: title.trim(), date: dateLabel, start: startTime, end: endTime }),
                customer ? `${t('calendar.picker.customer')}: ${customer.companyName}` : null,
                participants.length ? `${t('calendar.detail.participants')}: ${participants.map((person) => person.name).join(', ')}` : null,
                notes.trim() ? `${t('calendar.detail.notes')}: ${notes.trim()}` : null,
                '',
                t('calendar.wizard.mailClosing'),
            ].filter((line) => line !== null).join('\n'));
            setView('mail');
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || t('calendar.wizard.saveFailed'));
        } finally {
            setSaving(false);
        }
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

    const chip = (person: PickedPerson, onRemove: () => void) => (
        <span key={person.key} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1.5 text-[11.5px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
            {person.name}
            <button type="button" aria-label={t('common.delete')} onClick={onRemove} className="flex size-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/15 dark:hover:text-white">
                <X size={10} />
            </button>
        </span>
    );

    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title={t('calendar.meeting.title')}
            subtitle={view === 'mail' ? t('calendar.mail.title') : undefined}
            width={860}
            height="min(700px, 92vh)"
            footer={view === 'form' ? (
                <div className="flex items-center justify-end gap-2">
                    {error && <span className="max-w-[380px] truncate text-[12px] font-semibold text-red-600 dark:text-red-400">{error}</span>}
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 rounded-md border border-slate-200 px-4 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || !canSave}
                        className="h-9 rounded-md bg-[#07145c] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {saving ? t('common.saving') : t('calendar.meeting.create')}
                    </button>
                </div>
            ) : undefined}
        >
            {view === 'success' && (
                <div className="ofi-rise-in flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
                    <CheckCircle size={44} className="text-emerald-500" />
                    <div className="text-[15px] font-bold text-slate-900 dark:text-white">{t('calendar.meeting.savedTitle')}</div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 rounded-md bg-[#07145c] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c]"
                    >
                        {t('common.close')}
                    </button>
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
                        onSkip={() => setView('success')}
                        sending={mailSending}
                        error={mailError}
                        sent={mailSent}
                    />
                </div>
            )}

            {view === 'form' && (
                <div className="ofi-rise-in grid gap-5 p-5 lg:grid-cols-2">
                    <div className="space-y-4">
                        <label className="block">
                            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.meeting.subject')}</span>
                            <input value={title} onChange={(event) => setTitle(event.target.value)} className={FIELD_CLASS} placeholder={t('calendar.meeting.subjectPlaceholder')} autoFocus />
                        </label>
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

                    <div className="space-y-4">
                        <div>
                            <span className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.picker.customer')} <span className="normal-case text-slate-300 dark:text-white/30">({t('common.optional')})</span></span>
                            <CustomerComboField selected={customer} onSelect={setCustomer} />
                        </div>

                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{t('calendar.detail.participants')}</span>
                                <button type="button" onClick={() => setParticipantsOpen(true)} className="text-[11.5px] font-semibold text-[#07145c] hover:underline dark:text-[#d48f16]">
                                    {participants.length ? t('calendar.meeting.editParticipants') : t('calendar.meeting.addParticipants')}
                                </button>
                            </div>
                            <PeopleComboField mode="participants" value={participants} onChange={setParticipants} onOpenAll={() => setParticipantsOpen(true)} />
                            {participants.length === 0 ? (
                                <div className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[12px] text-slate-400 dark:border-white/15 dark:text-white/40">
                                    {t('calendar.meeting.participantsEmpty')}
                                </div>
                            ) : (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {participants.map((person) => chip(person, () => setParticipants((current) => current.filter((row) => row.key !== person.key))))}
                                </div>
                            )}
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
                                    {cc.map((person) => chip(person, () => setCc((current) => current.filter((row) => row.key !== person.key))))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <PeoplePickerModal
                open={participantsOpen}
                onClose={() => setParticipantsOpen(false)}
                mode="participants"
                initial={participants}
                onConfirm={(picked) => { setParticipants(picked); setParticipantsOpen(false); }}
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
