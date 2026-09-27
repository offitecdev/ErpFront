import i18n from '@/i18n';
import type {
    AreaShares,
    ProductionTask,
    TaskArea,
    TaskAreaCheck,
    TaskStage,
    TaskTemplateCheck,
} from '@/types/productionTasks';

/**
 * ── GÖREVLENDİRME · DAS MODELL IM BROWSER (26.09.2026) ─────────────────────
 *
 * Bereiche, Stufen und Rechnen — wortgleich mit den Regeln des Servers
 * (Erp_Backend/src/domain/services/productionTasks.ts). Die Oberfläche prüft
 * damit schon beim Tippen, ob eine Vorlage aufgeht; entscheiden tut der Server.
 */

export const TASK_AREAS: readonly TaskArea[] = ['MECHANICAL', 'ELECTRICAL'];

/**
 * Die zwei Wege (27.09.2026, Vorgabe Samet: «üretim hedef yolu iki yola
 * ayrılmalıdır»):
 *   Mekanik   Compressor seçimi & PID › Teknik çizim › Final çizim onayı ›
 *             BOM › Üretim/Montaj › Test › Final
 *   Elektrik  Teknik devre çizimi (EPLAN) › Final çizim onayı › BOM ›
 *             Pano imalatı › Test › Final
 */
export const AREA_STAGES: Readonly<Record<TaskArea, readonly TaskStage[]>> = {
    MECHANICAL: ['equipment', 'drawing', 'approval', 'bom', 'production', 'test', 'final'],
    ELECTRICAL: ['circuit', 'approval', 'bom', 'panel', 'test', 'final'],
};

/**
 * Dieselbe Stelle im anderen Weg — wortgleich mit `STAGE_TWINS` des Servers:
 * die Zeichnungen werden zum EPLAN-Stromlauf (und zurück zur ersten Stufe der
 * Mekanik), die Montage zum Schaltschrankbau. Gibt es keine Entsprechung,
 * beginnt der Weg vorn.
 */
const STAGE_TWINS: Readonly<Partial<Record<string, Partial<Record<TaskArea, TaskStage>>>>> = {
    equipment: { ELECTRICAL: 'circuit' },
    circuit: { MECHANICAL: 'equipment' },
    drawing: { ELECTRICAL: 'circuit' },
    production: { ELECTRICAL: 'panel' },
    panel: { MECHANICAL: 'production' },
    purchasing: { MECHANICAL: 'bom', ELECTRICAL: 'bom' },
};

export const twinStage = (stage: string, area: TaskArea): TaskStage =>
    (AREA_STAGES[area] as readonly string[]).includes(stage)
        ? stage as TaskStage
        : STAGE_TWINS[stage]?.[area] ?? AREA_STAGES[area][0];

export const TASK_LIMITS = { templateName: 120, code: 16, taskName: 200, tasks: 200 } as const;

const SUM_TOLERANCE = 0.01;

/** Die Adresse schreibt den Bereich klein (`?area=electrical`). */
export const areaParam = (area: TaskArea): 'mechanical' | 'electrical' => (area === 'ELECTRICAL' ? 'electrical' : 'mechanical');
export const areaFromParam = (value: string | null): TaskArea => (value === 'electrical' ? 'ELECTRICAL' : 'MECHANICAL');

export const areaLabelKey = (area: TaskArea): string => `productionTasks.area.${areaParam(area)}`;
/** Die Stufen tragen die Namen der Prozessleiste. */
export const stageLabelKey = (stage: TaskStage): string => `production.deviceStages.${stage}`;

export const isStageOfArea = (area: TaskArea, stage: string): stage is TaskStage =>
    (AREA_STAGES[area] as readonly string[]).includes(stage);

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

/** Beitrag einer Aufgabe zur Gesamtfertigstellung: Gewicht × Anteil des Bereichs. */
export const overallOf = (weight: number, share: number): number => roundPercent((weight * share) / 100);

/** Eine Zahl aus einem Feld («12,5» wie «12.5»); leer/ungültig → null. */
export const parsePercent = (value: string): number | null => {
    const clean = value.replace(/\s+/g, '').replace('%', '').replace(',', '.');
    if (!clean) return null;
    const number = Number(clean);
    if (!Number.isFinite(number) || number < 0 || number > 100) return null;
    return roundPercent(number);
};

type WeightedTask = Pick<ProductionTask, 'area' | 'stage' | 'weight'>;

/** Aufgaben und Gewichtssumme je Bereich. */
export const areaTotals = (tasks: readonly WeightedTask[]): Record<TaskArea, { taskCount: number; weightSum: number }> => {
    const totals = {} as Record<TaskArea, { taskCount: number; weightSum: number }>;
    for (const area of TASK_AREAS) totals[area] = { taskCount: 0, weightSum: 0 };
    for (const task of tasks) {
        const entry = totals[task.area];
        if (!entry) continue;
        entry.taskCount += 1;
        entry.weightSum = roundPercent(entry.weightSum + task.weight);
    }
    return totals;
};

/** Geht die Vorlage auf? Wortgleich mit `templateCheck` des Servers. */
export const checkTemplate = (areaShares: AreaShares, tasks: readonly WeightedTask[]): TaskTemplateCheck => {
    const totals = areaTotals(tasks);
    const sharesSum = roundPercent(TASK_AREAS.reduce((sum, area) => sum + (areaShares[area] ?? 0), 0));
    const sharesOk = Math.abs(sharesSum - 100) <= SUM_TOLERANCE;
    const areas = TASK_AREAS.map((area): TaskAreaCheck => {
        const share = areaShares[area] ?? 0;
        const { taskCount, weightSum } = totals[area];
        const ok = taskCount > 0 ? Math.abs(weightSum - 100) <= SUM_TOLERANCE : share === 0;
        return { area, share, taskCount, weightSum, ok };
    });
    const hasTasks = areas.some((entry) => entry.taskCount > 0);
    return { valid: sharesOk && hasTasks && areas.every((entry) => entry.ok), sharesSum, sharesOk, areas };
};

/** Gewichtssumme einer Stufe in einem Bereich. */
export const stageWeight = (tasks: readonly WeightedTask[], area: TaskArea, stage: TaskStage): number =>
    roundPercent(tasks.reduce((sum, task) => (task.area === area && task.stage === stage ? sum + task.weight : sum), 0));

/** Die Aufgaben eines Bereichs, nach Stufen gruppiert (in der Reihenfolge des Weges). */
export const tasksByStage = <T extends Pick<ProductionTask, 'area' | 'stage'>>(tasks: readonly T[], area: TaskArea): Map<TaskStage, T[]> => {
    const groups = new Map<TaskStage, T[]>();
    for (const stage of AREA_STAGES[area]) groups.set(stage, []);
    for (const task of tasks) {
        if (task.area !== area) continue;
        groups.get(task.stage)?.push(task);
    }
    return groups;
};

/** Reihenfolge wie beim Server: Bereich, Stufe des Weges, dann wie eingegeben. */
export const orderTasks = <T extends Pick<ProductionTask, 'area' | 'stage'>>(tasks: readonly T[]): T[] =>
    tasks
        .map((task, index) => ({ task, index }))
        .sort((left, right) => {
            const area = TASK_AREAS.indexOf(left.task.area) - TASK_AREAS.indexOf(right.task.area);
            if (area) return area;
            const stages = AREA_STAGES[left.task.area];
            return (stages.indexOf(left.task.stage) - stages.indexOf(right.task.stage)) || left.index - right.index;
        })
        .map((entry) => entry.task);

const codeKey = (code: string): string => code.replace(/\s+/g, '').toLocaleUpperCase('tr-TR');
export const sameCode = (left: string, right: string): boolean => codeKey(left) === codeKey(right);

/**
 * Das nächste freie Kürzel eines Bereichs: M-15 nach M-14, E-16 nach E-15.
 * Folgt die Vorlage einem anderen Muster, bleibt es beim Vorschlag M-/E- mit
 * der nächsten freien Nummer.
 */
export const suggestCode = (tasks: ReadonlyArray<Pick<ProductionTask, 'area' | 'code'>>, area: TaskArea): string => {
    const prefix = area === 'ELECTRICAL' ? 'E' : 'M';
    let highest = 0;
    for (const task of tasks) {
        const match = /^([A-Za-zÇĞİÖŞÜçğıöşü]+)-?(\d+)$/.exec(task.code.trim());
        if (match && match[1].toLocaleUpperCase('tr-TR') === prefix) highest = Math.max(highest, Number(match[2]));
    }
    let next = highest + 1;
    const taken = (candidate: string) => tasks.some((task) => sameCode(task.code, candidate));
    let code = `${prefix}-${String(next).padStart(2, '0')}`;
    while (taken(code)) {
        next += 1;
        code = `${prefix}-${String(next).padStart(2, '0')}`;
    }
    return code;
};

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
export const initialsOf = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.charAt(0) ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr-TR') || '?';
};
