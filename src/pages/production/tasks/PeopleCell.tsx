import { useState } from 'react';
import { UserPlus } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { StaffDirectoryRow } from '@/lib/api/directory';
import type { TaskPerson } from '@/types/productionTasks';

import { PersonPicker } from './PersonPicker';
import { initialsOf, shortName } from './taskModel';

/** Wie viele Namen eine Zeile zeigt — der Rest steht als «+n» (Tipp: alle). */
const VISIBLE = 2;

const sameSet = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && left.every((id) => right.includes(id));

export type PersonNames = ReadonlyMap<string, TaskPerson>;

/** Die Kapseln der Personen einer Aufgabe — Namenspunkt + kurzer Name. */
export const PersonChips = ({ ids, names, meId }: { ids: readonly string[]; names: PersonNames; meId?: string | null }) => {
    // Die lesende Person steht vorn — sie soll sich nie hinter «+n» suchen müssen.
    const ordered = meId && ids.includes(meId) ? [meId, ...ids.filter((id) => id !== meId)] : ids;
    const people = ordered.map((id) => names.get(id) ?? { id, name: '…', active: true });
    const visible = people.slice(0, VISIBLE);
    const hidden = people.length - visible.length;
    return (
        <span className="ofi-ptk-chips" title={people.map((person) => person.name).join(', ')}>
            {visible.map((person) => (
                <span
                    key={person.id}
                    className={`ofi-ptk-person ${person.id === meId ? 'is-me' : ''} ${person.active ? '' : 'is-inactive'}`}
                >
                    <span className="ofi-ptk-person__dot" aria-hidden>{initialsOf(person.name)}</span>
                    <span className="ofi-ptk-person__name">{shortName(person.name)}</span>
                </span>
            ))}
            {hidden > 0 && <span className="ofi-ptk-person is-more">+{hidden}</span>}
        </span>
    );
};

/**
 * Die Personen einer Aufgabe — «kişi ataması». Bearbeitbar ein Knopf, der die
 * Auswahl öffnet; die Häkchen gelten erst beim Schliessen (EIN Speichern je
 * Öffnen, nicht eines je Häkchen). Ohne Recht nur die Kapseln.
 */
export const PeopleCell = ({
    ids,
    names,
    editable,
    staff,
    staffLoading,
    meId,
    onCommit,
    busy,
}: {
    ids: readonly string[];
    names: PersonNames;
    editable: boolean;
    staff: StaffDirectoryRow[];
    staffLoading: boolean;
    meId?: string | null;
    onCommit?: (next: string[]) => void;
    busy?: boolean;
}) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [draft, setDraft] = useState<string[] | null>(null);
    const shown = draft ?? ids;

    if (!editable || !onCommit) {
        return (
            <span className="ofi-ptk-people is-static">
                {shown.length ? <PersonChips ids={shown} names={names} meId={meId} /> : <span className="ofi-ptk-people__none">—</span>}
            </span>
        );
    }

    const close = () => {
        const next = draft;
        setAnchor(null);
        setDraft(null);
        if (next && !sameSet(next, ids)) onCommit(next);
    };

    return (
        <>
            <button
                type="button"
                className={`ofi-ptk-people ofi-nosize ${shown.length ? '' : 'is-empty'} ${anchor ? 'is-open' : ''} ${busy ? 'is-busy' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={Boolean(anchor)}
                title={shown.length ? t('productionTasks.people.change') : t('productionTasks.people.assign')}
                onClick={(event) => {
                    setDraft([...ids]);
                    setAnchor(event.currentTarget);
                }}
            >
                {shown.length ? (
                    <PersonChips ids={shown} names={names} meId={meId} />
                ) : (
                    <>
                        <UserPlus aria-hidden />
                        <span>{t('productionTasks.people.assign')}</span>
                    </>
                )}
            </button>
            {anchor && (
                <PersonPicker
                    anchorEl={anchor}
                    staff={staff}
                    loading={staffLoading}
                    selected={shown}
                    onChange={setDraft}
                    onClose={close}
                />
            )}
        </>
    );
};
