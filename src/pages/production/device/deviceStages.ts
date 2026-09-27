import type { TaskArea, TaskStage } from '@/types/productionTasks';

import { AREA_STAGES, twinStage } from '../tasks/taskModel';

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
 * Vor beiden steht die Stufe der Zuweisungen — nur die Administratorrolle
 * (`Role.isSystemAdmin`) sieht sie. Die Arbeitsstufen selbst stehen EINMAL in
 * tasks/taskModel.ts (`AREA_STAGES`, wortgleich mit dem Server). Der
 * Abschluss ist der ZIELPUNKT: die Fahne am Ende.
 */

export type DeviceStageId = 'assignments' | TaskStage;

export interface DeviceStage {
    id: DeviceStageId;
    /** i18n-Schlüssel des Stufennamens. */
    labelKey: string;
    /** Nur für die Administratorrolle sichtbar. */
    adminOnly?: boolean;
    /** Der Zielpunkt am Ende des Weges (die Fahne). */
    finish?: boolean;
}

const stage = (id: DeviceStageId, extra: Partial<DeviceStage> = {}): DeviceStage => ({
    id,
    labelKey: `production.deviceStages.${id}`,
    ...extra,
});

const pathOf = (area: TaskArea): DeviceStage[] => [
    stage('assignments', { adminOnly: true }),
    ...AREA_STAGES[area].map((id) => stage(id, id === 'final' ? { finish: true } : {})),
];

const DEVICE_STAGES: Record<TaskArea, DeviceStage[]> = {
    MECHANICAL: pathOf('MECHANICAL'),
    ELECTRICAL: pathOf('ELECTRICAL'),
};

/** Die Stufen, die diese Person in diesem Weg sieht. */
export const visibleDeviceStages = (isAdmin: boolean, area: TaskArea): DeviceStage[] =>
    DEVICE_STAGES[area].filter((entry) => !entry.adminOnly || isAdmin);

/**
 * Die Stufe aus der Adresse. Kommt sie aus dem anderen Weg, gilt dieselbe
 * Stelle hier (`twinStage`: Zeichnung ↔ EPLAN, Montage ↔ Pano imalatı);
 * Unbekanntes und Verborgenes führen zum Anfang.
 */
export const deviceStageFrom = (value: string | null, stages: DeviceStage[], area: TaskArea): DeviceStage => {
    const direct = stages.find((entry) => entry.id === value);
    if (direct) return direct;
    if (value && value !== 'assignments') {
        const twin = stages.find((entry) => entry.id === twinStage(value, area));
        if (twin) return twin;
    }
    return stages[0];
};

/** Eine Arbeitsstufe — an ihr können Aufgaben hängen (nicht an den Zuweisungen selbst). */
export const isWorkStage = (id: DeviceStageId): id is TaskStage => id !== 'assignments';

/** Die Nummer einer Stufe in der Leiste (die Fahne hat keine). */
export const stageNumber = (stages: DeviceStage[], id: DeviceStageId): number | null => {
    const steps = stages.filter((entry) => !entry.finish);
    const index = steps.findIndex((entry) => entry.id === id);
    return index < 0 ? null : index + 1;
};
