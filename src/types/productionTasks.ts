/**
 * ── GÖREVLENDİRME DER PRODUKTION (26.09.2026) — die Antworten von /production ──
 * Spiegel von Erp_Backend/src/application/use-cases/production/productionTaskReadModel.ts
 * (und den Regeln in domain/services/productionTasks.ts).
 */

/** Der Bereich («bölüm») einer Aufgabe. */
export type TaskArea = 'MECHANICAL' | 'ELECTRICAL';

/**
 * Die Arbeitsstufen der zwei Wege (27.09.2026), an denen Aufgaben hängen:
 * Mekanik equipment · drawing · approval · bom · production · test · final,
 * Elektrik circuit · approval · bom · panel · test · final.
 */
export type TaskStage =
    | 'equipment'
    | 'circuit'
    | 'drawing'
    | 'approval'
    | 'bom'
    | 'production'
    | 'panel'
    | 'test'
    | 'final';

export type AreaShares = Record<TaskArea, number>;

export interface ProductionTask {
    id: string;
    area: TaskArea;
    stage: TaskStage;
    code: string;
    name: string;
    /** Gewicht innerhalb des Bereichs, in Prozent. */
    weight: number;
    assigneeIds: string[];
}

export interface TaskPerson {
    id: string;
    name: string;
    /** false: ausgetreten, gesperrt oder nicht mehr in dieser Firma. */
    active: boolean;
}

export interface TaskAreaCheck {
    area: TaskArea;
    share: number;
    taskCount: number;
    weightSum: number;
    ok: boolean;
}

export interface TaskTemplateCheck {
    valid: boolean;
    sharesSum: number;
    sharesOk: boolean;
    areas: TaskAreaCheck[];
}

export interface TaskTemplateSummary {
    id: string;
    name: string;
    areaShares: AreaShares;
    taskCount: number;
    check: TaskTemplateCheck;
    /** Auf so vielen Geräten liegt eine Kopie dieser Vorlage. */
    usedBy: number;
    isExample: boolean;
    updatedAt: string;
}

export interface TaskTemplate {
    id: string;
    name: string;
    areaShares: AreaShares;
    tasks: ProductionTask[];
    people: TaskPerson[];
    check: TaskTemplateCheck;
    isExample: boolean;
    createdAt: string;
    updatedAt: string;
    updatedByName: string | null;
}

/** Was die Vorlage beim Speichern schickt. */
export interface TaskTemplateInput {
    name: string;
    areaShares: AreaShares;
    tasks: Array<Omit<ProductionTask, 'id'>>;
}

export interface DeviceTaskPlan {
    id: string;
    templateId: string | null;
    templateName: string;
    areaShares: AreaShares;
    loadedAt: string;
    loadedByName: string | null;
}

export interface DeviceTasks {
    device: {
        id: string;
        projectId: string;
        name: string;
        positionNumber: string | null;
        projectNumber: string;
        projectName: string;
    };
    plan: DeviceTaskPlan | null;
    tasks: ProductionTask[];
    people: TaskPerson[];
}
