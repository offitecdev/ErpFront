import { t } from '@/i18n/translate';
import type { BomSummary, BomAreaView } from '@/types/productionBom';

import type { NavEntry } from '../navStackState';

/**
 * ── DIE ANSICHTEN DER BOM-FLÄCHE (27.09.2026) ────────────────────────────────
 * Jede ist ein Eintrag des Navigationsstapels. Die oberste steht in der
 * Adresse (`bv`, `bom`, `rev`) — ein Neuladen öffnet genau dort.
 *
 * Seit der Hierarchie (gleicher Tag, Samet: «BOM listede kart kart olmamalı,
 * direkt boş liste açılmalı … her zaman bir ana BOM»): die WURZEL ist die
 * Haupt-BOM selbst (BOM-MEK-00001) — ihre Zeilen, darunter die Karten der
 * Alt-BOMs. `bom` ist eine Alt-BOM; «Görevler» ist eine eigene Ansicht.
 *
 * Bestellen, Preisanfragen, Belege und Wareneingang macht der Einkauf auf
 * «Satın alma» (seit 28.09.2026 auf einer Seite ohne Assistenten) — die BOM
 * stellt nur den Talep.
 */
export type BomView =
    | { kind: 'list' }
    | { kind: 'tasks' }
    | { kind: 'bom'; bomId: string }
    /** Die Revisionen einer BOM (27.09.2026) — und eine davon im Einzelnen. */
    | { kind: 'revisions'; bomId: string }
    | { kind: 'revision'; bomId: string; revision: number };

/** Die Haupt-BOM in der Adresse (`bom=main`) — ihre Kennung kennt erst die Antwort. */
export const MAIN_ALIAS = 'main';

export const viewKey = (view: BomView): string => {
    switch (view.kind) {
        case 'list': return 'list';
        case 'tasks': return 'tasks';
        case 'bom': return `bom:${view.bomId}`;
        case 'revisions': return `revisions:${view.bomId}`;
        case 'revision': return `revision:${view.bomId}:${view.revision}`;
        default: return 'list';
    }
};

export const entryOf = (view: BomView): NavEntry<BomView> => ({ key: viewKey(view), view });

/** Der Name einer Ansicht — für ihre Leiste und den Zurück-Pfeil der nächsten. */
export const viewTitle = (view: BomView, data: BomAreaView | null, boms: Map<string, BomSummary>): string => {
    const bomId = 'bomId' in view ? (view.bomId === MAIN_ALIAS ? data?.main?.id ?? view.bomId : view.bomId) : null;
    const bom = bomId ? boms.get(bomId) ?? null : null;
    switch (view.kind) {
        case 'list': return data?.main?.bomNumber ?? t('productionBom.device.title');
        case 'tasks': return t('productionBom.tasks.title');
        case 'bom': return bom?.bomNumber ?? '…';
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
    if (kind === 'tasks') return [root, entryOf({ kind: 'tasks' })];
    if (!bomId) return [root];
    // Die Haupt-BOM IST die Wurzel — ihre Unteransichten hängen direkt daran.
    const base = bomId === MAIN_ALIAS ? [root] : [root, entryOf({ kind: 'bom', bomId })];
    // Alte Adressen der Einkaufsansichten (Bestellung, Wareneingang …) landen auf der BOM.
    switch (kind) {
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
    if (view.kind === 'revision') next.set('rev', String(view.revision));
    return next;
};
