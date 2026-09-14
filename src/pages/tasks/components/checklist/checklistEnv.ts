import { createContext, useContext } from 'react';

import type { Checklist, ChecklistItem, ChecklistProgress, PeopleMap } from '@/types/tasksModule';

/**
 * Was eine Checkliste von ihrer Seite braucht: Rechte, Personen und die
 * Helfer, mit denen sie Antworten des Servers in den Seitenstand schreibt.
 * Als Kontext, weil Checklisten sowohl IM Editor (Checklistenblock) als auch
 * darunter (Listen ohne Block) stehen — ohne Durchreichen durch jeden Block.
 */
export interface ChecklistEnv {
    taskId: string;
    editable: boolean;
    isManager: boolean;
    actorId: string;
    people: PeopleMap;
    /** Verantwortliche der Aufgabe — Teammitglieder dürfen Punkte nur an sie geben. */
    taskAssigneeIds: string[];
    replaceChecklist: (checklist: Checklist) => void;
    renameChecklistLocal: (checklistId: string, title: string) => void;
    setItem: (checklistId: string, item: ChecklistItem) => void;
    insertItem: (checklistId: string, item: ChecklistItem, afterItemId: string | null) => void;
    removeItem: (checklistId: string, itemId: string) => void;
    setProgress: (progress: ChecklistProgress) => void;
    setTaskAssignees: (assigneeIds: string[]) => void;
    /** Löscht die Liste samt Block (läuft über den Editor wegen der Inhaltsversion). */
    deleteChecklist: (checklistId: string) => Promise<boolean>;
}

export const ChecklistEnvContext = createContext<ChecklistEnv | null>(null);

export const useChecklistEnv = (): ChecklistEnv => {
    const env = useContext(ChecklistEnvContext);
    if (!env) throw new Error('ChecklistEnvContext fehlt');
    return env;
};
