import type { ReactNode } from 'react';

import { ArrowLeft, ArrowRight, Check } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';

import { GemMark } from './GemMark';

/**
 * ── BAUTEILE DER BEIDEN ERFASSUNGSSEITEN ─────────────────────────────────────
 *
 * Vorgabe Samet: die Rechnungserstellung öffnet KEIN Fenster, sondern eine
 * eigene Seite — und sie führt SCHRITT FÜR SCHRITT statt als eine lange Seite,
 * die man herunterrollen muss. Sichtbar ist darum immer nur der Kasten des
 * aktuellen Schritts; der Zähler oben sagt, wo man steht und was noch kommt.
 */

export interface WizardStep {
    key: string;
    label: string;
    /** Halbsatz unter dem Namen — er nimmt dem Schritt die Überraschung. */
    hint?: string;
}

/**
 * Der Schrittzähler. Erledigte Schritte sind anklickbar (man darf zurück und
 * etwas ändern), spätere nicht — sie hängen an dem, was hier noch fehlt.
 */
export const InvoiceSteps = ({
    steps,
    current,
    furthest,
    onGo,
    numbered = true,
}: {
    steps: WizardStep[];
    current: number;
    /** Höchster Schritt, den die bisherigen Eingaben erlauben. */
    furthest: number;
    onGo: (index: number) => void;
    /**
     * Ziffern vor den Namen. Bei ZWEI Schritten sagt eine „1" nichts, was der
     * Name nicht schon sagt (Vorgabe Samet, 24.08.2026: keine „1"/„2" mehr) —
     * die Leiter trägt dann nur die Namen, getrennt von der Raute. Erledigte
     * Schritte behalten ihren Haken.
     */
    numbered?: boolean;
}) => (
    <ol className={`ofi-invp-steps${numbered ? '' : ' is-plain'}`}>
        {steps.map((step, index) => (
            <li
                key={step.key}
                className={`ofi-invp-step ${index === current ? 'is-current' : ''} ${index < current ? 'is-done' : ''}`}
            >
                <button
                    type="button"
                    className="ofi-invp-step__btn"
                    disabled={index > furthest}
                    aria-current={index === current ? 'step' : undefined}
                    onClick={() => onGo(index)}
                >
                    {(numbered || index < current) && (
                        <span className="ofi-invp-step__num">
                            {index < current ? <Check size={14} /> : index + 1}
                        </span>
                    )}
                    <span className="ofi-invp-step__text">
                        <span className="ofi-invp-step__label">{step.label}</span>
                        {step.hint && <span className="ofi-invp-step__hint">{step.hint}</span>}
                    </span>
                </button>
                {/* Zwischen zwei Schritten steht das Hauszeichen: eine
                    geschliffene RAUTE in Navy → Rot (Vorgabe Samet — kein
                    Wellenband, keine Punkte, sondern ein Stein mit Facetten).
                    Sie trennt die Schritte, ohne einen Strich zu ziehen, und
                    ist bis zum erreichten Schritt farbig. */}
                {index < steps.length - 1 && (
                    <GemMark className="ofi-invp-step__mark" size={24} muted={index >= current} />
                )}
            </li>
        ))}
    </ol>
);

/**
 * ── DER FORTSCHRITT ALS BALKEN ───────────────────────────────────────────────
 * Vorgabe Samet (05.09.2026): der Weg durch die Erfassung soll NEBEN dem Titel
 * stehen — «ein Fortschrittsbalken, gross genug, aber nicht zu gross».
 *
 * Also drei SCHRÄGE Balken in einer Pille (Vorgabe Samet 05.09.2026 mit
 * Vorlage: «ein Fortschrittsbalken mit schrägen Rauten, etwas grösser»): die
 * erreichten Schritte sind gefüllt, die kommenden leer, jeder trägt nur seinen
 * Namen und ist anklickbar, sobald er erreicht war. Was ein Schritt bedeutet,
 * sagt sein Inhalt — nicht ein Halbsatz darunter.
 */
export const InvoiceProgress = ({
    steps,
    current,
    furthest,
    onGo,
}: {
    steps: WizardStep[];
    current: number;
    furthest: number;
    onGo: (index: number) => void;
}) => (
    <div className="ofi-invp-progress" role="group" aria-label={steps.map((step) => step.label).join(' · ')}>
        {steps.map((step, index) => (
            <button
                key={step.key}
                type="button"
                className={`ofi-invp-progress__seg ${index === current ? 'is-current' : ''} ${index < current ? 'is-done' : ''}`}
                aria-current={index === current ? 'step' : undefined}
                disabled={index > furthest}
                onClick={() => onGo(index)}
            >
                <span className="ofi-invp-progress__label">{step.label}</span>
            </button>
        ))}
    </div>
);

/**
 * Der Umschalter zwischen zwei Wegen — EIN Ort statt zweier Felder (Vorgabe
 * Samet). Die Marke gleitet unter den gewählten Namen; die Fläche ist
 * milchiges Glas, damit der Schalter über der Karte zu schweben scheint.
 */
export const InvoiceModeSwitch = <T extends string>({
    options,
    value,
    onChange,
}: {
    options: Array<{ key: T; label: string }>;
    value: T;
    onChange: (next: T) => void;
}) => {
    const index = Math.max(0, options.findIndex((option) => option.key === value));
    return (
        <div className="ofi-invp-switch" role="tablist">
            <span
                className="ofi-invp-switch__thumb"
                style={{
                    width: `calc((100% - 8px) / ${options.length})`,
                    transform: `translateX(${index * 100}%)`,
                }}
            />
            {options.map((option) => (
                <button
                    key={option.key}
                    type="button"
                    role="tab"
                    aria-selected={option.key === value}
                    className={`ofi-invp-switch__btn ${option.key === value ? 'is-on' : ''}`}
                    onClick={() => onChange(option.key)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
};

const NEUTRAL_BTN =
    'flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-[12.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10';
const BRAND_BTN =
    'ofi-btn-brand flex items-center gap-1.5 rounded-md bg-[#272f67] px-4 py-2.5 text-[12.5px] font-semibold text-white hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Fussleiste eines Schritts: links zurück (auf dem ersten Schritt heisst das
 * „Abbrechen"), rechts weiter — oder, auf dem letzten Schritt, die Tat selbst.
 */
export const InvoiceStepFoot = ({
    stepIndex,
    stepCount,
    onBack,
    onNext,
    nextDisabled,
    finalLabel,
    finalIcon,
    onFinal,
    finalDisabled,
    extra,
    backLabel,
}: {
    stepIndex: number;
    stepCount: number;
    onBack: () => void;
    onNext: () => void;
    nextDisabled?: boolean;
    finalLabel: string;
    finalIcon?: ReactNode;
    onFinal: () => void;
    finalDisabled?: boolean;
    /** Zusätzlicher Knopf des letzten Schritts (die Vorschau). */
    extra?: ReactNode;
    /**
     * Beschriftung des linken Knopfes. Einschrittige Masken — der Nachtrag —
     * verlassen nicht einen Vorgang, sondern GEHEN ZURÜCK an die Stelle, von
     * der sie geöffnet wurden (Vorgabe Samet 05.09.2026), und sagen das auch.
     */
    backLabel?: string;
}) => {
    const isLast = stepIndex >= stepCount - 1;
    return (
        <div className="ofi-invp-foot">
            <button type="button" className={NEUTRAL_BTN} onClick={onBack}>
                <ArrowLeft size={14} />
                {backLabel || (stepIndex === 0 ? t('invoices.cancelBtn') : t('invoices.stepBack'))}
            </button>
            <span className="ofi-invp-foot__spacer" />
            {isLast ? (
                <>
                    {extra}
                    <button type="button" className={BRAND_BTN} disabled={finalDisabled} onClick={onFinal}>
                        {finalIcon}
                        {finalLabel}
                    </button>
                </>
            ) : (
                <button type="button" className={BRAND_BTN} disabled={nextDisabled} onClick={onNext}>
                    {t('invoices.stepNext')}
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
    );
};

/**
 * Kopf der Erfassungsseiten: derselbe Listenkopf wie überall.
 *
 * Rechts stand hier ein ZURÜCK-Knopf mit dem Namen des Ziels („Rechnungen").
 * Er ist weg — den Rückweg trägt der Blitz ganz vorn in der Kopfleiste, der
 * sich auf jeder Unterseite in einen Pfeil verwandelt (QuickBackButton). Der
 * Fusssteg der Erfassung behält seinen eigenen „Schritt zurück": der geht
 * einen Erfassungsschritt zurück, nicht auf eine andere Seite.
 */
export const InvoicePageHeader = ({
    title,
    actions,
}: {
    title: string;
    actions?: ReactNode;
}) => (
    <InventoryListHeader title={title} action={actions} />
);

/** Beschriftetes Feld der Erfassungsseiten. */
export const InvoiceField = ({
    label,
    hint,
    wide,
    children,
}: {
    label: string;
    hint?: string;
    /** Absatzfelder (Einleitungstext, Notiz) füllen ihre Spalte; einzeilige
        Felder bleiben auf Lesebreite gedeckelt. */
    wide?: boolean;
    children: ReactNode;
}) => (
    <label className={`ofi-invp-field ${wide ? 'is-wide' : ''}`}>
        <span className="ofi-invp-field__label">{label}</span>
        {children}
        {hint && <span className="ofi-invp-field__hint">{hint}</span>}
    </label>
);
