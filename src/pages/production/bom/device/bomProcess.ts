import type { Bom, BomProcurementSummary } from '@/types/productionBom';

/**
 * ── DER WEG EINER BOM (27.09.2026 abends, Vorgabe Samet) ─────────────────────
 *
 * «Bom listede bu aşamalar hakkında sadece süreçsel bilgilendirme olacak ve
 *  bom listede de genel bir süreç akışı görmek istiyorum hep — yani nerede
 *  olduğumuzu ve process'in ne kaldığını görmek istiyorum.»
 *
 * Die Stationen, gerechnet aus der BOM (ohne Lieferant, ohne Preis):
 *
 *   Liste › Fiyat talebi (wahlweise) › Onay › Sipariş talebi › Satın alma ›
 *   Tedarikçi onayı › Mal kabul & rezerve › Tamamlandı › Stoktan düşüldü
 *
 * Jede Station ist erledigt, dran, offen oder übersprungen. Die erste offene
 * ist «şu an»; was danach kommt, ist «kalan». Eine Haupt-BOM ohne eigene
 * Zeilen (die Klammer) rechnet über ihre Alt-BOMs: erledigt, wenn alle es
 * sind.
 */

export type BomStepKey =
    | 'list'
    | 'price'
    | 'approve'
    | 'orderRequest'
    | 'purchasing'
    | 'confirmed'
    | 'received'
    | 'completed'
    | 'consumed';

export type BomStepState = 'done' | 'current' | 'todo' | 'skipped';

export interface BomStep {
    key: BomStepKey;
    state: BomStepState;
    /** Wie weit (z. B. 3/5) — null = keine Zahl. */
    done: number | null;
    total: number | null;
    /** Die Station ist wahlweise (Fiyat talebi). */
    optional?: boolean;
}

export const BOM_STEP_KEYS: BomStepKey[] = [
    'list', 'price', 'approve', 'orderRequest', 'purchasing', 'confirmed', 'received', 'completed', 'consumed',
];

const OPEN = new Set(['OPEN', 'IN_PROGRESS']);
const LIVE = new Set(['OPEN', 'IN_PROGRESS', 'DONE']);
const EPS = 1e-9;

interface RawStep { key: BomStepKey; done: boolean; skipped?: boolean; optional?: boolean; count?: [number, number] | null }

/** Die Stationen EINER BOM mit eigenen Zeilen. */
const rawSteps = (bom: Bom): RawStep[] => {
    const consumed = Boolean(bom.consumedAt);
    const approved = bom.status !== 'DRAFT' || consumed;
    const requests: BomProcurementSummary[] = bom.procurement ?? [];
    const price = requests.filter((entry) => entry.kind === 'PRICE' && LIVE.has(entry.status));
    const orders = requests.filter((entry) => entry.kind === 'ORDER' && LIVE.has(entry.status));
    const lines = bom.lines.length;

    // Was fehlt, und was davon schon beim Einkauf liegt.
    const requested = new Set(orders.flatMap((entry) => entry.lines.map((line) => line.bomLineId)));
    const missingLines = bom.lines.filter((line) => line.coverage.missing > EPS);
    const missingRequested = missingLines.filter((line) => requested.has(line.id)).length;
    const orderDocs = bom.purchases.filter((purchase) => purchase.kind === 'ORDER');
    const confirmedDocs = orderDocs.filter((purchase) => purchase.checks.confirmed).length;
    const priceDone = price.filter((entry) => entry.status === 'DONE' || entry.progress.covered >= entry.progress.total).length;

    return [
        { key: 'list', done: approved || lines > 0, count: lines ? [lines, lines] : null },
        {
            key: 'price',
            optional: true,
            // Ohne Anfrage ist sie nach der Freigabe übersprungen; davor offen, aber wahlweise.
            done: price.length > 0 && priceDone === price.length,
            skipped: price.length === 0 && approved,
            count: price.length ? [priceDone, price.length] : null,
        },
        { key: 'approve', done: approved },
        {
            key: 'orderRequest',
            // Erledigt, wenn nichts fehlt, das nicht schon angefragt wäre.
            done: approved && missingLines.length === missingRequested,
            count: approved && missingLines.length ? [missingRequested, missingLines.length] : null,
        },
        {
            key: 'purchasing',
            done: approved && bom.completion.ordered,
            count: approved && lines ? [lines - bom.counts.missing, lines] : null,
        },
        {
            key: 'confirmed',
            done: approved && bom.completion.ordered && bom.completion.confirmed,
            count: orderDocs.length ? [confirmedDocs, orderDocs.length] : null,
        },
        {
            key: 'received',
            done: approved && bom.completion.reserved,
            count: approved && lines ? [bom.counts.reserved, lines] : null,
        },
        { key: 'completed', done: bom.status === 'COMPLETED' || consumed },
        { key: 'consumed', done: consumed },
    ];
};

/** Erledigte Stationen bleiben erledigt, die erste offene ist dran. */
const withStates = (raw: RawStep[]): BomStep[] => {
    let currentSet = false;
    return raw.map((step) => {
        let state: BomStepState;
        if (step.done) state = 'done';
        else if (step.skipped) state = 'skipped';
        // Die wahlweise Preisanfrage ist nie «dran» — sie blockiert die Freigabe nicht.
        else if (!currentSet && !step.optional) {
            state = 'current';
            currentSet = true;
        } else state = 'todo';
        return {
            key: step.key,
            state,
            done: step.count ? step.count[0] : null,
            total: step.count ? step.count[1] : null,
            ...(step.optional ? { optional: true } : {}),
        };
    });
};

/**
 * Die Klammer (Haupt-BOM ohne eigene Zeilen): jede Station über alle
 * Alt-BOMs — erledigt, wenn alle es sind; die Zahl sagt, wie viele.
 */
const containerSteps = (main: Bom, subs: Bom[]): RawStep[] => {
    if (!subs.length) {
        return BOM_STEP_KEYS.map((key) => ({ key, done: false, optional: key === 'price' }));
    }
    const perSub = subs.map((sub) => withStates(rawSteps(sub)));
    return BOM_STEP_KEYS.map((key, index) => {
        const states = perSub.map((steps) => steps[index]!.state);
        const done = states.filter((state) => state === 'done').length;
        const skipped = states.filter((state) => state === 'skipped').length;
        if (key === 'completed') {
            return { key, done: main.status === 'COMPLETED' || Boolean(main.consumedAt), count: [done, subs.length] as [number, number] };
        }
        if (key === 'consumed') return { key, done: Boolean(main.consumedAt) };
        return {
            key,
            optional: key === 'price',
            done: done > 0 && done + skipped === subs.length,
            skipped: skipped === subs.length,
            count: [done, subs.length - skipped] as [number, number],
        };
    });
};

export interface BomProcess {
    steps: BomStep[];
    current: BomStep | null;
    /** Wie viele Pflichtstationen noch offen sind (ohne die dran ist). */
    remaining: number;
    /** 0 … 1 — Anteil der erledigten Pflichtstationen. */
    progress: number;
}

export const bomProcess = (bom: Bom, subs: Bom[] = []): BomProcess => {
    const container = bom.kind === 'MAIN' && bom.lines.length === 0;
    const steps = withStates(container ? containerSteps(bom, subs) : rawSteps(bom));
    const required = steps.filter((step) => !step.optional && step.state !== 'skipped');
    const current = steps.find((step) => step.state === 'current') ?? null;
    const done = required.filter((step) => step.state === 'done').length;
    return {
        steps,
        current,
        remaining: required.filter((step) => step.state === 'todo').length,
        progress: required.length ? done / required.length : 0,
    };
};

/** Die Talepler, die gerade beim Einkauf liegen. */
export const openRequests = (bom: Bom): BomProcurementSummary[] =>
    (bom.procurement ?? []).filter((entry) => OPEN.has(entry.status));

/** Remaining quantities in the current draft, after open price requests. */
export const priceRequestRemaining = (bom: Bom): Map<string, number> => {
    const draft = bom.status !== 'DRAFT' ? bom.revisionDraft : null;
    const lines = draft?.lines ?? bom.lines;
    const revision = draft?.revision ?? bom.revision;
    const remaining = new Map(lines.map((line) => [line.id, line.quantity]));
    for (const request of openRequests(bom)) {
        if (request.kind !== 'PRICE' || request.bomRevision !== revision) continue;
        for (const line of request.lines) {
            if (!remaining.has(line.bomLineId)) continue;
            remaining.set(line.bomLineId, Math.round(Math.max(0, remaining.get(line.bomLineId)! - Math.max(0, line.quantity)) * 1000) / 1000);
        }
    }
    return remaining;
};

/** A partially requested PRICE line remains selectable for its remaining quantity. */
export const pendingLineIds = (bom: Bom, kind: 'PRICE' | 'ORDER'): Map<string, string> => {
    const map = new Map<string, string>();
    const remaining = kind === 'PRICE' ? priceRequestRemaining(bom) : null;
    const revision = bom.status !== 'DRAFT' && bom.revisionDraft ? bom.revisionDraft.revision : bom.revision;
    for (const entry of openRequests(bom)) {
        if (entry.kind !== kind) continue;
        if (kind === 'PRICE' && entry.bomRevision !== revision) continue;
        for (const line of entry.lines) {
            if (remaining && (remaining.get(line.bomLineId) ?? 0) > EPS) continue;
            if (!map.has(line.bomLineId)) map.set(line.bomLineId, entry.requestNumber);
        }
    }
    return map;
};
