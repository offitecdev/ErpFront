/**
 * Die Adressen des Checklisten-Bereichs an EINER Stelle — der Bereich hat zwei
 * Seiten (Reiter) und darunter den Vorlagen-Editor. Getippte Pfade statt
 * verstreuter Zeichenketten: wer die Adresse ändert, ändert sie hier.
 */
export const CHECKLIST_PATHS = {
    checklists: '/crm/forms',
    templates: '/crm/forms/templates',
} as const;

export type ChecklistTabKey = keyof typeof CHECKLIST_PATHS;

export const NEW_TEMPLATE_PATH = '/crm/forms/templates/new';

export const templateEditorPath = (templateId: string): string => `${CHECKLIST_PATHS.templates}/${templateId}`;
