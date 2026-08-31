import { useEffect, useMemo, useRef, useState } from 'react';

import { Check, ChevronDown, SearchLg } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';

/**
 * ── DAS AUSWAHLFELD DER RECHNUNGSSEITEN ──────────────────────────────────────
 *
 * Vorgabe Samet: „das Fenster, in dem wir Kunde, Projekt und so weiter wählen —
 * etwas kleiner, SIEBEN Einträge, und der Rest erscheint, während man tippt.
 * Die wählbaren Einträge sollen in Karten stehen; modern und aufgeräumt."
 *
 * Darum ist es kein `<select>` mehr: eine Pille als Knopf, darunter ein
 * schwebendes Blatt mit einem Suchfeld und den Einträgen als KARTEN. Solange
 * niemand tippt, zeigt es genau sieben — eine Liste, die man mit einem Blick
 * erfasst. Sobald getippt wird, sucht es in ALLEN Einträgen und zeigt, was
 * passt; die Fusszeile sagt, wie viele es insgesamt gibt.
 *
 * Die Tastatur kann alles: ↓/↑ wandern, Enter wählt, Esc schliesst.
 */

export interface PickerOption {
    id: string;
    label: string;
    /** Zweite Zeile der Karte (Kunde, Projektnummer …). */
    meta?: string;
}

/** So viele Karten stehen da, bevor jemand tippt (Vorgabe Samet). */
const RESTING_COUNT = 7;

/** Das Blatt wird nie höher als das — auch auf einem hohen Bildschirm. */
const SHEET_MAX = 420;
/** Was das Blatt neben der Liste noch braucht: Suchfeld, Fusszeile, Polster. */
const SHEET_CHROME = 96;

export const PickerField = ({
    value,
    options,
    onSelect,
    placeholder,
    emptyText,
    disabled,
}: {
    /** Id des gewählten Eintrags; leer = nichts gewählt. */
    value: string;
    options: PickerOption[];
    onSelect: (id: string) => void;
    placeholder: string;
    emptyText: string;
    disabled?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    const [sheetMax, setSheetMax] = useState(SHEET_MAX);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const selected = options.find((option) => option.id === value) ?? null;
    const needle = query.trim().toLowerCase();

    /* Ohne Suche: die ersten sieben. Mit Suche: alle, die passen — genau das
       ist gemeint mit „der Rest erscheint, während man tippt". */
    const shown = useMemo(() => {
        if (!needle) return options.slice(0, RESTING_COUNT);
        return options.filter((option) =>
            option.label.toLowerCase().includes(needle)
            || (option.meta || '').toLowerCase().includes(needle));
    }, [options, needle]);

    // Beim Öffnen steht der Zeiger im Suchfeld und die Wahl auf dem, was gilt.
    useEffect(() => {
        if (!open) return;
        setQuery('');
        setActiveId(value || shown[0]?.id || null);
        const focus = window.setTimeout(() => searchRef.current?.focus(), 30);
        return () => window.clearTimeout(focus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    /* Wie hoch DARF das Blatt sein? So hoch wie der Platz, der wirklich da ist —
       unterhalb oder oberhalb des Feldes, je nachdem, wo mehr ist.
       `AnchoredPicker` dreht die Richtung selbst um; ohne dieses Mass würde es
       stur 430px nach unten aufmachen und bei einem Feld im unteren Drittel
       aus dem Bild laufen. Gemessen wird beim Öffnen und danach, wenn sich
       Fenster oder Rollstand ändern. */
    useEffect(() => {
        if (!open || !anchorEl) return;
        const measure = () => {
            const rect = anchorEl.getBoundingClientRect();
            const below = window.innerHeight - rect.bottom - 16;
            const above = rect.top - 16;
            setSheetMax(Math.max(180, Math.min(SHEET_MAX, Math.max(below, above) - SHEET_CHROME)));
        };
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [open, anchorEl]);

    const choose = (id: string) => {
        onSelect(id);
        setOpen(false);
    };

    const move = (direction: 1 | -1) => {
        if (shown.length === 0) return;
        const current = shown.findIndex((option) => option.id === activeId);
        const next = Math.min(shown.length - 1, Math.max(0, (current < 0 ? -1 : current) + direction));
        const target = shown[next]!;
        setActiveId(target.id);
        // Die Liste rollt jetzt in sich — die Tastatur muss die Karte
        // nachziehen, sonst wandert die Auswahl unsichtbar weiter.
        listRef.current
            ?.querySelector(`[data-option-id="${target.id}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            move(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (event.key === 'Enter') {
            const target = shown.find((option) => option.id === activeId) ?? shown[0];
            if (target) {
                event.preventDefault();
                choose(target.id);
            }
            return;
        }
        if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
        }
    };

    const hiddenCount = needle ? 0 : Math.max(0, options.length - shown.length);

    return (
        <>
            <button
                ref={setAnchorEl}
                type="button"
                className={`ofi-invp-picker ${selected ? 'is-filled' : ''}`}
                disabled={disabled || options.length === 0}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((on) => !on)}
            >
                <span className="ofi-invp-picker__value">
                    {selected ? selected.label : (options.length === 0 ? emptyText : placeholder)}
                </span>
                <ChevronDown size={15} className="ofi-invp-picker__chev" />
            </button>

            <AnchoredPicker
                anchorEl={open ? anchorEl : null}
                onClose={() => setOpen(false)}
                width={360}
                maxHeight={sheetMax}
                panelClassName="ofi-invp-pick"
                footer={hiddenCount > 0 ? (
                    <div className="ofi-invp-pick__foot">
                        {t('invoices.pickerMore', { count: hiddenCount })}
                    </div>
                ) : undefined}
            >
                <div className="ofi-invp-pick__search">
                    <SearchLg size={15} />
                    <input
                        ref={searchRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={t('invoices.pickerSearch')}
                        autoComplete="off"
                    />
                </div>
                <div ref={listRef} className="ofi-invp-pick__list" role="listbox">
                    {shown.length === 0 && <div className="ofi-invp-pick__empty">{emptyText}</div>}
                    {shown.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            role="option"
                            data-option-id={option.id}
                            aria-selected={option.id === value}
                            className={`ofi-invp-pick__card ${option.id === value ? 'is-on' : ''} ${option.id === activeId ? 'is-active' : ''}`}
                            onMouseEnter={() => setActiveId(option.id)}
                            onClick={() => choose(option.id)}
                        >
                            <span className="ofi-invp-pick__text">
                                <span className="ofi-invp-pick__label">{option.label}</span>
                                {option.meta && <span className="ofi-invp-pick__meta">{option.meta}</span>}
                            </span>
                            {option.id === value && <Check size={15} className="ofi-invp-pick__check" />}
                        </button>
                    ))}
                </div>
            </AnchoredPicker>
        </>
    );
};
