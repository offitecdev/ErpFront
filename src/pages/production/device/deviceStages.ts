/**
 * ── DER WEG EINES GERÄTS DURCH DIE PRODUKTION (24.09.2026, Vorgabe Samet) ───
 *
 * «Süreçler şimdilik cihaz için şunlar: görevlendirmeler (sadece yöneticiye
 *  özel), sonra teknik çizim, sonra BOM, sonra final çizim onay, sonra satın
 *  alma, sonra üretim/montaj, sonra test ve final — bayrak olsun, bir tane
 *  bayrak noktası şeklinde.»
 *
 * Die Reihenfolge ist die des Geräts, nicht die einer Reiterleiste. Die
 * Zuweisungen sieht nur die Administratorrolle (`Role.isSystemAdmin`) — für
 * alle anderen beginnt der Weg bei der technischen Zeichnung. Der Abschluss
 * ist keine Stufe wie die anderen, sondern der ZIELPUNKT: die Fahne am Ende.
 * Die Inhalte der Stufen folgen Schritt für Schritt; bis dahin zeigt jede
 * Stufe ihre grosse, leere Fläche (DeviceStagePanel).
 */

export type DeviceStageId =
    | 'assignments'
    | 'drawing'
    | 'bom'
    | 'approval'
    | 'purchasing'
    | 'production'
    | 'test'
    | 'final';

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

export const DEVICE_STAGES: DeviceStage[] = [
    stage('assignments', { adminOnly: true }),
    stage('drawing'),
    stage('bom'),
    stage('approval'),
    stage('purchasing'),
    stage('production'),
    stage('test'),
    stage('final', { finish: true }),
];

/** Die Stufen, die diese Person sieht. */
export const visibleDeviceStages = (isAdmin: boolean): DeviceStage[] =>
    DEVICE_STAGES.filter((entry) => !entry.adminOnly || isAdmin);

/** Die Stufe aus der Adresse — Unbekanntes und Verborgenes führen zum Anfang. */
export const deviceStageFrom = (value: string | null, stages: DeviceStage[]): DeviceStage =>
    stages.find((entry) => entry.id === value) ?? stages[0];
