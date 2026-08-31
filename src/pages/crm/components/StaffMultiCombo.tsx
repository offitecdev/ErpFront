import { useState } from 'react';

import { X as XIcon } from '@/components/icons/antIconCompat';
import { PersonAvatar } from '@/components/ui-shared/PersonAvatar';
import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import { ComboCell } from '@/pages/inventory/components/ComboCell';
import { useStaffDirectory } from '../hooks/useStaffDirectory';
import { personName } from '../utils/crmFormat.utils';

/**
 * Verantwortliche wählen — MEHRERE Personen (18.08.2026). Dieselbe Bedienung
 * wie die Kundenwahl: ein Tippfeld mit Vorschlagsliste, jede Wahl landet als
 * Chip ÜBER dem Feld (die offene Liste verdeckt sie so nie), das ×  am Chip
 * nimmt sie wieder heraus. Die Liste bleibt nach einer Wahl offen, damit die
 * nächste Person gleich folgen kann; die Zahl der Gewählten steht daneben.
 *
 * Quelle ist der Personalverzeichnis-Endpunkt (auth-only, siehe
 * useStaffDirectory) — nicht die HR-Liste, die ohne `employees.view` leer wäre.
 */
export const StaffMultiCombo = ({ value, onChange, placeholder, disabled, compact = false, z }: {
    /** Gewählte Personen (id + Name reichen; die Liste ergänzt E-Mail/Rolle). */
    value: Array<{ id: string; firstName: string; lastName: string }>;
    onChange: (next: Array<{ id: string; firstName: string; lastName: string }>) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Kleinere Chips (Tabellenzelle / Popup). */
    compact?: boolean;
    /** Stapelhöhe der Vorschlagsliste über einem Fenster. */
    z?: number;
}) => {
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);
    const { staff, loading } = useStaffDirectory(open || value.length > 0);
    const needle = text.trim().toLowerCase();
    const chosen = new Set(value.map((person) => person.id));
    const pool = staff
        .filter((row) => !chosen.has(row.id))
        .filter((row) => !needle
            || personName(row).toLowerCase().includes(needle)
            || (row.email || '').toLowerCase().includes(needle)
            || (row.roleName || '').toLowerCase().includes(needle))
        .slice(0, 7);

    const add = (row: StaffDirectoryRow) => {
        if (chosen.has(row.id)) return;
        onChange([...value, { id: row.id, firstName: row.firstName, lastName: row.lastName }]);
        setText('');
    };

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            {value.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {value.map((person) => (
                        <span
                            key={person.id}
                            className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-1 pr-1 font-medium text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-white/85 ${compact ? 'h-6 text-[11px]' : 'h-7 text-[12px]'}`}
                        >
                            <PersonAvatar id={person.id} name={personName(person)} size={compact ? 18 : 20} ring={false} tone="subtle" />
                            <span className="max-w-[160px] truncate">{personName(person)}</span>
                            {!disabled && (
                                <button
                                    type="button"
                                    aria-label={t('common.delete')}
                                    onClick={() => onChange(value.filter((row) => row.id !== person.id))}
                                    className="flex size-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-white/15 dark:hover:text-white"
                                >
                                    <XIcon size={10} />
                                </button>
                            )}
                        </span>
                    ))}
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-white/40">
                        {t('calendar.picker.selectedCount', { count: value.length })}
                    </span>
                </div>
            )}
            {!disabled && (
                <ComboCell
                    open={open}
                    onOpenChange={setOpen}
                    value={text}
                    onChange={setText}
                    options={pool.map((row) => ({ id: row.id, label: personName(row), meta: row.roleName || row.email || '' }))}
                    loading={loading && pool.length === 0}
                    onSelect={(option) => {
                        const row = staff.find((item) => item.id === option.id);
                        if (row) add(row);
                    }}
                    placeholder={placeholder ?? t('crm.tasks.assigneesPlaceholder')}
                    emptyText={t('calendar.picker.noPeople')}
                    keepOpenOnSelect
                    listWidth={z ? 320 : 300}
                />
            )}
        </div>
    );
};
