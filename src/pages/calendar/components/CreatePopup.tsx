import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Check, ChevronLeft, ChevronRight, Mail01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { maintenanceApi } from '@/lib/api/maintenance';
import { meetingApi } from '@/lib/api/meetings';
import { projectApi, type ProjectPickerDto } from '@/lib/api/project';
import { StaffMultiCombo } from '@/pages/crm/components/StaffMultiCombo';
import {
    AppointmentNoteComposer,
    DocumentStage,
    uploadPendingDocuments,
    usePendingDocuments,
} from '@/components/ui-shared/AppointmentDocuments';

import { FloatingCard } from './FloatingCard';
import { LabelPicker } from './LabelPicker';
import { DayPlanRows, daysValid as everyDayValid, sortDays, type DaySpan } from './DayPlanRows';
import { CcComboField, CustomerComboField, PeopleComboField, StaticComboField, TechnicianComboField } from './CustomerPicker';
import { InviteSendPanel, type InviteTarget } from './InviteSendPanel';
import { PeoplePickerModal } from './PeoplePickerModal';
import { ccPersonFromEmail, draftDays, gmtOffsetLabel, personName, timeZoneId, type CalLabel, type CustomerLite, type DraftEntry, type FloatAnchor, type PickedPerson } from '../calendarShared';

export type CreateKind = 'appointment' | 'meeting' | 'task';

export type CreatePrefill = {
    kind?: CreateKind;
    customer?: CustomerLite | null;
    projectId?: string | null;
    salesOrderId?: string | null;
};

/**
 * DIE HÖHE DER KARTE (25.08.2026, Vorgabe Samet: «wegen der Vorschau darf das
 * Fenster nie grösser werden — innen einfach eine Rollleiste, Grösse und Ort
 * bleiben»).
 *
 * Sie ist deshalb FEST und misst sich nicht mehr am Inhalt: ein angehängtes
 * Bild, ein weiterer Tag, ein längerer Schritt rollen innen. Sonst wüchse die
 * Karte bei jedem Anhang, rückte dabei nach oben — mittig gesetzt wird an der
 * gemessenen Höhe — und die Fläche, auf die man gerade schaut, wanderte unter
 * dem Zeiger weg.
 */
const CARD_HEIGHT = 560;

type TechnicianRow = { id: string; firstName?: string; lastName?: string; email?: string | null; roleName?: string | null };

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

/* Steps per kind. The card shows ONE step at a time (user request 17.08.2026:
   a step-by-step flow, not everything stacked). */
const STEPS: Record<CreateKind, Array<{ key: string; labelKey: string }>> = {
    appointment: [
        { key: 'scope', labelKey: 'calendar.wizard.stepScope' },
        { key: 'time', labelKey: 'calendar.wizard.stepTime' },
        { key: 'team', labelKey: 'calendar.wizard.stepTeam' },
        { key: 'extras', labelKey: 'calendar.create.stepExtras' },
    ],
    meeting: [
        { key: 'time', labelKey: 'calendar.create.stepDetails' },
        { key: 'people', labelKey: 'calendar.detail.participants' },
        { key: 'extras', labelKey: 'calendar.create.stepExtras' },
    ],
    task: [
        { key: 'time', labelKey: 'calendar.create.stepDetails' },
        { key: 'owner', labelKey: 'calendar.create.assignee' },
    ],
};

/* One labelled block of a step. */
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="ofi-cal-field">
        <span className="ofi-cal-field__label">{label}{hint ? <span className="ofi-cal-field__hint"> · {hint}</span> : null}</span>
        {children}
    </div>
);

/* Free-floating quick entry — the calendar's only creation surface. One card,
   three kinds (installation appointment, meeting, task), each a short sequence
   of steps. Date and time are shared with the page's `draft`, so the block in
   the grid and the inputs here always agree, whichever one was touched last. */
export const CreatePopup = ({ open, anchor, prefill, kinds, draft, onDraftChange, onClose, onSaved, lockedScope = null, docked = false, expanded = false, onToggleExpand, labels, defaultLabelId }: {
    open: boolean;
    anchor: FloatAnchor | null;
    prefill: CreatePrefill | null;
    /* Which kinds the signed-in person may create (permission-gated). */
    kinds: CreateKind[];
    /* Embedded in a screen that already KNOWS the scope (the project's
       appointment section): customer, project and order come from the prefill,
       the "Rahmen" step disappears and this line names the context instead. */
    lockedScope?: { label: string; projectName?: string | null; orderNumber?: string | null } | null;
    /* The live block in the grid; its start/end are the source of truth. */
    draft: DraftEntry | null;
    onDraftChange: (next: Partial<DraftEntry>) => void;
    onClose: () => void;
    onSaved: (kind: CreateKind) => void;
    /* Expanded layout: the card is a docked full-height panel beside the grid. */
    docked?: boolean;
    expanded?: boolean;
    onToggleExpand?: () => void;
    /* DIE ETIKETTEN (25.08.2026). Dieselbe Liste, die in der Leiste steht —
       das Anlegen wählt daraus und erfindet nichts Eigenes. */
    labels: CalLabel[];
    /* Das Etikett, mit dem eine Art startet. Nur der TERMIN hat noch ein
       Feld dafür (Vorschlag «Geplanter Termin»); Besprechung und Aufgabe
       liefern `null` — die Besprechung bekommt ihres vom Server, die Aufgabe
       gar keines (26.08.2026). */
    defaultLabelId: (kind: CreateKind) => string | null;
}) => {
    const [kind, setKind] = useState<CreateKind>('appointment');
    const [step, setStep] = useState(0);
    const [view, setView] = useState<'form' | 'mail'>('form');

    const [title, setTitle] = useState('');
    const [customer, setCustomer] = useState<CustomerLite | null>(null);
    const [projects, setProjects] = useState<ProjectPickerDto[] | null>(null);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [salesOrderId, setSalesOrderId] = useState<string | null>(null);
    const [projectComboToken, setProjectComboToken] = useState(0);
    const [orderComboToken, setOrderComboToken] = useState(0);
    const [notes, setNotes] = useState('');
    const [labelId, setLabelId] = useState<string | null>(null);

    const [technicians, setTechnicians] = useState<TechnicianRow[]>([]);
    const [busyTechIds, setBusyTechIds] = useState<Set<string>>(() => new Set());
    const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);

    const [participants, setParticipants] = useState<PickedPerson[]>([]);
    const [participantsOpen, setParticipantsOpen] = useState(false);
    const [cc, setCc] = useState<PickedPerson[]>([]);
    const [ccOpen, setCcOpen] = useState(false);
    // Verantwortliche einer Aufgabe — mehrere Personen (18.08.2026).
    const [assignees, setAssignees] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
    /* «Termin an Kunden senden» nach dem Speichern (19.08.2026): standardmässig
       AN, damit der Weg zum Versand offen steht — gesendet wird trotzdem erst
       mit dem Senden-Knopf im Fenster. Ohne den Haken bleibt der Termin still. */
    const [sendMailAfter, setSendMailAfter] = useState(true);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* NOTIZEN MIT ANHÄNGEN (24.08.2026, Vorgabe Samet). Die Notiz eines Termins
       ist der Zettel für die MONTEURIN — und dazu gehören Bilder und PDF
       (Pläne, Fotos vom Aufmass). Der Termin existiert beim Anlegen noch nicht,
       also bleiben die Dateien hier liegen: sofort sichtbar über eine
       Blob-Adresse, blätterbar mit den Pfeilen, und beim Speichern gehen sie
       NEBENEINANDER an den frisch angelegten Termin. */
    const attachments = usePendingDocuments();
    const [attachmentIndex, setAttachmentIndex] = useState(0);
    /* ZUGEKLAPPT IST DER RUHIGE ZUSTAND (25.08.2026): gewählt wird oft mehr als
       eine Datei, und ein aufgeschlagenes Blatt schöbe die Felder darunter aus
       dem Bild. Es steht der Name; ein Klick darauf schlägt auf, das Kreuz
       klappt wieder zu — gelöscht wird dabei nichts. */
    const [attachmentPreview, setAttachmentPreview] = useState(false);

    /* Der gespeicherte Eintrag, an dem die Einladung hängt (Termin/Besprechung),
       plus die vorbereiteten Adressen für das Versandfenster. */
    const [invite, setInvite] = useState<{ target: InviteTarget; to: string; cc: PickedPerson[]; subject: string } | null>(null);

    /* Das Etikett — dieselbe Zeile in jeder Art, immer im ersten Schritt bei
       Titel und Zeit: es gehört zum Eintrag selbst und nicht zu seinem Umfeld. */
    const labelField = (
        <Field label={t('calendar.labels.field')} hint={t('calendar.labels.fieldHint')}>
            <LabelPicker labels={labels} value={labelId} onChange={setLabelId} />
        </Field>
    );

    // Date/time read straight from the draft — the grid block IS the value.
    const start = draft?.start ?? dayjs();
    const end = draft?.end ?? start.add(1, 'hour');
    const date = start.format('YYYY-MM-DD');
    const startTime = start.format('HH:mm');
    const endTime = end.format('HH:mm');
    /* DIE TAGE DES EINSATZES (24.08.2026). Ein gewöhnlicher Termin hat einen,
       ein mehrtägiger Einsatz mehrere — mit EIGENEN Zeiten je Tag, denn genau
       daran hängen der Tagesrapport und die Überstunden. Der erste Tag ist
       immer der Entwurf selbst (`start`/`end`); der Block im Raster und diese
       Zeilen zeigen deshalb dasselbe, egal welches zuletzt angefasst wurde. */
    const days: DaySpan[] = draft ? draftDays(draft) : [{ start, end }];
    const multiDay = days.length > 1;
    const planValid = everyDayValid(days);
    const timesValid = kind === 'appointment' ? planValid : end.isAfter(start);

    // Fresh start on every open, seeded from the click context.
    useEffect(() => {
        if (!open) return;
        const wanted = prefill?.kind && kinds.includes(prefill.kind) ? prefill.kind : kinds[0] ?? 'meeting';
        setKind(wanted);
        setStep(0);
        setView('form');
        setInvite(null);
        setTitle('');
        setCustomer(prefill?.customer ?? null);
        setLabelId(defaultLabelId(wanted));
        setProjects(null);
        setProjectId(prefill?.projectId ?? null);
        setSalesOrderId(prefill?.salesOrderId ?? null);
        setNotes('');
        setSelectedTechIds([]);
        setParticipants([]);
        setCc([]);
        setAssignees([]);
        setSendMailAfter(true);
        setProjectComboToken(0);
        setOrderComboToken(0);
        setSaving(false);
        setError(null);
        attachments.clear();
        setAttachmentIndex(0);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // The block in the grid mirrors what is typed here.
    useEffect(() => {
        if (!open) return;
        onDraftChange({ title, allDay: kind === 'task' });
    }, [open, title, kind]); // eslint-disable-line react-hooks/exhaustive-deps

    // Projects load only once a customer is chosen — no customer, no request.
    useEffect(() => {
        if (!open || kind !== 'appointment' || !customer || lockedScope) {
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
    }, [open, kind, customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open || kind !== 'appointment') return;
        let cancelled = false;
        projectApi.listTechnicians()
            .then((rows) => { if (!cancelled) setTechnicians(Array.isArray(rows) ? rows as TechnicianRow[] : []); })
            .catch(() => { if (!cancelled) setTechnicians([]); });
        return () => { cancelled = true; };
    }, [open, kind]);

    // Availability is only worth a request on the team step.
    /* With a locked scope the first appointment step has nothing left to ask. */
    const stepsFor = (which: CreateKind) => (
        lockedScope && which === 'appointment' ? STEPS[which].filter((item) => item.key !== 'scope') : STEPS[which]
    );
    const stepKey = stepsFor(kind)[step]?.key;
    /* «Besetzt» gilt für den GANZEN Einsatz (24.08.2026): wer an einem der
       gewählten Tage schon eingeteilt ist, ist für diesen Einsatz nicht frei —
       der Server lehnt ihn sonst beim Speichern ab, und zwar erst dann. Gefragt
       wird deshalb über die ganze Spanne, verglichen wird Tag für Tag. */
    const daysKey = days.map((day) => `${day.start.valueOf()}-${day.end.valueOf()}`).join('|');
    useEffect(() => {
        if (!open || kind !== 'appointment' || stepKey !== 'team') return;
        let cancelled = false;
        const windows = days.map((day) => [day.start.valueOf(), day.end.valueOf()] as const);
        const busyIn = (from: number, to: number) => windows.some(([windowStart, windowEnd]) => rangesOverlap(from, to, windowStart, windowEnd));
        const from = days[0].start.format('YYYY-MM-DD');
        const to = days[days.length - 1].start.format('YYYY-MM-DD');
        Promise.all([
            projectApi.listAppointments(from, to, { calendar: true }).catch(() => []),
            maintenanceApi.listTasks(from, to, { calendar: true }).catch(() => []),
        ]).then(([appointments, tasks]) => {
            if (cancelled) return;
            const busy = new Set<string>();
            (appointments as any[]).forEach((appointment) => {
                const aStart = dayjs(appointment.startTime).valueOf();
                const aEnd = dayjs(appointment.endTime || appointment.startTime).valueOf();
                if (busyIn(aStart, aEnd)) appointmentTechIds(appointment).forEach((id) => busy.add(id));
            });
            (tasks as any[]).forEach((task) => {
                const tStart = dayjs(task.scheduledStartTime || task.plannedDate).valueOf();
                const tEnd = task.scheduledEndTime ? dayjs(task.scheduledEndTime).valueOf() : tStart + 60 * 60 * 1000;
                if (busyIn(tStart, tEnd)) taskTechIds(task).forEach((id) => busy.add(id));
            });
            setBusyTechIds(busy);
        });
        return () => { cancelled = true; };
    }, [open, kind, stepKey, daysKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Addon orders (a parent order's extensions) are never appointment targets.
    const topOrders = (row: ProjectPickerDto | null | undefined) =>
        (row?.salesOrders || []).filter((order) => !order.parentSalesOrderId);

    // A single project / order needs no click; with several, the list pops open.
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
        if (available.length > 1 && !alreadyChosen) setOrderComboToken((token) => token + 1);
    }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const steps = stepsFor(kind);
    const isLast = step >= steps.length - 1;
    const ccEmails = cc.map((person) => person.email).filter((email): email is string => Boolean(email));
    /* Das eine Teilnehmerfeld der Besprechung, wieder auseinandergelegt: wer
       einen Datensatz hat (Mitarbeitende, Kunden), wird Teilnehmer:in des
       Kalendereintrags; eine frei getippte Adresse hat keinen und wird sein CC. */
    const meetingPeople = participants.filter((person) => person.type !== 'EMAIL');
    const meetingCcEmails = participants
        .filter((person) => person.type === 'EMAIL')
        .map((person) => person.email)
        .filter((email): email is string => Boolean(email));

    /* Editing the inputs writes back into the draft; the grid block follows. */
    const setDate = (value: string) => {
        if (!value) return;
        const day = dayjs(value);
        if (!day.isValid()) return;
        const nextStart = day.hour(start.hour()).minute(start.minute()).second(0).millisecond(0);
        onDraftChange({ start: nextStart, end: nextStart.add(end.diff(start, 'minute'), 'minute') });
    };
    const setStartTime = (value: string) => {
        const [h, m] = value.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return;
        const nextStart = start.hour(h).minute(m).second(0).millisecond(0);
        // Keep the length when the start moves, the way the reference does.
        const length = Math.max(15, end.diff(start, 'minute'));
        const nextEnd = nextStart.add(length, 'minute');
        onDraftChange({ start: nextStart, end: nextEnd.isSame(nextStart, 'day') ? nextEnd : nextStart.endOf('day') });
    };
    const setEndTime = (value: string) => {
        const [h, m] = value.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return;
        onDraftChange({ end: start.hour(h).minute(m).second(0).millisecond(0) });
    };

    /* Die Tage zurück in den Entwurf — der Block im Raster und die Zeilen hier
       sind dieselbe Sache. Ein einzelner Tag lässt `days` wieder leer, damit er
       sich im Raster weiterhin ziehen lässt. */
    const writeDays = (next: DaySpan[]) => {
        const sorted = sortDays(next);
        onDraftChange({
            days: sorted.length > 1 ? sorted.map((day) => ({ start: day.start, end: day.end })) : undefined,
            start: sorted[0].start,
            end: sorted[0].end,
        });
    };

    const stepValid = (() => {
        if (kind === 'appointment') {
            if (stepKey === 'scope') return Boolean(customer && projectId && (orders.length === 0 || salesOrderId));
            if (stepKey === 'time') return timesValid;
            if (stepKey === 'team') return selectedTechIds.length > 0;
            return true;
        }
        if (kind === 'meeting') return stepKey === 'time' ? Boolean(title.trim()) && timesValid : true;
        return stepKey === 'time' ? Boolean(title.trim()) : true;
    })();

    /* Öffnet das Versandfenster für den eben gespeicherten Eintrag. An = Kunde,
       CC = NUR Mitarbeitende: das gewählte Team (Termin) bzw. die Mitarbeitenden
       unter den Teilnehmenden (Besprechung) plus die CC-Liste. */
    const openInvite = (target: InviteTarget) => {
        const dateLabel = start.format('DD.MM.YYYY');
        if (target.kind === 'appointment') {
            const team = technicians
                .filter((tech) => selectedTechIds.includes(tech.id) && tech.email)
                .map((tech) => ccPersonFromEmail(tech.email as string, personName(tech), tech.id));
            setInvite({
                target,
                to: customer?.mainEmail || '',
                cc: [...team, ...cc],
                subject: t('calendar.wizard.mailSubject', { customer: customer?.companyName || '', date: dateLabel }),
            });
        } else {
            const staff = participants.filter((person) => person.type === 'EMPLOYEE' && person.email);
            const typed = participants.filter((person) => person.type === 'EMAIL' && person.email);
            const customerParticipant = participants.find((person) => person.type === 'CUSTOMER' && person.email);
            setInvite({
                target,
                to: customer?.mainEmail || customerParticipant?.email || '',
                cc: [...staff, ...typed],
                subject: t('calendar.meeting.mailSubject', { title: title.trim(), date: dateLabel }),
            });
        }
        setView('mail');
    };

    const submit = async () => {
        setSaving(true);
        setError(null);
        try {
            let target: InviteTarget | null = null;
            if (kind === 'appointment') {
                if (!projectId) return;
                const created = await projectApi.createAppointment(projectId, {
                    salesOrderId,
                    technicianIds: selectedTechIds,
                    // Der erste Tag steht weiterhin einzeln da (Aufrufer, die
                    // nur einen Termin kennen), die ganze Reihe daneben.
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                    ...(multiDay
                        ? { days: days.map((day) => ({ startTime: day.start.toISOString(), endTime: day.end.toISOString() })) }
                        : {}),
                    /* DER TEXT GEHT ZU DEN BILDERN (25.08.2026). Bis dahin lag
                       er als `notes` am Termin — und `notes` reist in der
                       Einladung mit, also bis zum KUNDEN, obwohl über dem Feld
                       «nur intern» steht. Er ist das Begleitwort: er hängt an
                       derselben Serie wie die Unterlagen, wird in der
                       Terminauskunft an derselben Stelle weitergeschrieben und
                       verlässt das Haus nie. */
                    coverNote: notes.trim() || undefined,
                    ccEmails,
                    labelId,
                });
                if (created?.id) {
                    target = { kind: 'appointment', id: String(created.id) };
                    /* Die Anhänge des Zettels gehen JETZT raus — parallel, roh,
                       an den eben angelegten Termin. Sie hängen an der Serie,
                       gelten also für alle Tage des Einsatzes. */
                    await uploadPendingDocuments(String(created.id), attachments.files);
                }
            } else if (kind === 'meeting') {
                /* Ohne `labelId`: die Besprechung wählt keines mehr, der
                   Server setzt das Etikett ihrer Rolle (26.08.2026). */
                const created = await meetingApi.create({
                    kind: 'MEETING',
                    title: title.trim(),
                    notes: notes.trim() || null,
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                    customerId: customer?.id ?? null,
                    ccEmails: meetingCcEmails,
                    participants: meetingPeople.map((person) => person.type === 'EMPLOYEE'
                        ? { participantType: 'EMPLOYEE' as const, employeeId: person.id }
                        : { participantType: 'CUSTOMER' as const, customerId: person.id }),
                });
                if (created?.id) target = { kind: 'meeting', id: created.id };
            } else {
                /* Ohne `labelId`: die Aufgabe hat keine Etikettenwahl, also
                   wird auch keine mitgeschickt (26.08.2026). */
                await crmApi.createTask({
                    kind: 'TASK',
                    title: title.trim(),
                    customerId: customer?.id ?? null,
                    assigneeEmployeeIds: assignees.map((person) => person.id),
                    dueDate: start.startOf('day').toISOString(),
                });
            }
            onSaved(kind);
            /* Gespeichert = EINE Meldung, dann ist das Fenster zu und die Liste
               lädt im Hintergrund nach. Keine Bestätigungsseite mehr, und die
               Seite wird nicht neu aufgebaut (Vorgabe 19.08.2026). Beim Speichern
               geht KEINE Mail raus — wer den Kunden einladen will, bleibt im
               Fenster und schickt die Einladung im nächsten Schritt ab. */
            if (sendMailAfter && target) openInvite(target);
            else {
                toast.success(t('calendar.create.saved'));
                onClose();
            }
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || t('calendar.wizard.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const cardTitle = view === 'mail'
        ? t('calendar.invite.sendTitle')
        : kind === 'appointment'
            ? t('calendar.newAppointment')
            : kind === 'meeting'
                ? t('calendar.newMeeting')
                : t('calendar.create.newTask');

    const kindTabs = ([
        { key: 'appointment' as const, label: t('calendar.create.tabAppointment') },
        { key: 'meeting' as const, label: t('calendar.create.tabMeeting') },
        { key: 'task' as const, label: t('calendar.create.tabTask') },
    ]).filter((tab) => kinds.includes(tab.key));

    /* Picked rows sit ABOVE the search field, so the open list never hides them. */
    const chipList = (list: PickedPerson[], onRemove: (key: string) => void, showEmail: boolean) => list.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
            {list.map((person) => (
                <span key={person.key} className="ofi-cal-chiptag">
                    {showEmail ? person.email || person.name : person.name}
                    <button type="button" aria-label={t('common.delete')} onClick={() => onRemove(person.key)}>×</button>
                </span>
            ))}
        </div>
    );

    /* Date and time row — shared by every kind (tasks: date only). */
    const timeRow = (
        <Field label={kind === 'task' ? t('calendar.create.dueDate') : t('calendar.wizard.date')}>
            <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="ofi-cal-input w-[150px]" />
                {kind !== 'task' && (
                    <>
                        <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="ofi-cal-input w-[100px]" />
                        <span className="text-[13px] text-slate-400">–</span>
                        <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="ofi-cal-input w-[100px]" />
                    </>
                )}
            </div>
            {kind !== 'task' && (
                <div className="ofi-cal-tznote" title={timeZoneId() || undefined}>
                    {t('calendar.timeZone')}: {gmtOffsetLabel()}{timeZoneId() ? ` · ${timeZoneId()}` : ''}
                </div>
            )}
            {kind !== 'task' && !timesValid && <div className="ofi-cal-warn">{t('calendar.wizard.timeInvalid')}</div>}
        </Field>
    );

    /* MEHRTÄGIGER EINSATZ (Vorgabe 24.08.2026). Eine Zeile je Tag: Datum, von,
       bis (DayPlanRows — dasselbe Bauteil, mit dem ein bestehender Einsatz
       später ausgedehnt wird). Bei EINEM Tag steht genau das da, was vorher
       dastand — plus der Knopf, der einen zweiten anhängt. */
    const dayPlanner = (
        <Field
            label={t('calendar.days.plan')}
            hint={multiDay ? t('calendar.days.count', { count: days.length }) : t('calendar.days.singleHint')}
        >
            <DayPlanRows days={days} onChange={writeDays} />
            <div className="ofi-cal-tznote" title={timeZoneId() || undefined}>
                {t('calendar.timeZone')}: {gmtOffsetLabel()}{timeZoneId() ? ` · ${timeZoneId()}` : ''}
            </div>
            {!planValid && <div className="ofi-cal-warn">{t('calendar.days.invalid')}</div>}
        </Field>
    );

    const renderStep = () => {
        if (kind === 'appointment') {
            if (stepKey === 'scope') {
                return (
                    <>
                        <Field label={t('calendar.picker.customer')}>
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
                        </Field>
                        <Field label={t('calendar.wizard.project')}>
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
                                    placeholder={customer ? t('calendar.picker.searchProject') : t('calendar.picker.customerFirst')}
                                    emptyText={t('calendar.wizard.noProjects')}
                                />
                            )}
                        </Field>
                        <Field label={t('calendar.wizard.order')}>
                            {project && orders.length === 0 ? (
                                <div className="ofi-cal-emptyline">{t('calendar.wizard.noOrders')}</div>
                            ) : (
                                <StaticComboField
                                    disabled={!project}
                                    openToken={orderComboToken}
                                    selectedId={salesOrderId}
                                    selectedLabel={orders.find((order) => order.id === salesOrderId)?.orderNumber ?? null}
                                    options={orders.map((order) => ({ id: order.id, label: order.orderNumber, meta: order.status }))}
                                    onPick={setSalesOrderId}
                                    placeholder={project ? t('calendar.picker.searchOrder') : t('calendar.picker.projectFirst')}
                                    emptyText={t('calendar.wizard.noOrders')}
                                />
                            )}
                        </Field>
                    </>
                );
            }
            if (stepKey === 'time') return (<>{dayPlanner}{labelField}</>);
            if (stepKey === 'team') {
                const chosen = technicians.filter((tech) => selectedTechIds.includes(tech.id));
                return (
                    <Field
                        label={t('calendar.wizard.stepTeam')}
                        hint={selectedTechIds.length ? t('calendar.picker.selectedCount', { count: selectedTechIds.length }) : t('calendar.wizard.teamHint')}
                    >
                        {chosen.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {chosen.map((tech) => (
                                    <span key={tech.id} className="ofi-cal-chiptag">
                                        {personName(tech) || tech.id}
                                        <button type="button" aria-label={t('common.delete')} onClick={() => setSelectedTechIds((current) => current.filter((id) => id !== tech.id))}>×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <TechnicianComboField
                            options={technicians.map((tech) => ({ id: tech.id, name: personName(tech) || tech.id, role: tech.roleName, busy: busyTechIds.has(tech.id) }))}
                            value={selectedTechIds}
                            onChange={setSelectedTechIds}
                        />
                    </Field>
                );
            }
        }

        if (kind === 'meeting') {
            if (stepKey === 'time') {
                /* AUCH DIE BESPRECHUNG FRAGT NICHT NACH DEM ETIKETT
                   (26.08.2026, Vorgabe Samet: «unter ‹Besprechung anlegen›
                   keine Etikettenwahl»). Sie bekommt es vom Server: fehlt die
                   Kennung, greift die Rolle MEETING — die Karte steht also
                   trotzdem farbig im Raster, nur ohne Feld hier. */
                return (
                    <>
                        <input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder={t('calendar.create.titlePlaceholder')}
                            className="ofi-cal-titlefield"
                            autoFocus
                        />
                        {timeRow}
                    </>
                );
            }
            if (stepKey === 'people') {
                /* EIN Feld für alle (19.08.2026, Vorgabe Samet: «ein einziges
                   Eingabefeld, wie auf der Mailseite»). Mitarbeitende, Kunden
                   und frei getippte Adressen stehen darin nebeneinander; beim
                   Speichern werden die Zeilen mit Datensatz zu Teilnehmenden
                   des Kalendereintrags, die getippten Adressen zu seinem CC.
                   Das getrennte CC-Feld im Schritt «Weiteres» entfällt für die
                   Besprechung deshalb — es fragte dieselbe Sache zweimal. */
                return (
                    <>
                        <Field label={t('calendar.picker.customer')} hint={t('common.optional')}>
                            <CustomerComboField selected={customer} onSelect={setCustomer} />
                        </Field>
                        <Field
                            label={t('calendar.detail.participants')}
                            hint={participants.length ? t('calendar.picker.selectedCount', { count: participants.length }) : t('calendar.picker.everyoneHint')}
                        >
                            {chipList(participants, (key) => setParticipants((current) => current.filter((row) => row.key !== key)), false)}
                            <PeopleComboField mode="everyone" value={participants} onChange={setParticipants} onOpenAll={() => setParticipantsOpen(true)} />
                        </Field>
                    </>
                );
            }
        }

        if (kind === 'task') {
            if (stepKey === 'time') {
                /* KEIN ETIKETT AN DER AUFGABE (26.08.2026, Vorgabe Samet: «in
                   den Aufgaben gibt es keine Etikettenwahl»). Das Etikett ist
                   die FARBE EINER KARTE IM RASTER — und Aufgaben stehen dort
                   seit dem 25.08.2026 nicht mehr. Es zu erfragen hiesse, nach
                   etwas zu fragen, das nachher nirgends zu sehen ist. */
                return (
                    <>
                        <input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder={t('calendar.create.titlePlaceholder')}
                            className="ofi-cal-titlefield"
                            autoFocus
                        />
                        {timeRow}
                    </>
                );
            }
            return (
                <>
                    <Field label={t('calendar.picker.customer')} hint={t('common.optional')}>
                        <CustomerComboField selected={customer} onSelect={setCustomer} />
                    </Field>
                    <Field label={t('calendar.create.assignee')} hint={assignees.length ? t('calendar.picker.selectedCount', { count: assignees.length }) : undefined}>
                        <StaffMultiCombo value={assignees} onChange={setAssignees} compact />
                    </Field>
                </>
            );
        }

        // 'extras' — appointment & meeting
        return (
            <>
                {/* Nur der Termin hat hier noch ein CC: bei der Besprechung
                    steckt es im einen Teilnehmerfeld des Schritts davor. */}
                {kind === 'appointment' && (
                    <Field label={t('calendar.detail.cc')} hint={cc.length ? t('calendar.picker.selectedCount', { count: cc.length }) : undefined}>
                        {chipList(cc, (key) => setCc((current) => current.filter((row) => row.key !== key)), true)}
                        <CcComboField value={cc} onChange={setCc} onOpenAll={() => setCcOpen(true)} />
                    </Field>
                )}
                {/* DERSELBE ZETTEL WIE IN DER TERMINAUSKUNFT (25.08.2026,
                    Vorgabe Samet: «Text und Bilder auf einmal — beim Anlegen wie
                    beim Termin, wie das Speichern im Log der Angebotsdetails»).
                    Beim Anlegen gibt es den Termin noch nicht: der Text und die
                    Auswahl bleiben liegen und gehen mit dem Speichern der Karte
                    zusammen weg — der Text als Begleitwort, die Dateien an
                    dieselbe Serie. Beides bleibt im Haus. */}
                {kind === 'appointment' ? (
                    <div className="ofi-cal-field">
                        <AppointmentNoteComposer
                            note={notes}
                            onNoteChange={setNotes}
                            staged={attachments.views}
                            onFiles={attachments.add}
                            onRemoveStaged={attachments.remove}
                            onOpenStaged={(position) => { setAttachmentIndex(position); setAttachmentPreview(true); }}
                        />
                        {/* Angeschaut wird auf Verlangen: ein Klick auf den
                            Namen klappt das Blatt auf, das Kreuz wieder zu. */}
                        {attachmentPreview && attachments.views.length > 0 && (
                            <DocumentStage
                                items={attachments.views}
                                index={Math.min(attachmentIndex, attachments.views.length - 1)}
                                onIndex={setAttachmentIndex}
                                onRemove={(item) => attachments.remove(item.id)}
                                onClose={() => setAttachmentPreview(false)}
                            />
                        )}
                    </div>
                ) : (
                    <Field label={t('calendar.detail.notes')}>
                        <textarea
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            rows={3}
                            className="ofi-cal-input w-full resize-none py-2 leading-snug"
                        />
                    </Field>
                )}
                {/* Seit 19.08.2026 geht beim Speichern KEINE Mail raus. Der Schalter
                    öffnet nach dem Speichern das Versandfenster «Termin an Kunden
                    senden» — erst dessen Senden-Knopf schickt die Einladung. */}
                <p className="ofi-cal-invitehint">{t('calendar.invite.hint')}</p>
                <button type="button" onClick={() => setSendMailAfter((current) => !current)} className="ofi-cal-mailtoggle">
                    <span className={`ofi-cal-check ${sendMailAfter ? 'is-on' : ''}`}>{sendMailAfter && <Check size={11} />}</span>
                    <Mail01 size={14} className="text-[#07145c] dark:text-[#d48f16]" />
                    <span className="min-w-0 flex-1 text-left">
                        {t('calendar.wizard.sendMailOption')}
                        <span className="block text-[11px] font-normal text-slate-500 dark:text-white/50">{t('calendar.wizard.sendMailOptionHint')}</span>
                    </span>
                </button>
            </>
        );
    };

    return (
        <FloatingCard
            open={open}
            onClose={onClose}
            closeOnBack
            anchor={anchor}
            width={view === 'mail' ? 560 : 500}
            /* Angedockt ist die Karte ohnehin so hoch wie die Spalte. */
            initialHeight={docked ? undefined : CARD_HEIGHT}
            docked={docked}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            title={cardTitle}
            subtitle={view === 'form'
                ? multiDay
                    // Mehrtägig: der Zeitraum und die Zahl der Tage — die Zeiten
                    // stehen je Tag in der Liste und passen hier nicht mehr hin.
                    ? `${days[0].start.format('DD.MM.')} – ${days[days.length - 1].start.format('DD.MM.YYYY')} · ${t('calendar.days.count', { count: days.length })}`
                    : `${start.format('dddd, DD. MMMM YYYY')}${kind === 'task' ? '' : ` · ${startTime}–${endTime}`}`
                : undefined}
            closeOnEscape={false}
            footer={view === 'form' ? (
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        {steps.length > 1 && (
                            <span className="flex items-center gap-1">
                                {steps.map((item, index) => (
                                    <span key={item.key} className={`ofi-cal-stepdot ${index === step ? 'is-active' : index < step ? 'is-done' : ''}`} />
                                ))}
                            </span>
                        )}
                        {error && <span className="min-w-0 truncate text-[11.5px] font-semibold text-red-600 dark:text-red-400" title={error}>{error}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {step > 0 ? (
                            <button type="button" onClick={() => { setStep((current) => current - 1); setError(null); }} className="ofi-cal-btn">
                                <ChevronLeft size={14} />
                                {t('common.back')}
                            </button>
                        ) : (
                            <button type="button" onClick={onClose} className="ofi-cal-btn">{t('common.cancel')}</button>
                        )}
                        {isLast ? (
                            <button type="button" onClick={submit} disabled={saving || !stepValid} className="ofi-cal-btn is-primary">
                                {saving ? t('common.saving') : t('common.save')}
                            </button>
                        ) : (
                            <button type="button" onClick={() => { setStep((current) => current + 1); setError(null); }} disabled={!stepValid} className="ofi-cal-btn is-primary">
                                {t('common.next')}
                                <ChevronRight size={14} />
                            </button>
                        )}
                    </div>
                </div>
            ) : undefined}
        >
            {view === 'mail' && invite && (
                <InviteSendPanel
                    target={invite.target}
                    initialTo={invite.to}
                    initialCc={invite.cc}
                    initialSubject={invite.subject}
                    /* Der Eintrag ist gerade entstanden — die eigenen Leute
                       haben ihre Aufbietung schon (der Server schickt sie beim
                       Anlegen, seit 19.08.2026 auch bei der Besprechung). Hier
                       geht es um den Kunden. */
                    teamAlreadyNotified
                    onSent={() => onSaved(kind)}
                    onClose={onClose}
                />
            )}

            {view === 'form' && (
                <div className="px-5 pb-4 pt-3">
                    {step === 0 && kindTabs.length > 1 && (
                        <div className="ofi-cal-tabs" role="tablist">
                            {kindTabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={kind === tab.key}
                                    onClick={() => {
                                        /* Der Vorschlag wandert mit der Art mit —
                                           aber nur, solange das Feld noch auf dem
                                           Vorschlag der bisherigen Art steht. Wer
                                           selbst gewählt hat, behält seine Wahl. */
                                        if (labelId === defaultLabelId(kind)) setLabelId(defaultLabelId(tab.key));
                                        setKind(tab.key);
                                        setStep(0);
                                        setError(null);
                                    }}
                                    className={`ofi-cal-tab ${kind === tab.key ? 'is-active' : ''}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* The scope the host screen fixed — shown, not asked. */}
                    {lockedScope && kind === 'appointment' && (
                        <div className="ofi-cal-scopeline" title={lockedScope.label}>{lockedScope.label}</div>
                    )}

                    {steps.length > 1 && (
                        <div className="ofi-cal-steptitle">
                            <span className="ofi-cal-steptitle__num">{step + 1}/{steps.length}</span>
                            {t(steps[step].labelKey)}
                        </div>
                    )}

                    <div key={`${kind}-${step}`} className="ofi-cal-step">
                        {renderStep()}
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
                open={ccOpen}
                onClose={() => setCcOpen(false)}
                mode="cc"
                staffOnly
                initial={cc}
                onConfirm={(picked) => { setCc(picked); setCcOpen(false); }}
            />
        </FloatingCard>
    );
};
