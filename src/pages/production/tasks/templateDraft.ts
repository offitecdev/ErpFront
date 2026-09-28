import type { ProductionTask, TaskArea, TaskSection, TaskStage, TaskTemplate, TaskTemplateInput } from '@/types/productionTasks';

import { localToday, newSectionKey, newStageKey, numberTasks, orderTasks, roundPercent } from './taskModel';

/**
 * ── DER ENTWURF EINER VORLAGE (26.09.2026) ──────────────────────────────────
 * Die Seite bearbeitet eine Kopie; «Kaydet» schickt sie als Ganzes (PUT/POST).
 * Neue Aufgaben tragen bis dahin eine vorläufige Kennung (`tmp-…`).
 *
 * Seit dem 28.09.2026 gehören die Bereiche und ihre Stufen zum Entwurf: eine
 * neue Vorlage beginnt OHNE Bereiche, man legt sie selbst an. Die Kürzel der
 * Aufgaben vergibt der Entwurf selbst, je Bereich laufend in der Reihenfolge
 * des Weges — neu gezählt, sobald sich an Aufgaben, Stufen oder Bereichen
 * etwas verschiebt (eine Vorlage von vorher behält ihre Kürzel bis dahin).
 */
export interface TemplateDraft {
    /** null = noch nie gespeichert. */
    id: string | null;
    name: string;
    sections: TaskSection[];
    tasks: ProductionTask[];
}

let counter = 0;
export const tempTaskId = (): string => {
    counter += 1;
    return `tmp-${Date.now().toString(36)}-${counter}`;
};

const copySections = (sections: readonly TaskSection[]): TaskSection[] =>
    sections.map((section) => ({ ...section, stages: section.stages.map((stage) => ({ ...stage })) }));

const copyTask = (task: ProductionTask): ProductionTask => ({
    ...task,
    assigneeIds: [...task.assigneeIds],
    subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
});

export const draftFromTemplate = (template: TaskTemplate): TemplateDraft => ({
    id: template.id,
    name: template.name,
    sections: copySections(template.sections),
    tasks: template.tasks.map(copyTask),
});

/** Eine leere Vorlage: noch keine Bereiche, keine Aufgaben — beides legt man selbst an. */
export const emptyDraft = (): TemplateDraft => ({
    id: null,
    name: '',
    sections: [],
    tasks: [],
});

/** «Çoğalt»: dieselben Bereiche und Aufgaben unter neuem Namen, noch nicht gespeichert. */
export const duplicateDraft = (draft: TemplateDraft, name: string): TemplateDraft => ({
    id: null,
    name,
    sections: copySections(draft.sections),
    tasks: draft.tasks.map((task) => ({ ...copyTask(task), id: tempTaskId() })),
});

/** Was der Server bekommt — ohne Kennungen der Aufgaben, in der Reihenfolge des Weges. */
export const draftInput = (draft: TemplateDraft): TaskTemplateInput => ({
    name: draft.name.replace(/\s+/g, ' ').trim(),
    sections: draft.sections.map((section) => ({
        key: section.key,
        name: section.name.replace(/\s+/g, ' ').trim(),
        share: section.share,
        stages: section.stages.map((stage) => ({ key: stage.key, name: stage.name.replace(/\s+/g, ' ').trim() })),
    })),
    tasks: orderTasks(draft.tasks, draft.sections).map((task) => ({
        area: task.area,
        stage: task.stage,
        code: task.code,
        name: task.name,
        weight: task.weight,
        assigneeIds: [...task.assigneeIds],
        // Eine Vorlage trägt keine Tage (28.09.2026) — auch alte gehen nicht mit.
        startDate: null,
        dueDate: null,
        createdAt: task.createdAt,
        subtasks: task.subtasks.map((subtask) => ({ ...subtask, startDate: null, dueDate: null })),
    })),
});

/** Hat sich gegenüber dem Gespeicherten etwas geändert? */
export const draftDirty = (draft: TemplateDraft | null, saved: TaskTemplate | null): boolean => {
    if (!draft) return false;
    if (!draft.id || !saved) return Boolean(draft.name.trim() || draft.sections.length || draft.tasks.length);
    return JSON.stringify(draftInput(draft)) !== JSON.stringify(draftInput(draftFromTemplate(saved)));
};

/** Aufgaben in die Reihenfolge des Weges und neu nummeriert. */
const renumbered = (draft: TemplateDraft): TemplateDraft => ({ ...draft, tasks: numberTasks(draft.tasks, draft.sections) });

/* ── Bereiche ───────────────────────────────────────────────────────────── */

/**
 * Ein neuer Bereich am Ende. Sein Anteil ist, was an 100 % noch fehlt — der
 * erste bekommt also 100 %, jeder weitere den Rest (0, wenn nichts fehlt).
 */
export const addSection = (draft: TemplateDraft, name: string): { draft: TemplateDraft; key: TaskArea } => {
    const used = roundPercent(draft.sections.reduce((sum, section) => sum + section.share, 0));
    const section: TaskSection = { key: newSectionKey(), name: name.trim(), share: Math.max(0, roundPercent(100 - used)), stages: [] };
    return { draft: { ...draft, sections: [...draft.sections, section] }, key: section.key };
};

export const renameSection = (draft: TemplateDraft, key: TaskArea, name: string): TemplateDraft =>
    // Der Name gibt das Präfix der Kürzel («Hidrolik» → H-01).
    renumbered({ ...draft, sections: draft.sections.map((section) => (section.key === key ? { ...section, name } : section)) });

export const setSectionShare = (draft: TemplateDraft, key: TaskArea, share: number): TemplateDraft => ({
    ...draft,
    sections: draft.sections.map((section) => (section.key === key ? { ...section, share } : section)),
});

/** Einen Bereich samt seinen Stufen und Aufgaben entfernen. */
export const removeSection = (draft: TemplateDraft, key: TaskArea): TemplateDraft =>
    renumbered({
        ...draft,
        sections: draft.sections.filter((section) => section.key !== key),
        tasks: draft.tasks.filter((task) => task.area !== key),
    });

const moved = <T>(list: readonly T[], index: number, offset: number): T[] => {
    const target = index + offset;
    if (index < 0 || target < 0 || target >= list.length) return [...list];
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    return next;
};

/** Einen Bereich um eine Stelle nach vorn (-1) oder hinten (+1). */
export const moveSection = (draft: TemplateDraft, key: TaskArea, offset: -1 | 1): TemplateDraft =>
    renumbered({ ...draft, sections: moved(draft.sections, draft.sections.findIndex((section) => section.key === key), offset) });

/* ── Stufen ─────────────────────────────────────────────────────────────── */

const withSection = (draft: TemplateDraft, key: TaskArea, change: (section: TaskSection) => TaskSection): TemplateDraft => ({
    ...draft,
    sections: draft.sections.map((section) => (section.key === key ? change(section) : section)),
});

/** Eine neue Stufe am Ende des Weges im Bereich. */
export const addStage = (draft: TemplateDraft, area: TaskArea, name: string): TemplateDraft =>
    withSection(draft, area, (section) => ({ ...section, stages: [...section.stages, { key: newStageKey(), name: name.trim() }] }));

export const renameStage = (draft: TemplateDraft, area: TaskArea, stage: TaskStage, name: string): TemplateDraft =>
    withSection(draft, area, (section) => ({
        ...section,
        stages: section.stages.map((entry) => (entry.key === stage ? { ...entry, name } : entry)),
    }));

/** Eine Stufe samt ihren Aufgaben entfernen. */
export const removeStage = (draft: TemplateDraft, area: TaskArea, stage: TaskStage): TemplateDraft =>
    renumbered({
        ...withSection(draft, area, (section) => ({ ...section, stages: section.stages.filter((entry) => entry.key !== stage) })),
        tasks: draft.tasks.filter((task) => !(task.area === area && task.stage === stage)),
    });

/** Eine Stufe um eine Stelle nach vorn (-1) oder hinten (+1) im Weg. */
export const moveStage = (draft: TemplateDraft, area: TaskArea, stage: TaskStage, offset: -1 | 1): TemplateDraft =>
    renumbered(withSection(draft, area, (section) => ({
        ...section,
        stages: moved(section.stages, section.stages.findIndex((entry) => entry.key === stage), offset),
    })));

/* ── Aufgaben ───────────────────────────────────────────────────────────── */

/**
 * Eine neue Aufgabe in einer Stufe — ihr Kürzel vergibt der Entwurf beim
 * Einfügen. Sie entsteht heute; Tage trägt eine Vorlage keine.
 */
export const newTask = (area: TaskArea, stage: TaskStage): ProductionTask => ({
    id: tempTaskId(),
    area,
    stage,
    code: '',
    name: '',
    weight: 0,
    assigneeIds: [],
    startDate: null,
    dueDate: null,
    createdAt: localToday(),
    status: 'TODO',
    subtasks: [],
});

/**
 * Eine Aufgabe ersetzen (oder anfügen) und die Reihenfolge des Weges halten.
 * Neu gezählt wird, wenn sie neu ist oder die Stufe wechselt — sonst bleibt
 * jedes Kürzel, wie es ist.
 */
export const upsertTask = (draft: TemplateDraft, task: ProductionTask): TemplateDraft => {
    const before = draft.tasks.find((entry) => entry.id === task.id);
    const tasks = before ? draft.tasks.map((entry) => (entry.id === task.id ? task : entry)) : [...draft.tasks, task];
    const next = { ...draft, tasks: orderTasks(tasks, draft.sections) };
    const placeChanged = !before || before.area !== task.area || before.stage !== task.stage;
    return placeChanged ? renumbered(next) : next;
};

export const removeTask = (draft: TemplateDraft, taskId: string): TemplateDraft =>
    renumbered({ ...draft, tasks: draft.tasks.filter((task) => task.id !== taskId) });
