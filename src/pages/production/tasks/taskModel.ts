import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import type {
    BuiltInArea,
    BuiltInStage,
    ProductionTask,
    TaskStatus,
    TaskArea,
    TaskAreaCheck,
    TaskSection,
    TaskSectionStage,
    TaskStage,
    TaskStageCheck,
    TaskSubtask,
    TaskTemplateCheck,
} from '@/types/productionTasks';

/**
 * ── GÖREVLENDİRME · DAS MODELL IM BROWSER (26.09.2026) ─────────────────────
 *
 * Bereiche, Stufen und Rechnen — wortgleich mit den Regeln des Servers
 * (Erp_Backend/src/domain/services/productionTasks.ts). Die Oberfläche prüft
 * damit schon beim Tippen, ob eine Vorlage aufgeht; entscheiden tut der Server.
 *
 * Seit dem 28.09.2026 bringt jede Vorlage ihre Bereiche mit — Name, Anteil
 * und die Stufen in der Reihenfolge des Weges («create the sections manually
 * … stages should be created dynamically»). Mekanik / Elektrik bleiben als
 * FESTE Bereiche der Vorlagen von vorher (Namen aus der Übersetzung, BOM).
 */

export const BUILT_IN_AREAS: readonly BuiltInArea[] = ['MECHANICAL', 'ELECTRICAL'];

/**
 * Die zwei festen Wege (27.09.2026, Vorgabe Samet: «üretim hedef yolu iki
 * yola ayrılmalıdır»):
 *   Mekanik   Compressor seçimi & PID › Teknik çizim › Final çizim onayı ›
 *             BOM › Üretim/Montaj › Test › Final
 *   Elektrik  Teknik devre çizimi (EPLAN) › Final çizim onayı › BOM ›
 *             Pano imalatı › Test › Final
 */
export const BUILT_IN_STAGES: Readonly<Record<BuiltInArea, readonly BuiltInStage[]>> = {
    MECHANICAL: ['equipment', 'drawing', 'approval', 'bom', 'production', 'test', 'final'],
    ELECTRICAL: ['circuit', 'approval', 'bom', 'panel', 'test', 'final'],
};

const BUILT_IN_STAGE_KEYS: ReadonlySet<string> = new Set([...BUILT_IN_STAGES.MECHANICAL, ...BUILT_IN_STAGES.ELECTRICAL]);

export const isBuiltInArea = (value: unknown): value is BuiltInArea =>
    typeof value === 'string' && (BUILT_IN_AREAS as readonly string[]).includes(value);

export const isBuiltInStage = (value: unknown): value is BuiltInStage =>
    typeof value === 'string' && BUILT_IN_STAGE_KEYS.has(value);

/**
 * Der Weg eines Geräts ohne geladene Vorlage — und der einer Vorlage von
 * vorher: Mekanik und Elektrik mit ihren festen Stufen.
 */
export const builtInSections = (shares: Partial<Record<BuiltInArea, number>> = {}): TaskSection[] =>
    BUILT_IN_AREAS.map((area) => ({
        key: area,
        name: '',
        share: shares[area] ?? 0,
        stages: BUILT_IN_STAGES[area].map((key) => ({ key, name: '', weight: 0 })),
    }));

/**
 * Dieselbe Stelle im anderen festen Weg — wortgleich mit `STAGE_TWINS` des
 * Servers: die Zeichnungen werden zum EPLAN-Stromlauf (und zurück zur ersten
 * Stufe der Mekanik), die Montage zum Schaltschrankbau.
 */
const STAGE_TWINS: Readonly<Partial<Record<string, Partial<Record<BuiltInArea, BuiltInStage>>>>> = {
    equipment: { ELECTRICAL: 'circuit' },
    circuit: { MECHANICAL: 'equipment' },
    drawing: { ELECTRICAL: 'circuit' },
    production: { ELECTRICAL: 'panel' },
    panel: { MECHANICAL: 'production' },
    purchasing: { MECHANICAL: 'bom', ELECTRICAL: 'bom' },
};

/**
 * Die Stufe eines Bereichs zu einer Kennung — dieselbe, sonst (in den festen
 * Bereichen) ihr Gegenstück, sonst die erste des Bereichs.
 */
export const twinStage = (stage: string, section: TaskSection): TaskStage | null => {
    if (section.stages.some((entry) => entry.key === stage)) return stage;
    const twin = isBuiltInArea(section.key) ? STAGE_TWINS[stage]?.[section.key] : undefined;
    if (twin && section.stages.some((entry) => entry.key === twin)) return twin;
    return section.stages[0]?.key ?? null;
};

export const TASK_LIMITS = {
    templateName: 120,
    taskName: 200,
    tasks: 200,
    sections: 12,
    sectionName: 60,
    stages: 20,
    stageName: 60,
    subtasks: 30,
    subtaskName: 200,
    checklistItems: 30,
    checklistItemText: 200,
    documentStandards: 2000,
} as const;

const SUM_TOLERANCE = 0.01;

/* ── Namen ─────────────────────────────────────────────────────────────── */

/** Die Farbklasse des Bereichszeichens: `is-mechanical`, `is-electrical` oder `is-custom`. */
export const areaTone = (area: TaskArea): string =>
    area === 'ELECTRICAL' ? 'is-electrical' : area === 'MECHANICAL' ? 'is-mechanical' : 'is-custom';

/** Der Name eines Bereichs: eigener Name, sonst der übersetzte der festen. */
/**
 * Die BOM-Stufe jedes Bereichs (02.10.2026, wie der Server: `withBomStages`):
 * Stufe «bom» mit genau einer Aufgabe «BOM» und ihrer Unteraufgabe «BOM Creation».
 * Die Stufe lässt sich nicht löschen, die Aufgabe nicht umbenennen oder ergänzen.
 */
export const BOM_STAGE = 'bom';
export const BOM_TASK_NAME = 'BOM';
export const BOM_SUBTASK_ID = 'bom-create';
export const BOM_SUBTASK_NAME = 'BOM Creation';
export const isBomTask = (task: Pick<ProductionTask, 'stage' | 'subtasks'>): boolean =>
    task.stage === BOM_STAGE && task.subtasks.some((subtask) => subtask.id === BOM_SUBTASK_ID);

export const sectionLabel = (section: Pick<TaskSection, 'key' | 'name'>): string => {
    if (section.name) return section.name;
    if (section.key === 'MECHANICAL') return t('productionTasks.area.mechanical');
    if (section.key === 'ELECTRICAL') return t('productionTasks.area.electrical');
    return section.key;
};

/** Der Name einer Stufe: eigener Name, sonst der übersetzte der festen (Namen der Prozessleiste). */
export const stageLabel = (stage: TaskSectionStage): string =>
    stage.name || (isBuiltInStage(stage.key) ? t(`production.deviceStages.${stage.key}`) : stage.key);

/**
 * Zwei Namen sind derselbe, wenn sie sich nur in Gross/klein unterscheiden —
 * auch über das türkische I hinweg (wortgleich mit dem Server).
 */
const nameKey = (value: string): string => value.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
export const sameName = (left: string, right: string): boolean => nameKey(left) === nameKey(right);

/** Ist dieser Name im Bereich (bzw. unter den Bereichen) schon vergeben? */
export const sectionNameTaken = (sections: readonly TaskSection[], name: string, exceptKey?: string): boolean =>
    sections.some((section) => section.key !== exceptKey && sameName(sectionLabel(section), name));

export const stageNameTaken = (section: TaskSection, name: string, exceptKey?: string): boolean =>
    section.stages.some((stage) => stage.key !== exceptKey && sameName(stageLabel(stage), name));

/* ── Personen ──────────────────────────────────────────────────────────── */

/**
 * Die Personen einer Aufgabe (29.09.2026) — wie der Server: die Summe ihrer
 * Unteraufgaben; zugewiesen wird nur an Unteraufgaben.
 */
export const taskAssigneesOf = (subtasks: ReadonlyArray<Pick<TaskSubtask, 'assigneeIds'>>): string[] =>
    [...new Set(subtasks.flatMap((subtask) => subtask.assigneeIds))];

/** Die Aufgabe mit neuen Personen an EINER Unteraufgabe — ihre eigenen Personen rechnen sich mit. */
export const withSubtaskAssignees = (task: ProductionTask, subtaskId: string, assigneeIds: string[]): ProductionTask => {
    const subtasks = task.subtasks.map((subtask) => (subtask.id === subtaskId ? { ...subtask, assigneeIds } : subtask));
    return { ...task, subtasks, assigneeIds: taskAssigneesOf(subtasks) };
};

/* ── Kennungen ─────────────────────────────────────────────────────────── */

const randomPart = (): string => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

/** Kennungen eigener Bereiche («s-…», passt in `area` VARCHAR(16)), Stufen («g-…»), Unteraufgaben («u-…») und Punkte der Freigabe-Checkliste («c-…»). */
export const newSectionKey = (): string => `s-${randomPart()}`;
export const newStageKey = (): string => `g-${randomPart()}`;
export const newSubtaskId = (): string => `u-${randomPart()}`;
export const newChecklistItemId = (): string => `c-${randomPart()}`;

/* ── Adresse ───────────────────────────────────────────────────────────── */

/** Die Adresse schreibt die festen Bereiche klein (`?area=electrical`), eigene mit ihrer Kennung. */
export const areaParam = (area: TaskArea): string => (isBuiltInArea(area) ? area.toLowerCase() : area);

/** Der Bereich aus der Adresse — unbekannt → der erste des Weges. */
export const areaFromParam = (value: string | null, sections: readonly TaskSection[]): TaskArea | null => {
    const wanted = value === 'mechanical' ? 'MECHANICAL' : value === 'electrical' ? 'ELECTRICAL' : value;
    return sections.find((section) => section.key === wanted)?.key ?? sections[0]?.key ?? null;
};

/* ── Rechnen ───────────────────────────────────────────────────────────── */

export const roundPercent = (value: number): number => Math.round(value * 100) / 100;

const localeTag = (): string => {
    const language = (i18n.language || 'tr').slice(0, 2);
    if (language === 'de') return 'de-CH';
    if (language === 'en') return 'en-GB';
    return 'tr-TR';
};

/**
 * Ein Prozentwert in der Schreibweise der Sprache — Türkisch «%8,4» wie in
 * Samets Liste, Deutsch «8.4%». `fixed` hält eine Nachkommastelle stehen
 * («%3,0»), wie in der Spalte «Genel tamamlanmaya katkı».
 */
export const formatPercent = (value: number, fixed = false): string =>
    new Intl.NumberFormat(localeTag(), {
        style: 'percent',
        minimumFractionDigits: fixed ? 1 : 0,
        maximumFractionDigits: 2,
    }).format((Number(value) || 0) / 100);

/** Beitrag zur Gesamtfertigstellung: Gewicht im Bereich × Anteil des Bereichs. */
export const overallOf = (weight: number, share: number): number => roundPercent((weight * share) / 100);

/**
 * Was eine Aufgabe im BEREICH wiegt (30.09.2026): ihr Gewicht in der Stufe × das Gewicht der
 * Stufe. Beitrag zur Gesamtfertigstellung dann mit `overallOf`.
 */
export const taskSectionWeight = (stageWeight: number, taskWeight: number): number =>
    roundPercent((stageWeight * taskWeight) / 100);

/** Das Gewicht einer Stufe im Bereich (0, wenn es sie nicht gibt). */
export const stageWeightOf = (sections: readonly TaskSection[], area: TaskArea, stage: TaskStage): number =>
    sections.find((section) => section.key === area)?.stages.find((entry) => entry.key === stage)?.weight ?? 0;

/** Was die Aufgaben einer Stufe zusammen wiegen (in der Stufe) — ohne `exceptId`. */
export const stageTaskWeight = (
    tasks: ReadonlyArray<Pick<ProductionTask, 'id' | 'area' | 'stage' | 'weight'>>,
    area: TaskArea,
    stage: TaskStage,
    exceptId?: string,
): number => roundPercent(tasks
    .filter((task) => task.area === area && task.stage === stage && task.id !== exceptId)
    .reduce((sum, task) => sum + task.weight, 0));

/** Eine Zahl aus einem Feld («12,5» wie «12.5»); leer/ungültig → null. */
export const parsePercent = (value: string): number | null => {
    const clean = value.replace(/\s+/g, '').replace('%', '').replace(',', '.');
    if (!clean) return null;
    const number = Number(clean);
    if (!Number.isFinite(number) || number < 0 || number > 100) return null;
    return roundPercent(number);
};

type WeightedTask = Pick<ProductionTask, 'area' | 'stage' | 'weight'>;

/**
 * Geht die Vorlage auf? Wortgleich mit `templateCheck` des Servers (30.09.2026: je Stufe).
 * Die Anteile der Bereiche ergeben 100 %; ein Bereich mit Aufgaben, wenn seine Stufen zusammen
 * 100 % wiegen und jede Stufe stimmt — mit Aufgaben ergeben diese 100 % der Stufe, ohne wiegt
 * sie 0; ein Bereich ohne Aufgaben, wenn er keinen Anteil trägt.
 */
export const checkTemplate = (sections: readonly TaskSection[], tasks: readonly WeightedTask[]): TaskTemplateCheck => {
    const sharesSum = roundPercent(sections.reduce((sum, section) => sum + section.share, 0));
    const sharesOk = Math.abs(sharesSum - 100) <= SUM_TOLERANCE;
    const areas = sections.map((section): TaskAreaCheck => {
        const own = tasks.filter((task) => task.area === section.key);
        const stages = section.stages.map((stage): TaskStageCheck => {
            const inStage = own.filter((task) => task.stage === stage.key);
            const taskWeightSum = roundPercent(inStage.reduce((sum, task) => sum + task.weight, 0));
            const ok = inStage.length > 0 ? Math.abs(taskWeightSum - 100) <= SUM_TOLERANCE : stage.weight === 0;
            return { stage: stage.key, weight: stage.weight, taskCount: inStage.length, taskWeightSum, ok };
        });
        const weightSum = roundPercent(section.stages.reduce((sum, stage) => sum + stage.weight, 0));
        const ok = own.length > 0
            ? Math.abs(weightSum - 100) <= SUM_TOLERANCE && stages.every((stage) => stage.ok)
            : section.share === 0;
        return { area: section.key, share: section.share, taskCount: own.length, weightSum, ok, stages };
    });
    const hasTasks = areas.some((entry) => entry.taskCount > 0);
    return { valid: sharesOk && hasTasks && areas.every((entry) => entry.ok), sharesSum, sharesOk, areas };
};

/**
 * Was an einer Vorlage (oder der Kopie am Gerät) nicht aufgeht — ein Satz je
 * Problem, für den Hinweis «unvollständig». Leer, wenn alles stimmt.
 */
export const checkProblems = (sections: readonly TaskSection[], taskCount: number, check: TaskTemplateCheck): string[] => {
    if (!sections.length) return [t('productionTasks.check.noSections')];
    const problems: string[] = [];
    if (!taskCount) problems.push(t('productionTasks.check.noTasks'));
    if (!check.sharesOk) problems.push(t('productionTasks.check.shares', { sum: formatPercent(check.sharesSum) }));
    for (const entry of check.areas) {
        if (entry.ok) continue;
        const target = sections.find((row) => row.key === entry.area);
        const label = target ? sectionLabel(target) : entry.area;
        if (!entry.taskCount) {
            problems.push(t('productionTasks.check.noAreaTasks', { area: label, share: formatPercent(entry.share) }));
            continue;
        }
        // Seit dem 30.09.2026 je Stufe: die Stufen zusammen, dann jede Stufe für sich.
        if (Math.abs(entry.weightSum - 100) > SUM_TOLERANCE) {
            problems.push(t('productionTasks.check.weights', { area: label, sum: formatPercent(entry.weightSum) }));
        }
        for (const stage of entry.stages) {
            if (stage.ok) continue;
            const stageEntry = target?.stages.find((row) => row.key === stage.stage);
            const stageName = stageEntry ? stageLabel(stageEntry) : stage.stage;
            problems.push(stage.taskCount
                ? t('productionTasks.check.stageTasks', { area: label, stage: stageName, sum: formatPercent(stage.taskWeightSum) })
                : t('productionTasks.check.stageEmpty', { area: label, stage: stageName, weight: formatPercent(stage.weight) }));
        }
    }
    return problems;
};

/** Die Aufgaben eines Bereichs, nach Stufen gruppiert (in der Reihenfolge des Weges). */
export const tasksByStage = <T extends Pick<ProductionTask, 'area' | 'stage'>>(tasks: readonly T[], section: TaskSection): Map<TaskStage, T[]> => {
    const groups = new Map<TaskStage, T[]>();
    for (const stage of section.stages) groups.set(stage.key, []);
    for (const task of tasks) {
        if (task.area !== section.key) continue;
        groups.get(task.stage)?.push(task);
    }
    return groups;
};

/** Reihenfolge wie beim Server: Bereich, Stufe des Weges, dann wie eingegeben. */
export const orderTasks = <T extends Pick<ProductionTask, 'area' | 'stage'>>(tasks: readonly T[], sections: readonly TaskSection[]): T[] => {
    const last = Number.MAX_SAFE_INTEGER;
    const areaRank = new Map(sections.map((section, index) => [section.key, index]));
    const stageRank = new Map(sections.map((section) => [section.key, new Map(section.stages.map((stage, index) => [stage.key, index]))]));
    return tasks
        .map((task, index) => ({ task, index }))
        .sort((left, right) => {
            const area = (areaRank.get(left.task.area) ?? last) - (areaRank.get(right.task.area) ?? last);
            if (area) return area;
            const stages = stageRank.get(left.task.area);
            return ((stages?.get(left.task.stage) ?? last) - (stages?.get(right.task.stage) ?? last)) || left.index - right.index;
        })
        .map((entry) => entry.task);
};

/* ── Stand ─────────────────────────────────────────────────────────────── */

/** Offen, in Arbeit, erledigt — in dieser Reihenfolge im Menü. */
export const TASK_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];


/**
 * Der Fortschritt einer Aufgabe aus ihren Unteraufgaben (28.09.2026):
 * erledigte / alle. Ohne Unteraufgaben zählt die Aufgabe selbst
 * (erledigt = 1/1, sonst 0/1).
 */
export const taskProgress = (task: { status: TaskStatus; subtasks: ReadonlyArray<{ status: TaskStatus }> }) => {
    const total = task.subtasks.length;
    const done = total ? task.subtasks.filter((subtask) => subtask.status === 'DONE').length : task.status === 'DONE' ? 1 : 0;
    const ratio = total ? done / total : done;
    return { done, total, ratio, complete: ratio >= 1 };
};

/* ── Dateien und Abschluss einer Unteraufgabe (28.09.2026) — wie der Server ── */

/** Mindestens ein PDF: erst dann ist das Dokument da («at least one pdf»). */
export const hasSubtaskDocument = (subtask: Pick<TaskSubtask, 'files'>): boolean =>
    subtask.files.some((file) => file.type === 'application/pdf');

/** Abgeschlossen: den Stand ändert niemand mehr, Dateien nur die Verwaltung. */
export const isSubtaskCompleted = (subtask: Pick<TaskSubtask, 'completedById'>): boolean => subtask.completedById !== null;

/** Wie viele Unteraufgaben auf die Freigabe warten (28.09.2026: neben dem Namen der Stufe). */
export const pendingApprovals = (tasks: ReadonlyArray<{ subtasks: ReadonlyArray<{ status: TaskStatus }> }>): number =>
    tasks.reduce((sum, task) => sum + task.subtasks.filter((subtask) => subtask.status === 'PENDING').length, 0);

/** Fertig melden (erledigt bzw. wartet auf Freigabe) geht mit «Document» erst mit einem PDF. */
export const needsPdfFirst = (subtask: TaskSubtask): boolean => subtask.requiresDocument && !hasSubtaskDocument(subtask);

/**
 * Kommt eine Pflicht dazu («Document»/«Approval» neu, ein Punkt der Checkliste
 * neu oder anders)? Dann beginnt die Unteraufgabe beim Speichern offen von
 * vorn — wortgleich mit `requirementsAdded` des Servers (28.09.2026).
 */
export const requirementsAdded = (
    before: Pick<TaskSubtask, 'requiresDocument' | 'requiresApproval' | 'approvalChecklist'>,
    after: Pick<TaskSubtask, 'requiresDocument' | 'requiresApproval' | 'approvalChecklist'>,
): boolean => {
    if (after.requiresDocument && !before.requiresDocument) return true;
    if (after.requiresApproval && !before.requiresApproval) return true;
    const earlier = new Map(before.approvalChecklist.map((item) => [item.id, item.text]));
    return after.approvalChecklist.some((item) => earlier.get(item.id) !== item.text.replace(/\s+/g, ' ').trim());
};

/** Was an eine Unteraufgabe darf — wie der Server: nur PDF, höchstens 25 MB. */
export const SUBTASK_FILE_ACCEPT = 'application/pdf';
export const SUBTASK_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** Der Stand einer Aufgabe aus dem ihrer Unteraufgaben — wortgleich mit dem Server. */
export const statusOfSubtasks = (subtasks: ReadonlyArray<{ status: TaskStatus }>): TaskStatus | null => {
    if (!subtasks.length) return null;
    if (subtasks.every((subtask) => subtask.status === 'DONE')) return 'DONE';
    // Alles fertig, aber noch nicht alles freigegeben: die Aufgabe wartet auf die Freigabe.
    if (subtasks.every((subtask) => subtask.status === 'DONE' || subtask.status === 'PENDING')) return 'PENDING';
    if (subtasks.some((subtask) => subtask.status !== 'TODO')) return 'IN_PROGRESS';
    return 'TODO';
};

/* ── Tage ──────────────────────────────────────────────────────────────── */

/** Heute als Kalendertag `YYYY-MM-DD` (Ortszeit) — der Tag des Anlegens. */
export const localToday = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/**
 * Ein Kalendertag wie im Datumsfeld (MacDatePicker) und im Rest der
 * Anwendung — «01.10.2026», in jeder Sprache.
 */
export const formatDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/**
 * Die Gewichte der Unteraufgaben zusammen — Anteile an ihrer Aufgabe,
 * höchstens 100 % (28.09.2026). Wortgleich mit `subtaskWeightSum` des Servers.
 */
export const subtaskWeightSum = (subtasks: ReadonlyArray<{ weight: number | null }>): number =>
    roundPercent(subtasks.reduce((sum, subtask) => sum + (subtask.weight ?? 0), 0));

/**
 * Was eine Unteraufgabe im Bereich wiegt: ihr Anteil an der Aufgabe × das
 * Gewicht der Aufgabe («10 means 10% of its parent»: 10 % von 50 % = 5 %).
 */
export const subtaskSectionWeight = (taskWeight: number, subtaskWeight: number): number =>
    roundPercent((taskWeight * subtaskWeight) / 100);

/** Beginn und Termin als EINE Angabe: «01.10.2026 – 05.10.2026», «ab …», «bis …». */
export const dateRangeLabel = (startDate: string | null, dueDate: string | null): string => {
    if (startDate && dueDate) return `${formatDay(startDate)} – ${formatDay(dueDate)}`;
    if (startDate) return t('productionTasks.dates.from', { date: formatDay(startDate) });
    if (dueDate) return t('productionTasks.dates.until', { date: formatDay(dueDate) });
    return '';
};

/**
 * Passt eine Unteraufgabe in die Tage ihrer Aufgabe (am Gerät)? «order»: ihr
 * Termin liegt vor ihrem Beginn; «outside»: ein Tag liegt vor dem Beginn oder
 * nach dem Termin der Aufgabe. Wortgleich mit `taskDatesProblem` des Servers.
 */
export const subtaskDatesProblem = (
    task: { startDate: string | null; dueDate: string | null },
    subtask: { startDate: string | null; dueDate: string | null },
): 'order' | 'outside' | null => {
    if (subtask.startDate && subtask.dueDate && subtask.startDate > subtask.dueDate) return 'order';
    for (const day of [subtask.startDate, subtask.dueDate]) {
        if (!day) continue;
        if ((task.startDate && day < task.startDate) || (task.dueDate && day > task.dueDate)) return 'outside';
    }
    return null;
};

/* ── Kürzel ────────────────────────────────────────────────────────────── */

/**
 * Das Kürzel-Präfix je Bereich — wortgleich mit dem Server: M und E für die
 * festen, sonst der Anfang des Namens («Hidrolik» → H). Je Vorlage eindeutig:
 * ist der Buchstabe vergeben, werden es zwei («Montaj» → MO).
 */
export const sectionPrefixes = (sections: readonly Pick<TaskSection, 'key' | 'name'>[]): Map<TaskArea, string> => {
    const used = new Set<string>();
    const prefixes = new Map<TaskArea, string>();
    for (const section of sections) {
        const letters = section.key === 'MECHANICAL' ? 'M'
            : section.key === 'ELECTRICAL' ? 'E'
                : section.name.toLocaleUpperCase('tr-TR').replace(/[^\p{L}]/gu, '');
        const base = letters || 'T';
        let prefix = [base.slice(0, 1), base.slice(0, 2), base.slice(0, 3)].find((candidate) => !used.has(candidate));
        for (let number = 2; !prefix; number += 1) {
            if (!used.has(`${base.slice(0, 1)}${number}`)) prefix = `${base.slice(0, 1)}${number}`;
        }
        used.add(prefix);
        prefixes.set(section.key, prefix);
    }
    return prefixes;
};

/**
 * «Create the task codes automatically» (28.09.2026): je Bereich laufend in
 * der Reihenfolge des Weges — M-01, M-02 … wie in Samets Chiller-Liste.
 */
export const numberTasks = <T extends Pick<ProductionTask, 'area' | 'stage' | 'code'>>(tasks: readonly T[], sections: readonly TaskSection[]): T[] => {
    const prefixes = sectionPrefixes(sections);
    const counters = new Map<TaskArea, number>();
    return orderTasks(tasks, sections).map((task) => {
        const number = (counters.get(task.area) ?? 0) + 1;
        counters.set(task.area, number);
        const code = `${prefixes.get(task.area) ?? 'T'}-${String(number).padStart(2, '0')}`;
        return code === task.code ? task : { ...task, code };
    });
};

/** Die Nummer einer Unteraufgabe unter ihrer Aufgabe: M-03.1, M-03.2 … */
export const subtaskCode = (taskCode: string, index: number): string => `${taskCode}.${index + 1}`;

/* ── Personen ──────────────────────────────────────────────────────────── */

/** Der Name einer Zeile des Personalverzeichnisses. */
export const staffName = (row: { firstName?: string | null; lastName?: string | null }): string =>
    `${row.firstName ?? ''} ${row.lastName ?? ''}`.replace(/\s+/g, ' ').trim();

/** «Ahmet Yılmaz» → «Ahmet Y.» — kurz genug für eine Kapsel in der Karte. */
export const shortName = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return name.trim();
    const last = parts[parts.length - 1];
    return `${parts.slice(0, -1).join(' ')} ${last.charAt(0).toLocaleUpperCase('tr-TR')}.`;
};

/** Zwei Buchstaben für den runden Namenspunkt. */
/**
 * Die Farbe des Kreises einer Person (29.09.2026: «make the image circles
 * colored, different for each person»). Fest an der Kennung — dieselbe Person
 * trägt überall dieselbe Farbe. Zwölf satte Töne, auf denen weisse Initialen
 * hell wie dunkel lesbar bleiben (Kontrast je mindestens 4,5:1); bei mehr
 * Personen können sich Farben wiederholen.
 */
const PERSON_TONES = [
    '#c92a2a', '#a61e4d', '#862e9c', '#5f3dc4', '#364fc7', '#1864ab',
    '#0b7285', '#087f5b', '#237a36', '#4d7c0f', '#c2410c', '#b35c00',
] as const;

export const personTone = (id: string): string => {
    let sum = 0;
    for (let index = 0; index < id.length; index += 1) sum = (sum * 31 + id.charCodeAt(index)) % 100_000;
    return PERSON_TONES[sum % PERSON_TONES.length];
};

export const initialsOf = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.charAt(0) ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr-TR') || '?';
};
