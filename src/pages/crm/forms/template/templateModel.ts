import { t } from '@/i18n/translate';
import type { FormTemplateDto, FormTemplateInput } from '@/lib/api/forms';
import {
    newFieldId,
    operatorsForField,
    type FormCondition,
    type FormFieldDef,
    type FormFieldType,
} from '@/lib/formFields';

/**
 * Der Vorlagen-Entwurf und alle Änderungen daran — REINE Funktionen ohne
 * React, damit der Editor (useTemplateEditor) nur noch Zustand hält und die
 * Seite nur noch zeichnet.
 *
 * Eine Regel zieht sich durch: eine Bedingung darf nur auf ein FRÜHERES Feld
 * zeigen und nur einen Operator führen, der zu diesem Feld passt (der Server
 * erzwingt dasselbe). Statt sie an jeder Stelle einzeln nachzuziehen, läuft
 * jede Feldänderung durch `normalizeConditions` — Verschieben, Löschen und
 * Typwechsel können damit keine ungültige Bedingung hinterlassen.
 */
export interface TemplateDraft {
    name: string;
    description: string;
    category: string;
    isActive: boolean;
    fields: FormFieldDef[];
}

export const emptyDraft = (): TemplateDraft => ({
    name: '',
    description: '',
    category: '',
    isActive: true,
    fields: [],
});

export const draftFromTemplate = (template: FormTemplateDto): TemplateDraft => ({
    name: template.name,
    description: template.description || '',
    category: template.category || '',
    isActive: template.isActive,
    fields: Array.isArray(template.fields) ? template.fields : [],
});

/** Was gespeichert wird: getrimmt, leere Optionen fallen weg. */
export const draftToInput = (draft: TemplateDraft): FormTemplateInput => ({
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    category: draft.category.trim() || null,
    isActive: draft.isActive,
    fields: draft.fields.map((field) => ({
        ...field,
        label: field.label.trim(),
        options: field.options?.filter((option) => option.label.trim()),
    })),
});

/** Vergleichswert für "geändert?" — Reihenfolge der Felder zählt mit. */
export const draftSignature = (draft: TemplateDraft): string => JSON.stringify(draft);

// ── Bedingungen ──────────────────────────────────────────────────────────────

/**
 * Löst jede Bedingung, die nicht (mehr) tragfähig ist: Bezugsfeld fehlt, steht
 * nicht oberhalb, ist ein Abschnitt oder der Operator passt nicht zum Typ.
 */
const normalizeConditions = (fields: FormFieldDef[]): FormFieldDef[] => {
    const positionById = new Map(fields.map((field, index) => [field.id, index]));
    return fields.map((field, index) => {
        const condition = field.visibleWhen;
        if (!condition) return field;
        const source = fields.find((candidate) => candidate.id === condition.fieldId);
        const sourcePosition = positionById.get(condition.fieldId) ?? -1;
        const valid = Boolean(source)
            && sourcePosition >= 0
            && sourcePosition < index
            && operatorsForField(source).includes(condition.operator);
        return valid ? field : { ...field, visibleWhen: null };
    });
};

/** Felder OBERHALB (ohne Abschnitte) — die möglichen Bezugsfelder. */
export const conditionSources = (fields: FormFieldDef[], index: number): FormFieldDef[] =>
    fields.slice(0, index).filter((field) => field.type !== 'SECTION');

/** Bedingung als Satz — für den Hinweis an der Feldzeile. */
export const describeCondition = (fields: FormFieldDef[], field: FormFieldDef): string | null => {
    const condition = field.visibleWhen;
    if (!condition) return null;
    const source = fields.find((candidate) => candidate.id === condition.fieldId);
    if (!source) return null;
    const label = source.label.trim() || t('forms.builder.unnamedField');
    const operator = t(`forms.operators.${condition.operator}`);
    if (!condition.value) return `${label} ${operator}`;
    const option = source.options?.find((candidate) => candidate.id === condition.value);
    return `${label} ${operator} ${option?.label || condition.value}`;
};

// ── Feldliste bearbeiten ─────────────────────────────────────────────────────

export const patchField = (fields: FormFieldDef[], fieldId: string, patch: Partial<FormFieldDef>): FormFieldDef[] =>
    normalizeConditions(fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)));

/**
 * Typwechsel EINES Feldes: Eigenschaften, die zum neuen Typ nicht passen,
 * fallen weg — sonst schleppt ein Feld z. B. Auswahlmöglichkeiten mit, die
 * niemand sieht. Das Fenster ändert damit sein Feld, die Liste ihres.
 */
export const retypeOne = (field: FormFieldDef, type: FormFieldType): FormFieldDef => {
    const next: FormFieldDef = { ...field, type };
    if (type === 'SELECT') {
        if (!next.options?.length) next.options = [{ id: newFieldId(), label: '' }, { id: newFieldId(), label: '' }];
        next.display = next.display || 'dropdown';
    } else {
        delete next.options;
        delete next.display;
    }
    if (type !== 'TEXT') delete next.multiline;
    if (type === 'SECTION') {
        delete next.required;
        delete next.placeholder;
    }
    return next;
};

export const retypeField = (fields: FormFieldDef[], fieldId: string, type: FormFieldType): FormFieldDef[] =>
    normalizeConditions(fields.map((field) => (field.id === fieldId ? retypeOne(field, type) : field)));

/** Ein im Fenster fertig ausgefülltes Feld ans Ende hängen. */
export const addField = (fields: FormFieldDef[], field: FormFieldDef): FormFieldDef[] =>
    normalizeConditions([...fields, field]);

/** Ein im Fenster geändertes Feld zurückschreiben (gleiche Id, gleicher Platz). */
export const replaceField = (fields: FormFieldDef[], next: FormFieldDef): FormFieldDef[] =>
    normalizeConditions(fields.map((field) => (field.id === next.id ? next : field)));

export const copyField = (fields: FormFieldDef[], index: number): FormFieldDef[] => {
    const source = fields[index];
    if (!source) return fields;
    const copy: FormFieldDef = {
        ...source,
        id: newFieldId(),
        options: source.options?.map((option) => ({ ...option, id: newFieldId() })),
    };
    const next = [...fields];
    next.splice(index + 1, 0, copy);
    return normalizeConditions(next);
};

export const dropField = (fields: FormFieldDef[], fieldId: string): FormFieldDef[] =>
    normalizeConditions(fields.filter((field) => field.id !== fieldId));

export const moveField = (fields: FormFieldDef[], index: number, delta: number): FormFieldDef[] => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return fields;
    const next = [...fields];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return normalizeConditions(next);
};

// ── Prüfung vor dem Speichern ────────────────────────────────────────────────

export type DraftIssue =
    | { kind: 'NAME_MISSING' }
    | { kind: 'LABEL_MISSING'; count: number }
    | { kind: 'OPTIONS_MISSING'; count: number };

export const validateDraft = (draft: TemplateDraft): DraftIssue[] => {
    const issues: DraftIssue[] = [];
    if (!draft.name.trim()) issues.push({ kind: 'NAME_MISSING' });

    const unlabeled = draft.fields.filter((field) => !field.label.trim()).length;
    if (unlabeled > 0) issues.push({ kind: 'LABEL_MISSING', count: unlabeled });

    const withoutOptions = draft.fields.filter(
        (field) => field.type === 'SELECT' && !(field.options || []).some((option) => option.label.trim()),
    ).length;
    if (withoutOptions > 0) issues.push({ kind: 'OPTIONS_MISSING', count: withoutOptions });

    return issues;
};

/**
 * Prüfung EINES Feldes — das Fenster lässt nur ein brauchbares Feld heraus,
 * damit die Liste keine halbfertigen Zeilen sammelt.
 */
export type FieldIssue = 'LABEL_MISSING' | 'OPTIONS_MISSING';

export const validateField = (field: FormFieldDef): FieldIssue | null => {
    if (!field.label.trim()) return 'LABEL_MISSING';
    if (field.type === 'SELECT' && !(field.options || []).some((option) => option.label.trim())) return 'OPTIONS_MISSING';
    return null;
};

export const fieldIssueMessage = (issue: FieldIssue): string =>
    (issue === 'LABEL_MISSING' ? t('forms.builder.labelMissing') : t('forms.builder.optionsRequired'));

export const issueMessage = (issue: DraftIssue): string => {
    switch (issue.kind) {
        case 'NAME_MISSING': return t('forms.builder.nameRequired');
        case 'LABEL_MISSING': return t('forms.builder.labelRequired', { count: issue.count });
        case 'OPTIONS_MISSING': return t('forms.builder.optionsRequired');
    }
};

/** Felder ohne Abschnitte — das, was tatsächlich ausgefüllt wird. */
export const countInputFields = (fields: FormFieldDef[]): number =>
    fields.filter((field) => field.type !== 'SECTION').length;

/**
 * Beispielgruppe für die leere Vorlage: ein Prüfpunkt und drei Masse, die nur
 * erscheinen, wenn er angekreuzt ist — die kürzeste Vorführung dessen, was
 * Bedingungen können.
 */
export const sampleConditionGroup = (): FormFieldDef[] => {
    const trigger = newFieldId();
    const when: FormCondition = { fieldId: trigger, operator: 'IS_CHECKED' };
    return [
        { id: trigger, type: 'CHECKBOX', label: t('forms.builder.sample.trigger'), required: false },
        { id: newFieldId(), type: 'MILLIMETERS', label: t('forms.builder.sample.diameter'), required: true, visibleWhen: when },
        { id: newFieldId(), type: 'CENTIMETERS', label: t('forms.builder.sample.wall'), required: true, visibleWhen: when },
        { id: newFieldId(), type: 'QUANTITY', label: t('forms.builder.sample.holes'), required: true, visibleWhen: when },
    ];
};
