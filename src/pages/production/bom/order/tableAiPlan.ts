import { parseNum } from '@/pages/inventory/utils/format';
import type { BomTableAiResult } from '@/types/productionBom';

/**
 * ── WAS DIE KI IN DIE TABELLE SCHREIBT (27.09.2026, Vorgabe Samet) ───────────
 *
 * «Şablondaki boş [hücreler] otomatik eşleşip doldurulacak … boşsa boş
 *  bırakacak.» Die KI liefert je Zeile, was der Beleg zu jeder Spalte sagt;
 * HIER wird entschieden, was davon in die Tabelle geht:
 *
 *   fill      die Zelle ist leer, der Beleg nennt einen Wert  → wird geschrieben
 *   conflict  die Zelle trägt schon etwas anderes              → nur mit «Dolu hücreleri de güncelle»
 *   same      die Zelle trägt schon genau diesen Wert          → nichts zu tun
 *   keep      die Zelle ist gefüllt, der Beleg schweigt        → bleibt
 *   none      beides leer                                      → bleibt leer
 *   locked    die Zeile nimmt diese Spalte nicht an (Nettopreis/Betrag
 *             ausserhalb der manuellen Eingabe)                 → bleibt
 */

export type TableAiLabel = 'grossPrice' | 'netPrice' | 'discount' | 'discount2' | 'total';

/** Eine Spalte der Vorlage, die die KI füllen darf. */
export interface TableAiColumn {
    key: string;
    name: string;
    type: 'text' | 'number';
    label: TableAiLabel | null;
}

/** Eine Zeile der Bestellung, wie das Fenster sie zeigt. */
export interface TableAiRow {
    /** Stelle in der GESPEICHERTEN Bestellung — so antwortet der Server. */
    index: number;
    code: string | null;
    name: string;
    quantity: string;
    /** Was die Zelle jetzt trägt, je Spaltenschlüssel ('' = leer). */
    current: Record<string, string>;
    /** Spalten, die diese Zeile nicht annimmt. */
    locked: string[];
}

export type CellKind = 'fill' | 'conflict' | 'same' | 'keep' | 'none' | 'locked';

export interface CellPlan {
    kind: CellKind;
    current: string;
    found: string;
}

export interface RowPlan {
    row: TableAiRow;
    evidence: string;
    cells: Record<string, CellPlan>;
    /** Leere Zellen, die gefüllt werden. */
    fills: number;
    /** Gefüllte Zellen, zu denen der Beleg etwas anderes sagt. */
    conflicts: number;
    /** Sagt der Beleg zu dieser Zeile überhaupt etwas? */
    matched: boolean;
}

export interface TableAiChange {
    index: number;
    /** Spaltenschlüssel → neuer Wert. */
    values: Record<string, string>;
}

const isNumeric = (column: TableAiColumn): boolean => Boolean(column.label) || column.type === 'number';

/** Derselbe Wert? Zahlen als Zahl («45.5» = «45,50»), Text ohne Gross/Klein und Randleerzeichen. */
export const sameCellValue = (column: TableAiColumn, left: string, right: string): boolean => {
    if (isNumeric(column)) {
        const a = parseNum(left);
        const b = parseNum(right);
        if (a !== null && b !== null) return Math.abs(a - b) < 1e-6;
    }
    return left.trim().toLowerCase() === right.trim().toLowerCase();
};

export const planCell = (column: TableAiColumn, row: TableAiRow, found: string): CellPlan => {
    const current = (row.current[column.key] ?? '').trim();
    const value = found.trim();
    if (row.locked.includes(column.key)) return { kind: 'locked', current, found: value };
    if (!value) return { kind: current ? 'keep' : 'none', current, found: value };
    if (!current) return { kind: 'fill', current, found: value };
    return { kind: sameCellValue(column, current, value) ? 'same' : 'conflict', current, found: value };
};

export const planRows = (columns: TableAiColumn[], rows: TableAiRow[], result: BomTableAiResult): RowPlan[] => {
    const byIndex = new Map(result.rows.map((entry) => [entry.index, entry]));
    return rows.map((row) => {
        const answer = byIndex.get(row.index);
        const cells: Record<string, CellPlan> = {};
        let fills = 0;
        let conflicts = 0;
        for (const column of columns) {
            const cell = planCell(column, row, answer?.values[column.key] ?? '');
            cells[column.key] = cell;
            if (cell.kind === 'fill') fills += 1;
            if (cell.kind === 'conflict') conflicts += 1;
        }
        const evidence = answer?.evidence ?? '';
        const matched = Boolean(evidence) || columns.some((column) => Boolean(answer?.values[column.key]));
        return { row, evidence, cells, fills, conflicts, matched };
    });
};

/** Was geschrieben wird: je angehakter Zeile die leeren Zellen — und mit `overwrite` auch die abweichenden. */
export const changesOf = (plans: RowPlan[], enabled: ReadonlySet<number>, overwrite: boolean): TableAiChange[] => plans
    .filter((plan) => enabled.has(plan.row.index))
    .map((plan) => ({
        index: plan.row.index,
        values: Object.fromEntries(Object.entries(plan.cells)
            .filter(([, cell]) => cell.kind === 'fill' || (overwrite && cell.kind === 'conflict'))
            .map(([key, cell]) => [key, cell.found])),
    }))
    .filter((change) => Object.keys(change.values).length > 0);
