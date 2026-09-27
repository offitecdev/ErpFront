import type { BomLine, BomLineChange, BomRevisionLine } from '@/types/productionBom';

import type { BomRowChange } from '../BomLinesTable';
import { parseQuantityText, quantityToText } from '../bomFormat';
import type { DraftLine } from '../templates/templateDraft';

/**
 * ── REVISION EINER BOM · DIE RECHNUNG DER OBERFLÄCHE (27.09.2026) ───────────
 *
 * «Bom onaylanırsa geri dönüş yok, revize olması lazım.» Während eine
 * Revision im Entwurf steht, zeigt die Tabelle die Arbeitskopie — und an jeder
 * Zeile, was sich gegenüber der geltenden Revision ändert (auch ungespeichert).
 * Verglichen wird je Karte, wie der Server die Kennungen der Zeilen vergibt.
 */

const EPS = 1e-9;

/** Eine Zeile der Revision im Entwurf, wie der Editor sie hält. */
export const draftOfRevisionLine = (line: BomRevisionLine): DraftLine => ({
    key: line.id,
    productId: line.productId,
    product: line.product ?? null,
    erpCode: line.erpCode,
    name: line.name,
    brand: line.brand,
    modelNumber: line.modelNumber,
    quantityText: quantityToText(line.quantity),
    unit: line.unit,
    note: line.note,
});

export interface RevisionDiff {
    /** Zeilenschlüssel der Arbeitskopie → was sich an ihr ändert. */
    marks: Map<string, BomRowChange>;
    /** Zeilen der geltenden Revision, die in der Arbeitskopie fehlen. */
    removed: BomLine[];
    counts: { added: number; increased: number; decreased: number; edited: number; removed: number };
}

export const diffDraft = (effective: BomLine[], draft: DraftLine[]): RevisionDiff => {
    const pool = new Map<string, BomLine[]>();
    for (const line of effective) pool.set(line.productId, [...(pool.get(line.productId) ?? []), line]);
    const marks = new Map<string, BomRowChange>();
    const counts = { added: 0, increased: 0, decreased: 0, edited: 0, removed: 0 };
    for (const line of draft) {
        const before = pool.get(line.productId)?.shift();
        if (!before) {
            marks.set(line.key, { kind: 'ADDED', before: 0, unitBefore: null });
            counts.added += 1;
            continue;
        }
        const after = parseQuantityText(line.quantityText);
        const quantity = Number.isFinite(after) ? after : before.quantity;
        if (quantity > before.quantity + EPS) {
            marks.set(line.key, { kind: 'INCREASED', before: before.quantity, unitBefore: before.unit });
            counts.increased += 1;
        } else if (quantity + EPS < before.quantity) {
            marks.set(line.key, { kind: 'DECREASED', before: before.quantity, unitBefore: before.unit });
            counts.decreased += 1;
        } else if (before.unit !== line.unit || (before.note ?? '').trim() !== (line.note ?? '').trim()) {
            marks.set(line.key, { kind: 'EDITED', before: before.quantity, unitBefore: before.unit });
            counts.edited += 1;
        }
    }
    const removed = [...pool.values()].flat();
    counts.removed = removed.length;
    return { marks, removed, counts };
};

/** Wie viele Zeilen je Art — für die kleinen Zähler der Geschichte. */
export const changeCounts = (changes: BomLineChange[]) => ({
    added: changes.filter((change) => change.kind === 'ADDED').length,
    increased: changes.filter((change) => change.kind === 'INCREASED').length,
    decreased: changes.filter((change) => change.kind === 'DECREASED').length,
    edited: changes.filter((change) => change.kind === 'EDITED').length,
    removed: changes.filter((change) => change.kind === 'REMOVED').length,
});

export type ChangeCounts = ReturnType<typeof changeCounts>;
