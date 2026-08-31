import { useMemo, useState } from 'react';

import { List as ListIcon } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { CustomerPickerModal } from '../components/CustomerPickerModal';
import { useCustomerLookup } from '../hooks/useCustomerLookup';
import { TaskFilterCombo, type FilterComboPick } from './TaskFilterCombo';

/**
 * Der Kundenfilter der Aufgaben-Filterzeile (19.08.2026) — DASSELBE Feld wie
 * der Mitarbeiterfilter daneben (Vorgabe): getippt wird im Feld, darunter
 * stehen die Treffer. Vorher war es ein Auswahlknopf, der ein grosses Fenster
 * öffnete; zwei Filter in einer Zeile sollen nicht zwei Bedienungen haben.
 *
 * ALLE KUNDEN, BESTIMMTE KUNDEN ODER EINER (11.09.2026, Vorgabe Samet): leer
 * heisst alle, jede weitere Wahl legt dazu. «Alle Kunden» ist darum kein
 * Eintrag, sondern der leere Zustand — und die Zeile ganz oben im Fenster, die
 * dorthin zurückführt.
 *
 * Gesucht wird beim SERVER, nicht im Speicher: die Kundenkartei ist zu lang,
 * um sie für ein Filterfeld zu laden. `useCustomerLookup` entprellt das Tippen
 * und holt genau sieben Zeilen über die schlanke Kundenliste — dieselbe
 * Abfrage wie die Kundenzelle der Tabellen-Erfassung.
 *
 * Ganz unten bleibt die grosse Auswahl: wer den Namen nicht im Kopf hat,
 * blättert weiterhin darin. Damit nimmt das Feld nichts weg.
 */

export type TaskCustomerPick = FilterComboPick;

export const TaskCustomerFilter = ({ values, onChange }: {
    values: TaskCustomerPick[];
    onChange: (next: TaskCustomerPick[]) => void;
}) => {
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);
    const [allOpen, setAllOpen] = useState(false);
    // Gefragt wird NUR, solange die Liste offen ist.
    const { items, loading } = useCustomerLookup(text, open);

    /* Die schon gewählten Kunden stehen OBEN und bleiben sichtbar, auch wenn
       die Serverantwort sie gerade nicht enthält — sonst könnte man einen
       gewählten Kunden nach dem Tippen nicht mehr abwählen. */
    const options = useMemo(() => {
        const found = items.map((customer) => ({
            id: customer.id,
            name: customer.companyName,
            meta: customer.responsibleName || undefined,
        }));
        const foundIds = new Set(found.map((option) => option.id));
        return [...values.filter((value) => !foundIds.has(value.id)), ...found];
    }, [items, values]);

    return (
        <>
            <TaskFilterCombo
                values={values}
                onChange={onChange}
                text={text}
                onText={setText}
                open={open}
                onOpen={setOpen}
                options={options}
                loading={loading}
                placeholder={t('crm.tasks.filterCustomer')}
                emptyText={t('crm.quick.noCustomer')}
                allText={t('crm.tasks.filterCustomerAll')}
                footer={(
                    <div className="py-0.5">
                        <button
                            type="button"
                            // pointerdown: vor dem Verlassen des Feldes, sonst
                            // schlösse das Fenster, bevor der Klick ankommt.
                            onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                event.preventDefault();
                                setOpen(false);
                                setAllOpen(true);
                            }}
                            className="ofi-option-action flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[12px] font-medium text-[#1f2654] transition-colors dark:text-white/80"
                        >
                            <ListIcon size={12} />
                            <span className="truncate">{t('crm.quick.customerPickTitle')}</span>
                        </button>
                    </div>
                )}
            />

            <CustomerPickerModal
                open={allOpen}
                onClose={() => setAllOpen(false)}
                onSelect={(pick) => {
                    // Aus der grossen Auswahl kommt EIN Kunde — er legt sich zu
                    // den bereits gewählten dazu, statt sie zu ersetzen.
                    onChange(values.some((value) => value.id === pick.customer.id)
                        ? values
                        : [...values, { id: pick.customer.id, name: pick.customer.companyName }]);
                }}
            />
        </>
    );
};
