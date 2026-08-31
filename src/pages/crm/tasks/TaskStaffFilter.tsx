import { useMemo, useState } from 'react';

import { PersonAvatar } from '@/components/ui-shared/PersonAvatar';
import { t } from '@/i18n/translate';
import { useStaffDirectory } from '../hooks/useStaffDirectory';
import { personName } from '../utils/crmFormat.utils';
import { TaskFilterCombo, type FilterComboPick } from './TaskFilterCombo';

/**
 * Der Mitarbeiterfilter des Aufgabenbretts (19.08.2026) — er steht in der
 * Filterzeile und gilt darum an BEIDEN Orten, auf /crm/tasks und im
 * Aufgabenmodus des Kalenders.
 *
 * MEHRERE PERSONEN ODER ALLE (11.09.2026, Vorgabe Samet). Leer heisst alle;
 * jede weitere Wahl legt dazu. Die Zeilen kommen aus derselben Quelle wie
 * vorher — hier drin steht nur, WOHER: die Personalliste ist kurz und liegt
 * nach dem ersten Laden im Speicher (`useStaffDirectory`), also wird im
 * Browser gefiltert statt bei jedem Tastendruck zu fragen. Quelle ist die
 * auth-freie Hausliste `/employees/directory` — die HR-Liste hängt an
 * `employees.view` und liesse das Feld für alle ohne HR-Recht leer.
 */

export type TaskStaffPick = FilterComboPick;

/** So viele Vorschläge stehen im Fenster — wie in der Kundensuche. */
const SUGGESTIONS = 7;

export const TaskStaffFilter = ({ values, onChange }: {
    values: TaskStaffPick[];
    onChange: (next: TaskStaffPick[]) => void;
}) => {
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);
    const { staff, loading } = useStaffDirectory(open || values.length > 0);

    const options = useMemo(() => {
        const query = text.trim().toLowerCase();
        const chosen = new Set(values.map((value) => value.id));
        return staff
            .map((person) => ({
                id: person.id,
                name: personName(person),
                meta: person.roleName || person.title || '',
            }))
            .filter((option) => !query
                || option.name.toLowerCase().includes(query)
                || option.meta.toLowerCase().includes(query))
            /* Das schon Gewählte steht OBEN — sonst rutschte es beim Tippen aus
               den sieben Zeilen heraus und man könnte es nicht mehr abwählen. */
            .sort((left, right) => Number(chosen.has(right.id)) - Number(chosen.has(left.id)))
            .slice(0, SUGGESTIONS)
            .map((option) => ({
                ...option,
                icon: <PersonAvatar id={option.id} name={option.name} size={22} ring={false} tone="subtle" />,
            }));
    }, [staff, text, values]);

    return (
        <TaskFilterCombo
            values={values}
            onChange={onChange}
            text={text}
            onText={setText}
            open={open}
            onOpen={setOpen}
            options={options}
            loading={loading}
            placeholder={t('crm.tasks.filterStaff')}
            emptyText={t('crm.quick.assigneeEmpty')}
            allText={t('crm.tasks.filterStaffAll')}
        />
    );
};
