import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { LabelDto, PeopleMap, TaskStatus } from '@/types/tasksModule';
import { personName, statusLabel, statusTone } from '../../utils/taskFormat';

/* Kleine Marken des Moduls: Zustand, Etikett, Personen, Fortschritt. Farbe
   steht nur im Punkt oder im Text — nie als getönte Fläche (Vorgabe: «çok
   renkli olmasın»). */

export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => (
    <span className={`ofi-gv-status is-${statusTone(status)}`}>{statusLabel(status)}</span>
);

export const LabelChip = ({ label, onRemove }: { label: Pick<LabelDto, 'name' | 'color'>; onRemove?: () => void }) => (
    <span className={`ofi-gv-label is-${label.color}`}>
        <i className="ofi-gv-label__dot" aria-hidden />
        <span>{label.name}</span>
        {onRemove && (
            <button
                type="button"
                className="ofi-gv-label__remove ofi-btn-plain"
                aria-label={t('tasksModule.labels.remove', { name: label.name })}
                onClick={(event) => { event.stopPropagation(); onRemove(); }}
            >
                <X size={11} />
            </button>
        )}
    </span>
);

/** Im Aufgabenmodul keine Profilbilder (Samet, 13.09.2026): nur die Namen. */
export const PeopleNames = ({
    ids,
    people,
    max = 2,
}: {
    ids: readonly string[];
    people: PeopleMap | undefined;
    max?: number;
}) => {
    if (!ids.length) return null;
    const shown = ids.slice(0, max);
    const rest = ids.length - shown.length;
    return (
        <span className="ofi-gv-names" title={ids.map((id) => personName(people, id)).join(', ')}>
            <span className="ofi-gv-names__list">{shown.map((id) => personName(people, id)).join(', ')}</span>
            {rest > 0 && <span className="ofi-gv-names__more">+{rest}</span>}
        </span>
    );
};

export const ProgressBar = ({ done, total, className = '' }: { done: number; total: number; className?: string }) => {
    const percent = total ? Math.round((done / total) * 100) : 0;
    return (
        <span
            className={`ofi-gv-progress ${percent === 100 ? 'is-complete' : ''} ${className}`.trim()}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
        >
            <i style={{ width: `${percent}%` }} />
        </span>
    );
};
