import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Check, ChevronLeft, ChevronRight, Edit01, File05, ListChecks, Paperclip } from '@/components/icons/antIconCompat';
import { PersonAvatar } from '@/components/ui-shared/PersonAvatar';
import { t } from '@/i18n/translate';
import type { CrmPersonLite, CrmTaskRow } from '@/lib/api/crm';
import { FloatingCard } from '@/pages/calendar/components/FloatingCard';
import { anchorFromRect, type FloatAnchor } from '@/pages/calendar/calendarShared';
import { isTaskOverdue, personName } from '../utils/crmFormat.utils';
import { PAGE_SIZE, columnPages, formatTaskSpan, isMultiDayTask, pageWindow, taskOrigin, type BoardColumn, type TaskOrigin } from './taskBoardModel';

/**
 * Das Aufgabenbrett (19.08.2026) — ZWEI grosse Spalten neben einander (Vorgabe):
 * links "Nicht erledigt", rechts "Erledigt". Passt die Liste nicht mehr in die
 * Spalte, blättert die Spalte selbst weiter — gerollt wird nicht.
 *
 * Wie GROSS eine Aufgabe gezeichnet wird, entscheidet `fill`:
 *   • ohne `fill` (Aufgabenmodus des Kalenders) — kleine Zeilen fester Höhe,
 *     oben angeschlagen.
 *   • mit `fill` (/crm/tasks, Vorgabe 19.08.2026) — die Karten FÜLLEN den
 *     Abschnitt aus: er bekommt so viele Reihen, wie bei `CARD_TARGET_HEIGHT`
 *     hineinpassen, und jede Reihe nimmt sich denselben Anteil der Höhe. Unter
 *     der letzten Karte bleibt damit kein toter Streifen mehr stehen.
 *
 * Eine Zeile in die andere Spalte ZIEHEN setzt den Zustand. Sobald man
 * aufnimmt, legt sich ein Schleier über die Seite und die aufgenommene Zeile
 * hängt am Zeiger — man SIEHT, was man trägt und wohin es fällt (Vorgabe). Der
 * Kreis auf der Zeile tut dasselbe per Klick; ein Klick auf die Zeile öffnet die
 * Erledigungskarte als Popup (Angaben / Notizen & Bilder), keine neue Seite.
 *
 * Auf der Zeile stehen Titel, Zustand, Termin, Kunde, WER sie zugewiesen hat und
 * die ersten ZWEI Verantwortlichen; der Pfeil daneben öffnet den Rest als Popup.
 *
 * Farbsprache (Vorgabe): die Herkunft färbt die FLÄCHE — Markenblau für selbst
 * zugewiesen, Violett für bekommen. KEINE Farbstriche an den Kanten.
 *
 * Gezogen wird über Fenster-Zeigerereignisse (wie im Kalender), weil die Zeile
 * beim Ziehen neu gezeichnet wird und eine Zeigerbindung am Element verlieren
 * könnte.
 */

/** Wie viele Bilder auf der Zeile stehen, bevor der Pfeil übernimmt. */
const AVATARS_ON_ROW = 2;
/** Wie weit der Zeiger wandern muss, damit es ein Ziehen und kein Klick ist. */
const DRAG_THRESHOLD = 5;
/* LANGER DRUCK (Vorgabe Samet, 29.08.2026: «beim langen Drücken erscheint die
   Hand zum Verschieben — beim ersten Mal aber nicht»). Vorher hob die Karte
   erst ab, wenn der Zeiger DRAG_THRESHOLD weit gewandert war: wer die Karte
   nur hielt, sah nichts und drückte ein zweites Mal — daher «beim ersten Mal
   erscheint sie nicht». Jetzt nimmt der lange Druck die Karte AUCH OHNE
   Bewegung auf: nach LONG_PRESS_MS hängt sie am Zeiger, die Hand ist zu, der
   Schleier liegt über der Seite. Die Maus zieht weiterhin sofort los, sobald
   sie wandert — man muss nicht warten. Gilt für beide Bretter (/crm/tasks und
   der Aufgabenmodus des Kalenders), sie sind dieselbe Zeichnung. */
const LONG_PRESS_MS = 320;
/* Kartenhöhe und Abstand aus index.css (.ofi-taskrow) — daraus rechnet das
   Brett OHNE `fill`, wie viele Karten in einen Abschnitt passen. Ändert sich
   dort das Polster oder die Schriftgrösse, muss diese Zahl mit.
   `CARD_MIN_WIDTH` entscheidet, ob ein Abschnitt seine Karten ZWEI- oder
   einspaltig legt (Vorgabe 19.08.2026: beide Abschnitte zweispaltig). */
const CARD_HEIGHT = 92;
const CARD_GAP = 8;
const CARD_MIN_WIDTH = 250;
const MIN_ROWS_PER_PAGE = 2;
/* OBERGRENZE je Seite. Ohne sie füllte die Messung einen hohen Abschnitt mit
   zwölf und mehr Karten — dann passte alles auf Seite 1 und die Blätterleiste
   zeigte ewig nur die "1" (Vorgabe 19.08.2026: es soll wirklich auf 2, 3 …
   weitergehen). Sechs sind zwei Spalten mal drei Reihen. */
const MAX_ROWS_PER_PAGE = 6;
/* ── Füllmodus (`fill`, Vorgabe 19.08.2026) ────────────────────────────────
   Auf der eigenen Aufgabenseite sollen die Karten den Abschnitt AUSFÜLLEN —
   unter der letzten Karte stand ein toter Streifen, während die Karten selbst
   schmale Zeilen blieben. Dort zählt darum keine feste Kartenhöhe mehr: das
   Brett fragt, wie viele Reihen bei der ANGESTREBTEN Höhe in den Abschnitt
   passen, und index.css lässt die Reihen anschliessend exakt auf die
   Abschnittshöhe wachsen (jede Reihe `1fr`, `.ofi-taskboard.is-fill`).
   GERUNDET statt abgeschnitten: so landet die wirkliche Kartenhöhe nahe am
   Ziel, statt zwischen zwei Reihenzahlen zu verhungern.

   150 ist kein runder Wunsch, sondern die Höhe, die eine Karte WIRKLICH füllt:
   Polster 26 + Titel über drei Zeilen 57 + Nebenzeile 20 + Fussband 34 ≈ 137.
   Deutlich höher (etwa 180) stünde zwischen Nebenzeile und Fussband ein leeres
   Feld — eine Aufgabe hat ausser Titel, Kunde, Termin und Bildern nichts, was
   dort stehen könnte. */
const CARD_TARGET_HEIGHT = 150;
const FILL_MIN_ROWS = 2;
const FILL_MAX_ROWS = 10;
/** Bilder je Karte im Füllmodus — die hohe Karte trägt eine Person mehr. */
const AVATARS_ON_FILL_ROW = 3;

/**
 * Welche Spalte die gezogene Zeile "meint" — entschieden über die FLÄCHE des
 * Abbilds, nicht über die Zeigerspitze (Vorgabe 19.08.2026: die Zeile soll
 * fallen, sobald sie die Kante überschreitet, und nicht erst, wenn man den
 * Zeiger millimetergenau in die andere Spalte setzt). Es gewinnt die Spalte,
 * mit der sich das Abbild am weitesten überschneidet; berührt es keine, bleibt
 * es beim Zeiger als letzte Auskunft.
 */
const columnUnder = (ghost: { left: number; top: number; width: number; height: number }, pointerX: number, pointerY: number): BoardColumn | null => {
    const columns = Array.from(document.querySelectorAll<HTMLElement>('[data-task-col]'));
    let best: { column: BoardColumn; area: number } | null = null;
    for (const element of columns) {
        const key = element.dataset.taskCol as BoardColumn | undefined;
        if (!key) continue;
        const box = element.getBoundingClientRect();
        const overlapX = Math.min(ghost.left + ghost.width, box.right) - Math.max(ghost.left, box.left);
        const overlapY = Math.min(ghost.top + ghost.height, box.bottom) - Math.max(ghost.top, box.top);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const area = overlapX * overlapY;
        if (!best || area > best.area) best = { column: key, area };
    }
    if (best) return best.column;
    const under = document.elementFromPoint(pointerX, pointerY) as HTMLElement | null;
    return (under?.closest('[data-task-col]') as HTMLElement | null)?.dataset.taskCol as BoardColumn | undefined ?? null;
};

const ORIGIN_CLASS: Record<TaskOrigin, string> = {
    self: 'is-self',
    incoming: 'is-incoming',
    outgoing: 'is-outgoing',
    plain: '',
};

/** Was auf einer Zeile steht — auch das Zieh-Abbild zeichnet damit. */
const rowFacts = (task: CrmTaskRow, userId?: string | null) => {
    const done = task.status === 'DONE';
    const missed = task.status === 'INCOMPLETE';
    const overdue = task.status === 'OPEN' && isTaskOverdue(task);
    const origin = taskOrigin(task, userId);
    return {
        done,
        missed,
        overdue,
        origin,
        // Die "von …"-Zeile nur, wenn es jemand anderes war — bei einer selbst
        // gegebenen Aufgabe wäre der eigene Name auf der eigenen Zeile Lärm.
        assigner: origin === 'incoming' || origin === 'plain' ? task.createdBy : null,
        notes: Number(task.noteCount ?? 0),
        people: origin === 'self' ? [] : task.assignees,
        stateLabel: done ? t('crm.tasks.statusDone')
            : missed ? t('crm.tasks.statusIncomplete')
                : overdue ? t('crm.tasks.overdue')
                    : t('crm.tasks.statusOpen'),
        /* KEINE Zustandsmarke mehr auf der Karte (18.08.2026). Sie sagte auf
           jeder Karte dasselbe wie die Spalte darueber: "Offen" links,
           "Erledigt" rechts — und "Nicht erledigt" war sogar Wort fuer Wort
           der Name der linken Spalte. Was bleibt, sagt es ohne Marke:
             · offen/erledigt  → der Kreis und die durchgestrichene Zeile
             · zu spaet        → der Termin selbst wird rot
           Das Wort steht weiterhin im Titel-Tooltip der Zeile.
           `missed` und `overdue` sind fuer die Anzeige dasselbe: der
           Hintergrunddienst kippt jede verstrichene offene Aufgabe ohnehin
           auf INCOMPLETE (crmTaskMaintenance.flipOverdueTasks). */
        late: missed || overdue,
        /* ANFANG BIS ENDE statt eines einzelnen Termins (11.09.2026): eine
           Aufgabe darf sich über mehrere Tage ziehen, und dann ist der
           Endtermin allein die halbe Auskunft. */
        due: formatTaskSpan(task),
        multiDay: isMultiDayTask(task),
        /* Anleitung und Anhänge stehen als ZAHLEN auf der Karte — was drin
           steht, sieht man im Fenster. Die Anleitung zeigt ihren Fortschritt
           (2/5), weil das die eigentliche Auskunft ist. */
        steps: Number(task.stepCount ?? 0),
        stepsDone: Number(task.stepDoneCount ?? 0),
        files: Number(task.documentCount ?? 0),
    };
};

const TaskRow = ({ task, userId, busy, dragging, fill, onPointerStart, onToggle, onPeople }: {
    task: CrmTaskRow;
    userId?: string | null;
    busy: boolean;
    dragging: boolean;
    /** Hohe Karte, die ihre Reihe ausfüllt — dann ist mehr Platz für Bilder. */
    fill: boolean;
    onPointerStart: (event: React.PointerEvent<HTMLElement>, task: CrmTaskRow) => void;
    onToggle: (task: CrmTaskRow) => void;
    onPeople: (task: CrmTaskRow, popupAnchor: FloatAnchor) => void;
}) => {
    const facts = rowFacts(task, userId);
    const avatars = fill ? AVATARS_ON_FILL_ROW : AVATARS_ON_ROW;
    const rest = Math.max(0, facts.people.length - avatars);

    return (
        <article
            data-task-card
            role="button"
            tabIndex={0}
            onPointerDown={(event) => onPointerStart(event, task)}
            /* Der lange Druck gehört DEM BRETT, nicht dem Browser: auf einem
               Berührschirm wirft das Halten sonst nach einer halben Sekunde
               das eigene Fenster des Browsers auf (und mit ihm ein
               `pointercancel`, das die eben aufgenommene Karte wieder fallen
               liesse). Eine Aufgabenkarte hat kein eigenes Kontextmenü, hier
               geht also nichts verloren. */
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(task); } }}
            className={`ofi-taskrow ${ORIGIN_CLASS[facts.origin]} ${facts.done ? 'is-done' : ''} ${dragging ? 'is-dragging' : ''}`}
        >
            <button
                type="button"
                disabled={busy}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); onToggle(task); }}
                aria-label={facts.done ? t('calendar.tasks.reopen') : t('calendar.tasks.complete')}
                title={facts.done ? t('calendar.tasks.reopen') : t('calendar.tasks.complete')}
                className={`ofi-taskrow__check ${facts.done ? 'is-done' : ''}`}
            >
                {facts.done && <Check size={12} />}
            </button>

            <div className="ofi-taskrow__body">
                <h3 className="ofi-taskrow__title" title={task.title}>{task.title}</h3>
                <p className="ofi-taskrow__sub">
                    {task.customer?.companyName}
                    {/* Die verknüpfte Offerte steht direkt hinter dem Kunden —
                        sie ist seine Angelegenheit, keine eigene Zeile. */}
                    {task.tender?.tenderNumber && (
                        <span className="ofi-taskrow__quote"><File05 size={10} />{task.tender.tenderNumber}</span>
                    )}
                    {task.customer?.companyName && (facts.assigner || facts.origin === 'self') ? ' · ' : ''}
                    {facts.assigner
                        ? t('crm.tasks.assignedBy', { name: personName(facts.assigner) })
                        : facts.origin === 'self' ? t('crm.tasks.assignedSelf') : ''}
                </p>
                <div className="ofi-taskrow__foot">
                    <span className={`ofi-taskrow__due ${facts.late ? 'is-late' : ''} ${facts.multiDay ? 'is-span' : ''}`} title={facts.stateLabel}>
                        {facts.due}
                    </span>
                    {facts.steps > 0 && (
                        <span className="ofi-taskrow__notes" title={t('crm.tasks.stepsTitle')}>
                            <ListChecks size={11} />{facts.stepsDone}/{facts.steps}
                        </span>
                    )}
                    {facts.files > 0 && (
                        <span className="ofi-taskrow__notes" title={t('crm.tasks.filesTitle')}>
                            <Paperclip size={11} />{facts.files}
                        </span>
                    )}
                    {facts.notes > 0 && <span className="ofi-taskrow__notes"><Edit01 size={11} />{facts.notes}</span>}
                    {facts.people.length > 0 && (
                        <span className="ofi-taskrow__people">
                            {facts.people.slice(0, avatars).map((person) => (
                                <PersonAvatar key={person.id} id={person.id} name={personName(person)} size={fill ? 24 : 20} ring={false} tone="subtle" />
                            ))}
                            {/* Der Rest steckt hinter dem Pfeil — die Karte bleibt ruhig. */}
                            {rest > 0 && (
                                <button
                                    type="button"
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onPeople(task, anchorFromRect((event.currentTarget as HTMLElement).getBoundingClientRect()));
                                    }}
                                    aria-label={t('crm.tasks.peopleMore', { count: rest })}
                                    title={t('crm.tasks.peopleMore', { count: rest })}
                                    className="ofi-taskrow__peoplemore"
                                >
                                    +{rest}
                                    <ChevronRight size={10} />
                                </button>
                            )}
                        </span>
                    )}
                </div>
            </div>
        </article>
    );
};

/**
 * Die GESCHLOSSENE HAND auf dem Abbild (Vorgabe Samet, 29.08.2026). Der Zeiger
 * zeigt sie ohnehin (`cursor: grabbing`) — auf einem Berührschirm gibt es aber
 * keinen Zeiger, und dort ist dieses Zeichen die einzige Auskunft, dass die
 * Karte jetzt WIRKLICH in der Hand liegt und abgelegt werden will.
 */
const GrabMark = () => (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden>
        <path d="M18 11.5V9a2 2 0 0 0-4 0v1.4" />
        <path d="M14 10V8a2 2 0 0 0-4 0v2" />
        <path d="M10 9.9V9a2 2 0 0 0-4 0v5" />
        <path d="M6 14a2 2 0 0 0-4 0v1a8 8 0 0 0 8 8h4a8 8 0 0 0 8-8V9a2 2 0 0 0-4 0v1" />
    </svg>
);

/**
 * Das Zieh-Abbild: die aufgenommene Zeile am Zeiger, über einem Schleier, der
 * den Rest der Seite abdeckt (Vorgabe 19.08.2026 — man muss sehen, was man
 * trägt). Der Schleier lässt Zeigerereignisse DURCH (`pointer-events: none`),
 * sonst fände `elementFromPoint` beim Ablegen nur ihn und nie die Spalte.
 */
const DragGhost = ({ task, userId, x, y, width }: {
    task: CrmTaskRow;
    userId?: string | null;
    x: number;
    y: number;
    width: number;
}) => {
    const facts = rowFacts(task, userId);
    return createPortal(
        <>
            <div className="ofi-taskdrag__veil" aria-hidden />
            <div className="ofi-taskdrag" style={{ left: x, top: y, width }} aria-hidden>
                <span className="ofi-taskdrag__hand"><GrabMark /></span>
                <span className={`ofi-taskrow__check ${facts.done ? 'is-done' : ''}`}>{facts.done && <Check size={12} />}</span>
                <div className="ofi-taskrow__body">
                    <h3 className="ofi-taskrow__title">{task.title}</h3>
                    <div className="ofi-taskrow__foot">
                        <span className={`ofi-taskrow__due ${facts.late ? 'is-late' : ''}`}>
                            {facts.due}
                        </span>
                    </div>
                </div>
            </div>
        </>,
        document.body,
    );
};

/** Alle Verantwortlichen einer Aufgabe — das Popup hinter dem Pfeil. */
const PeopleCard = ({ open, task, anchor, onClose }: {
    open: boolean;
    task: CrmTaskRow | null;
    anchor: FloatAnchor | null;
    onClose: () => void;
}) => (
    <FloatingCard
        open={open && Boolean(task)}
        onClose={onClose}
        closeOnBack
        anchor={anchor}
        /* Wie die Erledigungskarte: rechts neben dem Pfeil, auf den geklickt
           wurde — nicht auf der anderen Hälfte des Bretts. */
        prefer="right"
        width={280}
        title={t('crm.tasks.colAssignee')}
        subtitle={task?.title}
        closeOnOutside
    >
        <ul className="ofi-taskpeople">
            {(task?.assignees ?? []).map((person: CrmPersonLite) => (
                <li key={person.id}>
                    <PersonAvatar id={person.id} name={personName(person)} size={24} ring={false} tone="subtle" />
                    {personName(person)}
                </li>
            ))}
        </ul>
    </FloatingCard>
);

export const TaskBoard = ({ tasks, loading, busyIds, userId, fill = false, onSetDone, onOpen, pageSize }: {
    tasks: CrmTaskRow[];
    loading: boolean;
    busyIds: Set<string>;
    userId?: string | null;
    /**
     * Die Karten FÜLLEN den Abschnitt aus (Vorgabe 19.08.2026, /crm/tasks):
     * hohe Karten in fester Reihenzahl statt schmaler Zeilen mit totem Raum
     * darunter. Der Aufgabenmodus des Kalenders lässt es aus — dort steht die
     * Leiste neben dem Brett und der Abschnitt ist anders hoch.
     */
    fill?: boolean;
    /** In die andere Spalte gezogen (oder Kreis geklickt): erledigt ja/nein. */
    onSetDone: (task: CrmTaskRow, done: boolean) => void;
    onOpen: (task: CrmTaskRow, popupAnchor: FloatAnchor) => void;
    /** Zeilen je Seite; ohne Angabe rechnet das Brett sie aus der Höhe aus. */
    pageSize?: number;
}) => {
    const bodyRef = useRef<HTMLDivElement | null>(null);
    /* Wie viele Karten wirklich in einen Abschnitt passen. Eine feste Zahl
       schnitt die letzte Karte ab, wenn das Fenster niedriger war als gedacht —
       und gerollt wird hier nicht, es wird geblättert (Vorgabe). Gemessen werden
       Höhe UND Breite des Abschnitts: die Breite sagt, ob die Karten ein- oder
       zweispaltig liegen, die Höhe, wie viele Reihen hineingehen. */
    const [fit, setFit] = useState<{ size: number; rows: number }>({ size: PAGE_SIZE, rows: 3 });
    useEffect(() => {
        const element = bodyRef.current;
        if (!element || typeof ResizeObserver === 'undefined') return;
        const measure = () => {
            /* Gemessen wird der INHALTSKASTEN: `clientHeight` zählt das Polster
               des Abschnitts mit, die Reihen des Rasters bekommen es aber nicht.
               Ohne den Abzug rechnete das Brett mit zwanzig Pixeln, die es gar
               nicht zu verteilen hat. */
            const style = getComputedStyle(element);
            const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
            const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            if (!(height > 0) || !(width > 0)) return;
            const columns = Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP)));
            const next = fill
                /* Füllmodus: die Reihenzahl kommt aus der ZIELHÖHE, die wirkliche
                   Kartenhöhe fällt danach beim Aufteilen des Abschnitts an. */
                ? (() => {
                    const rows = Math.min(FILL_MAX_ROWS, Math.max(FILL_MIN_ROWS, Math.round((height + CARD_GAP) / (CARD_TARGET_HEIGHT + CARD_GAP))));
                    return { size: columns * rows, rows };
                })()
                : (() => {
                    const rows = Math.max(1, Math.floor((height + CARD_GAP) / (CARD_HEIGHT + CARD_GAP)));
                    const room = columns * rows;
                    return { size: Math.min(MAX_ROWS_PER_PAGE, Math.max(MIN_ROWS_PER_PAGE, room)), rows };
                })();
            setFit((current) => (current.size === next.size && current.rows === next.rows ? current : next));
        };
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [fill]);
    const rowsPerPage = pageSize ?? fit.size;
    /* Die gemessene Reihenzahl geht als Merkmal an BEIDE Abschnitte: index.css
       baut daraus `grid-template-rows: repeat(n, 1fr)`. Sie ist FEST und wird
       nicht aus der Kartenzahl abgeleitet — sonst wäre eine halbvolle letzte
       Seite eine einzige riesige Karte und die Karten wechselten beim Blättern
       die Grösse. */
    const bodyStyle = fill ? ({ '--ofi-task-rows': fit.rows } as React.CSSProperties) : undefined;

    /* Die laufende Aufnahme. `cancel` räumt sie ab, ohne etwas auszulösen —
       daran hängt die Rettung weiter unten. */
    const dragRef = useRef<{ task: CrmTaskRow; cancel: () => void } | null>(null);
    /* Der sichtbare Zustand des Ziehens: welche Zeile hängt am Zeiger, wo ist
       der Zeiger, und über welcher Spalte steht er. */
    const [drag, setDrag] = useState<{
        task: CrmTaskRow;
        x: number;
        y: number;
        width: number;
        over: BoardColumn | null;
    } | null>(null);
    const [people, setPeople] = useState<{ task: CrmTaskRow; anchor: FloatAnchor } | null>(null);
    /* JE Abschnitt eine eigene Seitenzahl (Vorgabe 19.08.2026): die beiden
       Listen blättern unabhängig, weil sie unabhängig lang sind. */
    const [pageOpen, setPageOpen] = useState(0);
    const [pageDone, setPageDone] = useState(0);

    const openPages = useMemo(() => columnPages(tasks, 'open', rowsPerPage), [tasks, rowsPerPage]);
    const donePages = useMemo(() => columnPages(tasks, 'done', rowsPerPage), [tasks, rowsPerPage]);

    /* ── AUFNEHMEN, ZIEHEN, ABLEGEN ─────────────────────────────────────────
       Und vor allem: SICHER WIEDER LOSLASSEN.

       Solange eine Aufnahme läuft, trägt das Brett `is-dragging` — und damit
       (index.css) `cursor: grabbing` über der ganzen Fläche und
       `pointer-events: none` auf JEDER Zeile. Das ist beim Ziehen richtig und
       im Stehen fatal: bleibt die Aufnahme hängen, zeigt das Brett nur noch
       eine geschlossene Hand, keine Zeile lässt sich mehr anklicken und keine
       Karte geht mehr auf (Fehlerbild Samet, 29.08.2026: «bei den Aufgaben
       erscheint nur ein Handzeichen, ich kann nicht klicken und keine Details
       sehen»).

       Hängen blieb sie, weil das Loslassen NUR am Fenster horchte: wer eine
       Karte an den Bildrand zog und den Knopf ausserhalb losliess — über der
       Werkzeugleiste des Browsers, auf dem zweiten Schirm — dessen `pointerup`
       kam nie an. Der alte `startDrag` stieg dann bei jedem weiteren Druck
       sofort wieder aus (`if (… || dragRef.current) return`), also blieb es so
       bis zum Neuladen der Seite.

       Drei Griffe halten das jetzt:
         1. ZEIGERFANG (`setPointerCapture`): der Zeiger gehört bis zum
            Loslassen dieser Zeile, das Loslassen wird also auch ausserhalb des
            Fensters zugestellt. `lostpointercapture` ist das Netz darunter.
         2. Fenster verliert den Fokus (Alt-Tab, anderer Schirm) → abbrechen.
            Escape ebenso: eine Aufnahme muss man loswerden können.
         3. Eine ALTE Aufnahme wird beim nächsten Druck abgeräumt, statt den
            Druck abzuweisen. Selbst wenn doch einmal etwas durchrutscht,
            heilt sich das Brett damit beim nächsten Griff. */
    const startDrag = useCallback((event: React.PointerEvent<HTMLElement>, task: CrmTaskRow) => {
        if (event.button !== 0) return;
        // Eine hängengebliebene Aufnahme zuerst abräumen — nicht aussteigen.
        dragRef.current?.cancel();

        const element = event.currentTarget as HTMLElement;
        const box = element.getBoundingClientRect();
        // Das Abbild hängt dort am Zeiger, wo man die Zeile aufgenommen hat.
        const grabX = event.clientX - box.left;
        const grabY = event.clientY - box.top;
        const originX = event.clientX;
        const originY = event.clientY;
        const pointerId = event.pointerId;
        let over: BoardColumn | null = null;
        /* AUFGENOMMEN — durch Wandern ODER durch langes Halten. Danach ist es
           ein Ziehen und kein Klick mehr: das Loslassen legt ab, es öffnet
           keine Karte. */
        let held = false;
        let closed = false;
        // Wo der Zeiger zuletzt stand — der lange Druck braucht die Stelle, an
        // der er zuschlägt, und die Bewegung davor zählt noch nicht als Ziehen.
        let lastX = originX;
        let lastY = originY;

        /** Abbild und Ablegeziel auf die Zeigerstelle setzen. */
        const place = (pointerX: number, pointerY: number) => {
            const left = pointerX - grabX;
            const top = pointerY - grabY;
            // Über die FLÄCHE des Abbilds, nicht über die Zeigerspitze: die Zeile
            // fällt, sobald sie die Kante überschreitet.
            over = columnUnder({ left, top, width: box.width, height: box.height }, pointerX, pointerY);
            setDrag({ task, x: left, y: top, width: box.width, over });
        };

        /** Die Zeile hebt ab und hängt von nun an am Zeiger. */
        let holdTimer = 0;
        const pickUp = () => {
            if (closed || held) return;
            held = true;
            window.clearTimeout(holdTimer);
            place(lastX, lastY);
        };

        /* Der lange Druck. Er läuft ab dem Aufsetzen und wird von jeder
           Bewegung überholt, die weiter als DRAG_THRESHOLD geht — die Maus
           soll nicht warten müssen. */
        holdTimer = window.setTimeout(pickUp, LONG_PRESS_MS);

        const onMove = (moveEvent: PointerEvent) => {
            lastX = moveEvent.clientX;
            lastY = moveEvent.clientY;
            if (!held) {
                if (Math.abs(lastX - originX) < DRAG_THRESHOLD && Math.abs(lastY - originY) < DRAG_THRESHOLD) return;
                pickUp();
                return;
            }
            place(lastX, lastY);
        };

        /** Alles abräumen — ohne abzulegen und ohne zu öffnen. */
        const cancel = () => {
            if (closed) return;
            closed = true;
            window.clearTimeout(holdTimer);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', cancel);
            window.removeEventListener('blur', cancel);
            window.removeEventListener('keydown', onKey);
            element.removeEventListener('lostpointercapture', cancel);
            if (element.hasPointerCapture?.(pointerId)) {
                try { element.releasePointerCapture(pointerId); } catch { /* schon weg */ }
            }
            dragRef.current = null;
            setDrag(null);
        };

        const onKey = (keyEvent: KeyboardEvent) => { if (keyEvent.key === 'Escape') cancel(); };

        const onUp = () => {
            if (closed) return;
            const wasHeld = held;
            const target = over;
            cancel();
            /* Ein Klick (weder gewandert noch gehalten) öffnet die
               Erledigungskarte neben der Zeile. Wer die Karte aufgenommen hat
               und sie an Ort und Stelle wieder loslässt, LEGT sie dort ab —
               die Karte darf danach nicht auch noch aufspringen. */
            if (!wasHeld) { onOpen(task, anchorFromRect(box)); return; }
            if (!target) return;
            const wasDone = task.status === 'DONE';
            const wantsDone = target === 'done';
            if (wasDone !== wantsDone) onSetDone(task, wantsDone);
        };

        dragRef.current = { task, cancel };
        // Der Zeiger gehört ab jetzt dieser Zeile: das Loslassen kommt an, auch
        // wenn es ausserhalb des Fensters geschieht.
        try { element.setPointerCapture(pointerId); } catch { /* kein Fang möglich */ }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('blur', cancel);
        window.addEventListener('keydown', onKey);
        element.addEventListener('lostpointercapture', cancel);
    }, [onOpen, onSetDone]);

    const column = (key: BoardColumn, pages: CrmTaskRow[][], page: number, setPage: (next: number) => void) => {
        const count = pages.length;
        /* Die gültige Seite wird BEIM LESEN begrenzt: hakt man die letzte Karte
           einer Seite ab, wandert sie in den anderen Abschnitt und die Seitenzahl
           könnte ins Leere zeigen. */
        const current = Math.max(0, Math.min(page, count - 1));
        const rows = pages[current] ?? [];
        const total = pages.reduce((sum, list) => sum + list.length, 0);
        return (
            <section
                data-task-col={key}
                className={`ofi-taskcol ${key === 'done' ? 'is-done' : ''} ${drag?.over === key ? 'is-drop' : ''}`}
            >
                {/* Der Zähler steht OBEN, direkt neben dem Namen des Abschnitts
                    (Vorgabe 19.08.2026) — nicht mehr in der Filterzeile. */}
                <header className="ofi-taskcol__head">
                    <h2>{key === 'done' ? t('crm.tasks.groupDone') : t('crm.tasks.groupOpen')}</h2>
                    <span className={`ofi-taskcol__count ${key === 'done' ? 'is-done' : ''}`}>{total}</span>
                </header>
                <div className="ofi-taskcol__body" style={bodyStyle} ref={key === 'open' ? bodyRef : undefined}>
                    {/* Der Ladeschimmer zeigt so viele Platzhalter, wie wirklich
                        auf eine Seite gehen — im Füllmodus sind das die hohen
                        Karten, nicht fünf schmale Zeilen. */}
                    {loading && total === 0 && Array.from({ length: fill ? rowsPerPage : 5 }, (_, index) => (
                        <div key={index} className="ofi-shimmer ofi-taskcol__ghost" />
                    ))}
                    {!loading && total === 0 && (
                        <p className="ofi-taskcol__empty">
                            {key === 'done' ? t('crm.tasks.doneEmpty') : t('crm.tasks.openEmpty')}
                        </p>
                    )}
                    {rows.map((task) => (
                        <TaskRow
                            key={task.id}
                            task={task}
                            userId={userId}
                            busy={busyIds.has(task.id)}
                            dragging={drag?.task.id === task.id}
                            fill={fill}
                            onPointerStart={startDrag}
                            onToggle={(row) => onSetDone(row, row.status !== 'DONE')}
                            onPeople={(row, popupAnchor) => setPeople({ task: row, anchor: popupAnchor })}
                        />
                    ))}
                </div>

                {/* JEDER Abschnitt blättert selbst (Vorgabe): 1, 2, 3 … Die Leiste
                    steht auch bei einer einzigen Seite da, damit die Höhe des
                    Abschnitts beim Filtern nicht springt. */}
                <nav className="ofi-taskboard__pager" aria-label={t('crm.tasks.pagerLabel')}>
                    <button
                        type="button"
                        disabled={current <= 0}
                        onClick={() => setPage(current - 1)}
                        aria-label={t('crm.tasks.pagePrev')}
                        title={t('crm.tasks.pagePrev')}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    {/* MEHR Zahlen als nur 1-2-3 (Vorgabe): bis zu elf stehen in der
                        Leiste, die Knöpfe sind dafür schmal. */}
                    {pageWindow(current, count, 11).map((index, position) => (index < 0 ? (
                        <span key={`gap-${position}`} className="ofi-taskboard__gap" aria-hidden>…</span>
                    ) : (
                        <button
                            key={index}
                            type="button"
                            onClick={() => setPage(index)}
                            aria-current={index === current ? 'page' : undefined}
                            className={index === current ? 'is-active' : ''}
                        >
                            {index + 1}
                        </button>
                    )))}
                    <button
                        type="button"
                        disabled={current >= count - 1}
                        onClick={() => setPage(current + 1)}
                        aria-label={t('crm.tasks.pageNext')}
                        title={t('crm.tasks.pageNext')}
                    >
                        <ChevronRight size={16} />
                    </button>
                </nav>
            </section>
        );
    };

    return (
        <div className={`ofi-taskboard ${fill ? 'is-fill' : ''} ${drag ? 'is-dragging' : ''}`}>
            <div className="ofi-taskboard__cols">
                {column('open', openPages, pageOpen, setPageOpen)}
                {column('done', donePages, pageDone, setPageDone)}
            </div>

            {drag && <DragGhost task={drag.task} userId={userId} x={drag.x} y={drag.y} width={drag.width} />}

            <PeopleCard
                open={Boolean(people)}
                task={people?.task ?? null}
                anchor={people?.anchor ?? null}
                onClose={() => setPeople(null)}
            />
        </div>
    );
};
