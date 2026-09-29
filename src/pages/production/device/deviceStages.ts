import { t } from '@/i18n/translate';
import type { DeviceTaskPlan, TaskSection, TaskStage } from '@/types/productionTasks';

import { isBuiltInArea, twinStage } from '../tasks/taskModel';

/**
 * ── DER WEG EINES GERÄTS DURCH DIE PRODUKTION (24.09.2026, Vorgabe Samet) ───
 *
 * «Süreçler şimdilik cihaz için şunlar: görevlendirmeler (sadece yöneticiye
 *  özel), sonra teknik çizim, … bayrak olsun, bir tane bayrak noktası.»
 *
 * ZWEI WEGE (27.09.2026): «Üretim hedef yolu iki yola ayrılmalıdır — makine,
 * elektrik; administrator ekranında bu iki yol ayrı takip edilir.»
 *
 *   Mekanik   Compressor seçimi & PID › Teknik çizim › Final çizim onayı ›
 *             BOM › Üretim/Montaj › Test › Final
 *   Elektrik  Teknik devre çizimi (EPLAN) › Final çizim onayı › BOM ›
 *             Pano imalatı › Test › Final
 *
 * DER WEG DER VORLAGE (28.09.2026): die Bereiche der geladenen Vorlage sind
 * die Wege und IHRE Stufen die Stationen — so, wie sie beim Laden galten.
 * Ohne Vorlage gibt es keinen Weg («it will be generated based on the
 * selected template's stages»): keine Leiste, nur «Şablondan yükle». Eine
 * Vorlage mit Mekanik / Elektrik bringt deren feste Stufen samt BOM mit.
 *
 * Vor jedem Weg steht die Stufe der Zuweisungen — nur die Administratorrolle
 * (`Role.isSystemAdmin`) sieht sie. Der feste Abschluss am Ende eines festen
 * Weges ist der ZIELPUNKT: die Fahne.
 */

export type DeviceStageId = 'assignments' | TaskStage;

export interface DeviceStage {
    id: DeviceStageId;
    /** i18n-Schlüssel des Stufennamens (die Zuweisungen und die festen Stufen). */
    labelKey: string;
    /** Der Name einer eigenen Stufe — steht er da, gilt er statt `labelKey`. */
    name?: string;
    /** Nur für die Administratorrolle sichtbar. */
    adminOnly?: boolean;
    /** Der Zielpunkt am Ende des Weges (die Fahne). */
    finish?: boolean;
}

/** Der Name einer Stufe in der Leiste: der eigene, sonst der übersetzte. */
export const deviceStageLabel = (stage: DeviceStage): string => stage.name || t(stage.labelKey);

/**
 * Die Wege des Geräts: die Bereiche der geladenen Vorlage — ohne Vorlage
 * keine. Ein Bereich ohne Stufen hat keinen Weg (und trägt keine Aufgaben).
 */
export const routeSections = (plan: DeviceTaskPlan | null): TaskSection[] =>
    plan?.sections.filter((section) => section.stages.length > 0) ?? [];

/** Die Stufen, die diese Person in diesem Weg sieht. */
export const visibleDeviceStages = (isAdmin: boolean, section: TaskSection): DeviceStage[] => {
    const last = section.stages.length - 1;
    const work = section.stages.map((entry, index): DeviceStage => ({
        id: entry.key,
        labelKey: `production.deviceStages.${entry.key}`,
        name: entry.name || undefined,
        finish: entry.key === 'final' && index === last && isBuiltInArea(section.key),
    }));
    return [
        ...(isAdmin ? [{ id: 'assignments', labelKey: 'production.deviceStages.assignments', adminOnly: true }] : []),
        ...work,
    ];
};

/**
 * Die Stufe aus der Adresse. Kommt sie aus dem anderen Weg, gilt dieselbe
 * Stelle hier (`twinStage`: Zeichnung ↔ EPLAN, Montage ↔ Pano imalatı);
 * Unbekanntes und Verborgenes führen zum Anfang.
 */
export const deviceStageFrom = (value: string | null, stages: DeviceStage[], section: TaskSection): DeviceStage => {
    const direct = stages.find((entry) => entry.id === value);
    if (direct) return direct;
    if (value && value !== 'assignments') {
        const twin = twinStage(value, section);
        const match = twin ? stages.find((entry) => entry.id === twin) : undefined;
        if (match) return match;
    }
    return stages[0];
};

/** Eine Arbeitsstufe — an ihr können Aufgaben hängen (nicht an den Zuweisungen selbst). */
export const isWorkStage = (id: DeviceStageId): id is TaskStage => id !== 'assignments';

/**
 * Die Nummer einer Stufe in der Leiste — gezählt werden nur die Stufen des
 * Bereichs (28.09.2026: «numbers should be on the actual stage names»): die
 * Zuweisungen stehen davor ohne Nummer, die Fahne am Ende ebenso.
 */
export const stageNumber = (stages: DeviceStage[], id: DeviceStageId): number | null => {
    const steps = stages.filter((entry) => !entry.finish && isWorkStage(entry.id));
    const index = steps.findIndex((entry) => entry.id === id);
    return index < 0 ? null : index + 1;
};
