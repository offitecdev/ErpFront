import { X } from '@/components/icons/antIconCompat';
import { DateField } from '@/components/ui-shared/DateField';
import { TimeField } from '@/components/ui-shared/TimeField';
import { t } from '@/i18n/translate';
import { dateTimeInputToIso, isoToDateInput, isoToTimeInput } from '../../utils/taskFormat';

/**
 * Zeitpunkt aus Tag + Uhrzeit (die Hausfelder DateField/TimeField). Ohne
 * gewählte Uhrzeit gilt `defaultTime` (Görevly: 18:00 für ein Ende).
 * Die Uhrzeit ist auch OHNE Tag wählbar (14.09.2026, Samet) — dann gilt heute.
 * `clearable` bietet das Leeren an — Anfang, Ende und Erinnerung dürfen fehlen.
 * Drei feste Spalten (Tag · Zeit · Leeren), damit untereinander stehende
 * Felder bündig bleiben, auch wenn eines leer ist.
 */
export const DateTimeField = ({
    value,
    onChange,
    label,
    defaultTime = '18:00',
    clearable = true,
    disabled = false,
}: {
    value: string | null;
    onChange: (next: string | null) => void;
    label: string;
    defaultTime?: string;
    clearable?: boolean;
    disabled?: boolean;
}) => {
    const day = isoToDateInput(value);
    const time = isoToTimeInput(value) || defaultTime;
    return (
        <div className={`ofi-gv-datetime ${clearable ? 'is-clearable' : ''}`}>
            <DateField
                value={day}
                ariaLabel={label}
                disabled={disabled}
                onChange={(nextDay) => onChange(nextDay ? dateTimeInputToIso(nextDay, time, defaultTime) : null)}
                className="min-w-0"
            />
            <TimeField
                label={label}
                value={time}
                disabled={disabled}
                onChange={(nextTime) => onChange(dateTimeInputToIso(day || isoToDateInput(new Date().toISOString()), nextTime, defaultTime))}
                className="ofi-cal-input ofi-gv-datetime__time"
            />
            {clearable && (value && !disabled ? (
                <button
                    type="button"
                    className="ofi-gv-iconbtn ofi-btn-plain is-small ofi-gv-datetime__clear"
                    aria-label={t('tasksModule.common.clear')}
                    title={t('tasksModule.common.clear')}
                    onClick={() => onChange(null)}
                >
                    <X size={13} />
                </button>
            ) : <span aria-hidden />)}
        </div>
    );
};
