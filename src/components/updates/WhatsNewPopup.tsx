import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AppsGlyph } from '@/components/icons/AppsGlyph';
import { OffitecMark } from '@/components/icons/OffitecMark';
import { OutlookMark } from '@/components/icons/OutlookMark';
import { TaskMark } from '@/components/icons/TaskMark';
import { BellRinging, Calendar as CalendarIcon, TrendUp01, Umbrella } from '@/components/icons/antIconCompat';
import {
    LuArrowRight,
    LuBriefcase,
    LuCalendarDays,
    LuChevronRight,
    LuLayers,
    LuListChecks,
    LuMail,
    LuPackage,
    LuReceipt,
    LuTrendingUp,
    LuUsers,
    LuX,
    LuZap,
    type LocalIconProps,
} from '@/components/icons/lucideLocal';
import { useAppsMenuControl } from '@/components/layout/RequestsAppsMenu';
import { LoginWave } from '@/components/login/LoginWave';
import { isPathAllowed } from '@/lib/pageAccess';
import { useAuthStore } from '@/store/authStore';
import { useGuardedNavigate } from '@/store/navGuardStore';

import { QUOTES_PATH, newestQuotePath } from './sampleQuote';
import { UPDATE_NOTES, type AppMark, type TourStop, type UpdateAccent } from './updateNotes';
import { useWhatsNewStore } from './whatsNewStore';

/**
 * ── DIE ANKÜNDIGUNG ─────────────────────────────────────────────────────────
 *
 * Vorgaben Samet, an einem Tag gewachsen, der Reihe nach:
 *
 *   1. «Ein cooles, lebendiges Fenster beim ersten Anmelden — oder als kleine
 *      Mitteilung — das die neuen Apps und die allgemeinen Neuerungen
 *      ankündigt, etwa im Kalender oder im Verkauf. Modern und stilvoll.»
 *   2. «Es muss ein GROSSES Fenster sein, es muss SOFORT kommen, und es muss
 *      VON UNTEN heraufkommen.»
 *   3. «Beim ersten Start ein richtig cooles, grosses Fenster — mit den
 *      App-Zeichen, so eine Art Prospekt, passend zum Update vom 29. August.»
 *   4. «Bei ‹Weiter› soll es in dieses Stück hineinzoomen, bei ‹Fertig› ist
 *      Schluss.»
 *   5. «Es muss nicht in den Kopf; das Fenster soll einfach einmal kommen.»
 *   6. «Weniger farbig — die Fassung davor war besser. Die Zeichen nicht in
 *      Glaskästchen. Und zoom auf die OBERFLÄCHE: mach das Fenster der vier
 *      Apps auf, direkt in der Oberfläche, und stell den Hinweis dorthin.»
 *
 * ES IST EINE ANKÜNDIGUNG, KEIN ARCHIV UND KEIN WERKZEUG: sie zeigt genau die
 * NEUESTE Mitteilung, kommt beim ersten Besuch nach einem Update einmal von
 * selbst (`WhatsNewHost`) und ist danach fertig — im Kopf steht dafür kein
 * Zeichen. Die vollständige Liste aller Updates steht weiterhin in der
 * Mitteilungsleiste der Anmeldeseite, die aus derselben Quelle liest
 * (`updateNotes.ts`).
 *
 * SIE HAT ZWEI TEILE.
 *
 * ① DAS PROSPEKT. Ein Blatt am unteren Bildrand (`.ofi-pop.is-sheet`), das von
 *    unten herauffährt: Hauszeichen, Datum, Titel, die Markenwelle der
 *    Anmeldeseite — darunter die Programme mit IHREN ECHTEN ZEICHEN (der
 *    Outlook-Kachel, dem Aufgaben-Haken, dem Schirm der Anträge), die
 *    Neuerungen als Kacheln und der Rest als Liste hinter seinem Knopf.
 *
 * ② DER RUNDGANG DURCH DIE OBERFLÄCHE. «Weiter» blendet das Blatt aus und
 *    leuchtet die Stelle in der ECHTEN Anwendung aus, um die es geht: für die
 *    vier Programme wird das Apps-Feld im Kopf AUFGEKLAPPT und samt Knopf
 *    ausgeleuchtet, dann der Kalenderknopf, dann die Kopfleiste. Der Hinweis
 *    steht daneben — nicht in der Bildmitte, sondern dort, wo man hinsehen
 *    soll. Die letzte Station trägt «Fertig» und schliesst alles.
 *
 *    Der Kegel ist ein LOCH im abgedunkelten Schirm (index.css,
 *    `.ofi-upd-spot`): die Stelle bleibt in ihrer echten Farbe stehen. Wo eine
 *    Neuerung keine Stelle hat, auf die man zeigen kann (der Verkauf liegt auf
 *    einer anderen Seite), bleibt die Abdunklung und der Hinweis steht mittig.
 *
 * Die INHALTE sind deutsch und werden nicht übersetzt (siehe `updateNotes.ts`);
 * die Beschriftung läuft über i18n (`updates.*`).
 */

/* ── Die Zeichen ────────────────────────────────────────────────────────────
   `solid` heisst: das Zeichen bringt seine eigene Kachel mit (die Outlook-
   Kachel, der Aufgaben-Haken, das Apps-Karo) und darf keine untergelegt
   bekommen — sonst sässe eine Kachel auf einer Kachel. Die übrigen sind
   Strichzeichen und bekommen ihre getönte Fläche von der Klasse `is-<mark>`. */
const APP_MARKS: Record<AppMark, { solid?: boolean; render: (size: number) => ReactNode }> = {
    apps: { solid: true, render: (size) => <AppsGlyph size={size} /> },
    mail: { solid: true, render: (size) => <OutlookMark size={size} /> },
    tasks: { solid: true, render: (size) => <TaskMark size={size} /> },
    requests: { render: (size) => <Umbrella size={Math.round(size * 0.52)} /> },
    reminders: { render: (size) => <BellRinging size={Math.round(size * 0.52)} /> },
    calendar: { render: (size) => <CalendarIcon size={Math.round(size * 0.52)} /> },
    sales: { render: (size) => <TrendUp01 size={Math.round(size * 0.52)} /> },
};

const AppMarkTile = ({ mark, size = 44 }: { mark: AppMark; size?: number }) => {
    const spec = APP_MARKS[mark];
    return (
        <span
            className={`ofi-upd__mark is-${mark}${spec.solid ? ' is-solid' : ''}`}
            style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
            aria-hidden="true"
        >
            {spec.render(size)}
        </span>
    );
};

const ACCENT_ICONS: Record<UpdateAccent, ComponentType<LocalIconProps>> = {
    apps: LuLayers,
    calendar: LuCalendarDays,
    sales: LuTrendingUp,
    invoice: LuReceipt,
    mail: LuMail,
    tasks: LuListChecks,
    people: LuUsers,
    inventory: LuPackage,
    project: LuBriefcase,
    general: LuZap,
};

/** Luft um die ausgeleuchtete Stelle, damit der Kegel nicht am Knopf klebt. */
const SPOT_PAD = 8;
/**
 * Abstand zwischen Kegel und Hinweis. Bewusst gross (Vorgabe Samet: «das
 * Fenster soll weiter unten stehen» — es verdeckte sonst genau das
 * aufgeklappte Apps-Feld, das es erklärt).
 */
const HINT_GAP = 28;
/** Mindestabstand des Hinweises zum Bildrand. */
const EDGE = 12;

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Die gemeinsame Fläche aller Treffer eines Wählers. Der Apps-Wähler trifft
 * ZWEI Dinge — den Knopf im Kopf und das aufgeklappte Feld darunter — und der
 * Kegel soll beide zeigen, nicht eines von beiden.
 */
const unionRect = (selector: string): Rect | null => {
    const nodes = Array.from(document.querySelectorAll(selector));
    const boxes = nodes
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0);
    if (boxes.length === 0) return null;
    const top = Math.min(...boxes.map((box) => box.top));
    const left = Math.min(...boxes.map((box) => box.left));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    return { top, left, width: right - left, height: bottom - top };
};

export const WhatsNewPopup = () => {
    const { t } = useTranslation();
    const navigate = useGuardedNavigate();
    const location = useLocation();
    const open = useWhatsNewStore((state) => state.open);
    const close = useWhatsNewStore((state) => state.close);
    const setAppsMenuForced = useAppsMenuControl((state) => state.setForced);
    const pageAccess = useAuthStore((state) => state.pageAccess);

    /* NUR die neueste Mitteilung — «es ist nur die Ankündigung vom 29. August». */
    const note = UPDATE_NOTES[0];
    const steps = useMemo<TourStop[]>(() => note?.tour ?? [], [note]);
    const highlights = useMemo(() => note?.highlights ?? [], [note]);

    /** `null` = das Prospekt; eine Zahl = der Rundgang auf dieser Station. */
    const [step, setStep] = useState<number | null>(null);
    const [linesOpen, setLinesOpen] = useState(false);
    const [spot, setSpot] = useState<Rect | null>(null);
    /* Die gemessene Grösse des Hinweises — nur so lässt er sich zuverlässig
       UNTER dem Kegel halten (siehe die Rechnung weiter unten). */
    const hintRef = useRef<HTMLElement | null>(null);
    /* Stand die Anwendung schon auf dem geöffneten Angebot? Erst danach zählt
       ein Adresswechsel als «der Pfeil wurde gedrückt». */
    const enteredSample = useRef(false);
    /**
     * Wurde auf DIESER Station schon hingeführt? (12.09.2026)
     *
     * Der Effekt darunter hängt an `navigate` — und die Fassung aus
     * react-router baut sich BEI JEDEM ADRESSWECHSEL neu (`useNavigate` führt
     * den Pfad in seinen Abhängigkeiten). Ohne diesen Merker lief er also
     * genau dann noch einmal, wenn die Person den Zurück-Pfeil gedrückt hatte,
     * sah die Angebots-LISTE unter sich — «noch nicht im Angebot» — und
     * schickte sie augenblicklich wieder hinein. Der Rundgang endete damit nie
     * dort, wo er enden soll: in der Liste (Vorgabe Samet, 12.09.2026).
     */
    const sampleSent = useRef(false);
    /* Der laufende Stand für die späte Antwort von `newestQuotePath()`: ist
       der Rundgang inzwischen zu, darf sie niemanden mehr wegführen. */
    const stationRef = useRef<TourStop | null>(null);
    const [hintSize, setHintSize] = useState<{ height: number }>({ height: 0 });

    const current = step === null ? null : steps[step];
    stationRef.current = current;
    const lastIndex = steps.length - 1;
    const isLast = step !== null && step >= lastIndex;

    /* Beim Öffnen steht das Prospekt, nicht der Rundgang. */
    useEffect(() => {
        if (!open) return;
        setStep(null);
        setLinesOpen(false);
        enteredSample.current = false;
        sampleSent.current = false;
    }, [open]);

    useEffect(() => {
        if (location.pathname.startsWith(`${QUOTES_PATH}/`)) enteredSample.current = true;
    }, [location.pathname]);

    /* Die Übungsstation führt beim Betreten auf das Musterangebot — erst dort
       IST der Blitz der Zurück-Pfeil, auf den sie zeigt. Nur einmal je
       Station: `location.pathname` steht bewusst nicht in den Abhängigkeiten,
       sonst schöbe der eigene Wechsel die Wirkung gleich wieder an. */
    useEffect(() => {
        if (!open || !current?.opensSampleQuote) return;
        // EINMAL, und nur einmal: siehe `sampleSent` oben. Ohne diese Zeile
        // führte der Zurück-Pfeil zwar in die Liste, und der neu gebaute
        // `navigate` schickte die Person sofort wieder ins Angebot.
        if (sampleSent.current) return;
        // Wer den Verkauf gar nicht öffnen darf, wird nicht auf eine Seite
        // geführt, die der Seitenwächter gleich wieder zumacht — für ihn ist
        // die Ankündigung an dieser Stelle zu Ende.
        if (!isPathAllowed(pageAccess, QUOTES_PATH)) { close(); return; }
        if (window.location.pathname.startsWith(`${QUOTES_PATH}/`)) return;
        sampleSent.current = true;
        // Das zuletzt angelegte Angebot in der STANDARD-Maske (Vorgabe Samet:
        // «öffne ein Angebot aus unserer Standard-Angebotsseite»). Es wird nur
        // angesehen — angelegt wird hier nichts.
        void newestQuotePath().then((path) => {
            // Die Auskunft kommt vom Server und darf unterwegs überholt worden
            // sein: ist der Rundgang zu oder steht er auf einer anderen
            // Station, führt sie niemanden mehr weg.
            if (!useWhatsNewStore.getState().open || !stationRef.current?.opensSampleQuote) return;
            navigate(path);
        });
    }, [open, current, navigate, pageAccess, close]);

    /* … und sie endet, sobald der Pfeil gedrückt ist: dann steht eine andere
       Adresse in der Leiste. Das IST der Abschluss — es gibt auf dieser
       Station keinen «Weiter»-Knopf, der ihn sonst geben könnte. */
    useEffect(() => {
        if (!open || !current?.opensSampleQuote) return;
        if (location.pathname.startsWith(`${QUOTES_PATH}/`)) return;
        // Erst NACH dem Hinweg schliessen — beim Betreten steht noch die alte
        // Adresse, und ohne diese Schranke wäre die Station sofort vorbei.
        if (!enteredSample.current) return;
        close();
    }, [open, current, location.pathname, close]);

    /* Das Apps-Feld im Kopf aufhalten, solange seine Station läuft — und beim
       Verlassen unbedingt wieder loslassen, auch wenn das Blatt hart
       geschlossen wird. */
    useEffect(() => {
        setAppsMenuForced(Boolean(open && current?.opensAppsMenu));
        return () => setAppsMenuForced(false);
    }, [open, current, setAppsMenuForced]);

    /* Die Stelle messen — NACH dem Zeichnen, denn das Apps-Feld entsteht erst
       durch die Zeile darüber; vorher gäbe es nur den Knopf zu messen. Ein
       zweiter Anlauf im nächsten Bild fängt die Kachel-Animation des Feldes
       ab, sonst wäre der Kegel um die Höhe des noch leeren Feldes zu klein. */
    const measure = useCallback(() => {
        if (!current?.target) { setSpot(null); return; }
        setSpot(unionRect(current.target));
    }, [current]);

    /* Die Höhe des Hinweises messen, sobald er steht — sie hängt am Text und
       an der Zeichenreihe der Apps-Station und ist auf keinen festen Wert zu
       bringen. */
    useLayoutEffect(() => {
        if (!open || step === null) { setHintSize({ height: 0 }); return; }
        const read = () => {
            const height = hintRef.current?.offsetHeight ?? 0;
            setHintSize((prev) => (prev.height === height ? prev : { height }));
        };
        read();
        const frame = window.requestAnimationFrame(read);
        return () => window.cancelAnimationFrame(frame);
    }, [open, step, current]);

    useLayoutEffect(() => {
        if (!open || step === null) { setSpot(null); return; }
        measure();
        const again = window.requestAnimationFrame(measure);
        const settled = window.setTimeout(measure, 260);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.cancelAnimationFrame(again);
            window.clearTimeout(settled);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [open, step, measure]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            // Der Rundgang zuerst: Escape führt zurück aufs Prospekt, nicht hinaus.
            setStep((value) => {
                if (value === null) close();
                return null;
            });
        };
        // Capture: eine schwebende Karte dahinter soll die Taste nicht sehen.
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, close]);

    if (!open || !note) return null;

    const lines = note.lines ?? [];

    const advance = () => {
        // Eine Mitteilung ohne Rundgang (jede künftige, die keine Stelle im Kopf
        // betrifft) hat nur das Prospekt — dann ist «Weiter» das Ende.
        if (steps.length === 0) { close(); return; }
        if (step === null) { setStep(0); return; }
        if (isLast) { close(); return; }
        setStep(step + 1);
    };

    const go = (to: string) => {
        close();
        navigate(to);
    };

    /* Der Hauptknopf heisst durchgehend «Weiter» und erst auf der letzten
       Station «Fertig» (Vorgabe Samet, 29.08.2026: «wo ist der
       Weiter-Knopf?»). Er trug im Prospekt zuerst «Los geht's» — zwei Namen
       für denselben Knopf, und gesucht wurde der, den es nicht gab. */
    const primaryLabel = isLast || steps.length === 0 ? t('updates.finish') : t('updates.next');

    const primary = (
        <button type="button" className="ofi-upd__primary" onClick={advance}>
            {primaryLabel}
            {!isLast && <LuArrowRight size={15} aria-hidden="true" />}
        </button>
    );

    /* ── ② der Rundgang ─────────────────────────────────────────────────── */
    if (current) {
        /* WO DER HINWEIS STEHT.
           Er steht IMMER UNTER der ausgeleuchteten Stelle und nie darüber
           (Vorgabe Samet: «es verdeckt gerade das Gezeigte, vor allem bei den
           Apps»). Ein Hinweis, der die Stelle verdeckt, die er erklärt, ist
           schlimmer als gar keiner — und beide Stationen hängen ohnehin oben
           im Kopf, unter ihnen ist der ganze Schirm frei.

           Reicht der Platz darunter einmal nicht, wird er an den unteren
           Bildrand gestellt, statt nach oben zu klappen: dort liegt er
           garantiert unter dem Kopf. Die HÖHE wird gemessen und nicht
           geschätzt — geschätzt war sie beim Apps-Feld mit seiner Zeichenreihe
           um gut hundert Pixel zu klein. */
        const width = Math.min(420, window.innerWidth - EDGE * 2);
        const height = hintSize.height || 240;
        /* DER KNOPF MUSS AUF DEN SCHIRM (Vorgabe Samet, 29.08.2026: «der
           Weiter-Knopf passt nicht, er sitzt zu weit unten»). Hier stand
           `Math.min(below, Math.max(below, …))` — das ist IMMER `below`, die
           Begrenzung tat also nichts, und auf einem flachen Fenster stand der
           Fuss des Hinweises unter dem Bildrand.
           Jetzt wird zuerst der letzte Platz bestimmt, an dem der Hinweis noch
           ganz sichtbar ist, und dann das Kleinere von beidem genommen. Bleibt
           unter dem Kegel zu wenig übrig, begrenzt zusätzlich `maxHeight` die
           Karte und ihr Inhalt rollt — der Fuss mit dem Knopf bleibt dabei
           stehen. */
        const hintStyle: { top: number; left: number; maxHeight: number } = (() => {
            if (!spot) {
                /* Keine Stelle gefunden: der Hinweis stellt sich unten rechts
                   an den Rand statt mitten ins Bild — es gibt keine Abdunklung
                   mehr, hinter ihm arbeitet die Anwendung weiter. */
                const top = Math.max(EDGE, window.innerHeight - height - EDGE);
                return { top, left: Math.max(EDGE, window.innerWidth - width - EDGE), maxHeight: window.innerHeight - top - EDGE };
            }
            const below = spot.top + spot.height + SPOT_PAD + HINT_GAP;
            const lastFitting = window.innerHeight - height - EDGE;
            const top = Math.max(EDGE, Math.min(below, lastFitting));
            const wanted = spot.left + spot.width / 2 - width / 2;
            const left = Math.min(Math.max(EDGE, wanted), window.innerWidth - width - EDGE);
            return { top, left, maxHeight: window.innerHeight - top - EDGE };
        })();
        /* Der Pfeil zeigt von der Karte auf die Stelle — er sitzt über dem
           Hinweis, senkrecht unter der Mitte des Kegels. Ist der Hinweis am
           Bildrand gestoppt worden, wandert der Pfeil mit dem Kegel und nicht
           mit der Karte. */
        const arrowLeft = spot
            ? Math.min(Math.max(22, spot.left + spot.width / 2 - hintStyle.left), width - 22)
            : width / 2;
        const Icon = ACCENT_ICONS[current.accent] ?? LuZap;

        return createPortal(
            <>
                {spot && (
                    <div
                        className="ofi-upd-spot"
                        style={{
                            top: spot.top - SPOT_PAD,
                            left: spot.left - SPOT_PAD,
                            width: spot.width + SPOT_PAD * 2,
                            height: spot.height + SPOT_PAD * 2,
                        }}
                    />
                )}

                <section
                    ref={hintRef}
                    role="dialog"
                    /* KEIN `aria-modal`: hinter dem Hinweis bleibt die
                       Anwendung sichtbar UND bedienbar — auf der letzten
                       Station muss man ja gerade dort etwas drücken. */
                    aria-label={current.title}
                    className="ofi-upd-hint"
                    style={{ ...hintStyle, width }}
                >
                    {/* DER ZEIGENDE PFEIL. Auf der Übungsstation gibt es keinen
                        «Weiter»-Knopf — gedrückt wird in der Oberfläche, und
                        der Pfeil sagt wo. Er steht über der Karte, senkrecht
                        unter dem Kegel, und wippt darauf zu. */}
                    {current.opensSampleQuote && spot && (
                        <span className="ofi-upd-hint__point" style={{ left: arrowLeft }} aria-hidden="true">
                            <svg viewBox="0 0 24 40" width="24" height="40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 38V6" />
                                <path d="m4 14 8-8 8 8" />
                            </svg>
                        </span>
                    )}
                    <div className="ofi-upd-hint__head">
                        <span className={`ofi-upd__tile is-${current.accent}`} aria-hidden="true">
                            <Icon size={20} />
                        </span>
                        <div className="min-w-0">
                            <span className="ofi-upd-hint__kicker">{note.badge || t('updates.badgeNew')} · {note.date}</span>
                            <h2 className="ofi-upd-hint__title">{current.title}</h2>
                        </div>
                    </div>

                    <p className="ofi-upd-hint__copy">{current.text}</p>

                    {current.showApps && (note.apps?.length ?? 0) > 0 && (
                        <ul className="ofi-upd-hint__apps">
                            {(note.apps ?? []).map((app) => (
                                <li key={app.name} className="ofi-upd-hint__app">
                                    <AppMarkTile mark={app.mark} size={22} />
                                    {app.name}
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="ofi-upd-hint__foot">
                        <span className="ofi-upd-hint__step">
                            {t('updates.counter', { index: (step ?? 0) + 1, total: steps.length })}
                        </span>
                        <div className="ofi-upd-hint__acts">
                            {current.opensSampleQuote
                                /* Statt eines Knopfes die Aufforderung: der Pfeil
                                   oben zeigt auf die Stelle, hier steht, was sie
                                   tut. Ein «Weiter» daneben hiesse, man dürfe
                                   auch daran vorbei — dann übte niemand. */
                                ? <span className="ofi-upd-hint__doit">{t('updates.pressBack')}</span>
                                : primary}
                        </div>
                    </div>
                </section>
            </>,
            document.body,
        );
    }

    /* ── ① das Prospekt ─────────────────────────────────────────────────── */
    return createPortal(
        // `data-cal-stacked` — eine schwebende Karte darunter lässt Escape in
        // Ruhe, solange dieses Blatt offen ist (FloatingCard liest es).
        <section data-cal-stacked="1" className="ofi-upd-scrim">
            <div
                className="ofi-upd-scrim__hit"
                onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
            />
            {/* `.is-sheet` — das Blatt sitzt am unteren Bildrand: nur die zwei
                oberen Ecken sind rund, unten keine Haarlinie, Schatten nach
                oben (index.css, "FENSTER-OBERFLÄCHE"). */}
            <section role="dialog" aria-modal="true" aria-label={t('updates.title')} className="ofi-pop is-sheet ofi-upd">
                <span aria-hidden="true" className="ofi-upd__grip" />

                <header className="ofi-upd__hero">
                    <LoginWave className="ofi-upd__wave" />
                    {/* Drei stille Lichter — sie schweben, sonst nichts. */}
                    <span aria-hidden="true" className="ofi-upd__spark s1" />
                    <span aria-hidden="true" className="ofi-upd__spark s2" />
                    <span aria-hidden="true" className="ofi-upd__spark s3" />

                    <button type="button" className="ofi-upd__close" onClick={close} aria-label={t('common.close')}>
                        <LuX size={17} />
                    </button>

                    <div className="ofi-upd__herotext">
                        <div className="ofi-upd__brand">
                            {/* Die drei Speichen tragen die Töne des Startvorhangs. */}
                            <OffitecMark size={26} spokes={['#ffffff', '#c9d4ff', '#ff9ea3']} dot="#ffffff" />
                            <span>Offitec ERP</span>
                        </div>
                        <span className="ofi-upd__badge">
                            {note.badge || t('updates.badgeNew')}
                            <span className="ofi-upd__badgedate">{note.date}</span>
                        </span>
                        <h2 className="ofi-upd__title">{note.title}</h2>
                        {note.intro && <p className="ofi-upd__intro">{note.intro}</p>}
                    </div>
                </header>

                <div className="ofi-upd__body">
                    {(note.apps?.length ?? 0) > 0 && (
                        <section className="ofi-upd__apps">
                            {note.appsTitle && <h3 className="ofi-upd__sect">{note.appsTitle}</h3>}
                            <ul className="ofi-upd__applist">
                                {(note.apps ?? []).map((app, index) => (
                                    <li key={app.name} className="ofi-upd__app" style={{ ['--i' as string]: index }}>
                                        <button type="button" className="ofi-upd__appbtn" onClick={() => app.to && go(app.to)}>
                                            <AppMarkTile mark={app.mark} />
                                            <span className="ofi-upd__appname">{app.name}</span>
                                            <span className="ofi-upd__apphint">{app.hint}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {highlights.length > 0 && (
                        <section className="ofi-upd__news">
                            <h3 className="ofi-upd__sect">
                                {t('updates.sectionNew')}
                                <span className="ofi-upd__fresh">{note.date}</span>
                            </h3>
                            <ul className="ofi-upd__cards">
                                {highlights.map((highlight, index) => {
                                    const Icon = ACCENT_ICONS[highlight.accent] ?? LuZap;
                                    return (
                                        <li
                                            key={highlight.title}
                                            className={`ofi-upd__card is-${highlight.accent}`}
                                            style={{ ['--i' as string]: index }}
                                        >
                                            {/* EINE KACHEL IST INHALT, KEIN EINSTIEG: der Rundgang
                                                führt nur an die Stellen im Kopf, die sich verschoben
                                                haben (Vorgabe Samet). Hat die Neuerung einen Weg,
                                                steht er als Knopf darunter — sonst steht sie da und
                                                erzählt. */}
                                            <div className="ofi-upd__cardbtn is-static">
                                                <span className="ofi-upd__tile" aria-hidden="true">
                                                    <Icon size={20} />
                                                </span>
                                                <span className="ofi-upd__cardtext">
                                                    <span className="ofi-upd__cardtitle">{highlight.title}</span>
                                                    <span className="ofi-upd__cardcopy">{highlight.text}</span>
                                                    {highlight.to && (
                                                        <button
                                                            type="button"
                                                            className="ofi-upd__zoomhint"
                                                            onClick={() => go(highlight.to as string)}
                                                        >
                                                            {t('updates.open')}
                                                            <LuArrowRight size={13} aria-hidden="true" />
                                                        </button>
                                                    )}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {lines.length > 0 && (
                        <div className="ofi-upd__more">
                            <button
                                type="button"
                                className="ofi-upd__morebtn"
                                onClick={() => setLinesOpen((value) => !value)}
                                aria-expanded={linesOpen}
                            >
                                {linesOpen ? t('updates.hideAll') : t('updates.showAll', { count: lines.length })}
                                <LuChevronRight size={14} aria-hidden="true" className={linesOpen ? 'is-open' : ''} />
                            </button>
                            {linesOpen && (
                                <ul className="ofi-upd__lines">
                                    {lines.map((line) => (
                                        <li key={line}>{line}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {note.link && (
                        <a className="ofi-upd__weblink" href={note.link.href} target="_blank" rel="noreferrer">
                            {note.link.label}
                            <LuArrowRight size={14} aria-hidden="true" />
                        </a>
                    )}
                </div>

                <footer className="ofi-upd__foot">
                    <div className="ofi-upd__dots">
                        {steps.map((entry, index) => (
                            <button
                                key={entry.title}
                                type="button"
                                aria-label={entry.title}
                                className="ofi-upd__dot"
                                onClick={() => setStep(index)}
                            />
                        ))}
                    </div>
                    <div className="ofi-upd__footactions">
                        <button type="button" className="ofi-upd__ghost" onClick={close}>
                            {t('updates.skip')}
                        </button>
                        {primary}
                    </div>
                </footer>
            </section>
        </section>,
        document.body,
    );
};
