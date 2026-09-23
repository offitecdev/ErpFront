import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Check, Plus, SearchLg } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { MacSelectionCheck, MacSelectionFooter } from '@/components/ui-shared/MacSelectionParts';
import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import { useIsTasksManager, useTasksModuleStore } from '../../store/tasksModuleStore';
import type { LabelDto } from '@/types/tasksModule';

/* Feste leere Liste: ein Selektor, der jedes Mal `[]` neu baut, liesse zustand endlos neu zeichnen. */
const NO_LABELS: LabelDto[] = [];

/**
 * Etikettenauswahl: hakt Etiketten der Firma an und ab (ohne zu schliessen).
 * Die Leitung kann aus dem Suchbegriff direkt ein neues Etikett anlegen
 * («Yeni etiket oluştur» wie Görevly) — es ist danach sofort angehakt.
 */
export const LabelPicker = ({
    anchorEl,
    onClose,
    selected,
    onChange,
    macSelection = false,
}: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    selected: readonly string[];
    onChange: (next: string[]) => void;
    macSelection?: boolean;
}) => {
    const labels = useTasksModuleStore((state) => state.bootstrap?.labels) ?? NO_LABELS;
    const setLabels = useTasksModuleStore((state) => state.setLabels);
    const isManager = useIsTasksManager();
    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => { if (!anchorEl) setQuery(''); }, [anchorEl]);

    const needle = query.trim().toLocaleLowerCase();
    const visible = useMemo(
        () => labels.filter((label) => !needle || label.name.toLocaleLowerCase().includes(needle)),
        [labels, needle],
    );
    const exactExists = labels.some((label) => label.name.toLocaleLowerCase() === needle);

    const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

    const create = async () => {
        const name = query.trim();
        if (!name || creating) return;
        setCreating(true);
        try {
            const label = await tasksApi.createLabel(name);
            setLabels([...labels, label].sort((a, b) => a.name.localeCompare(b.name)));
            onChange([...selected, label.id]);
            setQuery('');
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setCreating(false);
        }
    };

    return (
        <AnchoredPicker
            anchorEl={anchorEl} onClose={onClose} width={macSelection ? 300 : 260} maxHeight={340}
            panelClassName={`ofi-gv-picker${macSelection ? ' ofi-mac-selection' : ''}`}
            arrow={macSelection} exactWidth={macSelection} ariaLabel={t('tasksModule.labels.search')}
            footer={macSelection ? <MacSelectionFooter
                allSelected={visible.every((label) => selected.includes(label.id))}
                onSelectAll={() => onChange([...new Set([...selected, ...visible.map((label) => label.id)])])}
                onClose={() => { anchorEl?.focus(); onClose(); }}
            /> : undefined}
        >
            <div className="ofi-gv-picker__search">
                {macSelection && <SearchLg size={15} aria-hidden />}
                <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && isManager && needle && !exactExists) {
                            event.preventDefault();
                            void create();
                        }
                    }}
                    placeholder={t('tasksModule.labels.search')}
                    aria-label={t('tasksModule.labels.search')}
                    className="ofi-cal-input w-full"
                />
            </div>
            <div className="ofi-gv-picker__list" role="listbox" aria-label={t('tasksModule.labels.search')} aria-multiselectable>
                {!visible.length && !(isManager && needle) && (
                    <div className="ofi-gv-picker__hint px-2 py-3">{t('tasksModule.labels.none')}</div>
                )}
                {visible.map((label) => {
                    const active = selected.includes(label.id);
                    return (
                        <button
                            key={label.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            // Gewählt = Haken, nicht Füllung: sonst sähe das Überfahren wie Auswahl aus
                            // (14.09.2026, Samet: «etiketlerin hoverları görünmüyor»).
                            className="ofi-option-row ofi-gv-picker__row"
                            onClick={() => toggle(label.id)}
                        >
                            {macSelection && <MacSelectionCheck selected={active} />}
                            <i className={`ofi-gv-picker__dot is-${label.color}`} aria-hidden />
                            <span className="ofi-gv-picker__name">{label.name}</span>
                            {active && !macSelection && <Check size={14} />}
                        </button>
                    );
                })}
                {isManager && needle && !exactExists && (
                    <button type="button" className="ofi-option-row ofi-gv-picker__row" disabled={creating} onClick={() => void create()}>
                        <Plus size={14} />
                        <span className="ofi-gv-picker__name">{t('tasksModule.labels.createNamed', { name: query.trim() })}</span>
                    </button>
                )}
            </div>
        </AnchoredPicker>
    );
};
