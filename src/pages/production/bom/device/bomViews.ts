import { t } from '@/i18n/translate';
import type {
    Bom,
    BomAreaView,
    BomOrderLineInput,
    BomProposal,
    BomProposalLine,
    BomRequestLineInput,
    BomRequestProposal,
    BomSupplierOrder,
} from '@/types/productionBom';

import { quantityToText, shownPurchaseCode } from '../bomFormat';

import type { NavEntry } from '../navStackState';

/**
 * ── DIE ANSICHTEN DER BOM-FLÄCHE (27.09.2026) ────────────────────────────────
 * Jede ist ein Eintrag des Navigationsstapels. Die oberste steht in der
 * Adresse (`bv`, `bom`, `po`) — ein Neuladen oder ein Link aus der
 * Bestellung öffnet genau dort.
 *
 * Seit der Hierarchie (gleicher Tag, Samet: «BOM listede kart kart olmamalı,
 * direkt boş liste açılmalı … her zaman bir ana BOM»): die WURZEL ist die
 * Haupt-BOM selbst (BOM-MEK-00001) — ihre Zeilen, darunter die Karten der
 * Alt-BOMs. `bom` ist eine Alt-BOM; «Görevler» ist eine eigene Ansicht.
 */
export type BomView =
    | { kind: 'list' }
    | { kind: 'tasks' }
    | { kind: 'bom'; bomId: string }
    | { kind: 'wizard'; bomId: string; step: WizardStep }
    /** «Fiyat talebi» — nur im Entwurf (Ürünler › Tedarikçiler › Önizleme › Sonuç). */
    | { kind: 'request'; bomId: string; step: WizardStep }
    | { kind: 'purchases'; bomId: string }
    | { kind: 'purchase'; bomId: string; purchaseOrderId: string }
    | { kind: 'receipt'; bomId: string; purchaseOrderId: string }
    | { kind: 'documents'; bomId: string }
    /** Die Revisionen einer BOM (27.09.2026) — und eine davon im Einzelnen. */
    | { kind: 'revisions'; bomId: string }
    | { kind: 'revision'; bomId: string; revision: number };

export type WizardStep = 1 | 2 | 3 | 4;

/** Die Haupt-BOM in der Adresse (`bom=main`) — ihre Kennung kennt erst die Antwort. */
export const MAIN_ALIAS = 'main';

export const viewKey = (view: BomView): string => {
    switch (view.kind) {
        case 'list': return 'list';
        case 'tasks': return 'tasks';
        case 'bom': return `bom:${view.bomId}`;
        case 'wizard': return `wizard:${view.bomId}:${view.step}`;
        case 'request': return `request:${view.bomId}:${view.step}`;
        case 'purchases': return `purchases:${view.bomId}`;
        case 'purchase': return `purchase:${view.purchaseOrderId}`;
        case 'receipt': return `receipt:${view.purchaseOrderId}`;
        case 'documents': return `documents:${view.bomId}`;
        case 'revisions': return `revisions:${view.bomId}`;
        case 'revision': return `revision:${view.bomId}:${view.revision}`;
        default: return 'list';
    }
};

export const entryOf = (view: BomView): NavEntry<BomView> => ({ key: viewKey(view), view });

/** Im Entwurf gibt es nur Preisanfragen (bestellt wird nach der Freigabe) — dann heisst die Liste so. */
export const purchasesTitle = (bom: Bom | null | undefined): string =>
    bom && bom.status === 'DRAFT' && !bom.purchases.some((purchase) => purchase.kind === 'ORDER')
        ? t('productionBom.request.links')
        : t('productionBom.purchases.title');

/** Der Name einer Ansicht — für ihre Leiste und den Zurück-Pfeil der nächsten. */
export const viewTitle = (view: BomView, data: BomAreaView | null, boms: Map<string, Bom>): string => {
    const bomId = 'bomId' in view ? (view.bomId === MAIN_ALIAS ? data?.main?.id ?? view.bomId : view.bomId) : null;
    const bom = bomId ? boms.get(bomId) ?? data?.boms.find((entry) => entry.id === bomId) ?? null : null;
    switch (view.kind) {
        case 'list': return data?.main?.bomNumber ?? t('productionBom.device.title');
        case 'tasks': return t('productionBom.tasks.title');
        case 'bom': return bom?.bomNumber ?? '…';
        case 'wizard': return t(`productionBom.wizard.step${view.step}`);
        case 'request': return t(`productionBom.request.step${view.step}`);
        case 'purchases': return purchasesTitle(bom);
        case 'purchase': {
            const purchase = bom?.purchases.find((entry) => entry.purchaseOrderId === view.purchaseOrderId);
            // Wie überall: der Code in der Sprache der Oberfläche (BE-… → SP-/PO-).
            return purchase?.referenceNumber ? shownPurchaseCode(purchase.referenceNumber) : t('productionBom.purchases.order');
        }
        case 'receipt': return t('productionBom.receipt.title');
        case 'documents': return t('productionBom.documents.title');
        case 'revisions': return t('productionBom.revision.history');
        case 'revision': return t('productionBom.revision.label', { revision: view.revision });
        default: return '';
    }
};

/** Der Stapel, den eine Adresse beschreibt: Haupt-BOM › (Alt-BOM ›) Unteransicht. */
export const stackFromParams = (params: URLSearchParams): Array<NavEntry<BomView>> => {
    const root = entryOf({ kind: 'list' });
    const kind = params.get('bv');
    const bomId = params.get('bom');
    const purchaseOrderId = params.get('po');
    if (kind === 'tasks') return [root, entryOf({ kind: 'tasks' })];
    if (!bomId) return [root];
    // Die Haupt-BOM IST die Wurzel — ihre Unteransichten hängen direkt daran.
    const base = bomId === MAIN_ALIAS ? [root] : [root, entryOf({ kind: 'bom', bomId })];
    switch (kind) {
        case 'wizard': return [...base, entryOf({ kind: 'wizard', bomId, step: 1 })];
        case 'request': return [...base, entryOf({ kind: 'request', bomId, step: 1 })];
        case 'purchases': return [...base, entryOf({ kind: 'purchases', bomId })];
        case 'purchase':
            return purchaseOrderId
                ? [...base, entryOf({ kind: 'purchases', bomId }), entryOf({ kind: 'purchase', bomId, purchaseOrderId })]
                : base;
        case 'receipt':
            return purchaseOrderId
                ? [...base, entryOf({ kind: 'purchases', bomId }), entryOf({ kind: 'purchase', bomId, purchaseOrderId }), entryOf({ kind: 'receipt', bomId, purchaseOrderId })]
                : base;
        case 'documents': return [...base, entryOf({ kind: 'documents', bomId })];
        case 'revisions': return [...base, entryOf({ kind: 'revisions', bomId })];
        case 'revision': {
            const revision = Number(params.get('rev'));
            return Number.isInteger(revision) && revision >= 0
                ? [...base, entryOf({ kind: 'revisions', bomId }), entryOf({ kind: 'revision', bomId, revision })]
                : [...base, entryOf({ kind: 'revisions', bomId })];
        }
        default: return base;
    }
};

/** Die Adresse der obersten Ansicht (die übrigen Parameter der Seite bleiben). */
export const writeViewParams = (current: URLSearchParams, view: BomView, mainId: string | null): URLSearchParams => {
    const next = new URLSearchParams(current);
    for (const key of ['bv', 'bom', 'po', 'rev']) next.delete(key);
    if (view.kind === 'list') return next;
    next.set('bv', view.kind);
    if ('bomId' in view) next.set('bom', mainId && view.bomId === mainId ? MAIN_ALIAS : view.bomId);
    if ('purchaseOrderId' in view) next.set('po', view.purchaseOrderId);
    if (view.kind === 'revision') next.set('rev', String(view.revision));
    return next;
};

/* ── Der Entwurf von «Sipariş oluştur» ─────────────────────────────────── */

export interface WizardLineState {
    include: boolean;
    quantityText: string;
    note: string;
    supplier: { id: string | null; name: string } | null;
    /** Lieferanten, die für diese Zeile erst hier dazukamen («Yeni tedarikçi»). */
    extraSuppliers: Array<{ id: string | null; name: string }>;
}

export interface WizardState {
    bomId: string;
    proposal: BomProposal;
    lines: Record<string, WizardLineState>;
    result: {
        /** `merged` = die Zeilen kamen in die schon bestehende Bestellung des Lieferanten. */
        created: Array<{ purchaseOrderId: string; referenceNumber: string; supplierName: string; lineCount: number; merged?: boolean }>;
        failed: Array<{ supplierName: string; error: string }>;
    } | null;
}

export const wizardFromProposal = (proposal: BomProposal): WizardState => ({
    bomId: proposal.bomId,
    proposal,
    result: null,
    lines: Object.fromEntries(proposal.lines.map((line) => [line.lineId, {
        include: !line.block,
        quantityText: String(line.floor),
        note: '',
        supplier: line.suppliers[0] ? { id: line.suppliers[0].id, name: line.suppliers[0].name } : null,
        extraSuppliers: [],
    }])),
});

export const parseQty = (text: string): number => {
    const parsed = Number(String(text).trim().replace(/['\s]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const wizardLineProblem = (floor: number, state: WizardLineState): 'QTY' | 'NOTE' | null => {
    const qty = parseQty(state.quantityText);
    if (!Number.isFinite(qty) || qty + 1e-9 < floor) return 'QTY';
    if (qty > floor + 1e-9 && !state.note.trim()) return 'NOTE';
    return null;
};

export const supplierGroupKey = (supplier: { id: string | null; name: string }): string =>
    supplier.id ? `id:${supplier.id}` : `name:${supplier.name.trim().toLocaleLowerCase('tr-TR')}`;

/** Derselbe Lieferant? Tragen beide eine Kennung, entscheidet sie — sonst der Name (wie `sameSupplier` am Server). */
export const sameSupplierAs = (a: { id: string | null; name: string }, b: { id: string | null; name: string }): boolean =>
    a.id && b.id ? a.id === b.id : a.name.trim().toLocaleLowerCase('tr-TR') === b.name.trim().toLocaleLowerCase('tr-TR');

/** Eine Karte der Vorschau: ein Lieferant, seine Zeilen und wohin sie gehen. */
export interface WizardOrderGroup {
    supplier: { id: string | null; name: string };
    lines: BomProposalLine[];
    /** Sein Entwurf in dieser BOM, der nie hinausging — die Zeilen kommen dort hinein. */
    target: BomSupplierOrder | null;
    /** Ohne Entwurf: seine Bestellung, die schon beim Lieferanten ist (darum entsteht eine neue). */
    sent: BomSupplierOrder | null;
}

/**
 * Die Vorschau von Schritt 3, gruppiert wie am Server: je Lieferant EINE
 * Bestellung — und hat er in dieser BOM schon einen Entwurf, der nie beim
 * Lieferanten war, kommen die Zeilen dort hinein (Samet, 27.09.2026: «aynı
 * tedarikçiye ait ise o tek sipariş altında birleştirilir»).
 */
export const wizardGroups = (state: WizardState, lines: BomProposalLine[]): WizardOrderGroup[] => {
    const groups: WizardOrderGroup[] = [];
    for (const line of lines) {
        const supplier = state.lines[line.lineId]?.supplier;
        if (!supplier) continue;
        const group = groups.find((entry) => sameSupplierAs(entry.supplier, supplier));
        if (!group) {
            groups.push({ supplier, lines: [line], target: null, sent: null });
            continue;
        }
        group.lines.push(line);
        if (!group.supplier.id && supplier.id) group.supplier = supplier;
    }
    const orders = state.proposal.supplierOrders ?? [];
    for (const group of groups) {
        const mine = orders.filter((order) => sameSupplierAs({ id: order.supplierId, name: order.supplierName }, group.supplier));
        group.target = mine.find((order) => order.acceptsLines) ?? null;
        group.sent = group.target ? null : mine[0] ?? null;
    }
    return groups;
};

export const wizardInput = (state: WizardState): BomOrderLineInput[] =>
    state.proposal.lines.flatMap((line) => {
        const entry = state.lines[line.lineId];
        if (!entry?.include || line.block || !entry.supplier) return [];
        return [{
            lineId: line.lineId,
            quantity: parseQty(entry.quantityText),
            supplierId: entry.supplier.id,
            supplierName: entry.supplier.name,
            note: entry.note.trim() || null,
        }];
    });

/* ── Der Entwurf von «Fiyat talebi» (27.09.2026) ───────────────────────── */

type SupplierRef = { id: string | null; name: string };

export interface RequestLineState {
    include: boolean;
    quantityText: string;
    /** Die gewählten Lieferanten — einer oder mehrere; je Lieferant eine Anfrage. */
    suppliers: SupplierRef[];
    /** Lieferanten, die für diese Zeile erst hier dazukamen («Yeni tedarikçi»). */
    extraSuppliers: SupplierRef[];
}

export interface RequestWizardState {
    bomId: string;
    proposal: BomRequestProposal;
    lines: Record<string, RequestLineState>;
    result: WizardState['result'];
}

const foldName = (name: string): string => name.trim().toLocaleLowerCase('tr-TR');

/**
 * Der Vorschlag: jede Zeile mit der Menge der BOM und ALLEN Lieferanten ihrer
 * Karte — eine Preisanfrage vergleicht. Was schon angefragt ist, ist nicht
 * vorgewählt: eine Zeile mit Anfragen steht erst drin, wenn man sie anhakt,
 * und dann ohne die Lieferanten, die sie schon haben (ein zweiter Durchgang
 * stellt so nie dieselbe Anfrage noch einmal).
 */
export const requestWizardFromProposal = (proposal: BomRequestProposal): RequestWizardState => ({
    bomId: proposal.bomId,
    proposal,
    result: null,
    lines: Object.fromEntries(proposal.lines.map((line) => {
        const asked = new Set(line.requests.map((request) => foldName(request.supplierName)));
        return [line.lineId, {
            include: !line.requests.length,
            quantityText: quantityToText(line.quantity),
            suppliers: line.suppliers
                .filter((supplier) => !asked.has(foldName(supplier.name)))
                .map((supplier) => ({ id: supplier.id, name: supplier.name })),
            extraSuppliers: [],
        }];
    })),
});

export const requestLineProblem = (state: RequestLineState): 'QTY' | null => {
    const qty = parseQty(state.quantityText);
    return Number.isFinite(qty) && qty > 0 ? null : 'QTY';
};

export const requestInput = (state: RequestWizardState): BomRequestLineInput[] =>
    state.proposal.lines.flatMap((line) => {
        const entry = state.lines[line.lineId];
        if (!entry?.include || !entry.suppliers.length) return [];
        return [{
            lineId: line.lineId,
            quantity: parseQty(entry.quantityText),
            suppliers: entry.suppliers.map((supplier) => ({ supplierId: supplier.id, supplierName: supplier.name })),
        }];
    });

/** «BE-2026-012» + 2 → «BE-2026-014» (Vorschau; fest wird die Nummer erst beim Anlegen). */
export const predictedNumber = (next: string | null, offset: number): string | null => {
    if (!next) return null;
    const match = next.match(/^(.*?)(\d+)$/);
    if (!match) return next;
    const digits = match[2]!;
    const value = Number(digits) + offset;
    return `${match[1]}${String(value).padStart(digits.length, '0')}`;
};
