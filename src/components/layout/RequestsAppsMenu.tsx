import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';

import { AppsGlyph } from '@/components/icons/AppsGlyph';
import { BellRinging, Mail01, Umbrella } from '@/components/icons/antIconCompat';
import { TaskMark } from '@/components/icons/TaskMark';
import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { mailMessagesApi } from '@/lib/api/mail';
import { personnelApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import type { LeaveCounts } from '@/pages/personnel/types/personnel';
import { REQUEST_TYPES } from '@/pages/personnel/utils/personnel';
import '@/styles/personnel.css';

/**
 * ── DAS APPS-ZEICHEN IM KOPF ─────────────────────────────────────────────────
 *
 * Ursprung (26.08.2026): «Im Kopf soll statt des Suchen-Knopfs ein Apps-Zeichen
 * stehen — meist vier Kästchen. Und es soll eher wie bei Google aussehen:
 * grösserer Eckenradius, sauber und viel ansprechender.»
 *
 * ERWEITERT AM 10.09.2026 (Vorgabe Samet): «Verschieben wir die Aufgaben und
 * die E-Mails in den Apps-Bereich; nehmen wir sie aus dem Seitenmodul heraus.»
 * Aus dem Anträge-Feld wurde damit ein ECHTER PROGRAMM-STARTER: Postfach,
 * Aufgaben, Anfragen, Kalender — die vier Bereiche, die man den ganzen Tag
 * benutzt und die deshalb nicht im Menü zwischen Listen versauern sollen.
 *
 * UND DIE ANTRÄGE DARUNTER, NAMENTLICH: «Dieser Bereich enthält keine
 * allgemeinen Anträge, sondern die bestimmten — ein Klick auf ‹Urlaub› öffnet
 * die Urlaubs-Antragsseite direkt.» Also nicht EIN Eintrag «Anträge», sondern
 * Ferien / Homeoffice / Krankheit / Sonstiges, jeder mit seinem eigenen Weg.
 *
 * ══ 11.09.2026 (Vorgabe Samet) ═══════════════════════════════════════════
 *
 * «Beim Darüberfahren erscheinen darunter vier belebte, LEBENDE Bereiche:
 * E-Mail, Aufgaben, Anträge, Erinnerungen.»
 *
 * ZWEI Änderungen also. Erstens öffnete das Feld daraufhin BEIM DARÜBERFAHREN
 * — das ist inzwischen zurückgenommen, siehe «NUR NOCH AUF KLICK» darunter.
 *
 * Zweitens sind es GENAU DIESE VIER, und jede Kachel trägt ihre eigene, echte
 * Zahl: ungelesene Post, meine offenen Aufgaben, Anträge auf meiner Stufe,
 * fällige Erinnerungen. «Lebend» heisst genau das — die Zahl kommt vom Server
 * und wird nachgezogen, sie ist keine Verzierung. Anfragen und Kalender sind
 * dafür aus der Reihe gefallen: der Kalender hat seinen eigenen Knopf direkt
 * daneben, und die Anfragen stehen im Seitenmenü unter CRM.
 *
 * DER PUNKT IST DIE EIGENTLICHE FUNKTION. Er sagt, dass etwas AUF MICH wartet,
 * noch bevor die Seite offen ist. Am Zeichen selbst steht darum keine Zahl —
 * nur ein roter Punkt; die Zahlen stehen an den Kacheln. Was ihn färbt und was
 * bewusst nicht, steht unten bei `waiting`.
 *
 * ES LÄDT NUR, WAS ES BRAUCHT: die Zähler beim Aufsetzen (sie färben die
 * Punkte), sonst nichts. Ein Kopf, der beim Anmelden Listen zieht, kostet
 * jeden Seitenaufruf.
 */

/**
 * ── NUR NOCH AUF KLICK (Vorgabe Samet) ──────────────────────────────────────
 *
 * «Bei den Apps sollen die Unter-Apps beim Klicken aufgehen, nicht beim
 * Darüberfahren.»
 *
 * Damit ist das Hover-Öffnen vom 11.09.2026 erledigt: keine zwei Uhren mehr,
 * kein Aufklappen im Vorbeistreifen auf dem Weg zur Glocke daneben, und keine
 * Gnadenfrist für die Lücke zwischen Knopf und Feld — wer nicht hinein will,
 * bekommt es gar nicht erst zu sehen. Ein Klick auf das Zeichen öffnet das
 * Feld, der nächste schliesst es; daneben klicken und Escape schliessen wie
 * bei jedem anderen Menü im Kopf. Das ist zugleich das einzige Verhalten, das
 * auf dem Tablet überhaupt erreichbar ist — dort gab es «darüberfahren» nie.
 */

/**
 * ── DAS FELD VON AUSSEN AUFHALTEN (29.08.2026) ──────────────────────────────
 *
 * Die Ankündigung nach einem Update führt durch die Oberfläche und muss dabei
 * DIESES Feld offen halten, während sie darauf zeigt (Vorgabe Samet: «zoom auf
 * die Oberfläche — mach das Fenster der vier Apps auf, direkt in der
 * Oberfläche»). Sie schaltet hier `forced` ein; das Feld ist dann offen und
 * bleibt es, bis die Station vorbei ist — Zeiger und Klick können daran nichts
 * ändern, sonst klappte es genau in dem Moment weg, in dem man es ansieht.
 *
 * Ein winziger Speicher statt eines Ereignisses: der Zustand muss LESBAR sein
 * (das Feld muss wissen, dass es offen zu bleiben hat), nicht nur ein Anstoss.
 */
export const useAppsMenuControl = create<{ forced: boolean; setForced: (value: boolean) => void }>((set) => ({
    forced: false,
    setForced: (value) => set({ forced: value }),
}));

/** Wie oft die Zähler von selbst nachschauen (ms). */
const POLL_MS = 90_000;

const EMPTY_LEAVES: LeaveCounts = { approver: 0, accounting: 0, mine: 0, incoming: 0 };

/* Das Apps-Zeichen liegt seit dem 29.08.2026 in `icons/AppsGlyph.tsx`:
   das Neuigkeiten-Blatt zeigt dieselben App-Zeichen wie ein Prospekt,
   und zwei Fassungen desselben Zeichens waeren zwei Wahrheiten. Warum es
   so aussieht, wie es aussieht, steht dort. */


type Tile = {
    key: string;
    label: string;
    hint: string;
    icon: ReactNode;
    to: string;
    count: number;
};

export const RequestsAppsMenu = () => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [leaves, setLeaves] = useState<LeaveCounts>(EMPTY_LEAVES);
    const [unreadMail, setUnreadMail] = useState(0);
    const [openTasks, setOpenTasks] = useState(0);
    const [dueReminders, setDueReminders] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    /* Die Ankündigung kann das Feld aufhalten, während sie darauf zeigt. */
    const forced = useAppsMenuControl((state) => state.forced);
    const isOpen = open || forced;

    const permissions = useAuthStore((state) => state.permissions);
    const canCrm = permissions.includes('crm.customers.view');

    /* Alle Zähler in EINEM Anlauf, jeder für sich abgefangen: wer ein Modul
       nicht führt, bekommt dort eine Abweisung — und die darf den Kopf nicht
       stören und schon gar nicht die anderen Zähler mitreissen.

       DIE AUFGABEN WERDEN GEZÄHLT, NICHT GEHOLT: `pageSize: 1` liefert eine
       einzige Zeile, und die Antwort trägt die Gesamtzahl. Die ganze Liste für
       eine Zahl im Kopf zu ziehen, wäre bei jedem Takt ein Kilobyte je offener
       Aufgabe. Der Zeitraum bleibt offen — «offen» kennt keinen Stichtag. */
    const loadCounts = useCallback(() => {
        personnelApi.leaveCounts().then(setLeaves).catch(() => setLeaves(EMPTY_LEAVES));
        if (!canCrm) return;
        mailMessagesApi.stats().then((stats) => setUnreadMail(stats.unreadInbox)).catch(() => setUnreadMail(0));
        crmApi.listTasks({ kind: 'TASK', scope: 'me', status: 'OPEN', page: 1, pageSize: 1 })
            .then((page) => setOpenTasks(page.total))
            .catch(() => setOpenTasks(0));
        crmApi.listDueReminders().then((rows) => setDueReminders(rows.length)).catch(() => setDueReminders(0));
    }, [canCrm]);

    useEffect(() => {
        loadCounts();
        const timer = window.setInterval(loadCounts, POLL_MS);
        return () => window.clearInterval(timer);
    }, [loadCounts]);

    // Beim Öffnen einmal nachziehen — die Zahlen sollen stimmen, wenn man
    // hinsieht, nicht erst beim nächsten Takt.
    useEffect(() => { if (isOpen) loadCounts(); }, [isOpen, loadCounts]);

    // Klick daneben und Escape schliessen — wie jedes Menü im Kopf.
    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => {
            if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const go = (path: string) => {
        setOpen(false);
        navigate(path);
    };

    /* DIE VIER PROGRAMME (Vorgabe 11.09.2026): Postfach, Aufgaben, Anträge,
       Erinnerungen. Post, Aufgaben und Erinnerungen hängen am CRM-Recht — sie
       stehen seit dem 10.09.2026 nicht mehr im Seitenmenü, also ist das hier
       ihr einziger Weg und er muss dieselbe Bedingung tragen wie das Menü es
       tat. Die Anträge darf jede angestellte Person öffnen; es sind ihre
       eigenen.

       Jede Zahl ist eine ECHTE Zahl vom Server (siehe `loadCounts`) — das ist
       gemeint mit «lebend». Steht keine da, ist auch nichts da. */
    const tiles = useMemo<Tile[]>(() => ([
        ...(canCrm ? [
            {
                key: 'mail',
                label: t('nav.crmMail'),
                hint: t('apps.mailHint'),
                icon: <Mail01 size={17} />,
                to: '/crm/mail',
                count: unreadMail,
            },
            {
                key: 'tasks',
                label: t('nav.crmTasks'),
                hint: t('apps.tasksHint'),
                icon: <TaskMark size={17} />,
                to: '/crm/tasks',
                count: openTasks,
            },
        ] : []),
        {
            key: 'requests',
            label: t('personnel.apps.title'),
            hint: t('apps.requestsHint'),
            icon: <Umbrella size={17} />,
            to: '/personnel/requests?tab=mine',
            count: leaves.incoming,
        },
        ...(canCrm ? [
            {
                key: 'reminders',
                label: t('nav.crmReminders'),
                hint: t('apps.remindersHint'),
                icon: <BellRinging size={17} />,
                to: '/crm/reminders',
                count: dueReminders,
            },
        ] : []),
    ]), [canCrm, unreadMail, openTasks, dueReminders, leaves.incoming]);

    /* DIE ANTRÄGE — namentlich, nicht als Sammelbegriff. Jede Zeile führt auf
       die Antragsseite MIT gewählter Art, damit ein Klick auf «Ferien» genau
       dort landet und nicht in einer Liste, in der man erst filtern muss. */
    const requestRows = useMemo(() => REQUEST_TYPES.map((type) => ({
        type,
        label: t(`personnel.requestType.${type}`),
        to: `/personnel/requests?tab=mine&type=${type}`,
    })), []);

    /* DER PUNKT AM ZEICHEN — und warum die Post NICHT hineinzählt.
       Er soll heissen «hier wartet etwas auf Sie». Ein Firmenpostfach hat
       vierstellig viele ungelesene Nachrichten; nähme man sie mit, leuchtete
       der Punkt ab dem ersten Tag für immer und sagte damit gar nichts mehr.
       Gezählt wird darum nur, was eine ENTSCHEIDUNG bzw. einen GRIFF von mir
       verlangt: Anträge auf meiner Stufe und fällige Erinnerungen. Die
       ungelesene Post steht weiterhin als Zahl AN IHRER KACHEL — dort ist sie
       eine Auskunft und keine Alarmglocke; die offenen Aufgaben ebenso, denn
       offen ist eine Aufgabe fast immer. */
    const waiting = leaves.incoming + dueReminders;

    return (
        /* Der Umschlag trägt das Merkzeichen für «daneben geklickt»: Knopf UND
           Feld liegen darin, sonst schlösse der Griff nach einer Kachel das
           Feld, bevor der Klick ankommt. */
        <div className="relative mr-1" ref={wrapRef}>
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                /* Die Ankündigung sucht sich diesen Knopf über die Marke —
                   siehe components/updates/WhatsNewPopup.tsx. */
                data-tour="apps"
                aria-label={t('apps.title')}
                title={t('apps.title')}
                className="ofi-hdr-ctl ofi-apps-btn relative flex items-center justify-center rounded-full"
            >
                <AppsGlyph />
                {waiting > 0 && (
                    <span
                        aria-hidden
                        className="ofi-nosize absolute right-1.5 top-1.5 size-2.5 rounded-full bg-[#d93025] ring-2 ring-white dark:ring-[#08090a]"
                    />
                )}
                {waiting > 0 && <span className="sr-only">{t('apps.waitingCount', { count: waiting })}</span>}
            </button>

            {isOpen && (
                <div role="menu" className="ofi-apps" data-tour="apps-panel">
                    <header className="ofi-apps__head">
                        <span className="ofi-apps__title">{t('apps.title')}</span>
                    </header>

                    <div className="ofi-apps__tiles">
                        {/* `--i` staffelt den Auftritt: die Kacheln steigen
                            nacheinander auf, statt als Block zu erscheinen —
                            das ist das «Belebte» daran (index.css). */}
                        {tiles.map((tile, index) => (
                            <button
                                key={tile.key}
                                type="button"
                                role="menuitem"
                                className="ofi-apps__tile"
                                style={{ '--i': index } as React.CSSProperties}
                                onClick={() => go(tile.to)}
                            >
                                <span className="ofi-apps__tileicon" aria-hidden>{tile.icon}</span>
                                <span className="ofi-apps__tilelabel">{tile.label}</span>
                                <span className="ofi-apps__tilehint">{tile.hint}</span>
                                {/* Über 99 wird die Zahl zur Aussage «viele» —
                                    eine vierstellige Blase ist breiter als die
                                    Kachel und niemand liest sie ohnehin. */}
                                {tile.count > 0 && (
                                    <span className="ofi-apps__tilecount is-live">{tile.count > 99 ? '99+' : tile.count}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ── Anträge: die BESTIMMTEN, nicht der Sammelbegriff ── */}
                    <div className="ofi-apps__list">
                        <span className="ofi-apps__listhead">{t('personnel.apps.title')}</span>
                        <div className="ofi-apps__reqs">
                            {requestRows.map((row) => (
                                <button
                                    key={row.type}
                                    type="button"
                                    role="menuitem"
                                    className="ofi-apps__req"
                                    onClick={() => go(row.to)}
                                >
                                    <Umbrella size={14} aria-hidden />
                                    {row.label}
                                </button>
                            ))}
                        </div>
                        {/* Was auf MICH wartet, steht als eine Zeile darunter —
                            die Liste selbst gehört auf die Antragsseite. */}
                        {leaves.incoming > 0 && (
                            <button
                                type="button"
                                role="menuitem"
                                className="ofi-apps__row"
                                onClick={() => go('/personnel/requests?tab=incoming')}
                            >
                                <span className="ofi-apps__rowname">{t('personnel.requests.tab.incoming')}</span>
                                <span className="ofi-apps__rowmeta">
                                    {t('personnel.apps.pending', { count: leaves.incoming })}
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
