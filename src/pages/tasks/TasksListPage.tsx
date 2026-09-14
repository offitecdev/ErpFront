import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LuPlus } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { TaskRow } from '@/types/tasksModule';
import '@/styles/modules/tasksList.css';
import { TaskListGroups } from './components/list/TaskListGroups';
import { isTaskListPeriod } from './components/list/taskListRules';
import { TaskListToolbar } from './components/list/TaskListToolbar';
import { TaskRowDialogs } from './components/list/TaskRowDialogs';
import { TaskRowMenu } from './components/list/TaskRowMenu';
import { TaskSheet } from './components/list/TaskSheet';
import { useTaskRowActions } from './components/list/useTaskRowActions';
import { TaskButton } from './components/shared/TaskButton';
import { TasksModuleShell } from './components/shared/TasksModuleShell';
import { useTaskList, type TaskListQuery } from './hooks/useTaskList';
import { useTasksModuleStore } from './store/tasksModuleStore';

/**
 * ── GÖREVLER: LISTE (/tasks) ─────────────────────────────────────────────────
 *
 * Görevly `V.taskList`: Aufgaben nach Fälligkeit gruppiert, Filter oben, «Yeni
 * görev» rechts. Die Seite hält nur Zustand und verdrahtet — Daten im Hook,
 * Oberfläche in components/list.
 */

const DEFAULT_QUERY: TaskListQuery = { filter: 'open', period: 'all', assigneeId: '', labelId: '', q: '' };

/* Die Filter bleiben für die Sitzung stehen (wie in Görevly): wer eine Aufgabe
   öffnet und zurückkommt, findet seine Liste wieder — je Firma. */
let rememberedQuery: { tenantKey: string; query: TaskListQuery } | null = null;

export const TasksListPage = () => {
    // Die Seite reicht Werkzeugzeile und Liste als fertige Elemente an die Hülle — sie muss selbst neu zeichnen.
    useLanguageTick();
    const navigate = useNavigate();
    const tenantKey = useTasksModuleStore((state) => state.tenantKey);
    const [searchParams, setSearchParams] = useSearchParams();

    const [query, setQuery] = useState<TaskListQuery>(() => {
        const base = rememberedQuery && rememberedQuery.tenantKey === tenantKey ? rememberedQuery.query : DEFAULT_QUERY;
        // Der Zeitraum steht in der Adresse (?period=week) — ein geteilter Link öffnet dieselbe Ansicht.
        const fromUrl = searchParams.get('period');
        return isTaskListPeriod(fromUrl) ? { ...base, period: fromUrl } : base;
    });
    const tenantRef = useRef(tenantKey);
    useEffect(() => {
        if (tenantRef.current !== tenantKey) {
            tenantRef.current = tenantKey;
            setQuery(DEFAULT_QUERY);
        }
    }, [tenantKey]);
    useEffect(() => { rememberedQuery = { tenantKey, query }; }, [tenantKey, query]);
    useEffect(() => {
        const current = searchParams.get('period') ?? 'all';
        if (current === query.period) return;
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            if (query.period === 'all') next.delete('period');
            else next.set('period', query.period);
            return next;
        }, { replace: true });
    }, [query.period, searchParams, setSearchParams]);

    // Die Liste wartet nicht auf den Bootstrap — beide Anfragen laufen parallel.
    const list = useTaskList(query, true);
    const [sheet, setSheet] = useState<{ taskId: string | null } | null>(null);
    const [menu, setMenu] = useState<{ taskId: string; anchor: HTMLElement } | null>(null);

    const openEdit = useCallback((row: TaskRow) => setSheet({ taskId: row.id }), []);
    const actions = useTaskRowActions({ patchRow: list.patchRow, removeRow: list.removeRow, onEdit: openEdit });

    const toggleMenu = useCallback((row: TaskRow, anchor: HTMLElement) => {
        setMenu((current) => (current?.anchor === anchor ? null : { taskId: row.id, anchor }));
    }, []);
    const closeMenu = useCallback(() => setMenu(null), []);
    // Immer die frische Zeile — fällt sie beim Neuladen aus der Liste, geht das Menü zu.
    const menuRow = menu ? list.rows.find((row) => row.id === menu.taskId) ?? null : null;

    return (
        <TasksModuleShell
            title={t('tasksModule.nav.tasks')}
            actions={(
                // `ofi-nosize`: sonst malt die Lager-Hülle den Kopfknopf weiss über.
                <TaskButton variant="primary" className="ofi-nosize" icon={<LuPlus size={14} />} onClick={() => setSheet({ taskId: null })}>
                    {/* Alle legen an; ohne Leitungsrecht wartet die Aufgabe auf Freigabe (TaskSheet warnt). */}
                    {t('tasksModule.list.newTask')}
                </TaskButton>
            )}
            toolbar={(
                <TaskListToolbar
                    query={query}
                    onChange={(next) => setQuery((current) => ({ ...current, ...next }))}
                    busy={list.fetching}
                />
            )}
        >
            <TaskListGroups list={list} busyIds={actions.busyIds} onCheck={actions.quickComplete} onMenu={toggleMenu} />

            <TaskRowMenu row={menuRow} anchorEl={menuRow ? menu?.anchor ?? null : null} onClose={closeMenu} actions={actions.menuActions} />
            <TaskRowDialogs dialogs={actions.dialogs} />
            <TaskSheet
                open={sheet !== null}
                taskId={sheet?.taskId ?? null}
                onClose={() => setSheet(null)}
                onCreated={(task) => {
                    setSheet(null);
                    navigate(`/tasks/${task.id}`);
                }}
                onSaved={(envelope) => {
                    list.patchRow(envelope.task, envelope.people);
                    setSheet(null);
                }}
                onDeleted={(taskId) => {
                    list.removeRow(taskId);
                    setSheet(null);
                }}
            />
        </TasksModuleShell>
    );
};
