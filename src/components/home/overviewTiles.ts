import { useCallback, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';

import type { DashboardSummaryDto } from '../../lib/api/dashboard';
import { chf0, compactNumber } from './DashboardCharts';

/* ─────────────────────────────────────────────────────────────────────────────
   The overview tiles of the start page — CHOSEN BY THE USER (10.09.2026,
   Samet: «welche Karten angezeigt werden — etwa Rechnungen — soll man selbst
   wählen können, höchstens acht, zu Beginn vier»).

   Everything here is derived from the one summary call the dashboard already
   makes, so a tile costs nothing extra. The four counts stay the default; the
   money figures (which used to sit in their own "Finanzen" row) and the
   conversion rate are the ones to add. The choice is kept per user in the
   browser (localStorage) — it is a view preference, not company data.
   ───────────────────────────────────────────────────────────────────────── */

export type OverviewTileKey =
    | 'customers' | 'tenders' | 'orders' | 'projects' | 'activeProjects'
    | 'invoiced' | 'openReceivables' | 'paid' | 'unbilled'
    | 'quoteValue' | 'orderValue' | 'conversion';

export const OVERVIEW_TILE_KEYS: OverviewTileKey[] = [
    'customers', 'tenders', 'orders', 'projects', 'activeProjects',
    'invoiced', 'openReceivables', 'paid', 'unbilled',
    'quoteValue', 'orderValue', 'conversion',
];

export const DEFAULT_OVERVIEW_TILES: OverviewTileKey[] = ['customers', 'tenders', 'orders', 'projects'];
export const MAX_OVERVIEW_TILES = 8;
export const MIN_OVERVIEW_TILES = 1;

const STORAGE_PREFIX = 'ofi:home-overview-tiles:v1:';

const isKey = (value: unknown): value is OverviewTileKey =>
    typeof value === 'string' && (OVERVIEW_TILE_KEYS as string[]).includes(value);

const readStored = (userId: string): OverviewTileKey[] | null => {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + userId);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const keys = parsed.filter(isKey);
        const unique = keys.filter((key, index) => keys.indexOf(key) === index).slice(0, MAX_OVERVIEW_TILES);
        return unique.length >= MIN_OVERVIEW_TILES ? unique : null;
    } catch {
        return null;
    }
};

/** The user's tile choice — order matters, it is the order on screen. */
export const useOverviewTiles = (userId: string | null | undefined) => {
    const id = userId || 'anonymous';
    // The choice is keyed by user: a different user in the same tab (the
    // company switcher keeps the session) reads their own row — decided
    // during render, no effect needed.
    const [state, setState] = useState<{ id: string; tiles: OverviewTileKey[] }>(() => ({ id, tiles: readStored(id) ?? DEFAULT_OVERVIEW_TILES }));
    const tiles = state.id === id ? state.tiles : (readStored(id) ?? DEFAULT_OVERVIEW_TILES);

    const setTiles = useCallback((next: OverviewTileKey[]) => {
        const clean = next.filter(isKey).slice(0, MAX_OVERVIEW_TILES);
        const value = clean.length >= MIN_OVERVIEW_TILES ? clean : DEFAULT_OVERVIEW_TILES;
        setState({ id, tiles: value });
        try { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(value)); } catch { /* private mode */ }
    }, [id]);

    const reset = useCallback(() => {
        setState({ id, tiles: DEFAULT_OVERVIEW_TILES });
        try { localStorage.removeItem(STORAGE_PREFIX + id); } catch { /* private mode */ }
    }, [id]);

    const isDefault = useMemo(
        () => tiles.length === DEFAULT_OVERVIEW_TILES.length && tiles.every((key, index) => key === DEFAULT_OVERVIEW_TILES[index]),
        [tiles],
    );

    return { tiles, setTiles, reset, isDefault };
};

export type OverviewTileSpec = {
    key: OverviewTileKey;
    label: string;
    /** One line under the name in the picker — what the figure means. */
    hint: string;
    value: string;
    /** Footnote on the tile. */
    sub?: string;
    /** Where a click goes; a plain figure has none. */
    to?: string;
    /** The attention figure paints red. */
    tone?: 'red';
    /** Which group the picker lists it under. */
    group: 'counts' | 'money' | 'rates';
};

/**
 * Every tile the picker can offer, filled with the summary's figures. The
 * order of this list is the order of the picker, not of the screen.
 */
export const buildOverviewTiles = (summary: DashboardSummaryDto, t: TFunction): Record<OverviewTileKey, OverviewTileSpec> => ({
    customers: {
        key: 'customers',
        group: 'counts',
        label: t('dash.kpi.customers', { defaultValue: 'Kunden' }),
        hint: t('dash.tiles.customersHint', { defaultValue: 'Aktive Kunden im CRM' }),
        value: compactNumber(summary.counts.customers),
        to: '/crm/customers',
    },
    tenders: {
        key: 'tenders',
        group: 'counts',
        label: t('dash.kpi.quotes', { defaultValue: 'Angebote' }),
        hint: t('dash.tiles.quotesHint', { defaultValue: 'Alle erstellten Angebote' }),
        value: compactNumber(summary.counts.tenders),
        sub: t('dash.kpi.quotesSub', { defaultValue: '{{rate}}% werden zu Aufträgen', rate: summary.conversion.orderRate }),
        to: '/sales/quotes',
    },
    orders: {
        key: 'orders',
        group: 'counts',
        label: t('dash.kpi.orders', { defaultValue: 'Aufträge' }),
        hint: t('dash.tiles.ordersHint', { defaultValue: 'Alle Verkaufsaufträge' }),
        value: compactNumber(summary.counts.orders),
        sub: t('dash.kpi.ordersSub', { defaultValue: '{{value}} Auftragswert', value: chf0(summary.financials.orderValue.total) }),
        to: '/sales/orders',
    },
    projects: {
        key: 'projects',
        group: 'counts',
        label: t('dash.kpi.projects', { defaultValue: 'Projekte' }),
        hint: t('dash.tiles.projectsHint', { defaultValue: 'Alle Projekte' }),
        value: compactNumber(summary.counts.projects),
        sub: t('dash.kpi.projectsSub', { defaultValue: '{{count}} davon aktiv', count: summary.counts.activeProjects }),
        to: '/projects',
    },
    activeProjects: {
        key: 'activeProjects',
        group: 'counts',
        label: t('dash.tiles.activeProjects', { defaultValue: 'Aktive Projekte' }),
        hint: t('dash.tiles.activeProjectsHint', { defaultValue: 'Projekte im Status „Aktiv"' }),
        value: compactNumber(summary.counts.activeProjects),
        sub: t('dash.tiles.ofProjects', { defaultValue: 'von {{count}} Projekten', count: summary.counts.projects }),
        to: '/projects',
    },
    invoiced: {
        key: 'invoiced',
        group: 'money',
        label: t('dash.tiles.invoices', { defaultValue: 'Rechnungen' }),
        hint: t('dash.tiles.invoicesHint', { defaultValue: 'Fakturierter Betrag aller Rechnungen' }),
        value: chf0(summary.financials.invoiced),
        sub: t('dash.fin.paidSub', { defaultValue: 'davon bezahlt {{value}}', value: chf0(summary.financials.paid) }),
        to: '/sales/invoices',
    },
    openReceivables: {
        key: 'openReceivables',
        group: 'money',
        label: t('dash.fin.openReceivables', { defaultValue: 'Offene Forderungen' }),
        hint: t('dash.tiles.openHint', { defaultValue: 'Fakturiert, noch nicht bezahlt' }),
        value: chf0(summary.financials.open),
        sub: t('dash.tiles.ofInvoiced', { defaultValue: 'von {{value}} fakturiert', value: chf0(summary.financials.invoiced) }),
        to: '/sales/invoices',
        tone: 'red',
    },
    paid: {
        key: 'paid',
        group: 'money',
        label: t('dash.fin.paid', { defaultValue: 'Bezahlt' }),
        hint: t('dash.tiles.paidHint', { defaultValue: 'Bezahlte Rechnungen' }),
        value: chf0(summary.financials.paid),
        sub: t('dash.tiles.ofInvoiced', { defaultValue: 'von {{value}} fakturiert', value: chf0(summary.financials.invoiced) }),
        to: '/sales/invoices',
    },
    unbilled: {
        key: 'unbilled',
        group: 'money',
        label: t('dash.fin.unbilled', { defaultValue: 'Nicht fakturiert' }),
        hint: t('dash.tiles.unbilledHint', { defaultValue: 'Auftragswert ohne Rechnung' }),
        value: chf0(summary.financials.unbilled),
        sub: t('dash.tiles.ofOrderValue', { defaultValue: 'von {{value}} Auftragswert', value: chf0(summary.financials.orderValue.total) }),
        to: '/sales/orders',
    },
    quoteValue: {
        key: 'quoteValue',
        group: 'money',
        label: t('dash.fin.quoteValue', { defaultValue: 'Angebotsvolumen' }),
        hint: t('dash.tiles.quoteValueHint', { defaultValue: 'Summe aller Angebote' }),
        value: chf0(summary.financials.quoteValue),
        sub: t('dash.tiles.quoteCount', { defaultValue: '{{count}} Angebote', count: summary.counts.tenders }),
        to: '/sales/quotes',
    },
    orderValue: {
        key: 'orderValue',
        group: 'money',
        label: t('dash.fin.orderValue', { defaultValue: 'Auftragsvolumen' }),
        hint: t('dash.tiles.orderValueHint', { defaultValue: 'Summe aller Aufträge' }),
        value: chf0(summary.financials.orderValue.total),
        sub: t('dash.tiles.orderCount', { defaultValue: '{{count}} Aufträge', count: summary.counts.orders }),
        to: '/sales/orders',
    },
    conversion: {
        key: 'conversion',
        group: 'rates',
        label: t('dash.tiles.conversion', { defaultValue: 'Konversionsrate' }),
        hint: t('dash.tiles.conversionHint', { defaultValue: 'Angebote, die zu Aufträgen wurden' }),
        value: `${summary.conversion.orderRate}%`,
        sub: t('dash.tiles.conversionSub', { defaultValue: '{{converted}} von {{total}} Angeboten', converted: summary.conversion.converted, total: summary.conversion.tenders }),
        to: '/sales/quotes',
    },
});
