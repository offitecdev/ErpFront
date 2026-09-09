import type { ReactNode } from 'react';

import { FilterBar, FilterSlot } from '@/components/ui-shared/TableKit';
import { QuoteDatePicker } from '@/pages/sales/detail/components/common/QuoteDatePicker';

/**
 * Filterleiste über den CRM-Tabellen. Sie ist inzwischen nur noch der CRM-Name
 * für die hausweite Leiste (`FilterBar` aus ui-shared/TableKit): Mass, Abstand
 * und Umbruch stehen an EINER Stelle, in styles/controls.css. Vorher trug sie
 * ihre eigene Klassenkette und stand damit 36px hoch, während die Suche daneben
 * 38px und der Knopf dahinter 40px mass.
 */

/** Das Mass jedes Filterfeldes — dasselbe wie das des Suchfeldes daneben. */
export const CRM_FILTER_CONTROL_CLASS = 'ofi-filter';

export const CrmFilterBar = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
    <FilterBar end={action}>{children}</FilterBar>
);

/** Auswahlfeld der Filterleiste — bewusst nativ, damit es exakt so hoch ist wie die Suche. */
export const CrmFilterSelect = ({
    value,
    onChange,
    label,
    options,
    allLabel,
    className = '',
}: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    options: Array<{ value: string; label: string }>;
    allLabel: string;
    className?: string;
}) => (
    <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={`${CRM_FILTER_CONTROL_CLASS} ${className}`}
    >
        <option value="">{allLabel}</option>
        {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
        ))}
    </select>
);

/**
 * Datumsfeld der Filterleiste (von / bis). Bewusst der QuoteDatePicker und
 * NICHT `<input type="date">`: das native Feld zeigt Format und Kalender in
 * der Sprache des Browsers ("gg.aa.yyyy" auf einer türkischen Installation),
 * also mitten in einer deutschen Oberfläche eine zweite Sprache. Der Picker
 * schreibt DD.MM.YYYY in der Sprache der Anwendung.
 */
export const CrmFilterDate = ({
    value,
    onChange,
    label,
}: {
    value: string;
    onChange: (value: string) => void;
    label: string;
}) => (
    // `ofi-btn-plain`: der Auslöser des Wählers ist ein `<button>`, und
    // styles/buttons.css würde ihn sonst zum Handlungsknopf aufblasen. Das Mass
    // kommt stattdessen aus `button.ofi-filter` (styles/controls.css) — dasselbe
    // wie beim `<select>` daneben.
    <FilterSlot>
        <QuoteDatePicker
            value={value}
            onChange={onChange}
            ariaLabel={label}
            placeholder={label}
            className={`${CRM_FILTER_CONTROL_CLASS} ofi-btn-plain ofi-nosize`}
        />
    </FilterSlot>
);
