import { useEffect, useMemo, useRef, useState } from 'react';

import { Check, ChevronDown, Clock } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { PopupDialog } from './PopupKit';

/**
 * ══ ZEITWAHL ALS FENSTER (Vorgabe Samet, 02.09.2026) ════════════════════════
 * «Die Zeitwahl soll modern sein und als Fenster aufgehen.»
 *
 * Das native `<input type="time">` war genau das Gegenteil: Aussehen und
 * Bedienung kommen vom Browser, auf dem Tablet des Monteurs ist es ein
 * Zahlenfeld mit winzigen Pfeilen, und in jedem System sieht es anders aus.
 *
 * Hier steht stattdessen EIN Knopf, der die Zeit zeigt, und dahinter ein
 * Fenster mit zwei Spalten — Stunde und Minute, 44px hohe Zeilen (das
 * Fingermass), die gewählte Zeile gefüllt. Minuten stehen im 5er-Schritt; eine
 * krumme gespeicherte Minute (07) wird zusätzlich eingereiht, damit ein alter
 * Rapport nicht beim blossen Öffnen verrutscht.
 *
 * Übernommen wird erst mit «Übernehmen» — wer sich verklickt, verliert die
 * bestehende Zeit nicht.
 */

const pad = (value: number) => String(value).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTE_STEP = 5;

const parseTime = (value: string) => {
    const [rawHour, rawMinute] = String(value || '').split(':');
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    return {
        hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.trunc(hour))) : 0,
        minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, Math.trunc(minute))) : 0,
    };
};

/** Eine Spalte des Fensters — sie rollt die gewählte Zeile beim Öffnen ins Bild. */
const TimeColumn = ({
    label,
    values,
    selected,
    onSelect,
}: {
    label: string;
    values: number[];
    selected: number;
    onSelect: (value: number) => void;
}) => {
    const listRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const node = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
        // `block: 'center'` statt `scrollIntoView()` pur: die gewählte Zeile soll
        // in der Mitte der Spalte stehen und nicht am oberen Rand kleben.
        node?.scrollIntoView({ block: 'center' });
        // Nur beim Öffnen — beim Tippen soll die Liste NICHT unter dem Finger
        // wegspringen; darum die leere Abhängigkeitsliste.
    }, []);
    return (
        <div className="ofi-timepick__col">
            <span className="ofi-timepick__collabel">{label}</span>
            <div ref={listRef} role="listbox" aria-label={label} className="ofi-timepick__list">
                {values.map((value) => {
                    const active = value === selected;
                    return (
                        <button
                            key={value}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => onSelect(value)}
                            className={`ofi-option-row ofi-timepick__opt${active ? ' is-active' : ''}`}
                        >
                            <span>{pad(value)}</span>
                            {active && <Check size={14} />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export const TimeField = ({
    label,
    value,
    onChange,
    disabled = false,
    className,
}: {
    /** Steht als Titel über dem Fenster — «Beginn», «Ende». */
    label: string;
    /** «HH:mm». */
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
    className?: string;
}) => {
    const [open, setOpen] = useState(false);
    const current = parseTime(value);
    const [draft, setDraft] = useState(current);

    /* Das Fenster fängt IMMER beim gespeicherten Wert an — auch beim zweiten
       Öffnen, nachdem einmal abgebrochen wurde. */
    const openDialog = () => {
        if (disabled) return;
        setDraft(parseTime(value));
        setOpen(true);
    };

    const minutes = useMemo(() => {
        const steps = Array.from({ length: Math.ceil(60 / MINUTE_STEP) }, (_, index) => index * MINUTE_STEP);
        return steps.includes(draft.minute) ? steps : [...steps, draft.minute].sort((a, b) => a - b);
    }, [draft.minute]);

    return (
        <>
            <button
                type="button"
                disabled={disabled}
                onClick={openDialog}
                aria-label={label}
                className={`ofi-ios-time${className ? ` ${className}` : ''}`}
            >
                <Clock size={14} aria-hidden />
                <span className="ofi-ios-time__value">{pad(current.hour)}:{pad(current.minute)}</span>
                <ChevronDown size={14} aria-hidden className="ofi-ios-time__caret" />
            </button>

            <PopupDialog
                open={open}
                onClose={() => setOpen(false)}
                title={label}
                width={380}
                bodyClassName="ofi-timepick"
                footer={(
                    <div className="ofi-timepick__foot">
                        <button type="button" className="ofi-cal-btn" onClick={() => setOpen(false)}>
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            className="ofi-cal-btn is-primary"
                            onClick={() => { onChange(`${pad(draft.hour)}:${pad(draft.minute)}`); setOpen(false); }}
                        >
                            {t('common.apply')}
                        </button>
                    </div>
                )}
            >
                <div className="ofi-timepick__display">
                    <span>{pad(draft.hour)}</span>
                    <span className="ofi-timepick__colon">:</span>
                    <span>{pad(draft.minute)}</span>
                </div>
                <div className="ofi-timepick__cols">
                    <TimeColumn
                        label={t('common.hourLong')}
                        values={HOURS}
                        selected={draft.hour}
                        onSelect={(hour) => setDraft((state) => ({ ...state, hour }))}
                    />
                    <TimeColumn
                        label={t('common.minuteLong')}
                        values={minutes}
                        selected={draft.minute}
                        onSelect={(minute) => setDraft((state) => ({ ...state, minute }))}
                    />
                </div>
            </PopupDialog>
        </>
    );
};
