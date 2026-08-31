import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';

import { ArrowRight, CalendarDate, CalendarPlus01, File05 as FileIcon, InfoCircle, Mail01, MarkerPin01, Phone, Send01, Share04, Trash01, User01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { AppointmentDocumentsPanel, PaneSaveButton, type AppointmentDocsHandle, type PaneSaveReport, type PaneSaveState } from '@/components/ui-shared/AppointmentDocuments';
import { projectApi, type AppointmentSeriesDto } from '@/lib/api/project';
import { AppointmentDaysPane } from './AppointmentDaysPane';
import { FloatingCard } from './FloatingCard';
import { InviteSendPanel, type InviteTarget } from './InviteSendPanel';
import { calLabelName, ccPersonFromEmail, dotClass, type CalEvent, type CalEventDetail, type CalStatus, type FloatAnchor, type PickedPerson } from '../calendarShared';

/**
 * EINE KARTE FÜR ALLES (25.08.2026, Vorgabe Samet: «in den Terminfeldern soll
 * dieselbe Karte erscheinen — an genau derselben Stelle und in derselben
 * Grösse; der Termin soll so gross sein wie die Besprechung, also wie
 * ursprünglich»).
 *
 * Am 24.08.2026 war der Einsatz auf 820 Pixel gewachsen, weil Unterlagen und
 * Einsatzplan als eigene Spalte daneben standen. Damit sahen zwei Einträge im
 * selben Raster verschieden aus und sprangen beim Öffnen an verschiedene
 * Stellen. Jetzt ist es wieder EINE Karte: dieselbe Breite, dieselbe HÖHE,
 * derselbe Ort — was nicht hineinpasst, rollt INNEN.
 */
/**
 * ══ DIESELBE GESTALT WIE DAS AUFGABENFENSTER (12.09.2026, Vorgabe Samet:
 * «diese Gestaltung gefällt mir sehr — wendet sie auch auf das Fenster der
 * Termindetails an») ═══════════════════════════════════════════════════════
 *
 * Was daran gefällt, sind drei Dinge, und alle drei stehen jetzt auch hier:
 *
 *  1. EINE ZEICHENREIHE OBEN, die den INHALT des Fensters tauscht. Vorher
 *     sassen «Unterlagen» und «Einsatzplan» als Zeichen ganz UNTEN zwischen
 *     Löschen, Senden und Springen — Umschalter und Auslöser in einer Reihe,
 *     ohne dass man ihnen ansah, welcher was tut. Jetzt trennen sie sich:
 *     oben wird UMGESCHALTET, unten wird GEHANDELT.
 *
 *  2. DAS ERSTE ZEICHEN IST BEIM ÖFFNEN GEWÄHLT. «Angaben» ist ein Blatt wie
 *     die anderen und trägt sein eigenes Zeichen, statt der namenlose
 *     Grundzustand zu sein.
 *
 *  3. EINE ACHSE. Beschriftung und Wert stehen in einem Raster mit fester
 *     Beschriftungsspalte (`.ofi-cal-detail__label`), nicht in einer
 *     Flex-Zeile, die je nach Länge des Wertes verrutscht.
 *
 * Die Klassen `.ofi-newtask__mark*` sind dieselben wie im Aufgabenfenster —
 * eine zweite Fassung derselben Reihe liefe unweigerlich auseinander.
 */
const CARD_WIDTH = 440;
const CARD_HEIGHT = 480;
/**
 * VERGRÖSSERN (25.08.2026, Vorgabe Samet: «in der Auskunftskarte soll es auch
 * ein Vergrössern geben — statt nur der zwei Zeilen»).
 *
 * Die feste Grösse oben ist die RUHIGE: sie springt nie, egal was im Fenster
 * geschieht. Wer mehr sehen will, sagt es — mit dem Knopf oben links, demselben
 * wie im Anlegen-Fenster. Vergrössert stehen die Angaben wieder in zwei Spalten,
 * und ein aufgeklapptes Nebenblatt legt sich DANEBEN statt davor.
 */
const ENLARGED_WIDTH = 940;
const ENLARGED_HEIGHT = 720;

const STATUS_LABEL_KEY: Record<CalStatus, string> = {
    planned: 'calendar.status.planned',
    ongoing: 'calendar.status.ongoing',
    done: 'calendar.status.done',
    cancelled: 'calendar.status.cancelled',
    meeting: 'calendar.status.meeting',
    maintenance: 'calendar.status.maintenance',
    task: 'calendar.status.task',
    taskDone: 'calendar.status.taskDone',
};

/* EINE Achse für alle Zeilen: die Beschriftung in ihrer festen Spalte, der
   Wert daneben (index.css `.ofi-cal-detailrow`). Vorher war es eine
   Flex-Zeile mit `items-baseline` — bei einem Wert, der umbrach, sass die
   Beschriftung dann auf der Grundlinie der ERSTEN Zeile und die nächste Zeile
   begann woanders. */
const Row = ({ label, value }: { label: string; value?: string | null }) => {
    if (!value) return null;
    return (
        <div className="ofi-cal-detailrow">
            <span className="ofi-cal-detail__label">{label}</span>
            <span className="ofi-cal-detail__value">{value}</span>
        </div>
    );
};

/* Detail of a clicked entry, in the same free-floating card as everything else.
   The heavy payload loads lazily so the grid stays light. */
export const DetailPopup = ({ event, anchor, onClose, onNavigate, onCreateFrom, onDelete, canEditDays = false, onDaysChanged, canOpenDocs = false, technicianScope = false, canCreate = true, deletable = false, canSendInvite = false, onInviteSent }: {
    event: CalEvent | null;
    anchor: FloatAnchor | null;
    onClose: () => void;
    onNavigate: (event: CalEvent) => void;
    onCreateFrom: (event: CalEvent) => void;
    /** `scope` unterscheidet den einzelnen Tag vom ganzen mehrtägigen Einsatz. */
    onDelete?: (event: CalEvent, scope?: 'day' | 'series') => void;
    /**
     * MEHRTÄGIGER EINSATZ (24.08.2026): «Tage» klappt den Einsatzplan als
     * SPALTE neben den Angaben auf — kein zweites Fenster (Vorgabe Samet).
     * Ohne dieses Recht ist er nur lesbar; die Monteurin plant nicht.
     */
    canEditDays?: boolean;
    /** Nach dem Speichern des Einsatzplans: das Raster muss nachladen. */
    onDaysChanged?: () => void;
    /** «Terminunterlagen»: Begleitwort, Bilder und PDF für die Monteurin. */
    canOpenDocs?: boolean;
    /** Die Monteurin sieht nur ihre eigenen Einsätze — auch beim Einsatzplan. */
    technicianScope?: boolean;
    canCreate?: boolean;
    deletable?: boolean;
    /* «An Kunden senden» for appointments and meetings — the invitation is sent
       only from here or from the wizard's send step, never on save. */
    canSendInvite?: boolean;
    onInviteSent?: (event: CalEvent) => void;
}) => {
    const [detail, setDetail] = useState<CalEventDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [view, setView] = useState<'detail' | 'invite'>('detail');
    /* Der ganze Einsatz — seine Tage und wie viele Unterlagen daran hängen.
       Wird nebenher geholt: die Auskunftskarte steht schon, während die Zeilen
       nachkommen. Nur für Einsätze; eine Besprechung kennt keine Tage. */
    const [series, setSeries] = useState<AppointmentSeriesDto | null>(null);
    /* DIE SEITENSPALTE (24.08.2026). Unterlagen UND Einsatzplan öffnen sich
       NEBEN den Angaben, nicht darüber: kein zweites Fenster, kein Aufspringen
       (Vorgabe Samet: «die Tage sollen erscheinen wie die Unterlagen — nicht
       als Popup, das aufklappt»). Es ist EINE Spalte, in der das eine oder das
       andere steht; die Angaben bleiben immer stehen.

       Gespeichert wird am Schluss, mit dem breiten Knopf rechts im Fuss — er
       fragt den Griff der Spalte, die gerade offen ist. */
    const [pane, setPane] = useState<'docs' | 'days' | null>(null);
    const paneHandle = useRef<AppointmentDocsHandle | null>(null);
    /* Was der Speichern-Knopf im Fuss anzeigt. Die Spalte meldet es herauf; das
       Sichern selbst holt sich der Knopf am Griff oben, der bei jedem
       Tastendruck neu gesetzt wird und darum nie veraltet ist. */
    const [paneSave, setPaneSave] = useState<{ dirty: boolean; state: PaneSaveState }>({ dirty: false, state: 'idle' });
    const reportPaneSave: PaneSaveReport = (dirty, state) =>
        setPaneSave((current) => (current.dirty === dirty && current.state === state ? current : { dirty, state }));
    /* Die Zahl am Knopf. Sie kommt aus dem Einsatz — und, sobald die Spalte
       offen ist, von ihr: dort wird angehängt und gelöscht, und die Zahl muss
       das sofort zeigen, ohne dass die Karte neu lädt. */
    const [documentCount, setDocumentCount] = useState(0);
    /* Grösser oder ruhig — die Wahl gilt für diese eine Karte und fällt mit ihr
       weg; das nächste Mal beginnt wieder klein. */
    const [enlarged, setEnlarged] = useState(false);

    useEffect(() => {
        setDetail(null);
        setConfirmDelete(false);
        setView('detail');
        setPane(null);
        setPaneSave({ dirty: false, state: 'idle' });
        setEnlarged(false);
        if (!event?.loadDetail) return;
        let cancelled = false;
        setLoading(true);
        event.loadDetail()
            .then((payload) => { if (!cancelled) setDetail(payload); })
            .catch(() => { if (!cancelled) setDetail(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setSeries(null);
        if (!event || event.category !== 'appointments') return;
        let cancelled = false;
        projectApi.getAppointmentSeries(event.refId, { technician: technicianScope })
            .then((payload) => {
                if (cancelled) return;
                setSeries(payload);
                setDocumentCount(payload.documents.length);
            })
            .catch(() => { if (!cancelled) setSeries(null); });
        return () => { cancelled = true; };
    }, [event?.id, technicianScope]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!event) return null;

    /* AUS OUTLOOK/TEAMS HEREINGEKOMMEN (21.08.2026). Solche Einträge gehören
       dem Organisator draussen: das ERP lädt für sie niemanden ein (der Dienst
       lehnt es ohnehin ab) und bearbeitet sie nicht — sie werden bei jeder
       neuen Fassung der Einladung nachgeführt. Hier bleibt der Beitrittslink. */
    const externalOrigin = detail?.externalOrigin || null;
    const inviteTarget: InviteTarget | null = externalOrigin
        ? null
        : event.category === 'appointments'
            ? { kind: 'appointment', id: event.refId }
            : event.category === 'meetings'
                ? { kind: 'meeting', id: event.refId }
                : null;
    /* CC of the invitation = staff only: the assigned team / staff participants
       plus the entry's CC list. The customer is the To. */
    const inviteCc: PickedPerson[] = detail
        ? [
            ...detail.participants.filter((person) => person.isStaff && person.email).map((person) => ccPersonFromEmail(person.email as string, person.name, person.id)),
            ...(detail.ccEmails || []).map((email) => ccPersonFromEmail(email)),
        ]
        : [];
    const inviteSubject = event.category === 'appointments'
        ? t('calendar.wizard.mailSubject', { customer: detail?.customerName || event.customerName || '', date: event.start.format('DD.MM.YYYY') })
        : t('calendar.meeting.mailSubject', { title: event.title, date: event.start.format('DD.MM.YYYY') });

    if (view === 'invite' && inviteTarget) {
        return (
            <FloatingCard
                open
                onClose={onClose}
                closeOnBack
                anchor={anchor}
                width={560}
                closeOnOutside={false}
                title={t('calendar.invite.sendTitle')}
                subtitle={event.title}
            >
                <InviteSendPanel
                    target={inviteTarget}
                    initialTo={detail?.customerEmail || ''}
                    initialCc={inviteCc}
                    initialSubject={inviteSubject}
                    onSent={(sentAt) => {
                        setDetail((current) => (current ? { ...current, inviteSentAt: sentAt } : current));
                        onInviteSent?.(event);
                    }}
                    onClose={() => setView('detail')}
                />
            </FloatingCard>
        );
    }

    const sameDay = event.start.isSame(event.end, 'day');
    /* MEHRTÄGIGER EINSATZ: die Kopfzeile nennt dann den Zeitraum und die Zahl
       der Tage — die Zeiten stehen je Tag im Einsatzplan darunter, denn jeder
       Tag hat eigene. */
    const days = series?.days ?? [];
    const multiDay = days.length > 1;
    const when = multiDay
        ? `${dayjs(days[0].startTime).format('DD.MM.')} – ${dayjs(days[days.length - 1].startTime).format('DD.MM.YYYY')} · ${t('calendar.days.count', { count: days.length })}`
        : event.allDay
            ? event.start.format('dddd, DD. MMMM YYYY')
            : sameDay
                ? `${event.start.format('dddd, DD. MMMM')} · ${event.start.format('HH:mm')} – ${event.end.format('HH:mm')}`
                : `${event.start.format('DD.MM.YYYY HH:mm')} – ${event.end.format('DD.MM.YYYY HH:mm')}`;
    /* Beide Spalten gibt es nur an einem EINSATZ — eine Besprechung hat weder
       Tage noch Unterlagen. */
    const isAppointment = event.category === 'appointments';
    const showDocs = isAppointment && canOpenDocs;
    const showDays = isAppointment && (canEditDays || multiDay);

    /**
     * ZUMACHEN (25.08.2026 vereinfacht). Es gibt keinen Speichern-Knopf mehr —
     * das Blatt sichert sich selbst, kurz nach dem letzten Anschlag. Beim
     * Zumachen kann diese Wartezeit aber noch laufen; dann wird hier nachgeholt,
     * was sie noch nicht weggeschickt hat. Scheitert das, bleibt die Spalte
     * offen: der Fehler steht darin, und niemand macht ein Fenster zu, in dem
     * gerade etwas verloren ginge.
     */
    const closePane = async () => {
        const handle = paneHandle.current;
        if (handle?.dirty && !(await handle.save())) return;
        paneHandle.current = null;
        setPane(null);
        setPaneSave({ dirty: false, state: 'idle' });
    };

    /** Umschalten: derselbe Knopf noch einmal schliesst die Spalte wieder. */
    const togglePane = (next: 'docs' | 'days') => {
        if (pane === next) { void closePane(); return; }
        /* Die andere Spalte hat ihren eigenen Stand — bis sie ihn meldet, zeigt
           der Knopf im Fuss nicht mehr den der vorherigen. */
        setPaneSave({ dirty: false, state: 'idle' });
        setPane(next);
    };

    /* DIE KARTE IST BREITER GEWORDEN (24.08.2026, Vorgabe Samet: «das Fenster
       darf etwas grösser sein»). Sie traegt jetzt ZWEI Spalten mit Angaben —
       links der Vorgang, rechts die Beteiligten — und, sobald die Unterlagen
       aufgeklappt sind, eine dritte Spalte DANEBEN: das Aufklappen schliesst
       nichts, es legt sich daneben. */
    return (
        <FloatingCard
            open
            onClose={onClose}
            closeOnBack
            anchor={anchor}
            /* Termin wie Besprechung — siehe CARD_WIDTH oben. */
            width={enlarged ? ENLARGED_WIDTH : CARD_WIDTH}
            /* Die HÖHE steht ebenfalls fest. Ohne sie wüchse die Karte, sobald
               die Unterlagen aufgehen oder eine Vorschau geladen ist, und
               rückte dabei nach oben; mit ihr rollt der Inhalt innen und die
               Karte bleibt, wo und wie sie ist. Die zweite Grösse ist ebenso
               fest — vergrössern heißt umschalten, nicht mitwachsen. */
            initialHeight={enlarged ? ENLARGED_HEIGHT : CARD_HEIGHT}
            expanded={enlarged}
            onToggleExpand={() => setEnlarged((current) => !current)}
            className={`ofi-cal-detailcard ${enlarged ? 'is-enlarged' : ''}`}
            closeOnOutside={!pane}
            title={event.title}
            /* DER STAND WANDERT IN DIE KOPFZEILE (25.08.2026, Vorgabe Samet:
               «das ‹Geplant› kann woanders stehen — nicht vorne bei den
               Zeichen, die sollen linksbündig sein»). Im Fuss stand es links
               und drückte die ganze Knopfreihe an den rechten Rand; hier
               steht es bei Datum und Dauer, wo es hingehört. */
            subtitle={(
                <>
                    {when}
                    {/* DAS ETIKETT STEHT HIER (25.08.2026). Es hat den aus der
                        Uhr abgeleiteten Stand abgelöst — trägt der Eintrag
                        keines (Altbestand, gelöschtes Etikett), steht der Stand
                        weiterhin als Notnagel da. */}
                    <span className="ofi-cal-detailstatus">
                        {event.labelColor
                            ? <span className="ofi-ucal-dot" style={{ background: event.labelColor }} />
                            : <span className={dotClass(event.status)} />}
                        {calLabelName(event.labelName) || t(STATUS_LABEL_KEY[event.status])}
                    </span>
                </>
            )}
            /* DIE KNOPFLEISTE (25.08.2026 überarbeitet, Vorgabe Samet: «nicht
               zu viele Knöpfe und lange Texte — Zeichen genügen»). Auf 440
               Pixeln brächen sieben beschriftete Knöpfe in drei Zeilen um. Also
               trägt jeder nur noch sein Zeichen; was er tut, steht in seinem
               `title`. GESCHRIEBEN steht allein, was eine Entscheidung ist:
               die Löschfrage und «Speichern». */
            footer={(
                <div className="ofi-cal-detailfoot">
                    {/* `flex-wrap`: auf einem Telefon stehen vier Knoepfe
                        nebeneinander laengst neben dem Bildrand — hier
                        umbrechen sie in eine zweite Zeile. */}
                    <span className="ofi-cal-detailfoot__actions">
                        {deletable && onDelete && (
                            confirmDelete ? (
                                /* Bei einem mehrtägigen Einsatz ist «löschen»
                                   zweideutig — deshalb wird gefragt, WAS weg
                                   soll: dieser eine Tag oder der ganze Einsatz.
                                   HIER stehen WÖRTER: eine Frage, die man mit
                                   zwei gleich aussehenden Zeichen beantworten
                                   müsste, ist keine Frage. */
                                <>
                                    <button type="button" onClick={() => onDelete(event, 'day')} className="ofi-cal-btn is-danger">
                                        {multiDay ? t('calendar.days.deleteDay') : t('common.delete')}
                                    </button>
                                    {multiDay && (
                                        <button type="button" onClick={() => onDelete(event, 'series')} className="ofi-cal-btn is-danger">
                                            {t('calendar.days.deleteAll', { count: days.length })}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDelete(false)}
                                        className="ofi-cal-btn is-icon"
                                        aria-label={t('common.cancel')}
                                        title={t('common.cancel')}
                                    >
                                        <X size={15} />
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setConfirmDelete(true)}
                                    className="ofi-cal-btn is-icon"
                                    aria-label={t('common.delete')}
                                    title={t('common.delete')}
                                >
                                    <Trash01 size={15} />
                                </button>
                            )
                        )}
                        {/* «Unterlagen» und «Einsatzplan» standen HIER — als
                            Umschalter mitten in einer Reihe von Auslösern
                            (12.09.2026). Sie sind in die Zeichenreihe OBEN
                            gewandert, wo das Aufgabenfenster seine Blätter
                            wechselt; im Fuss steht jetzt nur noch, was etwas
                            TUT. */}
                        {event.category === 'appointments' && canCreate && (
                            <button
                                type="button"
                                onClick={() => onCreateFrom(event)}
                                className="ofi-cal-btn is-icon"
                                aria-label={t('calendar.detail.newAppointment')}
                                title={t('calendar.detail.newAppointment')}
                            >
                                <CalendarPlus01 size={15} />
                            </button>
                        )}
                        {detail?.meetingUrl && (
                            <a
                                href={detail.meetingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="ofi-cal-btn is-icon is-primary"
                                aria-label={t('calendar.invite.join')}
                                title={`${t('calendar.invite.join')} — ${detail.meetingUrl}`}
                            >
                                <Share04 size={15} />
                            </a>
                        )}
                        {canSendInvite && inviteTarget && !loading && (
                            <button
                                type="button"
                                onClick={() => setView('invite')}
                                className="ofi-cal-btn is-icon"
                                aria-label={t('calendar.invite.sendTitle')}
                                title={detail?.inviteSentAt ? t('calendar.invite.resend') : t('calendar.invite.sendTitle')}
                            >
                                <Send01 size={15} />
                            </button>
                        )}
                        {event.navigateTo && (
                            <button
                                type="button"
                                onClick={() => onNavigate(event)}
                                className="ofi-cal-btn is-icon"
                                aria-label={t('calendar.detail.goToItem')}
                                title={t('calendar.detail.goToItem')}
                            >
                                <ArrowRight size={15} />
                            </button>
                        )}
                        {/* SPEICHERN — GANZ AM SCHLUSS, RECHTS NEBEN DEM PFEIL
                            (25.08.2026, Vorgabe Samet). Der Pfeil bleibt, wo er
                            war; der Knopf tritt dahinter. Er ist nur da, solange
                            eine Spalte offen ist, und gilt dann für BEIDE: bei
                            den Tagen wie bei den Unterlagen ist es derselbe
                            Knopf, der den Griff der offenen Spalte fragt.
                            Gesichert wird weiter von selbst — er wartet die
                            Bedenkzeit nur nicht ab. */}
                        {pane && canEditDays && (
                            <PaneSaveButton
                                state={paneSave.state}
                                dirty={paneSave.dirty}
                                onSave={() => paneHandle.current?.saveNow()}
                            />
                        )}
                    </span>
                </div>
            )}
        >
            <div className="ofi-cal-detailbody">
                {/* ── DIE ZEICHENREIHE (12.09.2026) ────────────────────────
                    Dieselbe wie im Aufgabenfenster, bis auf die Klassen: oben
                    wird das Blatt gewechselt, das erste ist beim Öffnen
                    gewählt, und rechts steht sein Name. Ein zweiter Klick auf
                    dasselbe Zeichen führt zurück auf die Angaben.
                    Sie erscheint nur, wenn es überhaupt etwas zu wechseln gibt
                    — eine Besprechung hat weder Unterlagen noch Einsatzplan,
                    und eine Reihe mit einem einzigen Zeichen ist keine. */}
                {(showDocs || showDays) && (
                    <div className="ofi-newtask__marks ofi-cal-detailmarks" role="tablist" aria-label={t('calendar.detail.aboutTitle')}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={!pane}
                            onClick={() => { if (pane) void closePane(); }}
                            title={t('calendar.detail.aboutTitle')}
                            aria-label={t('calendar.detail.aboutTitle')}
                            className={`ofi-newtask__mark ${!pane ? 'is-active' : ''}`}
                        >
                            <InfoCircle size={16} />
                        </button>
                        {showDocs && (
                            <button
                                type="button"
                                role="tab"
                                aria-selected={pane === 'docs'}
                                onClick={() => togglePane('docs')}
                                title={t('calendar.docs.title')}
                                aria-label={t('calendar.docs.title')}
                                className={`ofi-newtask__mark ${pane === 'docs' ? 'is-active' : ''}`}
                            >
                                <FileIcon size={16} />
                                {documentCount > 0 && <span className="ofi-newtask__markdot">{documentCount}</span>}
                            </button>
                        )}
                        {showDays && (
                            <button
                                type="button"
                                role="tab"
                                aria-selected={pane === 'days'}
                                onClick={() => togglePane('days')}
                                title={t('calendar.days.title')}
                                aria-label={t('calendar.days.title')}
                                className={`ofi-newtask__mark ${pane === 'days' ? 'is-active' : ''}`}
                            >
                                <CalendarDate size={16} />
                                {multiDay && <span className="ofi-newtask__markdot">{days.length}</span>}
                            </button>
                        )}
                        <span className="ofi-newtask__marklabel">
                            {pane === 'docs'
                                ? t('calendar.docs.title')
                                : pane === 'days'
                                    ? t('calendar.days.title')
                                    : t('calendar.detail.aboutTitle')}
                        </span>
                    </div>
                )}

                {event.subtitle && <div className="ofi-cal-detailbody__sub">{event.subtitle}</div>}

                {/* DER AUSGESCHRIEBENE EINSATZPLAN IST WEG (25.08.2026, Vorgabe
                    Samet: ««(1) Di, 25.08.2026 09:30–14:00 / (2) Mi, 26.08.2026
                    09:30–14:00» — so muss das nicht dastehen»). Der Zeitraum
                    und die Zahl der Tage stehen bereits in der Kopfzeile; wer
                    Tag für Tag sehen (oder verstellen) will, drückt das
                    Kalenderzeichen im Fuss und bekommt den Plan ganz. */}
                {loading && (
                    <div className="space-y-1.5 py-1">
                        {[0, 1, 2].map((row) => <div key={row} className="ofi-shimmer h-4 rounded bg-slate-100 dark:bg-white/5" />)}
                    </div>
                )}

                {!loading && detail && (
                    <>
                        {externalOrigin && (
                            <div className="ofi-cal-extnote">
                                <div className="font-semibold text-slate-600 dark:text-white/70">
                                    {externalOrigin === 'TEAMS' ? t('calendar.invite.fromTeams') : t('calendar.invite.fromOutlook')}
                                </div>
                                {detail.externalOrganizer && (
                                    <div className="truncate">{`${t('calendar.invite.organizer')}: ${detail.externalOrganizer}`}</div>
                                )}
                                {/* WEM GEHÖRT DIE EINLADUNG (14.09.2026)? Steht eine
                                    Person aus dem Haus darin, ist es IHR Termin und
                                    sonst niemandes; ging sie nur an die Firmenadresse,
                                    sehen ihn alle. Ohne diese Zeile ist von aussen
                                    nicht zu erkennen, warum eine Kollegin denselben
                                    Termin nicht im Kalender hat. */}
                                <div>
                                    {detail.participants.some((person) => person.isStaff)
                                        ? t('calendar.mailbox.personal')
                                        : t('calendar.mailbox.shared')}
                                </div>
                                <div>{t('calendar.invite.externalHint')}</div>
                            </div>
                        )}

                        {/* ZWEI SPALTEN (Vorgabe 24.08.2026): links der Vorgang
                            — Kunde, Projekt, Auftrag, Angebot, Leitung, Stand
                            der Einladung, dazu der Kontakt; rechts, wer daran
                            beteiligt ist. Sind die Unterlagen offen, kommt eine
                            dritte Spalte DANEBEN, statt eine der beiden zu
                            verdrängen. */}
                        <div className={`ofi-cal-detailgrid ${pane ? 'has-pane' : ''}`}>
                            {/* Bei offenem Nebenblatt tritt AUCH der Vorgang
                                zurück: auf 440 Pixeln stehen Unterlagen und
                                Angaben nicht nebeneinander, und untereinander
                                müsste man zum Blatt erst hinunterrollen. Das
                                Kreuz oben im Blatt holt beides zurück.
                                VERGRÖSSERT ist der Platz da: dann bleiben die
                                Angaben stehen und das Blatt legt sich daneben. */}
                            {(!pane || enlarged) && (
                            <section className="ofi-cal-detailcol">
                                <div className="ofi-cal-detailcol__head">{t('calendar.detail.aboutTitle')}</div>
                                {/* KEIN Etikettenfeld hier (Vorgabe 25.08.2026:
                                    «nicht unter den Termindetails — es gehört in
                                    die Einstellungen»). Die Karte SAGT, welches
                                    Etikett der Eintrag trägt (oben bei Datum und
                                    Dauer); gepflegt und vergeben wird es dort,
                                    wo die Liste steht: hinter dem Zahnrad der
                                    Leiste und im Anlegefenster. */}
                                <Row label={t('calendar.detail.customer')} value={detail.customerName} />
                                <Row label={t('calendar.detail.project')} value={detail.projectName} />
                                <Row label={t('calendar.detail.order')} value={detail.orderNumber} />
                                <Row label={t('calendar.detail.offer')} value={detail.tenderNumber} />
                                <Row label={t('calendar.detail.manager')} value={detail.manager} />
                                <Row label={t('calendar.detail.contract')} value={detail.contractTitle ? `${detail.contractTitle}${detail.contractCode ? ` (${detail.contractCode})` : ''}` : null} />
                                <Row label={t('calendar.detail.site')} value={detail.siteName} />
                                <Row label={t('calendar.detail.period')} value={detail.period} />
                                <Row label={t('calendar.detail.notes')} value={detail.notes} />
                                {/* DAS BEGLEITWORT STEHT BEI DEN ANGABEN
                                    (25.08.2026). Geschrieben wird es im Zettel
                                    der Unterlagen — zusammen mit den Bildern,
                                    in einem Zug. Gelesen werden muss es aber
                                    hier: wer die Karte aufmacht, soll sehen,
                                    was zu diesem Einsatz gesagt wurde, ohne
                                    erst ein Blatt aufzuklappen. */}
                                <Row label={t('calendar.docs.coverNote')} value={series?.coverNote} />
                                {inviteTarget && (
                                    <Row
                                        label={t('calendar.invite.statusLabel')}
                                        value={detail.inviteSentAt
                                            ? t('calendar.invite.sentOn', { when: dayjs(detail.inviteSentAt).format('DD.MM.YYYY HH:mm') })
                                            : t('calendar.invite.notSent')}
                                    />
                                )}

                                {(detail.customerEmail || detail.customerPhone || detail.customerAddress) && (
                                    <div className="ofi-cal-contact">
                                        <div className="ofi-cal-detailcol__head">{t('calendar.detail.contact')}</div>
                                        {detail.customerEmail && <div className="ofi-cal-contact__row"><Mail01 size={12} /><span className="truncate">{detail.customerEmail}</span></div>}
                                        {detail.customerPhone && <div className="ofi-cal-contact__row"><Phone size={12} />{detail.customerPhone}</div>}
                                        {detail.customerAddress && <div className="ofi-cal-contact__row"><MarkerPin01 size={12} /><span className="truncate">{detail.customerAddress}</span></div>}
                                    </div>
                                )}
                            </section>
                            )}

                            {/* DIE TEILNEHMERSPALTE WEICHT DER SEITENSPALTE
                                (Vorgabe 24.08.2026): Einsatzplan wie Unterlagen
                                brauchen die Breite — der Plan, damit Datum, von
                                und bis nebeneinander stehen, die Unterlagen für
                                die Vorschau. Beide nehmen ihren Platz ein, statt
                                eine dritte Spalte anzuhängen: die Karte behält
                                ihre Breite, und beim Schliessen kommen die
                                Teilnehmer an dieselbe Stelle zurück. */}
                            {!pane && (
                            <section className="ofi-cal-detailcol">
                                <div className="ofi-cal-detailcol__head">{t('calendar.detail.participants')}</div>
                                {detail.participants.length > 0 ? (
                                    <div className="space-y-0.5">
                                        {detail.participants.map((person) => (
                                            <div key={person.id || person.name} className="ofi-cal-person">
                                                <span className="ofi-cal-person__avatar"><User01 size={12} /></span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="ofi-cal-person__name">{person.name}</span>
                                                    <span className="ofi-cal-person__meta">
                                                        {[person.role, person.email, person.phone].filter(Boolean).join(' · ') || '—'}
                                                    </span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="ofi-cal-emptyline">{t('calendar.detail.noParticipants')}</div>
                                )}

                                {(detail.ccEmails || []).length > 0 && (
                                    <div className="pt-2">
                                        <div className="ofi-cal-detailcol__head">{t('calendar.detail.cc')}</div>
                                        <div className="flex flex-wrap gap-1">
                                            {(detail.ccEmails || []).map((email) => (
                                                <span key={email} className="ofi-cal-chiptag is-static">{email}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </section>
                            )}

                            {/* DIE SEITENSPALTE: Unterlagen ODER Einsatzplan —
                                kein zweites Fenster, kein Aufspringen (Vorgabe
                                24.08.2026). Die Unterlagen hängen sich als
                                DRITTE Spalte an, der Einsatzplan nimmt den
                                Platz der Teilnehmer ein: so passen seine Zeilen
                                ganz hinein, ohne dass die Karte breiter wird.
                                Gespeichert wird mit dem breiten Knopf im Fuss —
                                oder beim Schliessen mit dem X, damit nichts
                                stillschweigend verloren geht. */}
                            {pane && (
                                <aside className="ofi-cal-detailcol is-pane">
                                    {/* Der Kopf der Spalte bleibt beim Rollen
                                        stehen: was nicht hineinpasst, wird
                                        gescrollt — und das X muss dabei immer
                                        erreichbar sein (Vorgabe 24.08.2026). */}
                                    <div className="ofi-cal-panehead">
                                        <span className="ofi-cal-detailcol__head">
                                            {pane === 'docs' ? t('calendar.docs.title') : t('calendar.days.title')}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => void closePane()}
                                            className="ofi-cal-panehead__close"
                                            aria-label={t('common.close')}
                                            title={t('common.close')}
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                    {pane === 'docs' ? (
                                        <AppointmentDocumentsPanel
                                            appointmentId={event.refId}
                                            technician={technicianScope}
                                            canManage={canEditDays}
                                            handleRef={paneHandle}
                                            onCountChange={setDocumentCount}
                                            onCoverNote={(coverNote) => setSeries((current) => (current ? { ...current, coverNote } : current))}
                                            onSaveState={reportPaneSave}
                                        />
                                    ) : (
                                        <AppointmentDaysPane
                                            appointmentId={event.refId}
                                            canEdit={canEditDays}
                                            handleRef={paneHandle}
                                            onSaved={() => onDaysChanged?.()}
                                            onSaveState={reportPaneSave}
                                        />
                                    )}
                                </aside>
                            )}
                        </div>
                    </>
                )}

                {!loading && !detail && !event.loadDetail && (
                    <div className="py-2 text-[12.5px] text-slate-400 dark:text-white/40">{t('calendar.detail.noDetail')}</div>
                )}
            </div>
        </FloatingCard>
    );
};
