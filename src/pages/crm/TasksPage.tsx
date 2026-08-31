import { useState } from 'react';
import { Plus } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import type { CrmTaskRow } from '@/lib/api/crm';
import type { FloatAnchor } from '@/pages/calendar/calendarShared';
import { useAuthStore } from '@/store/authStore';
import { ensureMaintenanceLocale } from '@/pages/maintenance/MaintenanceShared';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { SectionSplash } from '@/components/ui-shared/SectionSplash';
import { NewTaskCard } from './tasks/NewTaskCard';
import { TaskBoard } from './tasks/TaskBoard';
import { TaskBoardBar } from './tasks/TaskBoardBar';
import { TaskCustomerFilter, type TaskCustomerPick } from './tasks/TaskCustomerFilter';
import type { TaskStaffPick } from './tasks/TaskStaffFilter';
import { TaskCompletionCard } from './tasks/TaskCompletionCard';
import { useTaskBoard } from './tasks/useTaskBoard';
import { defaultRange, type TaskRange, type TaskScope } from './tasks/taskBoardModel';

/**
 * Aufgaben (19.08.2026) — ein BRETT aus zwei grossen Spalten (Vorgabe):
 * "Ausstehend" links, "Erledigt" rechts, beide füllen ihre Hälfte des
 * Schirms. Eine Karte in die andere Spalte zu ziehen setzt den Zustand; läuft
 * eine Spalte über, blättert sie selbst weiter.
 *
 * Der ZEITRAUM ist ein gewöhnlicher Bereich: Von und Bis, jedes mit eigenem
 * Kalenderfenster. Er gilt für beide Spalten. Die Zahlen offen/erledigt stehen
 * im Kopf des jeweiligen Abschnitts, nicht in der Filterzeile.
 *
 * Zwei Sichten, kein "Alle": "Mit mir" (ich bin verantwortlich) und "Ohne mich"
 * (ich habe zugewiesen, bin selbst nicht verantwortlich).
 *
 * FILTER IN DIE TIEFE (11.09.2026, Vorgabe Samet): Mitarbeitende UND Kunden
 * nehmen jetzt MEHRERE Einträge — leer heisst weiterhin alle, eine Wahl heisst
 * genau diese, mehrere heissen diese Gruppe. Der Zeitraum steht schon da und
 * fängt seit demselben Tag auch mehrtägige Aufgaben (Überschneidung statt
 * Endtermin).
 *
 * Ein Klick auf eine Karte öffnet die Erledigungskarte als POPUP — Angaben,
 * Anleitung, Anhänge und Notizen hinter EINER Zeichenreihe. Keine neue Seite.
 * Angelegt wird über "Neue Aufgabe" mit derselben Zeichenreihe.
 *
 * Erinnerungen haben weiterhin ihre eigene Seite.
 */
export const TasksPage = () => {
    ensureMaintenanceLocale();
    useLanguageTick();
    const user = useAuthStore((state) => state.user);
    const permissions = useAuthStore((state) => state.permissions);
    const canSeeAll = permissions.includes('crm.customers.view');
    const canCreate = permissions.includes('crm.activities.create');

    const [scope, setScope] = useState<TaskScope>('me');
    const [range, setRange] = useState<TaskRange>(() => defaultRange());
    const [customers, setCustomers] = useState<TaskCustomerPick[]>([]);
    /* Der Mitarbeiterfilter: leer heisst alle. Er verschärft die gewählte
       Sicht, statt sie zu ersetzen (siehe TaskBoardBar). */
    const [staff, setStaff] = useState<TaskStaffPick[]>([]);
    const [quickOpen, setQuickOpen] = useState(false);
    const [picked, setPicked] = useState<{ id: string; anchor: FloatAnchor } | null>(null);

    const board = useTaskBoard({
        range,
        scope,
        customerIds: customers.map((row) => row.id),
        assigneeIds: staff.map((row) => row.id),
    });

    // Die geöffnete Karte kommt aus der frischen Liste, nicht aus dem Zustand des
    // Klicks — sonst zeigte das Popup nach dem Abhaken noch den alten Stand.
    const pickedTask: CrmTaskRow | null = picked ? board.tasks.find((row) => row.id === picked.id) ?? null : null;

    // Die Filterwahl als Schlüssel: sie setzt das Brett auf Seite 1 zurück.
    const filterKey = `${customers.map((row) => row.id).join('|')}:${staff.map((row) => row.id).join('|')}`;

    return (
        /* `ofi-taskpage` drückt den Listenkopf flacher (siehe index.css): der
           Anlege-Knopf rückt nach oben, und die zwei Abschnitte bekommen die
           gewonnene Höhe (Vorgabe 19.08.2026). Der geteilte Kopf selbst bleibt
           unangetastet — die anderen Module rechnen mit seiner Höhe. */
        <div className="ofi-taskpage flex w-full flex-col gap-3">
            {/* Häkchen-Splash NUR hier (Vorgabe 17.08.2026): deckt den Bereich,
                solange der Reiter frisch geöffnet ist und die erste Ladung läuft. */}
            <SectionSplash scope="tasks" loading={board.loading} />
            <InventoryListHeader
                title={t('nav.crmTasks')}
                action={canCreate ? (
                    <button
                        type="button"
                        onClick={() => setQuickOpen(true)}
                        className="ofi-btn-brand flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1f2654]"
                    >
                        <Plus size={14} />
                        {t('crm.tasks.newTask')}
                    </button>
                ) : undefined}
            />

            {/* Der alte Auswahlknopf "Verantwortlich" ist weg (Vorgabe
                19.08.2026): er brauchte einen Eintrag "Alle Verantwortlichen",
                und ein Filter, dessen Grundzustand "alle" heisst, ist keiner.
                An seiner Stelle steht in der Leiste ein TIPPFELD: leer heisst
                alle, getippt kommen die ersten sieben Personen als Fenster —
                und seit dem 11.09.2026 nimmt es MEHRERE davon. */}
            <TaskBoardBar range={range} onRange={setRange} scope={scope} onScope={setScope} staff={staff} onStaff={setStaff}>
                {/* Der Kundenfilter ist DASSELBE Feld wie der Mitarbeiterfilter
                    daneben (Vorgabe 19.08.2026) — nur die Quelle der Vorschlaege
                    ist eine andere. Er steht weiterhin nur denen offen, die die
                    Kundenkartei sehen duerfen. */}
                {canSeeAll && <TaskCustomerFilter values={customers} onChange={setCustomers} />}
            </TaskBoardBar>

            <TaskBoard
                key={`${range.from}:${range.to}:${scope}:${filterKey}`}
                tasks={board.tasks}
                loading={board.loading}
                busyIds={board.busyIds}
                userId={user?.id}
                /* Die Karten füllen hier den Abschnitt aus (Vorgabe 19.08.2026):
                   hohe Karten in fester Reihenzahl, kein toter Streifen mehr
                   unter der letzten. Die Filterzeile darüber bleibt, wie sie
                   ist — Zeitraum, die zwei Sichten und der Kunde. */
                fill
                onSetDone={board.setDone}
                onOpen={(task, popupAnchor) => setPicked({ id: task.id, anchor: popupAnchor })}
            />

            <TaskCompletionCard
                open={Boolean(picked)}
                task={pickedTask}
                anchor={picked?.anchor ?? null}
                onClose={() => setPicked(null)}
                onSetDone={board.setDone}
                onSaveSpan={board.saveSpan}
                onDeleted={(task) => void board.remove(task)}
                onChanged={board.setNoteCount}
                onPatched={board.patchRow}
            />

            <NewTaskCard open={quickOpen} onClose={() => setQuickOpen(false)} onSaved={() => void board.reload()} />
        </div>
    );
};
