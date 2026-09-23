import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { t } from '@/i18n/translate';

import { PopupDialog } from './PopupKit';
import '@/styles/appleTimePicker.css';

/**
 * ══ ZEITWAHL (Vorgabe Samet, 19./20.09.2026) ═══════════════════════════════
 * «yapısı saha raporundaki gibi olmalı … tek fark dakikalar 5'er 5'er değil
 *  1'er 1'er … tasarımı [mactimepicker.png] gibi olmalı.»
 *
 * BEDIENUNG wie im Feldrapport (`TimeField`): zwei Listen, man rollt sie ganz
 * gewöhnlich und KLICKT die Zahl an — kein Rad mit Schwung, kein Einrasten,
 * kein Zifferblatt. Am PC rollt das Mausrad die Liste so schnell wie überall
 * sonst; die gewählte Zeile bleibt stehen, wo sie steht.
 * Einziger Unterschied zum Feldrapport: die Minuten laufen 00…59 einzeln.
 *
 * AUSSEHEN wie die Vorlage (ErpFront/mactimepicker.png): oben die Zeile
 * «Uhrzeit ··· 08:00» mit blauer Kapsel, darunter grosse Zahlen, die gewählte
 * auf grauem, rundem Balken, oben und unten verlaufend.
 *
 * Die Kapsel oben ist ein Feld: «1430», «14:30» oder «9» tippen geht auch,
 * Enter übernimmt. 24-Stunden-Uhr (Schweiz).
 *
 * Probelauf: vorerst nur im Kalender (CreatePopup, DayPlanRows).
 */

type TimeParts = { hour: number; minute: number };

const pad = (value: number) => String(value).padStart(2, '0');
const ROW = 44;   // Zeilenhöhe in px — muss zu --atp-row passen (Fingermass)
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

const parseTime = (value: string): TimeParts => {
    const [rawHour, rawMinute] = String(value || '').split(':');
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    return {
        hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.trunc(hour))) : 0,
        minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, Math.trunc(minute))) : 0,
    };
};

/** «1430», «14:30», «930», «9» → Zeit; unvollständig/ungültig → null. */
const parseTyped = (text: string): { hour: number; minute?: number } | null => {
    const clean = text.replace(/[.,\s]/g, ':').replace(/[^\d:]/g, '');
    let hourText: string;
    let minuteText: string | undefined;
    if (clean.includes(':')) {
        [hourText, minuteText] = clean.split(':');
        if (minuteText !== undefined && minuteText.length < 2) minuteText = undefined;
    } else if (clean.length <= 2) {
        hourText = clean;
    } else {
        hourText = clean.slice(0, clean.length - 2);
        minuteText = clean.slice(-2);
    }
    if (!hourText) return null;
    const hour = Number(hourText);
    const minute = minuteText === undefined ? undefined : Number(minuteText);
    if (!Number.isInteger(hour) || hour > 23) return null;
    if (minute !== undefined && (!Number.isInteger(minute) || minute > 59)) return null;
    return { hour, minute };
};

/**
 * Eine Spalte: eine ganz gewöhnliche Liste. Beim Öffnen steht die gewählte
 * Zahl in der Mitte; danach führt der Benutzer — ein Klick verschiebt die
 * Liste NICHT (sonst rutschte einem die Nachbarzahl unter dem Finger weg).
 */
const Column = ({
    label,
    values,
    value,
    onSelect,
    onEnter,
}: {
    label: string;
    values: number[];
    value: number;
    onSelect: (next: number) => void;
    onEnter: () => void;
}) => {
    const listRef = useRef<HTMLDivElement | null>(null);
    /* Wahl aus der Liste selbst → nicht nachrollen. Nur ein Wert von aussen
       (oben getippt) holt die Zeile wieder in die Mitte. */
    const picked = useRef(false);

    /* Die Liste ist oben und unten zwei Zeilen hoch gepolstert (CSS), damit
       auch die erste und die letzte Zahl in die Mitte können; deshalb steht
       Zeile i genau bei scrollTop = i · ROW. Eigene Rechnung statt
       `scrollIntoView` — das rollte sonst das Fenster dahinter mit. */
    const centre = (smooth: boolean) => {
        const node = listRef.current;
        if (!node) return;
        node.scrollTo({ top: values.indexOf(value) * ROW, behavior: smooth ? 'smooth' : 'auto' });
    };

    useLayoutEffect(() => {
        centre(false);
        // Nur beim Öffnen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (picked.current) { picked.current = false; return; }
        centre(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const pick = (next: number, fromList: boolean) => {
        picked.current = fromList;
        onSelect(next);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const index = values.indexOf(value);
        const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[event.key as string];
        if (move) {
            event.preventDefault();
            const next = values[Math.min(values.length - 1, Math.max(0, index + move))];
            pick(next, false);
            return;
        }
        if (event.key === 'Enter') { event.preventDefault(); onEnter(); }
    };

    return (
        <div
            ref={listRef}
            role="listbox"
            aria-label={label}
            tabIndex={0}
            className="ofi-atp__list"
            onKeyDown={onKeyDown}
        >
            {values.map((item) => {
                const active = item === value;
                return (
                    <div
                        key={item}
                        role="option"
                        aria-selected={active}
                        // `ofi-option-row` = die app-weite Zeilenfüllung beim Zeigen.
                        className={`ofi-option-row ofi-atp__opt${active ? ' is-on' : ''}`}
                        onClick={() => pick(item, true)}
                    >
                        {pad(item)}
                    </div>
                );
            })}
        </div>
    );
};

export const AppleTimePicker = ({
    label,
    value,
    onChange,
    disabled = false,
    className,
}: {
    /** Titel des Fensters — «Beginn», «Ende». */
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
    /* Solange die Kapsel oben den Fokus hat, gehört ihr Text dem Benutzer;
       sonst zeigt sie die Zeit der beiden Listen. */
    const [typedText, setTypedText] = useState<string | null>(null);

    const openDialog = () => {
        if (disabled) return;
        setDraft(parseTime(value));
        setTypedText(null);
        setOpen(true);
    };

    const apply = (time = draft) => {
        onChange(`${pad(time.hour)}:${pad(time.minute)}`);
        setOpen(false);
    };

    const applyTyped = () => {
        const parsed = typedText === null ? null : parseTyped(typedText);
        apply(parsed ? { hour: parsed.hour, minute: parsed.minute ?? draft.minute } : draft);
    };

    const onType = (text: string) => {
        setTypedText(text);
        const parsed = parseTyped(text);
        if (parsed) setDraft((state) => ({ hour: parsed.hour, minute: parsed.minute ?? state.minute }));
    };

    return (
        <>
            <button
                type="button"
                disabled={disabled}
                onClick={openDialog}
                aria-label={label}
                className={`ofi-atp-pill${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
            >
                {pad(current.hour)}:{pad(current.minute)}
            </button>

            <PopupDialog
                open={open}
                onClose={() => setOpen(false)}
                title={label}
                width={330}
                bodyClassName="ofi-atp"
                footer={(
                    <div className="ofi-atp__foot">
                        <button type="button" className="ofi-cal-btn" onClick={() => setOpen(false)}>
                            {t('common.cancel')}
                        </button>
                        <button type="button" className="ofi-cal-btn is-primary" onClick={() => apply()}>
                            {t('common.apply')}
                        </button>
                    </div>
                )}
            >
                <div className="ofi-atp__head">
                    <span className="ofi-atp__headlabel">{t('auto.saat')}</span>
                    <input
                        className="ofi-atp__headvalue"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={5}
                        aria-label={label}
                        value={typedText ?? `${pad(draft.hour)}:${pad(draft.minute)}`}
                        onChange={(event) => onType(event.target.value)}
                        onFocus={(event) => event.currentTarget.select()}
                        onBlur={() => setTypedText(null)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            applyTyped();
                        }}
                    />
                </div>
                <div className="ofi-atp__cols">
                    <Column
                        label={t('common.hourLong')}
                        values={HOURS}
                        value={draft.hour}
                        onSelect={(hour) => { setTypedText(null); setDraft((state) => ({ ...state, hour })); }}
                        onEnter={() => apply()}
                    />
                    <Column
                        label={t('common.minuteLong')}
                        values={MINUTES}
                        value={draft.minute}
                        onSelect={(minute) => { setTypedText(null); setDraft((state) => ({ ...state, minute })); }}
                        onEnter={() => apply()}
                    />
                </div>
            </PopupDialog>
        </>
    );
};
