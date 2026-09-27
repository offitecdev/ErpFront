import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { MacSelectionCheck } from '@/components/ui-shared/MacSelectionParts';
import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';

import { staffName } from './taskModel';

/**
 * ── KİŞİ ATA (26.09.2026) ───────────────────────────────────────────────────
 *
 * «Sadece kişi atamaları … kişilere özel atandığında gelmesi lazım.»
 * Die gläserne macOS-Auswahl der Anwendung (styles/macSelection.css) am
 * Auslöser: Suchfeld, Häkchenkästchen, jede zweite Zeile grau. Mehrfach —
 * ein Klick hakt an oder ab, ohne zu schliessen; «Tamam» oder ein Klick
 * daneben schliesst. Die Leute kommen aus dem Personalverzeichnis der
 * GEWÄHLTEN Firma (/employees/directory) — genau die, die der Server annimmt.
 */
export const PersonPicker = ({
    anchorEl,
    staff,
    loading,
    selected,
    onChange,
    onClose,
}: {
    anchorEl: HTMLElement | null;
    staff: StaffDirectoryRow[];
    loading: boolean;
    selected: readonly string[];
    onChange: (next: string[]) => void;
    onClose: () => void;
}) => {
    const [query, setQuery] = useState('');

    const rows = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('tr-TR');
        return staff
            .map((row) => ({ row, name: staffName(row) }))
            .filter(({ row, name }) => !needle
                || name.toLocaleLowerCase('tr-TR').includes(needle)
                || (row.roleName ?? '').toLocaleLowerCase('tr-TR').includes(needle)
                || (row.title ?? '').toLocaleLowerCase('tr-TR').includes(needle))
            .sort((left, right) => left.name.localeCompare(right.name, 'tr'));
    }, [staff, query]);

    const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

    return (
        <AnchoredPicker
            anchorEl={anchorEl}
            onClose={onClose}
            width={300}
            maxHeight={340}
            exactWidth
            arrow
            ariaLabel={t('productionTasks.people.pick')}
            panelClassName="ofi-gv-picker ofi-mac-selection ofi-ptk-picker"
            footer={(
                <div className="ofi-mac-selection__footer">
                    <button type="button" disabled={!selected.length} onClick={() => onChange([])}>
                        {t('productionTasks.people.clear')}
                    </button>
                    <button type="button" onClick={() => { anchorEl?.focus(); onClose(); }}>
                        {t('productionTasks.people.done')}
                    </button>
                </div>
            )}
        >
            <div className="ofi-gv-picker__search">
                <Search size={15} aria-hidden />
                <input
                    className="ofi-cal-input"
                    value={query}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('productionTasks.people.search')}
                    aria-label={t('productionTasks.people.search')}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        // Enter übernimmt den einzigen Treffer — schnell per Tastatur.
                        if (event.key === 'Enter' && rows.length === 1) {
                            event.preventDefault();
                            toggle(rows[0].row.id);
                        }
                    }}
                />
            </div>
            <div className="ofi-gv-picker__list" role="listbox" aria-multiselectable="true" aria-label={t('productionTasks.people.pick')}>
                {loading && !staff.length && <div className="ofi-ptk-picker__state">{t('productionTasks.people.loading')}</div>}
                {!loading && !rows.length && <div className="ofi-ptk-picker__state">{t('productionTasks.people.noneFound')}</div>}
                {rows.map(({ row, name }) => {
                    const active = selected.includes(row.id);
                    return (
                        <button
                            key={row.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className="ofi-gv-picker__row"
                            onClick={() => toggle(row.id)}
                        >
                            <MacSelectionCheck selected={active} />
                            <span className="ofi-gv-picker__name">{name || row.email || row.id}</span>
                            {(row.roleName || row.title) && <span className="ofi-gv-picker__hint">{row.roleName || row.title}</span>}
                        </button>
                    );
                })}
            </div>
        </AnchoredPicker>
    );
};
