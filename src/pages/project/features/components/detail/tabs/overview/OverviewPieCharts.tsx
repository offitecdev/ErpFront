import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n/translate';
import { useThemeStore } from '@/store/themeStore';

import { money } from '../../../../utils/projectFormatters';
import { CardLink } from './CardLink';
import { OverviewCard } from './OverviewCard';

/* Two slots in fixed order — billed, then open — so the same colour always means
   the same thing, no matter which scope button is pressed. Validated with the
   dataviz script against each surface (light #ffffff, dark #151616): lightness
   band, chroma floor, CVD separation and normal-vision floor all pass. The light
   amber sits below 3:1 contrast, which the always-present legend and the
   percentage written on every slice relieve. */
const BILLING_LIGHT = ['#2a78d6', '#eda100'];
const BILLING_DARK = ['#3987e5', '#c98500'];

/* ── Die Auswertungs-Scheibe ────────────────────────────────────────────────
   RING MIT NABE STATT FLACHER TORTE (28.08.2026, Vorlage `graphic01.jpg`): eine
   erhabene Platte, darauf ein breiter farbiger Ring, in der Mitte eine Nabe mit
   der Quote, und auf dem Aussenrand je Stück eine Prozent-Plakette, die halb
   über den Rand ragt. Scheibe LINKS, Auskunft RECHTS.

   EINE Scheibe für ALLES (28.08.2026, Benutzerwunsch): Auftrag und Zusatz-
   aufträge stehen zusammengezählt im Ring. Darüber liegen drei Schalter —
   Gesamt, Hauptauftrag, Zusatzaufträge; ein Klick stellt den Ring auf diesen
   Ausschnitt um, blosses Überfahren zeigt ihn zur Ansicht. Zwei getrennte
   Torten nebeneinander beantworteten dieselbe Frage zweimal.

   NICHTS RÜCKT BEIM ÜBERFAHREN AUS DEM KREIS (28.08.2026, Benutzerwunsch: „der
   Kreis soll nicht nach unten wandern"). Das angefasste Stück antwortet
   ausschliesslich mit der FARBE — es wird satter, die übrigen fallen ins Graue.
   Ein Stück herauszuschieben liess die ganze Scheibe kippen.

   Gezeichnet wird gemischt, und zwar mit Absicht: die Ringstücke in SVG (nur
   dort lässt sich der Anteil animieren), Platte, Nabe und Plaketten in HTML
   (nur dort sind weiche Schatten und Text billig und gestochen scharf). Die
   Masse stehen hier, die Optik in `.ofi-prj-dial*` in index.css.

   Jedes Stück ist EIN gestrichelter Kreis mit r = R_MID und Strichbreite BAND —
   der Strich IST also das Ringstück. Der Umweg über den Strich lohnt sich, weil
   `stroke-dasharray` eine animierbare Zahl ist: sowohl das Aufziehen als auch
   das Umstellen auf einen anderen Ausschnitt ist damit ein reiner CSS-Übergang
   und kein Pfad-Morphing. */
/** Kantenlänge des Zeichenfeldes in SVG-Einheiten (die Anzeigegrösse macht CSS). */
const BOX = 200;
const C = BOX / 2;
/** Aussenkante des farbigen Rings. */
const R_OUT = 84;
/** Innenkante des farbigen Rings. */
const R_IN = 54;
/** Mittellinie des Rings — auf ihr liegt der Strich, der die Fläche macht. */
const R_MID = (R_OUT + R_IN) / 2;
/** Strichbreite = Ringbreite. */
const BAND = R_OUT - R_IN;
const CIRCUMFERENCE = 2 * Math.PI * R_MID;
/** Winkelspalt zwischen zwei Stücken — auf der Mittellinie rund 4px blank. */
const SLICE_GAP = 4;
/**
 * Dauer EINER vollen Umdrehung beim Aufziehen; jedes Stück bekommt seinen
 * Anteil davon. Kurz gehalten (Benutzerwunsch: „die Prozentzahl soll schneller
 * da sein") — die Plakette eines Stücks erscheint, sobald es steht.
 */
const SWEEP_MS = 520;
/** Umstellen auf einen anderen Ausschnitt — eine Bewegung, keine Vorstellung. */
const REDRAW_MS = 280;
/** Dauer des Hochzählens in der Nabe. */
const COUNT_MS = 620;
/**
 * Sitz der Prozent-Plakette, in Prozent der Scheibenbreite ab Mitte gerechnet —
 * genau auf der Aussenkante, damit sie wie in der Vorlage halb darüber steht.
 */
const BADGE_ORBIT = (R_OUT / BOX) * 100;

type Figures = { billed: number; unbilled: number };
type ScopeKey = 'all' | 'order' | 'addons';

/** Anteil des verrechneten Geldes in Prozent — `null`, wenn es nichts zu teilen gibt. */
const billedRate = (figures: Figures) => {
    const total = figures.billed + figures.unbilled;
    return total > 0 ? Math.round((figures.billed / total) * 100) : null;
};

const prefersStill = () => typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Erste Sichtbarkeit, genau EINMAL. Der Ring soll sich aufziehen, wenn man ihn
 * wirklich zu sehen bekommt — nicht während er noch unter dem Falz liegt und
 * die Vorstellung niemand sieht.
 */
const useFirstReveal = <T extends Element>() => {
    const ref = useRef<T | null>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const node = ref.current;
        // Der Anfangszustand (LEERER Ring) muss GEMALT sein, sonst gibt es nichts
        // zu überblenden — deshalb immer erst im übernächsten Bild umschalten.
        const paint = () => requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
        if (!node || typeof IntersectionObserver === 'undefined') {
            paint();
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                observer.disconnect();
                paint();
            }
        }, { threshold: 0.3 });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return [ref, shown] as const;
};

/**
 * Zählt auf einen Wert hoch — die Nabe soll beim Aufziehen MITLAUFEN, nicht
 * fertig dastehen, und beim Umstellen auf einen anderen Ausschnitt sichtbar
 * hinüberwandern. Läuft nur, solange es etwas zu zählen gibt: die Schleife
 * hält sich selbst an, sobald der Wert steht.
 */
const useCountUp = (target: number, run: boolean, ms: number) => {
    const [value, setValue] = useState(0);
    const current = useRef(0);

    useEffect(() => {
        if (!run) return;
        if (prefersStill()) {
            current.current = target;
            setValue(target);
            return;
        }
        const from = current.current;
        if (from === target) return;
        const started = performance.now();
        let frame = requestAnimationFrame(function step(now: number) {
            const progress = Math.min(1, (now - started) / ms);
            // Ease-out cubic: schnell da, weich stehend.
            const eased = 1 - (1 - progress) ** 3;
            const next = from + (target - from) * eased;
            current.current = next;
            setValue(next);
            if (progress < 1) frame = requestAnimationFrame(step);
        });
        return () => cancelAnimationFrame(frame);
    }, [target, run, ms]);

    return value;
};

/**
 * Die Auswertung: Ring links, Schalter und Legende rechts.
 *
 * Die Identität hängt nie an der Farbe allein — die Legende steht immer da,
 * jedes Stück trägt seinen Betrag und seine Prozentzahl, und die Prozentzahl
 * selbst ist in Textfarbe gesetzt (nicht in der Farbe ihres Stücks, die auf dem
 * hellen Bernstein als Schrift zu schwach wäre). Damit übersteht die Karte
 * Graustufendruck und Farbfehlsichtigkeit.
 *
 * RING, PLAKETTE, SCHALTER UND LEGENDE SIND EIN GERÄT: eine Legendenzeile hebt
 * IHR Stück heraus (das Stück wechselt dabei sichtbar den Ton, die übrigen
 * fallen ins Graue), ein Schalter stellt den ganzen Ring auf seinen Ausschnitt
 * um. Ein Klick auf Ring, Plakette oder Legende führt in die Verrechnung.
 *
 * LEER HEISST GRAU (28.08.2026, Benutzerwunsch): die graue Bahn liegt IMMER
 * unter den Stücken — deshalb steht die Scheibe vor dem Aufziehen leer da und
 * füllt sich erst. Bleibt sie leer, weil es nichts zu zeigen gibt, kommt die
 * Schraffur dazu: eine glatte graue Fläche liesse sich als „alles in einem
 * Stück" lesen, die Schraffur kann das nicht.
 */
const BillingDial = memo(({ order, addons, onOpen }: {
    order: Figures;
    addons: Figures;
    onOpen?: () => void;
}) => {
    /** Welche Legendenzeile gerade gefragt ist — hebt EIN Stück heraus. */
    const [hotSlice, setHotSlice] = useState<string | null>(null);
    /** Fest gewählter Ausschnitt (Klick). */
    const [scope, setScope] = useState<ScopeKey>('all');
    /** Nur überfahren — zeigt den Ausschnitt, ohne ihn zu wählen. */
    const [preview, setPreview] = useState<ScopeKey | null>(null);
    const [rootRef, shown] = useFirstReveal<HTMLDivElement>();
    /**
     * Ist der Zeigerlauf durch? Danach ist jede Änderung ein Umstellen und
     * bekommt eine kurze, gleiche Dauer ohne Staffelung — mit den Aufzieh-
     * verzögerungen käme der Ring beim Schalten ins Stocken.
     */
    const [settled, setSettled] = useState(false);
    // `useId` liefert Zeichen, die in `url(#…)` nichts zu suchen haben — weg damit.
    const hatchId = `ofi-dial-void-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
    const isDark = useThemeStore((state) => state.isDarkMode);
    const colors = isDark ? BILLING_DARK : BILLING_LIGHT;

    useEffect(() => {
        if (!shown) return;
        const timer = setTimeout(() => setSettled(true), SWEEP_MS + 80);
        return () => clearTimeout(timer);
    }, [shown]);

    const options = useMemo(() => [
        {
            key: 'all' as ScopeKey,
            label: t('projects.detail.overview.totalScope'),
            figures: { billed: order.billed + addons.billed, unbilled: order.unbilled + addons.unbilled },
        },
        { key: 'order' as ScopeKey, label: t('projects.mainOrder'), figures: order },
        { key: 'addons' as ScopeKey, label: t('projects.detail.overview.addonsTitle'), figures: addons },
    ], [order, addons]);

    // Was der Ring gerade zeigt: der gewählte Ausschnitt — oder, solange ein
    // Schalter überfahren wird, dessen.
    const activeKey = preview ?? scope;
    const active = options.find((option) => option.key === activeKey) ?? options[0];
    const figures = active.figures;
    const total = figures.billed + figures.unbilled;
    const isEmpty = total === 0;
    const rate = billedRate(figures);
    const counted = useCountUp(rate ?? 0, shown, settled ? REDRAW_MS : COUNT_MS);

    const slices = [
        { key: 'billed', label: t('billing.billed'), value: figures.billed },
        { key: 'unbilled', label: t('projects.detail.overview.unbilled'), value: figures.unbilled },
    ];
    const data = slices.filter((slice) => slice.value > 0);

    // Jedes Stueck braucht, wo es anfaengt: die Summe aller Stuecke davor. Ohne
    // mitlaufenden Zaehler, den der React-Compiler zu Recht nicht mag.
    const lengths = data.map((slice) => (slice.value / total) * CIRCUMFERENCE);
    const arcs = data.map((slice, index) => {
        const length = lengths[index];
        const start = lengths.slice(0, index).reduce((sum, run) => sum + run, 0);
        return {
            key: slice.key,
            color: colors[slices.findIndex((candidate) => candidate.key === slice.key)],
            pct: Math.round((slice.value / total) * 100),
            length,
            start,
            /** Mittelwinkel, gemessen ab zwölf Uhr — trägt die Plakette. */
            mid: ((start + length / 2) / CIRCUMFERENCE) * Math.PI * 2,
        };
    });

    return (
        <div
            ref={rootRef}
            className={`ofi-prj-dial${shown ? ' is-shown' : ''}${hotSlice ? ' is-picking' : ''}${isEmpty ? ' is-empty' : ''}`}
            onMouseLeave={() => setHotSlice(null)}
        >
            <div className="ofi-prj-dial__ring">
                {/* Die erhabene Platte, auf der alles liegt — reine Optik. */}
                <span className="ofi-prj-dial__plate" aria-hidden="true" />

                <svg className="ofi-prj-dial__art" viewBox={`0 0 ${BOX} ${BOX}`} role="presentation" aria-hidden="true">
                    <defs>
                        {/* Schraffur für den leeren Ring. Im Muster-Koordinatensystem
                            gedreht, damit die Striche diagonal laufen. */}
                        <pattern id={hatchId} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                            <line className="ofi-prj-dial__hatch" x1="0" y1="0" x2="0" y2="9" strokeWidth="3" />
                        </pattern>
                    </defs>
                    {/* -90° so the first slice starts at twelve o'clock. */}
                    <g transform={`rotate(-90 ${C} ${C})`}>
                        {/* Die leere Bahn — immer da, vor dem Aufziehen ganz allein. */}
                        <circle className="ofi-prj-dial__void" cx={C} cy={C} r={R_MID} fill="none" strokeWidth={BAND} />
                        {isEmpty && (
                            <circle cx={C} cy={C} r={R_MID} fill="none" stroke={`url(#${hatchId})`} strokeWidth={BAND} />
                        )}
                        {arcs.map((arc) => {
                            // A lone slice gets no gap — it would notch a full ring.
                            const drawn = arcs.length > 1 ? Math.max(0.6, arc.length - SLICE_GAP) : arc.length;
                            const share = arc.length / CIRCUMFERENCE;
                            const sweep = Math.max(200, Math.round(share * SWEEP_MS));
                            return (
                                <circle
                                    key={arc.key}
                                    className={`ofi-prj-dial__slice${hotSlice === arc.key ? ' is-hot' : ''}`}
                                    cx={C}
                                    cy={C}
                                    r={R_MID}
                                    fill="none"
                                    stroke={arc.color}
                                    strokeWidth={BAND}
                                    strokeDasharray={shown ? `${drawn} ${CIRCUMFERENCE - drawn}` : `0 ${CIRCUMFERENCE}`}
                                    strokeDashoffset={-arc.start}
                                    style={{
                                        // Beim Aufziehen läuft jedes Stück genau so
                                        // lange, wie es gross ist, und startet, wenn
                                        // das vorige fertig ist — zusammen EIN
                                        // durchgehender Zeigerlauf im Uhrzeigersinn.
                                        // Danach ist jede Änderung ein Umstellen:
                                        // gleiche Dauer für alle, keine Staffelung.
                                        transitionDuration: settled
                                            ? `${REDRAW_MS}ms, 170ms, 170ms`
                                            : `${sweep}ms, 170ms, 170ms`,
                                        transitionDelay: settled
                                            ? '0ms, 0ms, 0ms'
                                            : `${Math.round((arc.start / CIRCUMFERENCE) * SWEEP_MS)}ms, 0ms, 0ms`,
                                    }}
                                    onMouseEnter={() => setHotSlice(arc.key)}
                                    onClick={onOpen}
                                />
                            );
                        })}
                    </g>
                </svg>

                {/* Die Nabe: die Quote gross, darunter wovon — wie in der Vorlage
                    das „infographic template / 4 steps" in der Mitte. Sie ist die
                    Antwort auf die Frage, für die es die Karte gibt, und sie zählt
                    beim Aufziehen mit. */}
                <div className="ofi-prj-dial__hub">
                    <span className="ofi-prj-dial__quota">{rate === null ? '–' : `${Math.round(counted)}%`}</span>
                    <span className="ofi-prj-dial__quotaKey">{t('billing.billed')}</span>
                    <span className="ofi-prj-dial__scope">{active.label}</span>
                </div>

                {/* Prozent-Plaketten auf dem Aussenrand — die „01/02/03" der Vorlage,
                    hier mit der Zahl, die man wirklich braucht. Sie sind zugleich
                    die Bedienelemente des Rings. */}
                {arcs.map((arc) => (
                    <button
                        key={arc.key}
                        type="button"
                        className={`ofi-prj-dial__badge${hotSlice === arc.key ? ' is-hot' : ''}`}
                        style={{
                            left: `${(50 + BADGE_ORBIT * Math.sin(arc.mid)).toFixed(3)}%`,
                            top: `${(50 - BADGE_ORBIT * Math.cos(arc.mid)).toFixed(3)}%`,
                            borderColor: arc.color,
                            transitionDelay: settled
                                ? '0ms'
                                : `${Math.round(((arc.start + arc.length) / CIRCUMFERENCE) * SWEEP_MS)}ms`,
                        }}
                        onMouseEnter={() => setHotSlice(arc.key)}
                        onFocus={() => setHotSlice(arc.key)}
                        onBlur={() => setHotSlice(null)}
                        onClick={onOpen}
                    >
                        {`${arc.pct}%`}
                    </button>
                ))}
            </div>

            <div className="ofi-prj-dial__side">
                {/* Die Schalter: Gesamt, Hauptauftrag, Zusatzaufträge. Klick wählt,
                    Überfahren zeigt — beides stellt Ring, Farben und Nabe um. */}
                <div className="ofi-prj-dial__scopes" role="group" aria-label={t('projects.detail.overview.chartsTitle')}>
                    {options.map((option) => {
                        const optionRate = billedRate(option.figures);
                        const optionSum = option.figures.billed + option.figures.unbilled;
                        return (
                            <button
                                key={option.key}
                                type="button"
                                aria-pressed={scope === option.key}
                                className={`ofi-prj-dial__scopeBtn${activeKey === option.key ? ' is-on' : ''}${optionSum === 0 ? ' is-void' : ''}`}
                                onClick={() => setScope(option.key)}
                                onMouseEnter={() => setPreview(option.key)}
                                onMouseLeave={() => setPreview(null)}
                                onFocus={() => setPreview(option.key)}
                                onBlur={() => setPreview(null)}
                            >
                                <span className="ofi-prj-dial__scopeName">{option.label}</span>
                                {/* Die Quote kommt beim Anfahren bzw. am gewählten
                                    Schalter — vier gleichzeitige Prozentzahlen auf
                                    der Karte bedeuteten keine mehr etwas. */}
                                <span className="ofi-prj-dial__rate">{optionRate === null ? '–' : `${optionRate}%`}</span>
                                <span className="ofi-prj-dial__scopeSum">{money(optionSum)}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Wofür die Farben im Ring stehen — immer für den Ausschnitt, der
                    gerade gezeigt wird. */}
                <ul className="ofi-prj-dial__legend">
                    {slices.map((slice, index) => (
                        <li key={slice.key}>
                            <button
                                type="button"
                                className={`ofi-prj-dial__item${hotSlice === slice.key ? ' is-hot' : ''}${slice.value === 0 ? ' is-void' : ''}`}
                                onMouseEnter={() => setHotSlice(slice.key)}
                                onFocus={() => setHotSlice(slice.key)}
                                onBlur={() => setHotSlice(null)}
                                onClick={onOpen}
                            >
                                <span className="ofi-prj-dial__swatch" style={{ background: colors[index] }} />
                                <span className="ofi-prj-dial__label">{slice.label}</span>
                                <span className="ofi-prj-dial__value">{money(slice.value)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
});

/**
 * Die Auswertungskarte der Projekt-Übersicht. Name und Schnittstelle bleiben,
 * damit die Auftragsansicht (`MyOrderDetail`) sie unverändert einbinden kann.
 */
export const OverviewPieCharts = memo(({ order, addons, bare = false, onOpenBilling }: {
    order: Figures;
    addons: Figures;
    /** Ohne Kartenrahmen — für Popups, deren Kopfzeile den Titel schon trägt. */
    bare?: boolean;
    /** Fehlt er (Popup, Auftragsansicht), bleibt die Scheibe reine Anzeige. */
    onOpenBilling?: () => void;
}) => {
    const content = (
        <div className="ofi-prj-dials">
            <BillingDial order={order} addons={addons} onOpen={onOpenBilling} />
        </div>
    );

    if (bare) return content;

    const title = t('projects.detail.overview.chartsTitle');
    return (
        <OverviewCard
            title={title}
            action={onOpenBilling ? <CardLink label={title} onOpen={onOpenBilling} /> : undefined}
        >
            {content}
        </OverviewCard>
    );
});
