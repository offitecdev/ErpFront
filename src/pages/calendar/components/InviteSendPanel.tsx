import { useEffect, useRef, useState } from 'react';

import { meetingApi } from '@/lib/api/meetings';
import { projectApi, type InviteAttachmentInput, type InviteSendResult } from '@/lib/api/project';
import type { FormSubmissionRow } from '@/lib/api/forms';
import { t } from '@/i18n/translate';
import { MailComposePanel } from './MailComposePanel';
import { PeoplePickerModal } from './PeoplePickerModal';
import { buildChecklistAttachments, loadAppointmentChecklists } from './inviteChecklists';
import type { PickedPerson } from '../calendarShared';

/* «Termin senden» — THE place the calendar invitation leaves from (19.08.2026).
   Saving an appointment or meeting never mails anyone; this panel is the
   explicit send command, and ONE click on it produces TWO messages:

     1. the CUSTOMER mail — written here: To (editable), subject, message.
     2. the TEAM mail     — automatic, nothing to compose. It goes to the
        assigned technicians, the appointment's CC list and the person who
        created the appointment, and it carries the checklists of the project /
        order as PDF. Technicians therefore get the appointment AND their
        working papers in one message that lands in their own calendar.

   Why a second message instead of putting the staff in CC: an invitation that
   arrives only as a copy is not processed as an appointment by every mailbox.
   With its own To line it lands in the calendar everywhere. Both messages carry
   the same UID/SEQUENCE — for Outlook it is one appointment. That is also why
   the staff are dropped from the customer mail's CC while the team mail runs:
   otherwise everything would arrive twice.

   ONE EXCEPTION (19.08.2026): saving a NEW appointment already fires the team
   mail by itself (backend `queueAppointmentTeamInvite`). The wizard therefore
   opens this panel with `teamAlreadyNotified`, which starts the toggle OFF —
   otherwise the team would get the same aufgebot twice. Switching it back on is
   the way to re-send it WITH the checklists, which the automatic one cannot
   carry (its PDFs are drawn in the browser, and there is no browser at create).

   THE MEETING WORKS THE SAME WAY (19.08.2026, Vorgabe Samet: «die Besprechung
   läuft wie der Termin»). Its second message goes to the participating staff,
   the CC list and the person who scheduled it; only the checklists stay with
   the appointment — a meeting has no working papers to carry. */

export type InviteTarget = { kind: 'appointment' | 'meeting'; id: string };

const dedupeByEmail = (people: PickedPerson[]): PickedPerson[] => {
    const seen = new Set<string>();
    return people.filter((person) => {
        const email = (person.email || '').trim().toLowerCase();
        if (!email || seen.has(email)) return false;
        seen.add(email);
        return true;
    });
};

/** Was nach dem Versand auf der grünen Karte steht — eine Zeile je Nachricht. */
const sentSummary = (result: InviteSendResult, isAppointment: boolean): string => {
    const lines: string[] = [];
    if (result.customer?.sent) lines.push(t('calendar.invite.sentToCustomer', { list: result.customer.recipients.join(', ') }));
    if (result.team?.sent) {
        // Beim Termin ist es «das Team», bei der Besprechung sind es die Teilnehmenden.
        const key = isAppointment ? 'calendar.invite.sentToTeam' : 'calendar.invite.sentToParticipants';
        lines.push(t(key, { list: result.team.recipients.join(', ') }));
    }
    return lines.length ? lines.join('\n') : t('calendar.invite.sentMsg');
};

export const InviteSendPanel = ({ target, initialTo, initialCc, initialSubject, teamAlreadyNotified, onSent, onClose }: {
    target: InviteTarget;
    initialTo: string;
    initialCc: PickedPerson[];
    initialSubject: string;
    /** The appointment was just created, so the team mail already went out. */
    teamAlreadyNotified?: boolean;
    /** Called once the backend confirmed the send (ISO timestamp). */
    onSent?: (sentAt: string) => void;
    onClose: () => void;
}) => {
    const isAppointment = target.kind === 'appointment';
    const [to, setTo] = useState(initialTo);
    const [cc, setCc] = useState<PickedPerson[]>(() => dedupeByEmail(initialCc));
    const [ccOpen, setCcOpen] = useState(false);
    const [subject, setSubject] = useState(initialSubject);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState<string | null>(null);
    /* Die automatische Teammail ist standardmässig AN — sie ist der Regelfall,
       das Abschalten die Ausnahme (etwa beim blossen Nachreichen an den Kunden).
       Beim eben angelegten Termin ist sie schon raus: dann startet sie AUS. */
    const [teamMail, setTeamMail] = useState(!teamAlreadyNotified);
    const [checklists, setChecklists] = useState<FormSubmissionRow[] | null>(() => (isAppointment ? null : []));
    const [note, setNote] = useState<string | null>(null);

    /* Die Checklisten stehen schon beim Öffnen fest — wer sendet, soll vorher
       sehen, WAS mitgeht, nicht erst hinterher. Nur die schlanke Liste; die
       PDFs entstehen erst beim Senden (sie kosten Rechenzeit und Speicher). */
    const alive = useRef(true);
    useEffect(() => {
        if (!isAppointment) return;
        alive.current = true;
        loadAppointmentChecklists(target.id)
            .then((rows) => { if (alive.current) setChecklists(rows); })
            .catch(() => { if (alive.current) setChecklists([]); });
        return () => { alive.current = false; };
    }, [target.id, isAppointment]);

    const ccEmails = cc.map((person) => person.email).filter((email): email is string => Boolean(email));
    const checklistCount = checklists?.length ?? 0;

    const send = async () => {
        setSending(true);
        setError(null);
        setNote(null);
        try {
            let attachments: InviteAttachmentInput[] = [];
            if (isAppointment && teamMail && checklistCount) {
                const built = await buildChecklistAttachments(checklists ?? []);
                attachments = built.attachments;
                // Weggelassenes wird GESAGT — sonst liest sich «gesendet» wie «alles mit».
                if (built.skipped) setNote(t('calendar.invite.checklistSkipped', { count: built.skipped }));
            }
            const input = {
                to: to.trim(),
                cc: ccEmails,
                subject: subject.trim() || null,
                message: message.trim() || null,
                teamMail,
                /* Nur der Termin führt Checklisten mit; bei der Besprechung
                   bleibt die Liste leer, statt zu fehlen — ein weggelassenes
                   Feld wäre ein zweiter Fall, den der Server kennen müsste. */
                attachments,
            };
            const result = isAppointment
                ? await projectApi.sendAppointmentInvite(target.id, input)
                : await meetingApi.sendInvite(target.id, input);
            setSent(sentSummary(result, isAppointment));
            onSent?.(result.sentAt);
        } catch (err: unknown) {
            const response = (err as { response?: { data?: { error?: string } } })?.response;
            setError(response?.data?.error || (err instanceof Error ? err.message : '') || t('calendar.invite.sendFailed'));
        } finally {
            setSending(false);
        }
    };

    /* Die zweite Nachricht steht für sich: ohne Kundenadresse ist «senden»
       trotzdem ein sinnvoller Befehl (die eigenen Leute aufbieten, den Kunden
       später einladen). */
    const canSend = Boolean(to.trim()) || teamMail;

    return (
        <>
            <MailComposePanel
                to={to}
                onToChange={setTo}
                cc={ccEmails}
                onEditCc={() => setCcOpen(true)}
                subject={subject}
                onSubjectChange={setSubject}
                body={message}
                onBodyChange={setMessage}
                onSend={send}
                onSkip={onClose}
                sending={sending}
                error={error}
                sent={Boolean(sent)}
                canSend={canSend}
                titleText={t(isAppointment ? 'calendar.invite.sendTitle' : 'calendar.invite.sendTitleMeeting')}
                bodyLabel={t('calendar.invite.messageLabel')}
                bodyPlaceholder={t('calendar.invite.messagePlaceholder')}
                hint={t('calendar.invite.autoAttach')}
                sentText={sent ?? undefined}
                note={note}
                sendLabel={t('calendar.invite.sendAction')}
                extra={(
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2.5 dark:border-white/15 dark:bg-white/5">
                        <input
                            type="checkbox"
                            checked={teamMail}
                            onChange={(event) => setTeamMail(event.target.checked)}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#07145c] dark:accent-[#d48f16]"
                        />
                        <span className="min-w-0">
                            <span className="block text-[12.5px] font-semibold text-slate-700 dark:text-white/85">
                                {t(isAppointment ? 'calendar.invite.teamMailLabel' : 'calendar.invite.teamMailLabelMeeting')}
                            </span>
                            <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500 dark:text-white/50">
                                {teamAlreadyNotified
                                    ? t(isAppointment ? 'calendar.invite.teamAlreadySent' : 'calendar.invite.teamAlreadySentMeeting')
                                    : t(isAppointment ? 'calendar.invite.teamMailHint' : 'calendar.invite.teamMailHintMeeting')}
                            </span>
                            {/* Checklisten gibt es nur am Projekttermin. */}
                            {isAppointment && (
                                <span className="mt-1 block text-[11.5px] leading-snug text-slate-500 dark:text-white/50">
                                    {checklists === null
                                        ? t('calendar.invite.checklistLoading')
                                        : checklistCount
                                            ? t('calendar.invite.checklistCount', { count: checklistCount })
                                            : t('calendar.invite.checklistNone')}
                                </span>
                            )}
                        </span>
                    </label>
                )}
            />
            <PeoplePickerModal
                open={ccOpen}
                onClose={() => setCcOpen(false)}
                mode="cc"
                staffOnly
                initial={cc}
                onConfirm={(picked) => { setCc(dedupeByEmail(picked)); setCcOpen(false); }}
                title={t('calendar.invite.ccTitle')}
            />
        </>
    );
};
