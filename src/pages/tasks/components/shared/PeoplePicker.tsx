import { useEffect, useMemo, useState } from 'react';

import { Check, SearchLg } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { MacSelectionCheck, MacSelectionFooter } from '@/components/ui-shared/MacSelectionParts';
import { t } from '@/i18n/translate';
import type { DirectoryPerson } from '@/types/tasksModule';
import { useTasksModuleStore } from '../../store/tasksModuleStore';

/**
 * Personenauswahl des Moduls: hängt am Auslöser (AnchoredPicker), sucht im
 * Personalverzeichnis des MODULS (nur Personal der ausgewählten Firma mit
 * Zugang — GET /tasks/people/directory). `multiple` hakt an und aus, ohne zu
 * schliessen; einfach wählt und schliesst. `allowNone` bietet «Niemand» an.
 * `onlyIds` grenzt die Liste ein (z. B. Checklistenpunkt → Verantwortliche).
 */
export const PeoplePicker = ({
    anchorEl,
    onClose,
    selected,
    onChange,
    multiple = false,
    allowNone = false,
    onlyIds,
    excludeIds,
    macSelection = false,
}: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    selected: readonly string[];
    onChange: (next: string[]) => void;
    multiple?: boolean;
    allowNone?: boolean;
    onlyIds?: readonly string[];
    excludeIds?: readonly string[];
    macSelection?: boolean;
}) => {
    const loadDirectory = useTasksModuleStore((state) => state.loadDirectory);
    const directory = useTasksModuleStore((state) => state.directory);
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (anchorEl) void loadDirectory();
        else setQuery('');
    }, [anchorEl, loadDirectory]);

    const people = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        return (directory ?? []).filter((person: DirectoryPerson) =>
            (!onlyIds || onlyIds.includes(person.id))
            && !(excludeIds ?? []).includes(person.id)
            && (!needle || person.name.toLocaleLowerCase().includes(needle) || (person.title ?? '').toLocaleLowerCase().includes(needle)));
    }, [directory, query, onlyIds, excludeIds]);

    const toggle = (id: string) => {
        if (!multiple) {
            onChange([id]);
            onClose();
            return;
        }
        onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
    };

    return (
        <AnchoredPicker
            anchorEl={anchorEl} onClose={onClose} width={macSelection ? 300 : 280} maxHeight={360}
            panelClassName={`ofi-gv-picker${macSelection ? ' ofi-mac-selection' : ''}`}
            arrow={macSelection} exactWidth={macSelection} ariaLabel={t('tasksModule.people.search')}
            footer={macSelection && multiple ? <MacSelectionFooter
                allSelected={people.every((person) => selected.includes(person.id))}
                onSelectAll={() => onChange([...new Set([...selected, ...people.map((person) => person.id)])])}
                onClose={() => { anchorEl?.focus(); onClose(); }}
            /> : undefined}
        >
            <div className="ofi-gv-picker__search">
                {macSelection && <SearchLg size={15} aria-hidden />}
                <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('tasksModule.people.search')}
                    aria-label={t('tasksModule.people.search')}
                    className="ofi-cal-input w-full"
                />
            </div>
            <div className="ofi-gv-picker__list" role="listbox" aria-label={t('tasksModule.people.search')} aria-multiselectable={multiple || undefined}>
                {allowNone && (
                    <button
                        type="button"
                        className="ofi-option-row ofi-gv-picker__row"
                        onClick={() => { onChange([]); onClose(); }}
                    >
                        <span className="ofi-gv-picker__name">{t('tasksModule.people.nobody')}</span>
                        {!selected.length && <Check size={14} />}
                    </button>
                )}
                {directory === null && <div className="ofi-gv-picker__hint px-2 py-3">{t('common.loading')}</div>}
                {directory !== null && !people.length && (
                    <div className="ofi-gv-picker__hint px-2 py-3">{t('tasksModule.people.noneFound')}</div>
                )}
                {people.map((person) => {
                    const active = selected.includes(person.id);
                    return (
                        <button
                            key={person.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className="ofi-option-row ofi-gv-picker__row"
                            onClick={() => toggle(person.id)}
                        >
                            {macSelection && <MacSelectionCheck selected={active} />}
                            <span className="ofi-gv-picker__name">{person.name}</span>
                            {/* Die echte Rolle aus dem System (14.09.2026, Samet) — nicht «Yönetici» für jede Leitungsberechtigung. */}
                            {person.roleName && <span className="ofi-gv-picker__hint">{person.roleName}</span>}
                            {active && !macSelection && <Check size={14} />}
                        </button>
                    );
                })}
            </div>
        </AnchoredPicker>
    );
};
