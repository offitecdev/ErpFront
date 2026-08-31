import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { crmApi, type CrmTaskRow, type CrmTaskStatus } from '@/lib/api/crm';
import { isTaskOverdue } from '../utils/crmFormat.utils';
import { rangeWindow, type TaskRange, type TaskScope } from './taskBoardModel';

/**
 * Daten und Handgriffe des Aufgabenbretts — geteilt von /crm/tasks und dem
 * Aufgabenmodus des Kalendermoduls, damit Abhaken und Umterminieren an beiden
 * Orten dasselbe tun.
 *
 * EIN Zeitraum je Abfrage (Vorgabe 19.08.2026): jede Änderung an Von oder Bis
 * lädt neu, mit dem Fenster [von, bis + 1 Tag). Aufgaben ohne Termin liefert der
 * Server in jedem Fenster mit — sie hängen an keinem Tag und dürfen darum nie
 * unsichtbar werden.
 *
 * Alles ÖRTLICH und sofort: die Karte springt, die Anfrage läuft im
 * Hintergrund; scheitert sie, springt die Karte zurück und es gibt EINE
 * Meldung.
 */
export const useTaskBoard = ({ range, scope, customerIds, assigneeIds, enabled = true }: {
    range: TaskRange;
    scope: TaskScope;
    /* MEHRERE Kunden bzw. Personen (11.09.2026); LEER heisst alle. */
    customerIds?: string[];
    assigneeIds?: string[];
    enabled?: boolean;
}) => {
    const [tasks, setTasks] = useState<CrmTaskRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
    const [reloadTick, setReloadTick] = useState(0);

    // Das Fenster als ZEICHENKETTEN: sie sind stabile Abhängigkeiten, im
    // Gegensatz zum Objekt, das bei jedem Rendern neu entsteht.
    const window = rangeWindow(range);
    const from = window.from;
    const to = window.to;
    /* Die Filterlisten als ZEICHENKETTE: sie ist eine stabile Abhängigkeit, im
       Gegensatz zum Feld, das bei jedem Rendern neu entsteht — und zugleich
       genau das, was an den Server geht. */
    const customerKey = (customerIds ?? []).join(',');
    const assigneeKey = (assigneeIds ?? []).join(',');

    /* Das Laden lebt IM Effekt, mit Abbruchmerker: wer schnell am Zeitraum
       dreht, löst mehrere Runden aus — nur die letzte darf schreiben, sonst
       zeigte der Stapel die Aufgaben eines Zeitraums, den man längst verlassen
       hat. `reloadTick` ist der Anstoss von aussen (nach dem Anlegen). */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Ohne Recht auf die Aufgabenseite (oder bei unlesbarem Datum) wird
            // nicht gefragt; die Liste beginnt leer und bleibt es.
            if (!enabled || !from || !to) { setTasks([]); return; }
            setLoading(true);
            try {
                const page = await crmApi.listTasks({
                    kind: 'TASK',
                    scope,
                    from,
                    to,
                    customerIds: customerKey || undefined,
                    assigneeIds: assigneeKey || undefined,
                    page: 1,
                    pageSize: 200,
                });
                if (cancelled) return;
                setTasks(page.data ?? []);
            } catch {
                if (cancelled) return;
                setTasks([]);
                toast.error(t('crm.tasks.errorLoad'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [enabled, scope, from, to, customerKey, assigneeKey, reloadTick]);

    const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

    const markBusy = (id: string, busy: boolean) => setBusyIds((current) => {
        const next = new Set(current);
        if (busy) next.add(id); else next.delete(id);
        return next;
    });

    const patchLocal = (id: string, patch: Partial<CrmTaskRow>) =>
        setTasks((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

    /** Abhaken oder in die andere Spalte gezogen: erledigt bzw. wieder offen. */
    const setDone = useCallback(async (task: CrmTaskRow, done: boolean) => {
        if (busyIds.has(task.id)) return;
        if ((task.status === 'DONE') === done) return;
        const nextStatus: CrmTaskStatus = done ? 'DONE' : 'OPEN';
        const previous = { status: task.status, completedAt: task.completedAt ?? null };
        patchLocal(task.id, {
            status: nextStatus,
            completedAt: nextStatus === 'DONE' ? new Date().toISOString() : null,
        });
        markBusy(task.id, true);
        try {
            const saved = await crmApi.updateTask(task.id, { status: nextStatus });
            // Der Schnellweg des Servers antwortet knapp (nur was er gesetzt
            // hat) — was fehlt, bleibt beim gewünschten Wert.
            patchLocal(task.id, { status: saved.status ?? nextStatus, completedAt: saved.completedAt ?? null });
        } catch {
            patchLocal(task.id, previous);
            toast.error(t('crm.tasks.updateError'));
        } finally {
            markBusy(task.id, false);
        }
    }, [busyIds]);

    /**
     * DIE SPANNE EINER AUFGABE UMGESTELLT (11.09.2026) — Anfang UND Ende in
     * einem Zug. Vorher gab es dafür `moveToDay`, das nur den Endtermin
     * kannte; seit eine Aufgabe sich über mehrere Tage zieht, wäre das die
     * halbe Auskunft und würde beim Verschieben die Länge verändern.
     *
     * Die beiden Zeitpunkte kommen fertig aus dem Fenster (taskSchedule.ts) —
     * hier steht nur, was DANACH gilt: eine verstrichene Aufgabe, deren Ende
     * auf heute oder später wandert, ist wieder OFFEN. Ohne diese Regel bliebe
     * sie "Ausstehend" auf einem Tag, der noch vor uns liegt; der
     * Verfalldienst am Server flippt sie nur HIN, nie zurück.
     *
     * Alles ÖRTLICH und sofort: die Karte springt, die Anfrage läuft im
     * Hintergrund; scheitert sie, springt die Karte zurück.
     */
    const saveSpan = useCallback(async (
        task: CrmTaskRow,
        next: { startAt: string | null; dueDate: string | null; allDay: boolean },
    ) => {
        if (busyIds.has(task.id)) return;
        const revived = task.status === 'INCOMPLETE'
            && !isTaskOverdue({ status: 'OPEN', dueDate: next.dueDate });
        const previous = {
            startAt: task.startAt ?? null,
            dueDate: task.dueDate ?? null,
            allDay: task.allDay,
            status: task.status,
        };
        patchLocal(task.id, {
            startAt: next.startAt,
            dueDate: next.dueDate,
            allDay: next.allDay,
            ...(revived ? { status: 'OPEN' as CrmTaskStatus } : {}),
        });
        markBusy(task.id, true);
        try {
            const saved = await crmApi.updateTask(task.id, {
                startAt: next.startAt,
                dueDate: next.dueDate,
                allDay: next.allDay,
                ...(revived ? { status: 'OPEN' as CrmTaskStatus } : {}),
            });
            patchLocal(task.id, {
                startAt: saved.startAt ?? next.startAt,
                dueDate: saved.dueDate ?? next.dueDate,
                allDay: next.allDay,
                status: saved.status ?? (revived ? 'OPEN' : task.status),
            });
        } catch {
            patchLocal(task.id, previous);
            toast.error(t('crm.tasks.updateError'));
        } finally {
            markBusy(task.id, false);
        }
    }, [busyIds]);

    /** Notizzähler der Karte nachziehen, nachdem das Popup eine geschrieben hat. */
    const setNoteCount = useCallback((taskId: string, noteCount: number) => {
        patchLocal(taskId, { noteCount });
    }, []);

    /**
     * Was das Popup gespeichert hat, in die Listenzeile zurückschreiben
     * (11.09.2026) — Titel, Spanne, Anleitung, Anhänge. Ohne das zeigte die
     * Karte hinter dem geschlossenen Fenster noch den alten Stand, und ein
     * vollständiges Nachladen der Liste für EINE geänderte Zeile wäre der
     * teuerste Weg zum selben Bild.
     */
    const patchRow = useCallback((taskId: string, patch: Partial<CrmTaskRow>) => {
        patchLocal(taskId, patch);
    }, []);

    const remove = useCallback(async (task: CrmTaskRow) => {
        const previous = tasks;
        setTasks((current) => current.filter((row) => row.id !== task.id));
        try {
            await crmApi.deleteTask(task.id);
            toast.success(t('crm.tasks.deleted'));
        } catch {
            setTasks(previous);
            toast.error(t('crm.tasks.deleteError'));
        }
    }, [tasks]);

    return { tasks, setTasks, loading, busyIds, reload, setDone, saveSpan, setNoteCount, patchRow, remove };
};
