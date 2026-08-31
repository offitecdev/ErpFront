import { useState } from 'react';
import type { ReactNode } from 'react';

import { Check, X as XIcon } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';

/**
 * Das Filterfeld der Aufgaben-Filterzeile (19.08.2026) — EIN Bauteil für
 * Mitarbeiter UND Kunde (Vorgabe: beide Filter sollen gleich aussehen und sich
 * gleich bedienen).
 *
 * Getippt wird im FELD selbst; darunter klappt eine kurze Trefferliste auf,
 * höchstens sieben Zeilen.
 *
 * MEHRFACHWAHL (11.09.2026, Vorgabe Samet: «man muss mehrere Mitarbeitende
 * oder alle wählen können … alle Kunden, bestimmte Kunden oder einen
 * einzigen»). Eine Zeile anzuklicken legt sie DAZU, ein zweiter Klick nimmt
 * sie wieder heraus — das Fenster bleibt dabei offen, denn wer zwei Personen
 * meint, meint meistens auch eine dritte.
 *
 * «ALLE» IST KEIN EINTRAG, SONDERN DER LEERE ZUSTAND. Ein Filter, dessen
 * Grundzustand «alle» heisst, ist keiner: das leere Feld IST alle. Was es
 * dafür gibt, ist der Weg ZURÜCK — die Zeile «Alle …» ganz oben, die die
 * Auswahl in einem Griff wieder aufhebt, und das Kreuz am Feld.
 *
 * Wie ComboCell im Lagermodul ist es GESTEUERT — Text und Zustand des Fensters
 * liegen beim Aufrufer, weil er entscheidet, wie und wo gesucht wird: das
 * Personal steht nach dem ersten Laden im Speicher, die Kundenkartei wird bei
 * jedem Tippen frisch beim Server erfragt.
 *
 * Was hier drin steckt, ist alles, was BEIDE brauchen: das Kleid des Feldes,
 * das Kreuz zum Leeren, die Pfeiltasten und die Zusammenfassung im Feld,
 * solange man nicht darin tippt.
 */

export interface FilterComboPick {
    id: string;
    name: string;
}

export interface FilterComboOption extends FilterComboPick {
    /** Leise Zweitangabe rechts (Rolle, Ansprechpartner). */
    meta?: string;
    /** Bild links auf der Zeile — Personen tragen eines, Kunden nicht. */
    icon?: ReactNode;
}

/**
 * Was im geschlossenen Feld steht: nichts (dann trägt der Platzhalter die
 * Auskunft «alle»), der eine Name, oder der erste Name und wie viele noch.
 * Die ganze Liste in ein Feld von 180 Pixeln zu schreiben, hiesse jeden Namen
 * abzuschneiden — so bleibt wenigstens einer lesbar.
 */
const summarize = (values: FilterComboPick[]): string => {
    if (values.length === 0) return '';
    if (values.length === 1) return values[0].name;
    return `${values[0].name} +${values.length - 1}`;
};

export const TaskFilterCombo = ({
    values,
    onChange,
    text,
    onText,
    open,
    onOpen,
    options,
    loading,
    placeholder,
    emptyText,
    allText,
    footer,
}: {
    /** Die gewählten Zeilen; LEER heisst alle. */
    values: FilterComboPick[];
    onChange: (next: FilterComboPick[]) => void;
    /** Der Suchtext im Feld — nur während getippt wird. */
    text: string;
    onText: (next: string) => void;
    open: boolean;
    onOpen: (next: boolean) => void;
    /** Schon fertig gekürzte Trefferliste (höchstens sieben Zeilen). */
    options: FilterComboOption[];
    loading: boolean;
    placeholder: string;
    emptyText: string;
    /** Beschriftung der Zeile, die die Auswahl aufhebt («Alle Mitarbeitenden»). */
    allText: string;
    /** Fusszeile der Liste, z. B. "Alle Kunden …". */
    footer?: ReactNode;
}) => {
    const [activeId, setActiveId] = useState<string | null>(null);
    /* Solange das Feld den Fokus hat, steht der SUCHTEXT darin; sonst die
       Zusammenfassung der Wahl. Ohne diese Unterscheidung müsste man den Namen
       der gewählten Person erst löschen, um nach der zweiten zu suchen. */
    const [typing, setTyping] = useState(false);
    /* Zustand statt Ref: der AnchoredPicker liest sein Ankerelement beim
       Aufbauen — ein Ref wäre beim ersten Öffnen noch leer. */
    const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);

    const chosen = new Set(values.map((value) => value.id));

    const close = () => {
        onOpen(false);
        setActiveId(null);
        setTyping(false);
        /* Halb Getipptes ohne Wahl verschwindet beim Schliessen: ein Feld, in
           dem "Mül" steht, während das Brett ungefiltert ist, wäre eine falsche
           Auskunft über den Filter. */
        onText('');
    };

    /** Dazulegen oder herausnehmen — das Fenster bleibt offen. */
    const toggle = (option: FilterComboOption) => {
        onChange(chosen.has(option.id)
            ? values.filter((value) => value.id !== option.id)
            : [...values, { id: option.id, name: option.name }]);
        setActiveId(option.id);
    };

    const clear = () => {
        onChange([]);
        onText('');
        setActiveId(null);
        inputEl?.focus();
    };

    /* Die angesteuerte Zeile hängt an der ID, nicht am Index: die Liste wird bei
       jedem Tastendruck neu gebaut, ein Index zeigte danach woanders hin. */
    const activeIndex = activeId ? options.findIndex((option) => option.id === activeId) : -1;
    const move = (direction: 1 | -1) => {
        if (!options.length) return;
        const next = Math.min(options.length - 1, Math.max(0, (activeIndex < 0 ? -1 : activeIndex) + direction));
        setActiveId(options[next].id);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!open) { onOpen(true); return; }
            event.preventDefault();
            move(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (event.key === 'Enter') {
            // Ohne Ansteuerung gilt der erste Treffer — das ist der, den man
            // beim Tippen im Blick hat.
            const target = activeIndex >= 0 ? options[activeIndex] : options[0];
            if (!target) return;
            event.preventDefault();
            toggle(target);
            // Nach der Wahl beginnt die Suche von vorn, damit die nächste
            // Person nicht hinter dem alten Suchwort versteckt bleibt.
            onText('');
            return;
        }
        if (event.key === 'Escape') {
            // Nicht weiterreichen: sonst schlösse Esc die Karte, in der die
            // Leiste steht, statt nur das Vorschlagfenster.
            event.stopPropagation();
            close();
        }
    };

    return (
        <div className={`ofi-taskbar__combo ${values.length > 0 ? 'is-picked' : ''}`}>
            <input
                ref={setInputEl}
                value={typing ? text : summarize(values)}
                onChange={(event) => {
                    onText(event.target.value);
                    setTyping(true);
                    setActiveId(null);
                    onOpen(true);
                }}
                onFocus={() => { setTyping(true); onText(''); onOpen(true); }}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                aria-label={placeholder}
                title={values.length > 1 ? values.map((value) => value.name).join(', ') : placeholder}
                autoComplete="off"
                className="ofi-taskbar__combofield"
            />
            {(values.length > 0 || text) && (
                <button
                    type="button"
                    onClick={clear}
                    aria-label={t('common.clear')}
                    title={t('common.clear')}
                    className="ofi-taskbar__comboclear"
                >
                    <XIcon size={11} />
                </button>
            )}

            <AnchoredPicker
                anchorEl={open ? inputEl : null}
                onClose={close}
                width={264}
                maxHeight={320}
                panelClassName="ofi-taskcombo-pop"
                footer={footer}
            >
                <div className="ofi-taskcombo-list" aria-busy={loading}>
                    {/* Der Weg zurück auf «alle» — er steht oben, weil er der
                        einzige ist, den man mit gefüllter Auswahl sucht. */}
                    <button
                        type="button"
                        onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.preventDefault();
                            onChange([]);
                            onText('');
                        }}
                        className={`ofi-taskcombo-row ofi-option-row ${values.length === 0 ? 'is-active' : ''}`}
                    >
                        <span className="ofi-taskcombo-row__name">{allText}</span>
                        {values.length === 0 && <Check size={13} className="ofi-taskcombo-row__check" />}
                    </button>

                    {loading && options.length === 0 && (
                        <div className="ofi-taskcombo-empty">{t('common.loading')}</div>
                    )}
                    {!loading && options.length === 0 && (
                        <div className="ofi-taskcombo-empty">{emptyText}</div>
                    )}
                    {options.map((option, index) => (
                        <button
                            key={option.id}
                            type="button"
                            title={option.name}
                            aria-pressed={chosen.has(option.id)}
                            // pointerdown statt click: es läuft vor dem Verlassen
                            // des Feldes, sonst schlösse das Fenster zuerst.
                            onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                event.preventDefault();
                                toggle(option);
                            }}
                            /* Die Färbung der überfahrenen und der angesteuerten
                               Zeile kommt aus der app-weiten `.ofi-option-row` —
                               hier steht NIE eine eigene Hover-Farbe. */
                            className={`ofi-taskcombo-row ofi-option-row ${index === activeIndex ? 'is-active' : ''}`}
                        >
                            {/* Das Bild steckt in einem <i>: die app-weite Regel
                                dimmt das ZWEITE <span> einer Zeile — stünde das
                                Bild als span davor, verlöre der Name seine
                                Schriftfarbe auf der Füllung. `__avatar` ist die
                                Ausnahme, die den Initialen auf der gefüllten
                                Zeile ihre Lesbarkeit lässt (index.css). */}
                            {option.icon && (
                                <i className="ofi-option-row__avatar ofi-taskcombo-row__pic">{option.icon}</i>
                            )}
                            <span className="ofi-taskcombo-row__name">{option.name}</span>
                            {option.meta && <span className="ofi-taskcombo-row__meta">{option.meta}</span>}
                            {chosen.has(option.id) && <Check size={13} className="ofi-taskcombo-row__check" />}
                        </button>
                    ))}
                </div>
            </AnchoredPicker>
        </div>
    );
};
