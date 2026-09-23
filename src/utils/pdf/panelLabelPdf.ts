/**
 * ── TYPENSCHILD EINES SCHALTSCHRANKS (20.09.2026, Vorgabe Baris) ────────────
 *
 * Ein Blatt = ein Schild, im eingestellten Mass (Voreinstellung 100 × 60 mm,
 * FRAGE 8). Mehrere Schränke eines Auftrags kommen als Seiten in EIN PDF, damit
 * eine Bestellung in einem Druck fertig wird.
 *
 * Was darauf steht, ist die EINGEFRORENE Kopie (`unit.nameplate`), nicht das
 * heutige Modell: das Schild am Schrank und der Satz im System bleiben für
 * immer dasselbe. Darum druckt diese Datei NIE aus dem Modell — der Server
 * friert die Werte beim Druck ein und liefert sie zurück.
 *
 * Inhalt (Baris' Liste, dazu Jahr, Auftrag und QR):
 *   OffiTec · Modell/Typ · S/N · Baujahr
 *   Ue · InA · Phasen/Frequenz · Icw
 *   IP · Norm · CE · Auftrag · QR → die Seite des Schranks
 *
 * Die Norm (EN IEC 61439) verlangt Hersteller, Typbezeichnung, ein Mittel zur
 * Bestimmung des Herstellungsdatums und die Normangabe; die übrigen Werte
 * kommen aus der technischen Dokumentation. Gedruckt wird nur, wenn ALLE
 * Pflichtangaben da sind — das prüft der Server, bevor er einfriert.
 */
import { jsPDF } from 'jspdf';
import type { PanelNameplate } from '../../types/panel';

import liberationBoldUrl from '../../assets/fonts/LiberationSans-Bold.ttf?url';
import liberationRegularUrl from '../../assets/fonts/LiberationSans-Regular.ttf?url';

const FONT = 'LiberationSans';

/* Die Töne des Hauses: Text fast schwarz, Beschriftungen fein grau. */
const INK: [number, number, number] = [29, 29, 31];
const MUTED: [number, number, number] = [142, 142, 146];
const HAIRLINE: [number, number, number] = [214, 214, 219];

let fontFiles: { regular: string; bold: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
};

async function registerFonts(doc: jsPDF) {
    if (!fontFiles) {
        const [regular, bold] = await Promise.all([
            fetch(liberationRegularUrl).then((r) => r.arrayBuffer()),
            fetch(liberationBoldUrl).then((r) => r.arrayBuffer()),
        ]);
        fontFiles = { regular: bufferToBase64(regular), bold: bufferToBase64(bold) };
    }
    doc.addFileToVFS('LiberationSans-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('LiberationSans-Bold.ttf', fontFiles.bold);
    doc.addFont('LiberationSans-Regular.ttf', FONT, 'normal');
    doc.addFont('LiberationSans-Bold.ttf', FONT, 'bold');
    doc.setFont(FONT, 'normal');
}

/** Das Bild hinter dem QR — `qrcode` wird erst hier nachgeladen (eigenes Stück). */
async function qrDataUrl(text: string, sizePx = 512): Promise<string | null> {
    try {
        const QR = await import('qrcode');
        return await QR.toDataURL(text, { margin: 0, width: sizePx, errorCorrectionLevel: 'M' });
    } catch (error) {
        console.warn('QR-Code für das Typenschild konnte nicht erzeugt werden:', error);
        return null;
    }
}

/** Die Adresse, die der QR trägt: die Seite dieses Schranks. */
export const panelQrTarget = (serialNumber: string, base?: string | null): string => {
    const root = String(base || '').trim().replace(/\/+$/, '');
    if (root) return `${root}/${encodeURIComponent(serialNumber)}`;
    return `${window.location.origin}/production/panels?serial=${encodeURIComponent(serialNumber)}`;
};

export interface PanelLabelSpec {
    widthMm: number;
    heightMm: number;
    qrBaseUrl?: string | null;
}

export interface PanelLabelStrings {
    model: string;
    serial: string;
    year: string;
    voltage: string;
    current: string;
    phases: string;
    shortCircuit: string;
    protection: string;
    standard: string;
    order: string;
}

const DEFAULT_STRINGS: PanelLabelStrings = {
    model: 'Typ / Model',
    serial: 'Serien-Nr. / Seri No',
    year: 'Baujahr / Üretim yılı',
    voltage: 'Ue',
    current: 'InA',
    phases: 'Phasen / Faz',
    shortCircuit: 'Icw',
    protection: 'Schutzart / Koruma',
    standard: 'Norm / Standart',
    order: 'Auftrag / Sipariş',
};

/** «3~ / 400 V / 50 Hz» — genau die Zeile, die Baris nennt. */
const phaseLine = (plate: PanelNameplate): string => {
    const parts: string[] = [];
    if (plate.phaseCount) parts.push(`${plate.phaseCount}~`);
    if (plate.ratedVoltage) parts.push(`${plate.ratedVoltage} V`);
    if (plate.frequency) parts.push(`${plate.frequency} Hz`);
    return parts.join(' / ');
};

const shortCircuitLine = (plate: PanelNameplate): string => {
    if (!plate.shortCircuitIcw) return '';
    const icw = `${plate.shortCircuitIcw} kA${plate.shortCircuitTime ? ` / ${plate.shortCircuitTime} s` : ''}`;
    return plate.shortCircuitIpk ? `${icw} · Ipk ${plate.shortCircuitIpk} kA` : icw;
};

/** Ein Schild auf die aktuelle Seite zeichnen. */
const drawLabel = (
    doc: jsPDF,
    plate: PanelNameplate,
    spec: PanelLabelSpec,
    strings: PanelLabelStrings,
    qr: string | null,
) => {
    const W = spec.widthMm;
    const H = spec.heightMm;
    const pad = Math.max(3.2, Math.min(4.5, W * 0.042));
    const compact = H < 45;
    const qrSize = Math.min(H * 0.38, W * 0.225);
    const qrX = W - pad - qrSize;
    const contentRight = qrX - 3;

    // Fester, ruhiger Rahmen mit einer einzigen Akzentlinie.
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.22);
    doc.roundedRect(0.8, 0.8, W - 1.6, H - 1.6, 1.5, 1.5, 'S');
    doc.setFillColor(20, 79, 132);
    doc.roundedRect(0.8, 0.8, W - 1.6, 1.7, 1.2, 1.2, 'F');

    // Kopf: Hersteller links, CE eindeutig getrennt rechts.
    const headerY = compact ? 7 : 8.5;
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...INK);
    doc.setFontSize(compact ? 9 : 11.5);
    doc.text(plate.manufacturer || 'OffiTec', pad, headerY);
    if (plate.ceMarking) {
        doc.setFontSize(compact ? 8 : 10);
        doc.text('CE', W - pad, headerY, { align: 'right' });
    }

    // Modell und Seriennummer stehen in zwei exakt gleich hohen Identitätsfeldern.
    const identityY = compact ? 9.5 : 12;
    const identityH = compact ? 8.5 : 11;
    const identityGap = 2;
    const identityW = (contentRight - pad - identityGap) / 2;
    const identity = (x: number, label: string, value: string) => {
        doc.setFillColor(247, 248, 250);
        doc.setDrawColor(...HAIRLINE);
        doc.roundedRect(x, identityY, identityW, identityH, 1, 1, 'FD');
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...MUTED);
        doc.setFontSize(compact ? 4.2 : 5.1);
        doc.text(label.toUpperCase(), x + 2, identityY + (compact ? 2.7 : 3.4));
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...INK);
        doc.setFontSize(compact ? 6.8 : 8.4);
        doc.text(value, x + 2, identityY + identityH - (compact ? 1.7 : 2.1), { maxWidth: identityW - 4 });
    };
    identity(pad, strings.model, plate.modelNumber);
    identity(pad + identityW + identityGap, strings.serial, plate.serialNumber);

    // Technische Werte: Beschriftung und Wert haben in jeder Zelle dieselbe
    // Grundlinie. Keine frei schwebenden Texte, kein optisches Zickzack.
    const rows: Array<[string, string]> = [
        [strings.voltage, plate.ratedVoltage ? `${plate.ratedVoltage} V` : ''],
        [strings.current, plate.ratedCurrent ? `${plate.ratedCurrent} A` : ''],
        [strings.phases, phaseLine(plate)],
        [strings.shortCircuit, shortCircuitLine(plate)],
        [strings.protection, plate.ipRating || ''],
        [strings.year, plate.productionYear ? String(plate.productionYear) : ''],
    ].filter(([, value]) => value) as Array<[string, string]>;
    const gridTop = identityY + identityH + (compact ? 2 : 3);
    const footerTop = H - (compact ? 7 : 9);
    const gridHeight = Math.max(8, footerTop - gridTop);
    const colWidth = (contentRight - pad) / 2;
    const rowHeight = gridHeight / Math.max(1, Math.ceil(rows.length / 2));
    rows.forEach(([label, value], index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = pad + column * colWidth;
        const y = gridTop + row * rowHeight;
        if (row > 0) {
            doc.setDrawColor(233, 233, 237);
            doc.setLineWidth(0.15);
            doc.line(x, y - 0.8, x + colWidth - 2, y - 0.8);
        }
        doc.setFont(FONT, 'normal');
        doc.setFontSize(compact ? 4 : 4.8);
        doc.setTextColor(...MUTED);
        doc.text(label.toUpperCase(), x, y + (compact ? 1.7 : 2.2));
        doc.setFont(FONT, 'bold');
        doc.setFontSize(compact ? 5.8 : 7);
        doc.setTextColor(...INK);
        doc.text(value, x, y + (compact ? 4.5 : 5.6), { maxWidth: colWidth - 2 });
    });

    // QR hat eine eigene, stille Spalte; darunter steht die Seriennummer als
    // Rückfallebene, falls der Code beschädigt ist.
    const qrY = identityY;
    if (qr) doc.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...MUTED);
    doc.setFontSize(compact ? 3.8 : 4.5);
    doc.text(strings.serial.toUpperCase(), qrX, qrY + qrSize + (compact ? 2.1 : 2.8));
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...INK);
    doc.setFontSize(compact ? 5.2 : 6.2);
    doc.text(plate.serialNumber, qrX, qrY + qrSize + (compact ? 4.7 : 5.8), { maxWidth: qrSize });

    // Fusszeile: Norm und Auftrag bleiben einzeilig und werden sauber gekürzt.
    const footY = H - pad;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.15);
    doc.line(pad, footerTop, W - pad, footerTop);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(compact ? 4.2 : 5.2);
    doc.setTextColor(...INK);
    const footParts = [plate.standard || '', plate.orderNumber ? `${strings.order}: ${plate.orderNumber}` : ''].filter(Boolean);
    doc.text(footParts.join('  ·  '), pad, footY, { maxWidth: W - pad * 2 });
};

/**
 * Das PDF für eine oder mehrere Schildkopien. Jede Kopie ist eine eigene Seite
 * im Schildmass — so kann ein ganzer Auftrag in einem Zug gedruckt werden.
 */
export const buildPanelLabelPdf = async (
    plates: PanelNameplate[],
    spec: PanelLabelSpec,
    strings: Partial<PanelLabelStrings> = {},
): Promise<Blob> => {
    if (!plates.length) throw new Error('Kein Typenschild zu drucken.');
    const text = { ...DEFAULT_STRINGS, ...strings };
    const width = Math.max(40, Number(spec.widthMm) || 100);
    const height = Math.max(25, Number(spec.heightMm) || 60);

    const doc = new jsPDF({
        orientation: width >= height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [width, height],
    });
    await registerFonts(doc);

    for (let index = 0; index < plates.length; index += 1) {
        if (index > 0) doc.addPage([width, height], width >= height ? 'landscape' : 'portrait');
        const plate = plates[index]!;
        const qr = await qrDataUrl(panelQrTarget(plate.serialNumber, spec.qrBaseUrl));
        drawLabel(doc, plate, { widthMm: width, heightMm: height }, text, qr);
    }

    return doc.output('blob');
};

/** Schild(er) im neuen Tab öffnen — von dort geht der Druck. */
export const openPanelLabelPdf = async (
    plates: PanelNameplate[],
    spec: PanelLabelSpec,
    strings: Partial<PanelLabelStrings> = {},
): Promise<void> => {
    const blob = await buildPanelLabelPdf(plates, spec, strings);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    // Der Tab hat das Blatt; die Adresse darf gleich wieder frei werden.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
