import type { ComponentType } from 'react';
import {
    LuBinary, LuBrush, LuCalendarDays, LuCamera, LuCircleDot, LuHash, LuHeading,
    LuPaperclip, LuRuler, LuSignature, LuSquareCheck, LuTextCursorInput, LuWeight,
} from 'react-icons/lu';
import { t } from '@/i18n/translate';
import type { FormFieldType } from '@/lib/formFields';

/**
 * Feldtypen des Vorlagen-Editors — Sinnbild je Typ und die DREI Gruppen, in
 * denen sie angeboten werden. Die Reihenfolge ist checklisten-zuerst:
 *
 *   prüfen   — Kontrollkästchen, Auswahl, Text, Abschnitt (das Gerüst einer
 *              Checkliste; der Prüfpunkt steht ganz vorne)
 *   messen   — Zahl, Menge, m / cm / mm, kg
 *   nachweis — Foto, Datei, Zeichnung, Unterschrift, Datum
 *
 * Kein Typ fällt weg; die Gruppen ordnen nur, was vorher eine lange Reihe war.
 */
export type FieldIcon = ComponentType<{ size?: number; className?: string }>;

export const FIELD_ICONS: Record<FormFieldType, FieldIcon> = {
    TEXT: LuTextCursorInput,
    NUMBER: LuBinary,
    QUANTITY: LuHash,
    METERS: LuRuler,
    KILOGRAMS: LuWeight,
    CENTIMETERS: LuRuler,
    MILLIMETERS: LuRuler,
    CHECKBOX: LuSquareCheck,
    SELECT: LuCircleDot,
    PHOTO: LuCamera,
    FILE: LuPaperclip,
    DRAWING: LuBrush,
    SIGNATURE: LuSignature,
    DATE: LuCalendarDays,
    SECTION: LuHeading,
};

export type FieldGroupKey = 'check' | 'measure' | 'proof';

export interface FieldGroup {
    key: FieldGroupKey;
    types: readonly FormFieldType[];
}

export const FIELD_GROUPS = [
    { key: 'check', types: ['CHECKBOX', 'SELECT', 'TEXT', 'SECTION'] },
    { key: 'measure', types: ['NUMBER', 'QUANTITY', 'METERS', 'CENTIMETERS', 'MILLIMETERS', 'KILOGRAMS'] },
    { key: 'proof', types: ['PHOTO', 'FILE', 'DRAWING', 'SIGNATURE', 'DATE'] },
] as const satisfies readonly FieldGroup[];

/**
 * Beim Übersetzen geprüft: jeder Feldtyp steht in genau einer Gruppe. Kommt in
 * `FORM_FIELD_TYPES` ein Typ dazu, ohne dass er hier eingeordnet wird, ist
 * `UngroupedFieldType` nicht mehr leer und die Zuweisung schlägt fehl.
 */
type GroupedFieldType = (typeof FIELD_GROUPS)[number]['types'][number];
type UngroupedFieldType = Exclude<FormFieldType, GroupedFieldType>;
export const EVERY_FIELD_TYPE_IS_GROUPED: UngroupedFieldType extends never ? true : never = true;

/** Der Prüfpunkt — der Feldtyp, mit dem eine Checkliste gebaut wird. */
export const CHECKPOINT_TYPE = 'CHECKBOX' satisfies FormFieldType;

export const fieldGroupLabel = (key: FieldGroupKey): string => t(`forms.builder.groups.${key}`);
