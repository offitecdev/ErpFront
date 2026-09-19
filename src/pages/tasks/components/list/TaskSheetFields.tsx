import { useState, type ReactNode } from 'react';
import { LuPlus, LuX } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { LabelDto, PeopleMap } from '@/types/tasksModule';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { personName } from '../../utils/taskFormat';
import { LabelPicker } from '../shared/LabelPicker';
import { PeoplePicker } from '../shared/PeoplePicker';
import { LabelChip } from '../shared/TaskMarks';

/* Bausteine des Aufgabenfensters: beschriftete Zeile (Mac-Formular: Wort
   links, Feld rechts, beide auf einer Mittellinie) und die zwei Chip-Felder
   für Personen und Etiketten. */

const NO_LABELS: LabelDto[] = [];

export const SheetRow = ({
    label,
    required = false,
    error,
    children,
}: {
    label: string;
    required?: boolean;
    error?: string | null;
    children: ReactNode;
}) => (
    <div className="ofi-gv-list-sheet__row">
        <span className="ofi-gv-list-sheet__label">
            {label}
            {required && <span className="ofi-tp-required" aria-hidden> *</span>}
        </span>
        <div className="ofi-gv-list-sheet__value">
            {children}
            {error && <div className="ofi-gv-list-sheet__error" role="alert">{error}</div>}
        </div>
    </div>
);

export const AssigneeChips = ({
    ids,
    people,
    onChange,
    selfId,
    canPick = true,
}: {
    ids: string[];
    /** Namen aus der Aufgabe; neu Gewählte kommen aus dem Verzeichnis. */
    people: PeopleMap;
    onChange: (next: string[]) => void;
    /** Neu anlegen: die eigene Person steht fest vorne — der Server trägt sie immer ein. */
    selfId?: string;
    /** Weitere Personen wählen (nur die Leitung). */
    canPick?: boolean;
}) => {
    const directory = useTasksModuleStore((state) => state.directory);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const nameOf = (id: string) => directory?.find((person) => person.id === id)?.name ?? personName(people, id);

    return (
        <div className="ofi-gv-list-sheet__chips">
            {selfId && (
                <span className="ofi-gv-list-person is-self" title={t('tasksModule.list.sheet.selfAssignedHint')}>
                    <span className="ofi-gv-list-person__name">{t('tasksModule.list.sheet.selfAssigned')}</span>
                </span>
            )}
            {ids.filter((id) => id !== selfId).map((id) => (
                <span key={id} className="ofi-gv-list-person">
                    <span className="ofi-gv-list-person__name">{nameOf(id)}</span>
                    <button
                        type="button"
                        className="ofi-gv-label__remove ofi-btn-plain"
                        aria-label={t('tasksModule.list.sheet.removePerson', { name: nameOf(id) })}
                        onClick={() => onChange(ids.filter((value) => value !== id))}
                    >
                        <LuX size={11} />
                    </button>
                </span>
            ))}
            {canPick && (
                <>
                    <button
                        type="button"
                        className="ofi-gv-add ofi-btn-plain"
                        aria-haspopup="listbox"
                        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
                    >
                        <LuPlus size={12} aria-hidden />
                        {t('tasksModule.list.sheet.addPerson')}
                    </button>
                    <PeoplePicker
                        anchorEl={anchor}
                        onClose={() => setAnchor(null)}
                        selected={ids}
                        onChange={onChange}
                        excludeIds={selfId ? [selfId] : undefined}
                        multiple
                    />
                </>
            )}
        </div>
    );
};

export const LabelChips = ({ ids, onChange }: { ids: string[]; onChange: (next: string[]) => void }) => {
    const labels = useTasksModuleStore((state) => state.bootstrap?.labels) ?? NO_LABELS;
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);

    return (
        <div className="ofi-gv-list-sheet__chips">
            {ids.map((id) => {
                const label = labels.find((item) => item.id === id);
                return label
                    ? <LabelChip key={id} label={label} onRemove={() => onChange(ids.filter((value) => value !== id))} />
                    : null;
            })}
            <button
                type="button"
                className="ofi-gv-add ofi-btn-plain"
                aria-haspopup="listbox"
                onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
            >
                <LuPlus size={12} aria-hidden />
                {t('tasksModule.list.sheet.addLabel')}
            </button>
            <LabelPicker anchorEl={anchor} onClose={() => setAnchor(null)} selected={ids} onChange={onChange} />
        </div>
    );
};
