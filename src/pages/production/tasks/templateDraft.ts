import type { AreaShares, ProductionTask, TaskArea, TaskStage, TaskTemplate, TaskTemplateInput } from '@/types/productionTasks';

import { orderTasks, suggestCode } from './taskModel';

/**
 * ── DER ENTWURF EINER VORLAGE (26.09.2026) ──────────────────────────────────
 * Die Seite bearbeitet eine Kopie; «Kaydet» schickt sie als Ganzes (PUT/POST).
 * Neue Aufgaben tragen bis dahin eine vorläufige Kennung (`tmp-…`).
 */
export interface TemplateDraft {
    /** null = noch nie gespeichert. */
    id: string | null;
    name: string;
    areaShares: AreaShares;
    tasks: ProductionTask[];
}

let counter = 0;
export const tempTaskId = (): string => {
    counter += 1;
    return `tmp-${Date.now().toString(36)}-${counter}`;
};

export const draftFromTemplate = (template: TaskTemplate): TemplateDraft => ({
    id: template.id,
    name: template.name,
    areaShares: { ...template.areaShares },
    tasks: template.tasks.map((task) => ({ ...task, assigneeIds: [...task.assigneeIds] })),
});

/** Eine leere Vorlage: beide Bereiche je zur Hälfte, noch keine Aufgaben. */
export const emptyDraft = (): TemplateDraft => ({
    id: null,
    name: '',
    areaShares: { MECHANICAL: 50, ELECTRICAL: 50 },
    tasks: [],
});

/** «Çoğalt»: dieselben Aufgaben unter neuem Namen, noch nicht gespeichert. */
export const duplicateDraft = (draft: TemplateDraft, name: string): TemplateDraft => ({
    id: null,
    name,
    areaShares: { ...draft.areaShares },
    tasks: draft.tasks.map((task) => ({ ...task, id: tempTaskId(), assigneeIds: [...task.assigneeIds] })),
});

/** Was der Server bekommt — ohne Kennungen, in der Reihenfolge des Weges. */
export const draftInput = (draft: TemplateDraft): TaskTemplateInput => ({
    name: draft.name.replace(/\s+/g, ' ').trim(),
    areaShares: { ...draft.areaShares },
    tasks: orderTasks(draft.tasks).map((task) => ({
        area: task.area,
        stage: task.stage,
        code: task.code,
        name: task.name,
        weight: task.weight,
        assigneeIds: [...task.assigneeIds],
    })),
});

/** Hat sich gegenüber dem Gespeicherten etwas geändert? */
export const draftDirty = (draft: TemplateDraft | null, saved: TaskTemplate | null): boolean => {
    if (!draft) return false;
    if (!draft.id || !saved) return Boolean(draft.name.trim() || draft.tasks.length);
    return JSON.stringify(draftInput(draft)) !== JSON.stringify(draftInput(draftFromTemplate(saved)));
};

/** Eine neue Aufgabe in einer Stufe — mit dem nächsten freien Kürzel. */
export const newTask = (draft: TemplateDraft, area: TaskArea, stage: TaskStage): ProductionTask => ({
    id: tempTaskId(),
    area,
    stage,
    code: suggestCode(draft.tasks, area),
    name: '',
    weight: 0,
    assigneeIds: [],
});

/** Eine Aufgabe ersetzen (oder anfügen) und die Reihenfolge des Weges halten. */
export const upsertTask = (draft: TemplateDraft, task: ProductionTask): TemplateDraft => {
    const exists = draft.tasks.some((entry) => entry.id === task.id);
    const tasks = exists ? draft.tasks.map((entry) => (entry.id === task.id ? task : entry)) : [...draft.tasks, task];
    return { ...draft, tasks: orderTasks(tasks) };
};

export const removeTask = (draft: TemplateDraft, taskId: string): TemplateDraft => ({
    ...draft,
    tasks: draft.tasks.filter((task) => task.id !== taskId),
});
