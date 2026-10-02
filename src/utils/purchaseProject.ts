import type { PurchaseOrderRow } from '@/types/inventory';
import { companyRequiresPurchaseRecipientAndProject, currentCompanyType } from '@/lib/companyType';

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

/**
 * ── PROJE ADI, PROJE VE SATIŞ ŞİRKETİNDE (01.10.2026, Samet) ────────────────
 *
 * Proje ve satış şirketlerinde stok siparişi ve stok fiyat talebi alıcı adı ile
 * proje adını taşır (zorunlu değil) (`lib/companyType.ts`). PDF'te serbest metin
 * «Kommission» değil «Projekt» olarak basılır; proje numarası varsa o da
 * kendi satırında kalır. BOM belgeleri (üretim) hiç değişmez.
 */
export const purchaseShowsProjectName = (order: ProjectSources): boolean =>
    !order.bomOrigin && companyRequiresPurchaseRecipientAndProject(currentCompanyType());

interface ProjectLabels {
    project: string;
    projectNumber: string;
    projectName: string;
    notesCommission: string;
    notesProject: string;
    notesProjectName: string;
}

/** Belge kartının proje satırları — numara, Kommission ya da proje adı. */
export const purchaseProjectCardRows = (order: ProjectSources, L: ProjectLabels): Array<{ label: string; value: string }> => {
    const project = purchaseProjectOf(order);
    const numberRow = project?.number ? [{ label: L.projectNumber, value: project.number }] : [];
    if (purchaseShowsProjectName(order)) return [...numberRow, { label: L.projectName, value: purchaseCommissionOf(order, project) }];
    return numberRow.length ? numberRow : [{ label: L.project, value: purchaseCommissionOf(order, null) }];
};

/** Hinweise: «… sowie die Projektnummer / die Kommission / das Projekt …» oder nichts. */
export const purchaseNotesReference = (order: ProjectSources, L: ProjectLabels): string => {
    const project = purchaseProjectOf(order);
    if (project?.number) return L.notesProject.replace('{p}', project.number);
    const commission = purchaseCommissionOf(order, project);
    if (!commission) return '';
    return (purchaseShowsProjectName(order) ? L.notesProjectName : L.notesCommission).replace('{c}', commission);
};
