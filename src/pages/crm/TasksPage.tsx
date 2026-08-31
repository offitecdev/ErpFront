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
 * "Nicht erledigt" links, "Erledigt" rechts, beide füllen ihre Hälfte des
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
 * Ein Klick auf eine Karte öffnet die Erledigungskarte als POPUP mit zwei
 * Reitern — Angaben, und Notizen mit Bildern. Keine neue Seite. Angelegt wird
 * über "Neue Aufgabe" mit Datumswahl im Formular.
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
    const [customer, setCustomer] = useState<TaskCustomerPick | null>(null);
    /* Der Mitarbeiterfilter: leer heisst alle. Er verschärft die gewählte
       Sicht, statt sie zu ersetzen (siehe TaskBoardBar). */
    const [staff, setStaff] = useState<TaskStaffPick | null>(null);
    const [quickOpen, setQuickOpen] = useState(false);
    const [picked, setPicked] = useState<{ id: string; anchor: FloatAnchor } | null>(null);

    const board = useTaskBoard({ range, scope, customerId: customer?.id, assigneeId: staff?.id });

    // Die geöffnete Karte kommt aus der frischen Liste, nicht aus dem Zustand des
    // Klicks — sonst zeigte das Popup nach dem Abhaken noch den alten Stand.
    const pickedTask: CrmTaskRow | null = picked ? board.tasks.find((row) => row.id === picked.id) ?? null : null;

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
                alle, getippt kommen die ersten sieben Personen als Fenster. */}
            <TaskBoardBar range={range} onRange={setRange} scope={scope} onScope={setScope} staff={staff} onStaff={setStaff}>
                {/* Der Kundenfilter ist DASSELBE Feld wie der Mitarbeiterfilter
                    daneben (Vorgabe 19.08.2026) — nur die Quelle der Vorschlaege
                    ist eine andere. Er steht weiterhin nur denen offen, die die
                    Kundenkartei sehen duerfen. */}
                {canSeeAll && <TaskCustomerFilter value={customer} onChange={setCustomer} />}
            </TaskBoardBar>

            <TaskBoard
                key={`${range.from}:${range.to}:${scope}:${staff?.id ?? ''}:${customer?.id ?? ''}`}
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
                onMoveToDay={board.moveToDay}
                onDeleted={(task) => void board.remove(task)}
                onChanged={board.setNoteCount}
            />

            <NewTaskCard open={quickOpen} onClose={() => setQuickOpen(false)} onSaved={() => void board.reload()} />
        </div>
    );
};
