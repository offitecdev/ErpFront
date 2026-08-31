/**
 * Checklisten / Formulare — Feldmodell (Frontend-Spiegel von
 * `Erp_Backend/src/shared/formFields.ts`).
 *
 * Feldtypen, Bedingungsauswertung und Pflichtprüfung müssen mit dem Server
 * im Gleichschritt bleiben: der Server entscheidet, was gespeichert und als
 * "abgeschlossen" angenommen wird; die Oberfläche zeigt dieselbe Prüfung
 * vorher, damit das Server-Nein niemanden überrascht. Dazu kommen hier die
 * reinen Anzeigehelfer (Beschriftung je Typ, Einheit, Wertformat).
 */
import { t } from '@/i18n/translate';

export const FORM_FIELD_TYPES = [
    'TEXT',
    'NUMBER',
    'QUANTITY',
    'METERS',
    'KILOGRAMS',
    'CENTIMETERS',
    'MILLIMETERS',
    'CHECKBOX',
    'SELECT',
    'PHOTO',
    'FILE',
    'DRAWING',
    'SIGNATURE',
    'DATE',
    'SECTION',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const NUMERIC_FIELD_TYPES: ReadonlySet<FormFieldType> = new Set([
    'NUMBER', 'QUANTITY', 'METERS', 'KILOGRAMS', 'CENTIMETERS', 'MILLIMETERS',
]);

/** Einheiten-Suffix der Zahlentypen (Anzeige, PDF). */
export const FIELD_UNITS: Partial<Record<FormFieldType, string>> = {
    METERS: 'm',
    KILOGRAMS: 'kg',
    CENTIMETERS: 'cm',
    MILLIMETERS: 'mm',
};

export const CONDITION_OPERATORS = [
    'EQUALS',
    'NOT_EQUALS',
    'IS_CHECKED',
    'IS_NOT_CHECKED',
    'NOT_EMPTY',
    'EMPTY',
    'GREATER_THAN',
    'LESS_THAN',
] as const;
export type FormConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface FormCondition {
    fieldId: string;
    operator: FormConditionOperator;
    value?: string;
}

export interface FormFieldOption {
    id: string;
    label: string;
}

export interface FormFieldDef {
    id: string;
    type: FormFieldType;
    label: string;
    required?: boolean;
    placeholder?: string;
    help?: string;
    multiline?: boolean;
    options?: FormFieldOption[];
    display?: 'dropdown' | 'radio';
    visibleWhen?: FormCondition | null;
}

export type FormValues = Record<string, unknown>;

export interface FormPhotoValue { dataUrl: string; caption?: string }
export interface FormFileValue { name: string; mimeType: string; size: number; dataUrl: string }
export interface FormSignatureValue { dataUrl: string; signedAt: string; name?: string }

/** Beschriftung eines Feldtyps in der Sprache der Person. */
export const fieldTypeLabel = (type: FormFieldType): string => t(`forms.fieldTypes.${type}`);

/** Welche Operatoren zu einem Bezugsfeld passen (der Bedingungs-Editor). */
export const operatorsForField = (field: FormFieldDef | null | undefined): FormConditionOperator[] => {
    if (!field) return [];
    switch (field.type) {
        case 'CHECKBOX': return ['IS_CHECKED', 'IS_NOT_CHECKED'];
        case 'SELECT': return ['EQUALS', 'NOT_EQUALS', 'NOT_EMPTY', 'EMPTY'];
        case 'PHOTO': case 'FILE': case 'DRAWING': case 'SIGNATURE': return ['NOT_EMPTY', 'EMPTY'];
        case 'DATE': return ['NOT_EMPTY', 'EMPTY', 'EQUALS'];
        case 'SECTION': return [];
        default:
            return NUMERIC_FIELD_TYPES.has(field.type)
                ? ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'NOT_EMPTY', 'EMPTY']
                : ['EQUALS', 'NOT_EQUALS', 'NOT_EMPTY', 'EMPTY'];
    }
};

/** Operatoren, die einen Vergleichswert brauchen. */
export const operatorNeedsValue = (operator: FormConditionOperator): boolean =>
    operator === 'EQUALS' || operator === 'NOT_EQUALS' || operator === 'GREATER_THAN' || operator === 'LESS_THAN';

const isBlank = (value: unknown): boolean => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (typeof value === 'number') return Number.isNaN(value);
    if (typeof value === 'boolean') return false;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') {
        const dataUrl = (value as Record<string, unknown>).dataUrl;
        return !(typeof dataUrl === 'string' && dataUrl.length > 0);
    }
    return false;
};

export const isFormValueEmpty = (field: FormFieldDef, value: unknown): boolean => {
    if (field.type === 'CHECKBOX') return value !== true;
    return isBlank(value);
};

const comparable = (field: FormFieldDef, value: unknown): string => {
    if (field.type === 'CHECKBOX') return value === true ? 'true' : 'false';
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return '';
    return String(value).trim().toLowerCase();
};

const asNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

/** Sichtbarkeit je Feld — identisch mit dem Server (Ketten inklusive). */
export function computeFieldVisibility(fields: FormFieldDef[], values: FormValues): Record<string, boolean> {
    const byId = new Map(fields.map((field) => [field.id, field]));
    const visible: Record<string, boolean> = {};
    for (const field of fields) {
        const condition = field.visibleWhen;
        if (!condition) { visible[field.id] = true; continue; }
        const source = byId.get(condition.fieldId);
        if (!source) { visible[field.id] = true; continue; }
        if (visible[source.id] === false) { visible[field.id] = false; continue; }
        if (source.type === 'SECTION') { visible[field.id] = true; continue; }
        const raw = values[source.id];
        const expected = String(condition.value ?? '').trim().toLowerCase();
        let ok: boolean;
        switch (condition.operator) {
            case 'EQUALS': ok = comparable(source, raw) === expected; break;
            case 'NOT_EQUALS': ok = comparable(source, raw) !== expected; break;
            case 'IS_CHECKED': ok = raw === true; break;
            case 'IS_NOT_CHECKED': ok = raw !== true; break;
            case 'NOT_EMPTY': ok = !isFormValueEmpty(source, raw); break;
            case 'EMPTY': ok = isFormValueEmpty(source, raw); break;
            case 'GREATER_THAN': {
                const left = asNumber(raw); const right = asNumber(expected);
                ok = left !== null && right !== null && left > right; break;
            }
            case 'LESS_THAN': {
                const left = asNumber(raw); const right = asNumber(expected);
                ok = left !== null && right !== null && left < right; break;
            }
            default: ok = true;
        }
        visible[field.id] = ok;
    }
    return visible;
}

/** Ids der sichtbaren Pflichtfelder ohne Wert. */
export function missingRequiredFields(fields: FormFieldDef[], values: FormValues): string[] {
    const visible = computeFieldVisibility(fields, values);
    return fields
        .filter((field) => field.type !== 'SECTION' && field.required && visible[field.id] !== false)
        .filter((field) => isFormValueEmpty(field, values[field.id]))
        .map((field) => field.id);
}

/**
 * Wert als Text für Tabellen und PDF. Bilder/Dateien/Zeichnungen/Unterschriften
 * werden NICHT hier ausgegeben (dafür zeichnen die Aufrufer eigene Blöcke),
 * sondern nur gezählt.
 */
export function formatFormValue(field: FormFieldDef, value: unknown, locale = 'de-CH'): string {
    if (isFormValueEmpty(field, value)) return field.type === 'CHECKBOX' ? t('forms.value.no') : '';
    switch (field.type) {
        case 'CHECKBOX': return t('forms.value.yes');
        case 'SELECT': {
            const option = (field.options || []).find((candidate) => candidate.id === value);
            return option?.label ?? String(value);
        }
        case 'DATE': {
            const date = new Date(String(value));
            return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(locale);
        }
        case 'PHOTO': return t('forms.value.photoCount', { count: Array.isArray(value) ? value.length : 0 });
        case 'FILE': return Array.isArray(value) ? value.map((file: FormFileValue) => file.name).join(', ') : '';
        case 'DRAWING': return t('forms.value.drawingPresent');
        case 'SIGNATURE': {
            const signature = value as FormSignatureValue;
            const when = signature?.signedAt ? new Date(signature.signedAt) : null;
            return when && !Number.isNaN(when.getTime())
                ? t('forms.value.signedAt', { date: when.toLocaleString(locale) })
                : t('forms.value.signed');
        }
        default: {
            if (NUMERIC_FIELD_TYPES.has(field.type)) {
                const number = asNumber(value);
                const text = number === null ? String(value) : number.toLocaleString(locale, { maximumFractionDigits: 3 });
                const unit = FIELD_UNITS[field.type];
                return unit ? `${text} ${unit}` : text;
            }
            return String(value);
        }
    }
}

/** Ein zufälliger, kurzer Feldschlüssel für den Editor (der Server hält ihn stabil). */
export const newFieldId = (): string => Math.random().toString(36).slice(2, 10);

/** Vorbelegung eines neuen Feldes im Editor. */
export const blankField = (type: FormFieldType = 'TEXT'): FormFieldDef => ({
    id: newFieldId(),
    type,
    label: '',
    required: false,
    ...(type === 'SELECT' ? { options: [{ id: newFieldId(), label: '' }, { id: newFieldId(), label: '' }], display: 'dropdown' as const } : {}),
});
