import type { ReactNode } from 'react';

import { Check } from '@/components/icons/antIconCompat';

/**
 * ── BAUTEILE DER DIREKTRECHNUNG (25.09.2026) ─────────────────────────────────
 *
 * Vorgabe Samet: «serbest fatura oluşturma tıpkı üretimdeki ya da teklifteki
 * gibi daha temiz … kocaman glass butonlar olmasın». Die Seite steht darum im
 * Kleid der Pano-Seiten (`pages/production/components/PanelEditorKit` +
 * `styles/modules/panels.css`): Tafel, Feld, Pop-up-Knopf, Hinweis und die
 * kleinen Knöpfe kommen von dort. Hier steht nur, was jenes Kit nicht kennt —
 * die drei Schritte, eine Tafel mit einer Handlung im Kopf und das
 * mehrzeilige Feld.
 */

/**
 * Die drei Schritte als kleine Segmentsteuerung NEBEN dem Titel (so stand der
 * Fortschritt schon seit 05.09.2026) — graue Rinne, weisses Segment, wie die
 * Reiter der Pano-Seite. Sie ersetzt den 620px breiten Glasstreifen.
 * Erledigte Schritte tragen einen Haken und bleiben anklickbar, spätere erst,
 * wenn die bisherigen Eingaben sie erlauben.
 */
export const DirectSteps = ({
    labels,
    current,
    furthest,
    disabled = false,
    onGo,
    ariaLabel,
}: {
    labels: string[];
    current: number;
    /** Höchster Schritt, den die bisherigen Eingaben erlauben. */
    furthest: number;
    disabled?: boolean;
    onGo: (index: number) => void;
    ariaLabel: string;
}) => (
    <nav className="direct-steps" aria-label={ariaLabel}>
        {labels.map((label, index) => (
            <button
                key={label}
                type="button"
                className={index === current ? 'is-on' : index < current ? 'is-done' : undefined}
                disabled={disabled || index > furthest}
                aria-current={index === current ? 'step' : undefined}
                onClick={() => onGo(index)}
            >
                <span className="direct-steps__n">{index < current ? <Check size={11} strokeWidth={3} /> : index + 1}</span>
                {label}
            </button>
        ))}
    </nav>
);

/**
 * Eine Tafel der Pano-Seite (`.ofi-panel-page-section`) — mit Platz für EINE
 * leise Handlung rechts im Kopf («Auf die Firmenangaben zurücksetzen»).
 */
export const DirectSection = ({
    title,
    description,
    action,
    children,
}: {
    title?: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
}) => (
    <section className="ofi-panel-page-section">
        {(title || description || action) && (
            <header className="direct-section-head">
                <div>
                    {title && <h2>{title}</h2>}
                    {description && <p>{description}</p>}
                </div>
                {action}
            </header>
        )}
        {children}
    </section>
);

/**
 * Das mehrzeilige Feld: dieselbe Beschriftung wie `PanelPageField`, aber die
 * mittlere Zeile wächst mit dem Kasten (dort ist sie auf 40px festgelegt).
 */
export const DirectTextField = ({
    label,
    hint,
    children,
}: {
    label: ReactNode;
    hint?: ReactNode;
    children: ReactNode;
}) => (
    <label className="ofi-panel-page-field is-wide direct-textfield">
        <span>{label}</span>
        {children}
        <small aria-hidden={!hint}>{hint ?? ' '}</small>
    </label>
);
