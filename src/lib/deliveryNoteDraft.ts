import type { DeliveryNoteDto, DeliveryNoteLineDto } from '@/lib/api/deliveryNotes';
import { buildTree, type TreeNode } from '@/pages/sales/detail/tenderDetailUtils';
import type { PositionDto } from '@/types/tender';

/**
 * ── LIEFERSCHEIN-ENTWURF AUS DEN POSITIONEN DES AUFTRAGS (28.09.2026) ─────────
 *
 * Welche Zeilen der Offerte kommen auf den Lieferschein? Die Positionen mit
 * MENGE — jede Zeile, die auf der AB eine Menge trägt. Kapitel ohne eigenen
 * Betrag und reine Textzeilen bleiben weg. Trägt eine Position selbst Menge und
 * Preis, geht ihr Inhalt (zugeordnete Artikel) MIT ihr — die Unterzeilen
 * erscheinen dann nicht noch einmal einzeln.
 *
 * Die Pos-Nummern sind EXAKT die der Offerte/AB (`flattenTenderTreeForPdf`):
 * Kapitel zählen 1, 2 …, Positionen darunter 1.1, 1.2 …, Textzeilen tragen
 * keine Nummer. Darum läuft der Zähler über ALLE Zeilen, auch über die, die
 * nicht auf den Lieferschein kommen.
 */
export const draftLinesFromPositions = (positions: PositionDto[]): DeliveryNoteLineDto[] => {
    const tree = buildTree(positions);
    let rootIndex = 0;
    let activeTitleIndex: number | null = null;
    let childIndex = 0;

    const nextLabel = (node: TreeNode) => {
        const rowType = (node.rowType || '').toUpperCase();
        if (rowType === 'DESCRIPTION') return '';
        if (rowType === 'SECTION' || rowType === 'TITLE') {
            rootIndex += 1;
            activeTitleIndex = rootIndex;
            childIndex = 0;
            return String(rootIndex);
        }
        if (activeTitleIndex == null) {
            rootIndex += 1;
            return String(rootIndex);
        }
        childIndex += 1;
        return `${activeTitleIndex}.${childIndex}`;
    };

    const lines: DeliveryNoteLineDto[] = [];
    const walk = (nodes: TreeNode[], covered: boolean) => {
        nodes.forEach((node) => {
            const label = nextLabel(node);
            const rowType = (node.rowType || '').toUpperCase();
            const qty = Number(node.quantity) || 0;
            const priced = (Number(node.unitPrice) || 0) !== 0;
            const heading = rowType === 'SECTION' || rowType === 'TITLE';
            const deliverable = !covered && qty > 0
                && (heading ? priced : (node.children.length === 0 || priced));
            if (deliverable) {
                lines.push({
                    sourcePositionId: node.id,
                    articleId: node.sourceArticleId ?? node.articleId ?? null,
                    positionNumber: label || null,
                    articleCode: null,
                    description: String(node.shortDescription || '').trim(),
                    unit: node.unit ?? null,
                    orderedQty: qty,
                    deliveredQty: qty,
                });
            }
            walk(node.children, covered || deliverable);
        });
    };
    walk(tree, false);
    return lines.filter((line) => line.description);
};

/**
 * Was von jeder Offertposition schon geliefert wurde — über alle Lieferscheine
 * des Auftrags, ohne den gerade bearbeiteten.
 */
export const deliveredByPosition = (notes: DeliveryNoteDto[], exceptNoteId?: string | null) => {
    const sums = new Map<string, number>();
    notes.forEach((note) => {
        if (exceptNoteId && note.id === exceptNoteId) return;
        note.lines.forEach((line) => {
            if (!line.sourcePositionId) return;
            sums.set(line.sourcePositionId, (sums.get(line.sourcePositionId) || 0) + (Number(line.deliveredQty) || 0));
        });
    });
    return sums;
};

/**
 * «Offen» je Zeile eines gespeicherten Lieferscheins: bestellt minus alles, was
 * bis und MIT diesem Lieferschein geliefert wurde (Lieferscheine in der
 * Reihenfolge ihrer Entstehung). Von Hand ergänzte Zeilen haben keinen
 * Bestellwert — dort bleibt «Offen» leer (null).
 */
export const openAfterNote = (note: DeliveryNoteDto, allNotes: DeliveryNoteDto[]): Array<number | null> => {
    const ordered = [...allNotes].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const index = ordered.findIndex((entry) => entry.id === note.id);
    const upTo = index >= 0 ? ordered.slice(0, index + 1) : [...ordered, note];
    const delivered = new Map<string, number>();
    upTo.forEach((entry) => entry.lines.forEach((line) => {
        if (!line.sourcePositionId) return;
        delivered.set(line.sourcePositionId, (delivered.get(line.sourcePositionId) || 0) + (Number(line.deliveredQty) || 0));
    }));
    return note.lines.map((line) => {
        if (!line.sourcePositionId || !(line.orderedQty > 0)) return null;
        return Math.max(0, roundQty(line.orderedQty - (delivered.get(line.sourcePositionId) || 0)));
    });
};

export const roundQty = (value: number) => Math.round((Number(value) || 0) * 1000) / 1000;
