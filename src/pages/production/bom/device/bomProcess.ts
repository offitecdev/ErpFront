import type { Bom, BomSummary, BomProcurementSummary } from '@/types/productionBom';

/**
 * ── DER WEG EINER BOM (27.09.2026 abends, Vorgabe Samet) ─────────────────────
 *
 * «Bom listede bu aşamalar hakkında sadece süreçsel bilgilendirme olacak ve
 *  bom listede de genel bir süreç akışı görmek istiyorum hep — yani nerede
 *  olduğumuzu ve process'in ne kaldığını görmek istiyorum.»
 *
 * Die Stationen, gerechnet aus der BOM (ohne Lieferant, ohne Preis):
 *
 *   Liste › Onay › Fiyat talebi › Satın alma › Tedarikçi onayı ›
 *   Mal kabul & rezerve › Tamamlandı › Stoktan düşüldü
 *   (die Station «Sipariş talebi» gibt es seit dem 30.09.2026 nicht mehr)
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
    'list', 'approve', 'price', 'purchasing', 'confirmed', 'received', 'completed', 'consumed',
];

const OPEN = new Set(['OPEN', 'IN_PROGRESS']);
const EPS = 1e-9;

interface RawStep { key: BomStepKey; done: boolean; skipped?: boolean; optional?: boolean; count?: [number, number] | null }

/** Die Stationen EINER BOM mit eigenen Zeilen. */
const rawSteps = (bom: BomSummary): RawStep[] => {
    const consumed = Boolean(bom.consumedAt);
    const approved = bom.status !== 'DRAFT' || consumed;
    const detail = 'lines' in bom ? bom as Bom : null;
    const lines = bom.counts.lines;

    /* «Bomda artık sipariş talebi yok, sadece fiyat talebi var» (30.09.2026): der
       Einkauf beginnt mit dem Fiyat talebi (auch nach der Freigabe) — bestellt wird
       aus dem Vergleich der Angebote. Gebraucht wird er für jede Zeile, der etwas
       fehlt (im Entwurf: jede Zeile). */
    const asked = detail ? priceRequestedLines(detail) : new Map<string, string>();
    const needingLines = (detail?.lines ?? []).filter((line) => !approved || line.coverage.missing > EPS);
    const needing = bom.activity?.needing ?? needingLines.length;
    const askedNeeding = bom.activity?.requestedNeeding ?? needingLines.filter((line) => asked.has(line.id)).length;
    const orderDocs = (detail?.purchases ?? []).filter((purchase) => purchase.kind === 'ORDER');
    const orderCount = bom.activity?.orderCount ?? orderDocs.length;
    const confirmedDocs = bom.activity?.confirmedOrders ?? orderDocs.filter((purchase) => purchase.checks.confirmed).length;

    return [
        { key: 'list', done: approved || lines > 0, count: lines ? [lines, lines] : null },
        { key: 'approve', done: approved },
        {
            key: 'price',
            done: needing > 0 && askedNeeding === needing,
            // Nichts fehlt (alles am Lager) — dann braucht es keine Anfrage.
            skipped: approved && needing === 0,
            count: needing ? [askedNeeding, needing] : null,
        },
        {
            key: 'purchasing',
            done: approved && bom.completion.ordered,
            count: approved && lines ? [lines - bom.counts.missing, lines] : null,
        },
        {
            key: 'confirmed',
            done: approved && bom.completion.ordered && bom.completion.confirmed,
            count: orderCount ? [confirmedDocs, orderCount] : null,
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
const containerSteps = (main: Bom, subs: BomSummary[]): RawStep[] => {
    if (!subs.length) {
        return BOM_STEP_KEYS.map((key) => ({ key, done: false }));
    }
    const perSub = subs.map((sub) => withStates(rawSteps(sub)));
    return BOM_STEP_KEYS.map((key) => {
        // Nach dem SCHLÜSSEL, nicht nach der Stelle: eine Alt-BOM, der eine Station fehlt, zählt als offen.
        const states = perSub.map((steps) => steps.find((step) => step.key === key)?.state ?? 'todo');
        const done = states.filter((state) => state === 'done').length;
        const skipped = states.filter((state) => state === 'skipped').length;
        if (key === 'completed') {
            return { key, done: main.status === 'COMPLETED' || Boolean(main.consumedAt), count: [done, subs.length] as [number, number] };
        }
        if (key === 'consumed') return { key, done: Boolean(main.consumedAt) };
        return {
            key,
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

export const bomProcess = (bom: Bom, subs: BomSummary[] = []): BomProcess => {
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

/**
 * «Fiyat talebi alınan üründen bir daha fiyat talebi istenemeyecek» (Samet,
 * 30.09.2026): eine Zeile, die in einem Fiyat talebi steht (jede Revision,
 * nur ein verworfener zählt nicht), ist gesperrt — Zeile → Talep-Nummer.
 * Dieselbe Regel wie der Server (`priceRequestedLineIds`).
 */
export const priceRequestedLines = (bom: Bom): Map<string, string> => {
    if (bom.activity) return new Map(Object.entries(bom.activity.priceRequests));
    const map = new Map<string, string>();
    for (const entry of bom.procurement ?? []) {
        if (entry.kind !== 'PRICE' || entry.status === 'CANCELLED') continue;
        for (const line of entry.lines) if (!map.has(line.bomLineId)) map.set(line.bomLineId, entry.requestNumber);
    }
    return map;
};

/** PRICE: Zeilen in einem Fiyat talebi (gesperrt); ORDER: Zeilen in einem offenen Satın alma talebi. */
export const pendingLineIds = (bom: Bom, kind: 'PRICE' | 'ORDER'): Map<string, string> => {
    if (kind === 'PRICE') return priceRequestedLines(bom);
    const map = new Map<string, string>();
    for (const entry of openRequests(bom)) {
        if (entry.kind !== kind) continue;
        for (const line of entry.lines) {
            if (!map.has(line.bomLineId)) map.set(line.bomLineId, entry.requestNumber);
        }
    }
    return map;
};
