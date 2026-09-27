import { forwardRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ChevronsUpDown, Plus, Search, X } from 'lucide-react';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { MacSelectionCheck } from '@/components/ui-shared/MacSelectionParts';
import { t } from '@/i18n/translate';

/**
 * ── DIE BAUSTEINE DER AUSWAHL (Depo, 26.09.2026) ────────────────────────────
 *
 * Vorgabe Samet: «malzeme grubu birden fazla seçilebilmeli (gmbh'deki ürün
 * ekranında tedarikçi seçiminde olan bir component var ya, onun tasarımını
 * kullan)». Das ist `SupplierMultiSelect` der Produktkarte im Lager: ein
 * Token-Feld (NSTokenField) mit blauen Kapseln und einem runden «+», dahinter
 * die gläserne macOS-Auswahl (styles/macSelection.css) mit Suchfeld,
 * Häkchenkästchen und jeder zweiten Zeile grau. Das Lager selbst bleibt
 * unberührt — hier stehen dieselben Formen für das Depo, einmal gebaut und
 * dreimal benutzt: Materialgruppen (mehrfach), Gruppe und Lieferant der Karte
 * (einfach).
 */

export interface TokenItem {
    key: string;
    label: string;
    /** Kleiner Zusatz in der Kapsel, z. B. «neu». */
    note?: string;
}

/**
 * Das Token-Feld: Kapseln, rechts das «+»; ein Klick irgendwo öffnet die
 * Auswahl. Ist bei der Einfachauswahl schon etwas gewählt, steht statt des
 * «+» nur ein leiser Pfeil (Vorgabe im Lager: «başka + tuşu olmasın») — er
 * bleibt der Weg der Tastatur.
 */
export const TokenField = forwardRef<HTMLDivElement, {
    open: boolean;
    size: 'toolbar' | 'field';
    /** Vorangestellte Beschriftung (nur in der Werkzeugzeile). */
    label?: string;
    placeholder: string;
    tokens: TokenItem[];
    /** Höchstens so viele Kapseln, der Rest als «+n». */
    maxVisible?: number;
    onOpen: () => void;
    onRemove?: (key: string) => void;
    disabled?: boolean;
    ariaLabel: string;
    /** Einfachauswahl: gefüllt → Pfeil statt «+». */
    single?: boolean;
    /** Roter Rand (Fehler beim Speichern). */
    invalid?: boolean;
}>(({ open, size, label, placeholder, tokens, maxVisible, onOpen, onRemove, disabled, ariaLabel, single, invalid }, ref) => {
    const visible = maxVisible && tokens.length > maxVisible ? tokens.slice(0, maxVisible) : tokens;
    const hidden = tokens.length - visible.length;
    const openFromField = (event: MouseEvent<HTMLDivElement>) => {
        if (disabled) return;
        if ((event.target as HTMLElement).closest('button')) return;
        onOpen();
    };
    return (
        <div
            ref={ref}
            role="group"
            aria-label={ariaLabel}
            className={`ofi-wh-tokens is-${size} ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${invalid ? 'is-invalid' : ''}`}
            onClick={openFromField}
        >
            {label && !tokens.length && <span className="ofi-wh-tokens__label">{label}</span>}
            {tokens.length ? (
                <span className="ofi-wh-tokens__list">
                    {visible.map((token) => (
                        <span key={token.key} className={`ofi-wh-token ${onRemove && !disabled ? '' : 'is-plain'}`} title={token.label}>
                            <span>{token.label}</span>
                            {token.note && <em>{token.note}</em>}
                            {onRemove && !disabled && (
                                <button
                                    type="button"
                                    className="ofi-nosize"
                                    aria-label={t('warehouse.groups.removeToken', { name: token.label })}
                                    onClick={() => onRemove(token.key)}
                                >
                                    <X />
                                </button>
                            )}
                        </span>
                    ))}
                    {hidden > 0 && <span className="ofi-wh-token is-more">+{hidden}</span>}
                </span>
            ) : (
                <span className="ofi-wh-tokens__placeholder">{label ? '' : placeholder}</span>
            )}
            {!disabled && (
                <button
                    type="button"
                    className="ofi-wh-tokens__open ofi-nosize"
                    aria-label={ariaLabel}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    onClick={onOpen}
                    onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                        if (event.key === 'ArrowDown') { event.preventDefault(); onOpen(); }
                    }}
                >
                    {single && tokens.length ? <ChevronsUpDown /> : <Plus />}
                </button>
            )}
        </div>
    );
});
TokenField.displayName = 'TokenField';

/** Die gläserne Auswahl unter dem Feld: Suchfeld oben, Liste, optional Fuss. */
export const PickerPanel = ({
    anchorEl,
    onClose,
    width = 320,
    query,
    onQuery,
    searchPlaceholder,
    footer,
    ariaLabel,
    onSearchKeyDown,
    children,
}: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    width?: number;
    query?: string;
    onQuery?: (value: string) => void;
    searchPlaceholder?: string;
    footer?: ReactNode;
    ariaLabel: string;
    onSearchKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
    children: ReactNode;
}) => (
    <AnchoredPicker
        anchorEl={anchorEl}
        onClose={onClose}
        width={width}
        maxHeight={340}
        exactWidth
        arrow
        ariaLabel={ariaLabel}
        panelClassName="ofi-gv-picker ofi-mac-selection ofi-wh-picker"
        footer={footer}
    >
        {onQuery && (
            <div className="ofi-gv-picker__search">
                <Search size={15} />
                <input
                    className="ofi-cal-input"
                    value={query ?? ''}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    onChange={(event) => onQuery(event.target.value)}
                    onKeyDown={onSearchKeyDown}
                />
            </div>
        )}
        <div className="ofi-gv-picker__list" role="listbox">{children}</div>
    </AnchoredPicker>
);

/** Eine Zeile der Auswahl: Häkchenkästchen, Name (+ Unterzeile), Hinweis rechts. */
export const PickerRow = ({
    selected,
    onSelect,
    main,
    sub,
    hint,
    disabled,
    check = true,
}: {
    selected: boolean;
    onSelect: () => void;
    main: ReactNode;
    sub?: ReactNode;
    hint?: ReactNode;
    disabled?: boolean;
    check?: boolean;
}) => (
    <button
        type="button"
        role="option"
        aria-selected={selected}
        disabled={disabled}
        className="ofi-gv-picker__row"
        onClick={onSelect}
    >
        {check && <MacSelectionCheck selected={selected} />}
        <span className="ofi-gv-picker__name">
            <span className="ofi-wh-picker__main">{main}</span>
            {sub && <span className="ofi-wh-picker__sub">{sub}</span>}
        </span>
        {hint !== undefined && hint !== null && hint !== '' && <span className="ofi-gv-picker__hint">{hint}</span>}
    </button>
);

/** Die Zeile «+ … anlegen / verwenden» — in Systemblau. */
export const PickerCreateRow = ({ label, onCreate, disabled }: { label: string; onCreate: () => void; disabled?: boolean }) => (
    <button type="button" className="ofi-gv-picker__row ofi-wh-picker__new" onClick={onCreate} disabled={disabled}>
        <span className="ofi-wh-picker__plus"><Plus /></span>
        <span className="ofi-gv-picker__name"><span className="ofi-wh-picker__main">{label}</span></span>
    </button>
);

export const PickerState = ({ children }: { children: ReactNode }) => (
    <div className="ofi-wh-picker__state">{children}</div>
);
