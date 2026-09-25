import type { CSSProperties, ReactNode } from 'react';
import { t } from '@/i18n/translate';

/**
 * App-weite Ladeanimation — EIN Ort für alle Ladezustände.
 *
 * Drei Bausteine, mehr braucht es nicht:
 *  - `Spinner`     — der Ring für "diese Aktion läuft" (Knöpfe, Kopfzeilen).
 *  - `DotRing`     — der Punktekranz für "dieses Fenster füllt sich gerade".
 *  - `SkeletonBar` — der wandernde Glanz für "hier kommt gleich Inhalt".
 *
 * Der Glanz selbst ist eine CSS-Klasse (`.ofi-shimmer` in `index.css`), damit er
 * NICHT je Aufrufer neu erfunden wird und `prefers-reduced-motion` an einer
 * Stelle greift. Tabellen bekommen ihn über `TableStateRow` aus dem TableKit —
 * damit lädt jede Tabelle der Anwendung gleich, ohne dass ein Aufrufer etwas
 * zusätzlich einbauen muss.
 */

const SPINNER_PX = { xs: 12, sm: 14, md: 18, lg: 26 } as const;

export type SpinnerSize = keyof typeof SPINNER_PX;

/**
 * Ladering in der aktuellen Textfarbe (`currentColor`) — er passt sich also der
 * Umgebung an und braucht keine eigene Farbvariante für den Dunkelmodus.
 */
export const Spinner = ({ size = 'md', className = '' }: { size?: SpinnerSize; className?: string }) => {
    const px = SPINNER_PX[size];
    return (
        <svg
            width={px}
            height={px}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
            className={`shrink-0 animate-spin ${className}`}
        >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.6" className="opacity-20" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
    );
};

/**
 * PUNKTEKRANZ — acht Punkte im Kreis, die im Takt weiterspringen; der vorderste
 * ist dunkel, dahinter verblassen sie (Vorlage Samet, `loading_spinner.png`).
 *
 * Anders als der Ring oben füllt er eine FLÄCHE, die noch leer ist: er steht
 * mitten in einem Fenster oder Bereich, während dessen Inhalt geholt wird.
 * Gedreht wird in acht Sprüngen (`steps(8)`) statt fliessend — genau das gibt
 * das Bild der Vorlage, in dem jeder Punkt seine eigene Helligkeit trägt.
 *
 * Die Punkte selbst liegen in CSS (`.ofi-dotring` in `index.css`), damit die
 * Winkel nicht in jeder Aufrufstelle neu gerechnet werden.
 */
export const DotRing = ({
    size = 40,
    label,
    className = '',
}: {
    /** Kantenlänge des Kranzes in Pixel. */
    size?: number;
    label?: string;
    className?: string;
}) => (
    <span
        role="status"
        aria-live="polite"
        className={`ofi-dotring ${className}`}
        style={{ '--ofi-dotring-size': `${size}px` } as CSSProperties}
    >
        {Array.from({ length: 8 }, (_, index) => (
            <i key={index} aria-hidden="true" style={{ '--ofi-dotring-i': index } as CSSProperties} />
        ))}
        <span className="sr-only">{label ?? t('common.loading')}</span>
    </span>
);

/**
 * DER MAC-KREISEL — zwölf Speichen, die vorderste dunkel, dahinter
 * verblassend, in zwölf Sprüngen gedreht: der Ladekreisel von macOS
 * (NSProgressIndicator). Vorgabe Samet, 24.09.2026, für die Geräteseite der
 * Produktion: «sayfa yüklenirken Apple macOS loading'i olacak, ama hızlı».
 *
 * Er steht mitten in einer SEITE, die sich gerade aufbaut — für Fenster und
 * Masken bleibt der Punktekranz, für Knöpfe der Ring. Speichen und Winkel
 * liegen in CSS (`.ofi-macspin` in `index.css`), die Farbe ist `currentColor`.
 */
export const MacSpinner = ({
    size = 30,
    label,
    className = '',
}: {
    /** Kantenlänge in Pixel. */
    size?: number;
    label?: string;
    className?: string;
}) => (
    <span
        role="status"
        aria-live="polite"
        className={`ofi-macspin ${className}`}
        style={{ '--ofi-macspin-size': `${size}px` } as CSSProperties}
    >
        {Array.from({ length: 12 }, (_, index) => (
            <i key={index} aria-hidden="true" style={{ '--ofi-macspin-i': index } as CSSProperties} />
        ))}
        <span className="sr-only">{label ?? t('common.loading')}</span>
    </span>
);

/**
 * Der Mac-Kreisel mitten in einer SEITE, die sich aufbaut — genau so hoch wie
 * das Fenster abzüglich der Polster der Seite. Route (solange das Stück lädt)
 * und Seite (solange die Daten kommen) zeigen dasselbe, damit nichts springt.
 */
export const MacSpinnerScreen = () => (
    <div
        className="flex items-center justify-center"
        style={{ minHeight: 'calc(100dvh - 2 * var(--page-pad-y, 1.5rem))' }}
    >
        <MacSpinner size={30} />
    </div>
);

/**
 * Der Punktekranz mitten in einer Fläche, die ihre Höhe behalten soll — der
 * Ladezustand einer Maske, bevor ihr Inhalt da ist.
 */
export const DotRingPanel = ({
    minHeight = 256,
    label,
    className = '',
}: {
    minHeight?: number;
    label?: string;
    className?: string;
}) => (
    <div className={`flex items-center justify-center ${className}`} style={{ minHeight }}>
        <DotRing size={44} label={label} className="text-slate-800 dark:text-white/85" />
    </div>
);

/**
 * Ladehinweis als TEXT mit laufenden Punkten — "Daten werden geladen • • •".
 * Für Stellen, an denen nicht nur gewartet, sondern GERECHNET wird (Bestellzeilen
 * neu berechnen, Excel-Zeilen zuordnen): der Satz sagt, was passiert, die Punkte
 * zeigen, dass es weiterläuft.
 *
 * Die Punkte pulsieren an fester Position (`.ofi-dot` in `index.css`), sie werden
 * NICHT einzeln angehängt — sonst würde die Textbreite bei jedem Takt springen.
 * Der Text ohne Auslassungspunkte gehört ins Label (`common.loadingData`), damit
 * nicht "…" und Punkte doppelt stehen.
 */
export const LoadingDots = ({
    label,
    className = '',
}: {
    label?: ReactNode;
    className?: string;
}) => (
    <span role="status" aria-live="polite" className={`inline-flex items-baseline gap-1 ${className}`}>
        {label ?? t('common.loadingData')}
        <span aria-hidden="true" className="inline-flex gap-[3px] pl-0.5">
            {[0, 1, 2].map((index) => (
                <span
                    key={index}
                    style={{ '--ofi-dot-delay': `${index * 160}ms` } as CSSProperties}
                    className="ofi-dot inline-block size-[3px] rounded-full bg-current"
                />
            ))}
        </span>
    </span>
);

/** Spinner + Text in einer Zeile — für Knöpfe und Kopfzeilen. */
export const InlineLoading = ({ label, className = '' }: { label?: ReactNode; className?: string }) => (
    <span className={`inline-flex items-center gap-2 text-[13px] text-slate-500 dark:text-white/60 ${className}`}>
        <Spinner size="sm" />
        {label ?? t('common.loading')}
    </span>
);

/**
 * Platzhalterbalken. Die Verzögerung läuft über eine CSS-Variable, weil die
 * Animation am Pseudo-Element hängt — ein `animationDelay` im Style-Attribut
 * würde dort nicht ankommen.
 */
export const SkeletonBar = ({
    width = '100%',
    className = 'h-3 rounded-full',
    delayMs = 0,
}: {
    width?: string;
    /**
     * Ersetzt Höhe UND Radius. Beides gehört in `className`, weil Tailwind bei
     * gleichen Eigenschaften nach Reihenfolge im Stylesheet gewinnt — ein hier
     * fest verdrahtetes `rounded-full` würde ein `rounded-md` des Aufrufers
     * überstimmen und aus einer Kachel eine Pille machen.
     */
    className?: string;
    delayMs?: number;
}) => (
    <span
        aria-hidden="true"
        style={{ width, '--ofi-shimmer-delay': `${delayMs}ms` } as CSSProperties}
        className={`ofi-shimmer block bg-slate-100 dark:bg-white/10 ${className}`}
    />
);

const BAR_WIDTHS = ['72%', '54%', '88%', '46%', '66%', '58%', '78%', '50%'];

/**
 * Ladezeilen für einen Tabellenkörper: je Spalte ein Balken, versetzt animiert,
 * damit die Tabelle beim Laden ihre Form behält (kein Höhensprung, wenn die
 * echten Zeilen eintreffen).
 *
 * Gibt ein Fragment aus `<tr>` zurück und gehört damit direkt in ein `<tbody>`.
 */
export const SkeletonTableRows = ({
    rows = 5,
    columns,
    widths,
    label,
}: {
    rows?: number;
    columns: number;
    /** Feste Breite je Spalte; ohne Angabe wechseln die Breiten durch. */
    widths?: string[];
    label?: string;
}) => (
    <>
        {Array.from({ length: rows }, (_, row) => (
            <tr key={row} data-skeleton-row>
                {Array.from({ length: columns }, (_, column) => (
                    <td key={column}>
                        {/* Der Vorlesehinweis steckt in der ersten Zelle — die
                            Balken selbst sind für Hilfstechnik unsichtbar. */}
                        {row === 0 && column === 0 && (
                            <span role="status" className="sr-only">{label ?? t('common.loading')}</span>
                        )}
                        <SkeletonBar
                            width={widths?.[column] ?? BAR_WIDTHS[(row + column * 3) % BAR_WIDTHS.length]}
                            delayMs={(row * columns + column) * 45}
                        />
                    </td>
                ))}
            </tr>
        ))}
    </>
);

/**
 * Ladeplatzhalter für einen ganzen Block (Reiterinhalt, Karte) — gleiche Optik
 * wie die Tabellenzeilen, nur ohne Tabelle.
 */
export const LoadingPanel = ({
    rows = 4,
    label,
    className = '',
}: {
    rows?: number;
    label?: string;
    className?: string;
}) => (
    <div
        role="status"
        aria-live="polite"
        className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-white/15 dark:bg-transparent dark:shadow-none ${className}`}
    >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-[12.5px] text-slate-400 dark:border-white/10 dark:text-white/50">
            <Spinner size="sm" />
            {label ?? t('common.loading')}
        </div>
        <div className="space-y-2.5 p-4">
            {Array.from({ length: rows }, (_, row) => (
                <SkeletonBar
                    key={row}
                    className="h-9 rounded-md"
                    width={BAR_WIDTHS[row % BAR_WIDTHS.length]}
                    delayMs={row * 90}
                />
            ))}
        </div>
    </div>
);
