import type { PurchaseOrderRow } from '@/types/inventory';

/**
 * ── PROJEKT UND KOMMISSION EINES LIEFERANTENBELEGS (29.09.2026, Samet) ──────
 *
 * «Komisyonda sadece projenin adı yazsın … proje kodu ayrı yerde, komisyonu
 *  ayrı yerde yazması lazım.»
 *
 * Die PROJEKTNUMMER kommt aus der Zuordnung des Belegs: in Listen aus
 * `project` (der Server liest sie aus uretim_siparis_atamalari), sonst aus der
 * BOM-Herkunft oder dem zugeordneten Produktionsprojekt. Die KOMMISSION ist der
 * Freitext des Belegs (`projectName`). Ältere Belege trugen dort die Nummer
 * gleich mit — «PR-2026-40009 · gsg — Gerät (BOM)» von der BOM, «PR-… · Name»
 * von der Projektwahl: beginnt der Text mit der Projektnummer, gilt nur der
 * Projektname. Ohne eigenen Text ist die Kommission der Projektname.
 */
export interface PurchaseProjectRef {
    number: string;
    name: string;
}

type ProjectSources = Partial<Pick<PurchaseOrderRow, 'project' | 'bomOrigin' | 'production' | 'projectName'>>;

export const purchaseProjectOf = (order: ProjectSources): PurchaseProjectRef | null => {
    if (order.project?.number) return { number: order.project.number, name: order.project.name ?? '' };
    if (order.bomOrigin?.projectNumber) return { number: order.bomOrigin.projectNumber, name: order.bomOrigin.projectName ?? '' };
    const project = order.production?.project;
    return project?.projectNumber ? { number: project.projectNumber, name: project.projectName ?? '' } : null;
};

export const purchaseCommissionOf = (order: ProjectSources, project: PurchaseProjectRef | null = purchaseProjectOf(order)): string => {
    const typed = String(order.projectName ?? '').replace(/\s+/g, ' ').trim();
    if (project?.number && project.name.trim() && typed.startsWith(project.number)) return project.name.trim();
    return typed || project?.name.trim() || '';
};
