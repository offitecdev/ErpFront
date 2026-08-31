import type { ReactNode } from 'react';

import { QuoteDatePicker } from '@/pages/sales/detail/components/common/QuoteDatePicker';

/**
 * Filterleiste über den CRM-Tabellen. Hält die Steuerelemente aller CRM-Seiten
 * auf einer Höhe und in einer Reihe — die Seiten selbst bestimmen nur, WELCHE
 * Felder darin stehen.
 */

export const CRM_FILTER_CONTROL_CLASS =
    'h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white';

export const CrmFilterBar = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
    <div className="flex flex-wrap items-center gap-2">
        {children}
        {action && <div className="ml-auto">{action}</div>}
    </div>
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
    <div className="w-[132px]">
        <QuoteDatePicker
            value={value}
            onChange={onChange}
            ariaLabel={label}
            placeholder={label}
            className={CRM_FILTER_CONTROL_CLASS}
        />
    </div>
);
