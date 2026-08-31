/**
 * Schlichter Ein/Aus-Schalter (kein antd): dieselbe Bauart wie der
 * Dunkelmodus-Schalter im Profilmenü. `label` ist nur für Screenreader —
 * der sichtbare Text steht daneben in der aufrufenden Zeile.
 */
export const Switch = ({
    checked,
    onChange,
    label,
    disabled = false,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    disabled?: boolean;
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        // Die Farben stehen auf `.ofi-switch` (index.css / dark.css), NICHT als
        // `bg-[#272f67]`-Utility: die Klasse würde die Markenbutton-Regeln ziehen
        // (Radius 0, Rahmen, Hover-Orange) — der Schalter wurde so zum
        // blauen Kasten ohne Knopf, sobald er eingeschaltet war.
        className="ofi-switch relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    >
        <span
            // bg-[#fff] statt bg-white: dark.css färbt .bg-white auf die Kartenfarbe um,
            // der Knopf wäre im Dunkelmodus unsichtbar.
            className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-[#fff] shadow-sm transition-transform duration-150 ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
    </button>
);
