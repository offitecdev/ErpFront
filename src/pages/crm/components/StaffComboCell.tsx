import { useMemo, useState } from 'react';

import { t } from '@/i18n/translate';
import { ComboCell } from '@/pages/inventory/components/ComboCell';
import { useStaffDirectory } from '../hooks/useStaffDirectory';
import { personName } from '../utils/crmFormat.utils';

/**
 * Verantwortliche Person als Tippfeld mit Vorschlägen — bewusst KEINE
 * Vorbelegung: wer verantwortlich ist, wird bewusst gewählt, nicht geerbt.
 *
 * Die Personalliste ist kurz und liegt nach dem ersten Laden im Speicher, also
 * wird hier im Browser gefiltert statt bei jedem Tastendruck zu fragen.
 */
export const StaffComboCell = ({
    value,
    selectedId,
    onChange,
    onPick,
}: {
    /** Angezeigter Text — der Name der gewählten Person oder das Getippte. */
    value: string;
    selectedId: string;
    onChange: (next: string) => void;
    onPick: (person: { id: string; name: string }) => void;
}) => {
    const [open, setOpen] = useState(false);
    const { staff, loading } = useStaffDirectory(open || Boolean(selectedId));

    const options = useMemo(() => {
        const query = value.trim().toLowerCase();
        return staff
            .map((person) => ({ id: person.id, label: personName(person), meta: person.roleName || undefined }))
            .filter((option) => !query || option.label.toLowerCase().includes(query))
            .slice(0, 7);
    }, [staff, value]);

    return (
        <ComboCell
            open={open}
            onOpenChange={setOpen}
            value={value}
            onChange={onChange}
            options={options}
            // Solange die Personalliste unterwegs ist, zeigt die Liste den
            // Ladehinweis — nicht "keine Person gefunden".
            loading={loading}
            // Leer ist erlaubt (die Person ist freiwillig); nur ein getippter
            // Name ohne Treffer wird gestrichelt dargestellt.
            invalid={Boolean(value.trim()) && !selectedId}
            placeholder={t('crm.quick.assigneeSearch')}
            emptyText={t('crm.quick.assigneeEmpty')}
            onSelect={(option) => onPick({ id: option.id, name: option.label })}
        />
    );
};
