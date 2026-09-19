/**
 * ── DAS ZEICHEN DES RAPPORTS: EINE GEZEICHNETE ECKE ─────────────────────────
 *
 * 16.09.2026 (Samet): «svg'yi direkt yapıştırma, onunla oyna, biraz yay — bir
 * yerde kesilmiş gibi duruyor. Deseni sen oluştur, bizim belgeye uyarla; tasarım
 * gibi durmalı, görsel eklenmiş gibi değil.»
 *
 * Also wird das Muster hier GERECHNET, nicht eingefügt: ein Gitter aus
 * 45°-Rauten, verankert in der oberen rechten Ecke des Blattes.
 *
 *   · am Anker sind die Rauten gross, dunkel und dicht beieinander
 *   · nach links und unten wachsen die Abstände, die Rauten werden kleiner und
 *     heller und hören von selbst auf — nichts wirkt abgeschnitten
 *   · nur oben und rechts läuft das Muster in den Blattrand (Anschnitt), dort
 *     GEHÖRT der Schnitt zur Gestaltung
 *   · jede Raute trägt denselben leichten Verlauf wie die Vorlage (unten links
 *     dunkler, oben rechts heller)
 *
 * Herauskommt EIN SVG-Text: die Vorschau zeigt ihn als Bild, das PDF zeichnet
 * ihn als Vektor (utils/pdf/svgArtPdf.ts). Eine Datei, eine Wahrheit.
 */

export const REPORT_MARK = { width: 470, height: 360 };

/** Feste Zufälligkeit: dieselbe Ecke in jeder Vorschau und in jedem PDF. */
const hash = (a: number, b: number): number => {
    const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return x - Math.floor(x);
};

const SIN45 = Math.SQRT1_2;

/**
 * Das Raster liegt im GEDREHTEN Rahmen (u, v): dort sind die Rauten einfache
 * Quadrate, in den Blattkoordinaten stehen sie auf der Spitze.
 *   rot(u, v) = ((u − v)/√2, (u + v)/√2)
 * Verankert ist alles an der oberen rechten Ecke des Blattes: je weiter eine
 * Raute von dort entfernt liegt, desto kleiner, heller und seltener wird sie.
 */
const rot = (u: number, v: number): [number, number] => [(u - v) * SIN45, (u + v) * SIN45];

interface Tile {
    points: Array<[number, number]>;
    /** 0 = schwarz … 255 = weiss, Anfang und Ende des Verlaufs. */
    from: number;
    to: number;
    /** Verlaufsachse in Blattkoordinaten. */
    axis: [number, number, number, number];
}

/**
 * Rastereinheit und weisse Fuge. Ein Stein ist 1 oder 2 Einheiten breit/hoch —
 * so stehen grosse, schmale und kleine Rauten nebeneinander wie in Samets
 * Vorlage (16.09.2026: «kareler sık sık ve arada farklı boyut olması lazım»;
 * danach: «kutular daha büyük olması lazım ve çok daha az» → grosse Einheit,
 * rund neun Steine in der Ecke).
 */
const UNIT = 96;
const GAP = 10;
/** Wie weit das Muster von der Ecke reicht (Anteil der Blattdiagonale). */
const REACH = 0.82;
/** Ab diesem Anteil der Reichweite fängt das Muster an auszufransen. */
const FADE_FROM = 0.5;

/** Weiche Schwelle zwischen `edge0` und `edge1` (0 → 1). */
const ramp = (edge0: number, edge1: number, value: number): number => {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};

/** Mögliche Steine (in Einheiten): gross, schmal, hoch, klein. */
const SHAPES: Array<[number, number]> = [[2, 2], [2, 1], [1, 2], [1, 1]];

const buildTiles = (): Tile[] => {
    const { width, height } = REPORT_MARK;
    const diagonal = Math.hypot(width, height);
    const corners: Array<[number, number]> = [[0, 0], [width, 0], [width, height], [0, height]];
    const us = corners.map(([x, y]) => (x + y) * SIN45);
    const vs = corners.map(([x, y]) => (y - x) * SIN45);
    const first = (values: number[]) => Math.floor(Math.min(...values) / UNIT) - 2;
    const last = (values: number[]) => Math.ceil(Math.max(...values) / UNIT) + 2;

    /** Mitte einer Zelle in Blattkoordinaten. */
    const centreOf = (column: number, row: number, wide: number, high: number) =>
        rot((column + wide / 2) * UNIT, (row + high / 2) * UNIT);
    /** Abstand zur oberen rechten Blattecke, 0 … 1 (Blattdiagonale). */
    const distanceOf = (point: [number, number]) => Math.hypot(point[0] - width, point[1]) / diagonal;

    const cells: Array<{ column: number; row: number; distance: number }> = [];
    for (let column = first(us); column <= last(us); column += 1) {
        for (let row = first(vs); row <= last(vs); row += 1) {
            cells.push({ column, row, distance: distanceOf(centreOf(column, row, 1, 1)) });
        }
    }
    // Von der Ecke nach innen legen: dort liegen die grossen Steine, der Rest füllt auf.
    cells.sort((left, right) => left.distance - right.distance);

    const taken = new Set<string>();
    const key = (column: number, row: number) => `${column}:${row}`;
    const tiles: Tile[] = [];

    for (const cell of cells) {
        if (taken.has(key(cell.column, cell.row))) continue;
        if (cell.distance > REACH) continue;
        const seed = hash(cell.column, cell.row);
        // Nach innen fehlt immer öfter ein Stein: das Muster franst aus, statt abzubrechen.
        if (seed < ramp(FADE_FROM, 1.08, cell.distance / REACH) * 0.9) continue;

        // Welche Form passt? Weiter aussen werden die Steine kleiner.
        const wish = hash(cell.row + 11, cell.column + 5);
        const small = ramp(0.3, 0.95, cell.distance / REACH);
        const order = wish < 0.72 - small * 0.3
            ? SHAPES
            : wish < 0.74 ? [SHAPES[1], SHAPES[2], SHAPES[3]]
                : wish < 0.9 ? [SHAPES[2], SHAPES[1], SHAPES[3]] : [SHAPES[3]];

        let shape: [number, number] | null = null;
        for (const [wide, high] of order) {
            const cellsOfShape: Array<[number, number]> = [];
            for (let dx = 0; dx < wide; dx += 1) for (let dy = 0; dy < high; dy += 1) cellsOfShape.push([cell.column + dx, cell.row + dy]);
            if (cellsOfShape.some(([column, row]) => taken.has(key(column, row)))) continue;
            const u = cell.column * UNIT + GAP / 2;
            const v = cell.row * UNIT + GAP / 2;
            const length = { w: wide * UNIT - GAP, h: high * UNIT - GAP };
            const points: Array<[number, number]> = [
                rot(u, v),
                rot(u + length.w, v),
                rot(u + length.w, v + length.h),
                rot(u, v + length.h),
            ];
            // Links und unten bleibt der Stein ganz auf dem Blatt; oben und rechts
            // darf er in den Rand laufen (dort gehört der Schnitt zur Gestaltung).
            if (!points.every(([x, y]) => x >= 3 && y <= height - 3)) continue;
            const middle = centreOf(cell.column, cell.row, wide, high);
            // Ein Stein, der fast ganz draussen liegt, hinterlässt nur einen Splitter am Rand.
            if (middle[0] > width + UNIT * 0.6 || middle[1] < -UNIT * 0.6) continue;

            cellsOfShape.forEach(([column, row]) => taken.add(key(column, row)));
            shape = [wide, high];

            // Grauwert: an der Ecke dunkel, nach innen heller — mit etwas Eigenleben.
            const distance = distanceOf(middle);
            const tone = Math.max(34, Math.min(232, 62 + distance * 150 + (hash(cell.row + 3, cell.column + 7) - 0.5) * 104));
            tiles.push({
                points,
                from: Math.round(Math.max(20, tone - 20)),
                to: Math.round(Math.min(242, tone + 20)),
                // Verlauf wie in der Vorlage: von der unteren linken zur oberen rechten Ecke.
                axis: [...rot(u, v + length.h), ...rot(u + length.w, v)] as [number, number, number, number],
            });
            break;
        }
        if (!shape) taken.add(key(cell.column, cell.row));
    }

    // Die hellsten zuerst: die dunklen Steine an der Ecke liegen obenauf.
    return tiles.sort((left, right) => right.from - left.from);
};

const round = (value: number) => Math.round(value * 100) / 100;
/** Grauwert als HEX — das PDF liest nur `#rrggbb` (svgArtPdf.ts), kein `rgb(…)`. */
const grey = (value: number) => {
    const pair = Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
    return `#${pair}${pair}${pair}`;
};

export const buildReportMarkSvg = (): string => {
    const tiles = buildTiles();
    const defs = tiles.map((tile, index) => (
        `<linearGradient id="rm${index}" gradientUnits="userSpaceOnUse" `
        + `x1="${round(tile.axis[0])}" y1="${round(tile.axis[1])}" x2="${round(tile.axis[2])}" y2="${round(tile.axis[3])}">`
        + `<stop offset="0" stop-color="${grey(tile.from)}"/>`
        + `<stop offset="1" stop-color="${grey(tile.to)}"/>`
        + '</linearGradient>'
    )).join('');
    const paths = tiles.map((tile, index) => (
        `<path d="${tile.points.map(([x, y], position) => `${position ? 'L' : 'M'}${round(x)} ${round(y)}`).join('')}Z" fill="url(#rm${index})"/>`
    )).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${REPORT_MARK.width} ${REPORT_MARK.height}" `
        + `width="${REPORT_MARK.width}" height="${REPORT_MARK.height}"><defs>${defs}</defs>${paths}</svg>`;
};

/** Einmal gerechnet — Vorschau und PDF lesen dasselbe Zeichen. */
export const REPORT_MARK_SVG = buildReportMarkSvg();

export const REPORT_MARK_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(REPORT_MARK_SVG)}`;
