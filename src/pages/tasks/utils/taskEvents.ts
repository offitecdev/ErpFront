import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Ein leiser Rundruf innerhalb des Moduls: wer etwas geändert hat, das eine
 * andere Stelle derselben Seite zeigt (Messung in der Kopfzeile gestoppt →
 * Liste, Detail, Pano), ruft `emitTasksChanged`. Kein Store-Umbau, keine
 * doppelte Wahrheit — die Seiten laden einfach neu.
 */

export type TasksChangeKind = 'timer' | 'task' | 'labels' | 'chat';

const EVENT = 'ofi:tasks-changed';

export const emitTasksChanged = (kind: TasksChangeKind, taskId?: string): void => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind, taskId } }));
};

export const useTasksChanged = (handler: (kind: TasksChangeKind, taskId?: string) => void): void => {
    const ref = useRef(handler);
    // Nach jedem Zeichnen den jüngsten Handler merken — nie während des Zeichnens.
    useLayoutEffect(() => {
        ref.current = handler;
    });
    useEffect(() => {
        const listener = (event: Event) => {
            const detail = (event as CustomEvent<{ kind: TasksChangeKind; taskId?: string }>).detail;
            ref.current(detail?.kind ?? 'task', detail?.taskId);
        };
        window.addEventListener(EVENT, listener);
        return () => window.removeEventListener(EVENT, listener);
    }, []);
};
