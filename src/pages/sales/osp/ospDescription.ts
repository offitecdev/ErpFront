import type { OspDatasheetSpecs } from '@/lib/api/osp';

/**
 * ── DATENBLATT-SCHABLONE DER OSP-POSITION ────────────────────────────────────
 * EINE Quelle für das Beschreibungsformat (Formatvorgabe des Benutzers,
 * 27.08.2026 — siehe sein Bildschirmfoto): jeder Block als Titel mit echten
 * Aufzählungspunkten darunter, Leerzeile zwischen den Blöcken, und am Ende der
 * feste Verweis aufs Datenblatt. Bewusst Deutsch — die Schablone selbst ist
 * die deutsche Datenblattsprache, keine Oberflächenübersetzung.
 *
 * `html` wird als Positionsbeschreibung gespeichert: <ul><li> zeigt die Punkte
 * auf der Offerte, und `richHtmlToPlainText` macht daraus im PDF "• "-Zeilen —
 * beides also GENAU die Vorlage. `text` ist dieselbe Schablone als Klartext
 * (Vorschau).
 */

export const DATASHEET_CLOSING_LINE = 'Den Rest entnehmen Sie dem Datenblatt.';

export type OspDescriptionValues = {
    /** true = die erste Zeile heisst "Kühlleistung" (Kategorie chiller). */
    isChiller: boolean;
    power: string;
    /** Nur an einer Wärmepumpe belegt: die Kühlleistung NEBEN der Heizleistung. */
    coolingPower: string;
    cop: string;
    /** Der Kühl-Wirkungsgrad. Ein Chiller nennt ihn statt eines COP — dann
        heisst die Zeile "EER:", damit keine Zahl unter falscher Beschriftung
        auf der Offerte landet. */
    eer: string;
    medium: string;
    /** Mehrzeilig — eine Zeile je Aufzählungspunkt. */
    technology: string;
    sound1m: string;
    sound10m: string;
    dimensions: string;
    weight: string;
};

/** Zeile "Label: Wert" — leerer Wert lässt die Zeile ganz weg. */
const line = (label: string, value: string): string | null => {
    const trimmed = value.trim();
    return trimmed ? `${label} ${trimmed}` : null;
};

const escapeHtml = (value: string): string => value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Die gelesenen Datenblatt-Angaben → Schablonenwerte (Medium fällt auf "Wasser" zurück). */
export const specsToDescriptionValues = (
    specs: OspDatasheetSpecs | null | undefined,
    category: string | null | undefined,
): OspDescriptionValues => ({
    isChiller: specs?.powerIsCooling ?? (category || '').toLowerCase().includes('chill'),
    power: specs?.power || '',
    coolingPower: specs?.coolingPower || '',
    cop: specs?.cop || '',
    eer: specs?.eer || '',
    medium: specs?.medium || 'Wasser',
    technology: specs?.technology || '',
    sound1m: specs?.sound1m || '',
    sound10m: specs?.sound10m || '',
    dimensions: specs?.dimensions || '',
    weight: specs?.weight || '',
});

export const buildOspDescriptionBlocks = (values: OspDescriptionValues): Array<{ head: string; items: string[] }> => {
    const performance = [
        line(values.isChiller ? 'Kühlleistung:' : 'Heizleistung:', values.power),
        // Eine Wärmepumpe kann beides; die gelieferte zweite Zahl fällt nicht
        // weg, nur weil die Schablone eine Kopfzeile hat.
        line('Kühlleistung:', values.isChiller ? '' : values.coolingPower),
        line('COP:', values.cop),
        // Ohne COP (Chiller) steht der EER da — unter seiner eigenen
        // Beschriftung, nie unter der fremden.
        line('EER:', values.cop ? '' : values.eer),
        line('Medium:', values.medium),
    ].filter(Boolean) as string[];
    const tech = values.technology.split('\n').map((row) => row.trim()).filter(Boolean);
    const highlights = [
        line('Schalldruck bei 1 m:', values.sound1m),
        line('Schalldruck bei 10 m:', values.sound10m),
        line('Kompakte Abmessungen LxBxH:', values.dimensions),
        line('Robustes Design mit einem Betriebsgewicht von', values.weight),
    ].filter(Boolean) as string[];

    const blocks: Array<{ head: string; items: string[] }> = [];
    if (performance.length) blocks.push({ head: 'Leistungsdaten:', items: performance });
    if (tech.length) blocks.push({ head: 'Technologie:', items: tech });
    if (highlights.length) blocks.push({ head: 'Technische Highlights:', items: highlights });
    return blocks;
};

export const buildOspDescription = (values: OspDescriptionValues): { text: string; html: string | null } => {
    const blocks = buildOspDescriptionBlocks(values);
    if (!blocks.length) return { text: '', html: null };
    const text = [
        ...blocks.map((block) => [block.head, ...block.items.map((item) => `• ${item}`)].join('\n')),
        DATASHEET_CLOSING_LINE,
    ].join('\n\n');
    /* Echte <ul>-Listen; die leeren <p><br></p> dazwischen sind die Leerzeilen
       zwischen den Blöcken. */
    const html = [
        ...blocks.map((block) => `<p>${escapeHtml(block.head)}</p><ul>${
            block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
        }</ul>`),
        `<p>${escapeHtml(DATASHEET_CLOSING_LINE)}</p>`,
    ].join('<p><br></p>');
    return { text, html };
};
