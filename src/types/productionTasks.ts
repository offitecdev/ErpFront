/**
 * ── GÖREVLENDİRME DER PRODUKTION (26.09.2026) — die Antworten von /production ──
 * Spiegel von Erp_Backend/src/application/use-cases/production/productionTaskReadModel.ts
 * (und den Regeln in domain/services/productionTasks.ts).
 *
 * Seit dem 28.09.2026 bringt jede Vorlage ihre Bereiche mit (`sections`):
 * Name, Anteil und die Stufen in der Reihenfolge des Weges. Die Vorlagen von
 * vorher tragen die festen Bereiche Mekanik / Elektrik mit den festen Stufen.
 */

/** Die zwei festen Bereiche — die Vorlagen von vorher und die BOM hängen an ihnen. */
export type BuiltInArea = 'MECHANICAL' | 'ELECTRICAL';

/** Die Kennung eines Bereichs («bölüm»): ein fester oder ein eigener der Vorlage («s-…»). */
export type TaskArea = string;

/**
 * Die festen Arbeitsstufen der zwei Wege (27.09.2026):
 * Mekanik equipment · drawing · approval · bom · production · test · final,
 * Elektrik circuit · approval · bom · panel · test · final.
 */
export type BuiltInStage =
    | 'equipment'
    | 'circuit'
    | 'drawing'
    | 'approval'
    | 'bom'
    | 'production'
    | 'panel'
    | 'test'
    | 'final';

/** Die Kennung einer Stufe: eine feste oder eine eigene des Bereichs («g-…»). */
export type TaskStage = string;

export interface TaskSectionStage {
    key: TaskStage;
    /** Leer bei den festen Stufen — ihr Name kommt aus der Übersetzung. */
    name: string;
}

export interface TaskSection {
    key: TaskArea;
    /** Leer bei den festen Bereichen — ihr Name kommt aus der Übersetzung. */
    name: string;
    /** Anteil an der Gesamtfertigstellung, in Prozent. */
    share: number;
    /** In der Reihenfolge des Weges. */
    stages: TaskSectionStage[];
}

/** Der Stand einer Aufgabe am Gerät (28.09.2026); in der Vorlage immer TODO. */
/** PENDING = fertig, wartet auf die Freigabe der Verwaltung (28.09.2026, nur mit «Approval»). */
/** REVISION (28.09.2026) = von der Verwaltung zur Überarbeitung zurückgegeben (nur an Unteraufgaben). */
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVISION' | 'PENDING' | 'DONE';

/** Ein Kalendertag `YYYY-MM-DD`. */
export type TaskDay = string;

/**
 * Eine Unteraufgabe — mit Beginn und Termin (innerhalb der Tage ihrer
 * Aufgabe) und den zwei Pflichtfeldern «Document» und «Approval».
 */
/** Eine Datei an einer Unteraufgabe am Gerät (28.09.2026). */
export interface TaskSubtaskFile {
    id: string;
    /** Fassungen derselben Datei (28.09.2026): gleiche `groupId` (die Kennung der ersten Fassung). */
    groupId: string;
    /** 1, 2, 3 … — die höchste Fassung einer Gruppe ist die aktuelle. */
    version: number;
    /** Was sich in dieser Fassung geändert hat (ab Fassung 2 Pflicht); null bei der ersten. */
    revisionNote: string | null;
    name: string;
    type: string;
    size: number;
    uploadedById: string | null;
    uploadedByName: string | null;
    /** Zeitpunkt (ISO). */
    uploadedAt: string;
}

/** Ein Punkt der Freigabe-Checkliste einer Unteraufgabe (28.09.2026). */
export interface TaskSubtaskChecklistItem {
    id: string;
    text: string;
}

export interface TaskSubtask {
    id: string;
    /** Der Stand am Gerät (28.09.2026); in der Vorlage immer TODO. */
    status: TaskStatus;
    name: string;
    /** Der Tag des Anlegens — Beginn, solange keiner gesetzt ist. */
    createdAt: TaskDay | null;
    /** Gewicht als Anteil an der AUFGABE, in Prozent (zusammen höchstens 100 %); null = ohne. */
    weight: number | null;
    startDate: TaskDay | null;
    dueDate: TaskDay | null;
    requiresDocument: boolean;
    requiresApproval: boolean;
    /** Die Freigabe-Checkliste (nur mit «Approval», sonst leer). */
    approvalChecklist: TaskSubtaskChecklistItem[];
    /** Dateien am Gerät (in der Vorlage keine). */
    files: TaskSubtaskFile[];
    /** Abgeschlossen («Complete the task», die Verwaltung) — danach gesperrt. */
    completedById: string | null;
    completedByName: string | null;
    completedAt: string | null;
    completionNote: string | null;
    /** Zurück zur Überarbeitung («Request revision», die Verwaltung) — der Abschluss leert es. */
    revisionById: string | null;
    revisionByName: string | null;
    revisionAt: string | null;
    revisionNote: string | null;
    /** Jede Rückgabe zur Überarbeitung, älteste zuerst — bleibt auch nach der Freigabe (28.09.2026). */
    revisionHistory: TaskSubtaskRevisionRequest[];
}

/** Eine Rückgabe zur Überarbeitung (28.09.2026): wer, wann (ISO), was zu ändern war. */
export interface TaskSubtaskRevisionRequest {
    byId: string | null;
    byName: string | null;
    at: string;
    note: string | null;
}

export interface ProductionTask {
    id: string;
    area: TaskArea;
    stage: TaskStage;
    code: string;
    name: string;
    /** Gewicht innerhalb des Bereichs, in Prozent. */
    weight: number;
    assigneeIds: string[];
    /** Beginn und Termin (28.09.2026) — frei lassbar. */
    startDate: TaskDay | null;
    dueDate: TaskDay | null;
    /** Der Tag des Anlegens (am Gerät: des Ladens) — Beginn, solange keiner gesetzt ist. */
    createdAt: TaskDay | null;
    status: TaskStatus;
    subtasks: TaskSubtask[];
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
    sections: TaskSection[];
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
    sections: TaskSection[];
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
    sections: TaskSection[];
    tasks: Array<Omit<ProductionTask, 'id' | 'status'>>;
}

export interface DeviceTaskPlan {
    id: string;
    templateId: string | null;
    templateName: string;
    /** Die Bereiche und Stufen, wie sie beim Laden galten — der Weg des Geräts. */
    sections: TaskSection[];
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
