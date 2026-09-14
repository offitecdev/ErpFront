import type { ContentBlock } from '@/types/tasksModule';

/**
 * ── TABELLENMODELL (14.09.2026, Samet: «apple tablo») ───────────────────────
 *
 * Reine Hilfen ohne React. Eine Tabelle besteht aus `rows` (Klartext) und
 * gleich geformten Rastern für Zellfarbe und senkrechte Ausrichtung; dazu die
 * Spaltenbreiten. Jede Änderung am Aufbau (Zeile/Spalte einfügen oder löschen)
 * läuft hier durch, damit die Raster nie gegen `rows` verrutschen.
 *
 * Breite: `fit` = «note» (Notizbreite) oder «window» (Fensterbreite) — die
 * Breiten sind dann Gewichte. Wer eine Spaltenkante zieht, macht daraus feste
 * px-Breiten (`fit` fällt weg).
 */

export type TableMeta = Required<Pick<ContentBlock['meta'], 'rows'>> & Pick<ContentBlock['meta'], 'colWidths' | 'fit' | 'cellBg' | 'cellVAlign'>;
export type CellVAlign = 'top' | 'middle' | 'bottom';
export interface TableRange { r0: number; r1: number; c0: number; c1: number }

export const TABLE_MAX_ROWS = 50;
export const TABLE_MAX_COLS = 12;
export const TABLE_MIN_COL_PX = 48;
export const TABLE_DEFAULT_COL_PX = 112;

/** Zellfarben wie im Vorbild: vier Reihen zu sechs, «dunkel» = weisse Schrift. */
export const TABLE_CELL_COLORS: ReadonlyArray<{ value: string; dark: boolean }> = [
    { value: '', dark: false },
    { value: '#e9e9eb', dark: false },
    { value: '#d2d2d7', dark: false },
    { value: '#ddd3f2', dark: false },
    { value: '#efd3f3', dark: false },
    { value: '#f9d3da', dark: false },
    { value: '#fde0c8', dark: false },
    { value: '#fde8a0', dark: false },
    { value: '#d3ecdc', dark: false },
    { value: '#d2eff0', dark: false },
    { value: '#d3e5f8', dark: false },
    { value: '#d3dbe9', dark: false },
    { value: '#3a3a3c', dark: true },
    { value: '#6e6e73', dark: true },
    { value: '#98989d', dark: true },
    { value: '#8e5fe0', dark: true },
    { value: '#be5fd2', dark: true },
    { value: '#ff5a5a', dark: true },
    { value: '#ff7f3a', dark: true },
    { value: '#ffc400', dark: false },
    { value: '#1aa847', dark: true },
    { value: '#55bec0', dark: true },
    { value: '#0a84c6', dark: true },
    { value: '#4267b8', dark: true },
];

const DARK_COLORS = new Set(TABLE_CELL_COLORS.filter((color) => color.dark).map((color) => color.value));
export const isDarkCellColor = (value: string | undefined): boolean => Boolean(value && DARK_COLORS.has(value));

/** Neue Tabelle klein (14.09.2026, Samet: «ilk başta küçük olsun»): 2 × 2, feste Spalten; strecken geht über das Menü. */
export const defaultTableMeta = (): TableMeta => ({ rows: [['', ''], ['', '']], colWidths: [TABLE_DEFAULT_COL_PX, TABLE_DEFAULT_COL_PX] });

/** Rechteckig machen: kurze Zeilen auffüllen, Raster an `rows` angleichen. */
export const normalizeTable = (meta: ContentBlock['meta']): TableMeta => {
    const source = meta.rows?.length ? meta.rows : [['']];
    const columns = Math.max(1, ...source.map((row) => row.length));
    const rows = source.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? ''));
    const grid = <T extends string>(value: T[][] | undefined): T[][] | undefined =>
        value ? rows.map((row, r) => row.map((_, c) => (value[r]?.[c] ?? '') as T)) : undefined;
    return {
        rows,
        colWidths: meta.colWidths?.length === columns ? meta.colWidths : undefined,
        fit: meta.fit,
        cellBg: grid(meta.cellBg),
        cellVAlign: grid(meta.cellVAlign),
    };
};

const insertAt = <T>(list: readonly T[], index: number, item: T): T[] => [...list.slice(0, index), item, ...list.slice(index)];

/** Mittlere Breite der vorhandenen Spalten — so fällt eine neue Spalte nicht aus dem Rahmen. */
const averageWidth = (widths: readonly number[]): number =>
    widths.length ? Math.round(widths.reduce((sum, width) => sum + width, 0) / widths.length) : TABLE_DEFAULT_COL_PX;

export const insertColumn = (table: TableMeta, at: number): TableMeta => ({
    ...table,
    rows: table.rows.map((row) => insertAt(row, at, '')),
    colWidths: table.colWidths ? insertAt(table.colWidths, at, averageWidth(table.colWidths)) : undefined,
    cellBg: table.cellBg?.map((row) => insertAt(row, at, '')),
    cellVAlign: table.cellVAlign?.map((row) => insertAt(row, at, '' as const)),
});

export const insertRow = (table: TableMeta, at: number): TableMeta => {
    const columns = table.rows[0].length;
    const blank = <T extends string>() => Array.from({ length: columns }, () => '' as T);
    return {
        ...table,
        rows: insertAt(table.rows, at, blank()),
        cellBg: table.cellBg ? insertAt(table.cellBg, at, blank()) : undefined,
        cellVAlign: table.cellVAlign ? insertAt(table.cellVAlign, at, blank<'' | CellVAlign>()) : undefined,
    };
};

/** null = nichts bliebe übrig (die ganze Tabelle geht). */
export const deleteColumns = (table: TableMeta, c0: number, c1: number): TableMeta | null => {
    const keep = (_: unknown, index: number) => index < c0 || index > c1;
    if (table.rows[0].filter(keep).length === 0) return null;
    return {
        ...table,
        rows: table.rows.map((row) => row.filter(keep)),
        colWidths: table.colWidths?.filter(keep),
        cellBg: table.cellBg?.map((row) => row.filter(keep)),
        cellVAlign: table.cellVAlign?.map((row) => row.filter(keep)),
    };
};

export const deleteRows = (table: TableMeta, r0: number, r1: number): TableMeta | null => {
    const keep = (_: unknown, index: number) => index < r0 || index > r1;
    if (table.rows.filter(keep).length === 0) return null;
    return {
        ...table,
        rows: table.rows.filter(keep),
        cellBg: table.cellBg?.filter(keep),
        cellVAlign: table.cellVAlign?.filter(keep),
    };
};

/** Einen Wert in alle Zellen des Bereichs schreiben (Farbe, Ausrichtung). */
export const paintRange = <T extends string>(
    table: TableMeta,
    grid: T[][] | undefined,
    range: TableRange,
    value: T,
): T[][] | undefined => {
    const next = table.rows.map((row, r) => row.map((_, c) => {
        const inside = r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;
        return inside ? value : ((grid?.[r]?.[c] ?? '') as T);
    }));
    return next.some((row) => row.some(Boolean)) ? next : undefined;
};

export const distributeEvenly = (table: TableMeta): TableMeta => {
    if (!table.colWidths) return table;
    const width = averageWidth(table.colWidths);
    return { ...table, colWidths: table.colWidths.map(() => width) };
};

/** Die Tabelle strecken («note»/«window»): die heutigen Breiten bleiben als Gewichte. */
export const fitTable = (table: TableMeta, fit: 'note' | 'window'): TableMeta => ({ ...table, fit });
