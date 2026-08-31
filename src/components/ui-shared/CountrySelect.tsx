import { Fragment, useMemo, useState } from 'react';
import { t } from '@/i18n/translate';
import { AnchoredPicker } from './AnchoredPicker';
import { countryName, findCountry, searchCountries } from './countries';
import type { CountryEntry, CountryOption } from './countries';

/**
 * Länderauswahl mit Tippsuche. Das Feld IST das Suchfeld — beim Tippen fällt
 * darunter die Trefferliste auf, die häufigen Länder zuerst. Dieselbe Bedienung
 * wie die Zeilen-Auswahlfelder im Lager (`ComboCell`), nur ohne deren
 * Nachladen: die Länderliste liegt vollständig im Programm.
 *
 * Getippt wird FREI — das Feld ist ja das Suchfeld. GESPEICHERT wird aber nur,
 * was die Liste kennt: beim Verlassen wird der Text auf die Schreibweise des
 * Landes gebracht, und Text, der KEIN Land benennt, wird verworfen. Vorher
 * blieb er stehen und wanderte als "Land" in den Adressblock und ins Angebots-
 * PDF (ein getipptes "rewukfh" stand so als Land in einer Kundenadresse).
 * Die Liste umfasst alle ISO-3166-Länder und `findCountry` erkennt sie in jeder
 * Oberflächensprache sowie am Code — ein echtes Land geht dabei nicht verloren.
 *
 * Nur wenn ein Eintrag wirklich ausgewählt wurde, meldet `onPick` das Land samt
 * Vorwahl an den Aufrufer (der damit die Telefonnummern nachführt).
 */
export const CountrySelect = ({
    value,
    onChange,
    onPick,
    inputClassName,
    disabled = false,
    autoFocus = false,
    placeholder,
}: {
    value: string;
    onChange: (next: string) => void;
    /** Feuert NUR bei echter Auswahl aus der Liste, nicht beim Tippen. */
    onPick?: (country: CountryEntry) => void;
    inputClassName?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    placeholder?: string;
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState<string | null>(null);
    const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
    const [activeCode, setActiveCode] = useState<string | null>(null);

    // Solange nicht getippt wird, zeigt das Feld den gespeicherten Wert; sobald
    // getippt wird, ist `query` die Wahrheit. So bleibt ein erfasstes Land
    // sichtbar, ohne die Liste beim Öffnen sofort zu filtern.
    const text = query ?? value;
    const options = useMemo(() => searchCountries(query ?? ''), [query]);
    const activeIndex = activeCode ? options.findIndex((option) => option.code === activeCode) : -1;

    const commit = (option: CountryOption) => {
        // `onPick` läuft VOR `onChange`: der Aufrufer sieht dann noch das alte
        // Land und kann daraus die bisherige Telefonvorwahl bestimmen. Beide
        // Zustandsänderungen laufen im selben Durchgang, die Reihenfolge bleibt.
        onPick?.(option);
        onChange(option.name);
        setQuery(null);
        setActiveCode(null);
        setOpen(false);
    };

    const close = () => {
        setQuery(null);
        setActiveCode(null);
        setOpen(false);
    };

    const move = (direction: 1 | -1) => {
        if (!options.length) return;
        const next = Math.min(options.length - 1, Math.max(0, (activeIndex < 0 ? -1 : activeIndex) + direction));
        setActiveCode(options[next].code);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!open) { setOpen(true); return; }
            event.preventDefault();
            move(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (event.key === 'Enter') {
            // Vorgemerkter Eintrag, sonst der erste Treffer — aber nur, wenn
            // wirklich einer gemeint ist: entweder wurde mit den Pfeiltasten
            // etwas vorgemerkt oder es wurde getippt. Sonst gibt Enter das
            // Formular frei, statt ungefragt ein Land zu setzen.
            const target = activeIndex >= 0 ? options[activeIndex] : options[0];
            if (open && target && (activeIndex >= 0 || query !== null)) {
                event.preventDefault();
                commit(target);
            }
            return;
        }
        if (event.key === 'Escape' && open) {
            event.stopPropagation();
            close();
        }
        if (event.key === 'Tab' && open) close();
    };

    return (
        <>
            <input
                ref={setInputEl}
                value={text}
                disabled={disabled}
                autoFocus={autoFocus}
                autoComplete="off"
                placeholder={placeholder ?? t('address.countryPlaceholder')}
                onChange={(event) => {
                    setQuery(event.target.value);
                    onChange(event.target.value);
                    setActiveCode(null);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                    // Beim Verlassen entscheidet die Liste: ein Text, der genau
                    // ein Land benennt, wird auf dessen Schreibweise gebracht —
                    // die Vorwahl meldet das aber NICHT, dafür braucht es eine
                    // echte Auswahl. Ein Text, der KEIN Land benennt, wird
                    // verworfen, statt als Land in der Adresse zu landen.
                    // Angefasst wird nur wirklich Getipptes (`query !== null`):
                    // ein blosses Hineinklicken darf einen Altbestand, den die
                    // Liste nicht kennt, nicht stillschweigend löschen.
                    if (query !== null) {
                        const match = findCountry(text);
                        onChange(match ? countryName(match) : '');
                    }
                    setQuery(null);
                }}
                onKeyDown={onKeyDown}
                className={inputClassName}
            />

            <AnchoredPicker anchorEl={open && !disabled ? inputEl : null} onClose={close} width={280} maxHeight={300}>
                <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
                    {options.length === 0 && (
                        <div className="px-2 py-3 text-center text-[12px] text-slate-400 dark:text-white/50">
                            {t('address.countryEmpty')}
                        </div>
                    )}
                    {options.map((option, index) => (
                        <Fragment key={option.code}>
                            {/* Trennlinie genau einmal: dort, wo die häufigen Länder enden. */}
                            {index > 0 && option.common !== options[index - 1].common && (
                                <>
                                    <div className="mx-2 mt-1 h-px bg-[#07145c] dark:bg-[#d48f16]" />
                                    <div className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                                        {t('address.countryAll')}
                                    </div>
                                </>
                            )}
                            <button
                                type="button"
                                title={option.name}
                                // pointerdown statt click: läuft vor dem Blur des Feldes.
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    commit(option);
                                }}
                                className={`ofi-option-row group flex w-full items-center gap-2 px-2 py-1 text-left transition-colors ${
                                    index === activeIndex ? 'is-active' : ''
                                }`}
                            >
                                <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-900 group-hover:!text-white dark:text-white">
                                    {option.name}
                                </span>
                                <span className="shrink-0 font-mono text-[11px] text-slate-400 group-hover:!text-white/70">
                                    {option.dial}
                                </span>
                            </button>
                        </Fragment>
                    ))}
                </div>
            </AnchoredPicker>
        </>
    );
};
