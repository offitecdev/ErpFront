import { useCallback, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';

import type { DashboardMonthlyPoint, DashboardSummaryDto } from '../../lib/api/dashboard';
import { chf0, compactNumber, type MonthlyKey } from './DashboardCharts';

/* ─────────────────────────────────────────────────────────────────────────────
   «Vertrieb & Konversion» — the section's own filters (21.09.2026, Samet:
   «Satış ve Dönüşüme özel filtreler ekleyebilin, özelleştirme butonu burada
   olacak»). The section gets the same Anpassen button the overview tiles
   carry, but it opens filters instead of a card list:

     · Zeitraum   — the last 3, 6 or 12 months of the history
     · Kennzahl   — Anzahl (Angebote/Aufträge) or Betrag (Auftragswert/Fakturiert)
     · Serien     — which of the two lines of the chosen Kennzahl are drawn
     · Konversion — which slices the donut shows

   Everything is cut from the data the dashboard already holds (the twelve
   monthly points and the summary), so a filter costs no extra call and no
   backend change. The choice is a view preference and lives per user in
   localStorage, exactly like the tile choice ([[home-dashboard-apple]]).
   ───────────────────────────────────────────────────────────────────────── */

export type SalesMetric = 'count' | 'amount';
export type SalesRange = 3 | 6 | 12;
export type SalesSeriesKey = MonthlyKey;
export type ConversionSliceKey = 'project' | 'delivery' | 'otherConverted' | 'open';

export const SALES_RANGES: SalesRange[] = [3, 6, 12];
export const SALES_METRICS: SalesMetric[] = ['count', 'amount'];
/** Counts and amounts never share a value axis — one metric at a time. */
export const SERIES_OF_METRIC: Record<SalesMetric, SalesSeriesKey[]> = {
    count: ['tenders', 'orders'],
    amount: ['orderValue', 'invoiced'],
};
export const CONVERSION_SLICES: ConversionSliceKey[] = ['project', 'delivery', 'otherConverted', 'open'];

export interface SalesFilters {
    range: SalesRange;
    metric: SalesMetric;
    /** Kept across BOTH metrics, so switching the metric keeps the choice. */
    series: SalesSeriesKey[];
    slices: ConversionSliceKey[];
}

export const DEFAULT_SALES_FILTERS: SalesFilters = {
    range: 12,
    metric: 'count',
    series: ['tenders', 'orders', 'orderValue', 'invoiced'],
    slices: [...CONVERSION_SLICES],
};

const STORAGE_PREFIX = 'ofi:home-sales-filters:v1:';

const SERIES_KEYS: SalesSeriesKey[] = ['tenders', 'orders', 'orderValue', 'invoiced'];

const isRange = (value: unknown): value is SalesRange => SALES_RANGES.includes(value as SalesRange);
const isMetric = (value: unknown): value is SalesMetric => SALES_METRICS.includes(value as SalesMetric);
const isSeries = (value: unknown): value is SalesSeriesKey => SERIES_KEYS.includes(value as SalesSeriesKey);
const isSlice = (value: unknown): value is ConversionSliceKey => CONVERSION_SLICES.includes(value as ConversionSliceKey);
const unique = <T,>(list: T[]) => list.filter((item, index) => list.indexOf(item) === index);

const sanitize = (raw: unknown): SalesFilters => {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<SalesFilters>;
    const series = Array.isArray(value.series) ? unique(value.series.filter(isSeries)) : [];
    const slices = Array.isArray(value.slices) ? unique(value.slices.filter(isSlice)) : [];
    return {
        range: isRange(value.range) ? value.range : DEFAULT_SALES_FILTERS.range,
        metric: isMetric(value.metric) ? value.metric : DEFAULT_SALES_FILTERS.metric,
        series: series.length > 0 ? series : DEFAULT_SALES_FILTERS.series,
        slices: slices.length > 0 ? slices : DEFAULT_SALES_FILTERS.slices,
    };
};

const readStored = (id: string): SalesFilters => {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + id);
        return raw ? sanitize(JSON.parse(raw)) : DEFAULT_SALES_FILTERS;
    } catch {
        return DEFAULT_SALES_FILTERS;
    }
};

const same = (a: SalesFilters, b: SalesFilters) =>
    a.range === b.range
    && a.metric === b.metric
    && [...a.series].sort().join() === [...b.series].sort().join()
    && [...a.slices].sort().join() === [...b.slices].sort().join();

/** The user's filter choice — keyed by user, like the tile choice. */
export const useSalesFilters = (userId: string | null | undefined) => {
    const id = userId || 'anonymous';
    const [state, setState] = useState<{ id: string; filters: SalesFilters }>(() => ({ id, filters: readStored(id) }));
    const filters = state.id === id ? state.filters : readStored(id);

    const setFilters = useCallback((next: SalesFilters) => {
        const clean = sanitize(next);
        setState({ id, filters: clean });
        try { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(clean)); } catch { /* private mode */ }
    }, [id]);

    const reset = useCallback(() => {
        setState({ id, filters: DEFAULT_SALES_FILTERS });
        try { localStorage.removeItem(STORAGE_PREFIX + id); } catch { /* private mode */ }
    }, [id]);

    const isDefault = useMemo(() => same(filters, DEFAULT_SALES_FILTERS), [filters]);

    return { filters, setFilters, reset, isDefault };
};

/** The series actually drawn: the chosen ones of the active metric, never none. */
export const visibleSeriesKeys = (filters: SalesFilters): SalesSeriesKey[] => {
    const allowed = SERIES_OF_METRIC[filters.metric];
    const picked = allowed.filter((key) => filters.series.includes(key));
    return picked.length > 0 ? picked : [allowed[0]];
};

/** The tail of the history the Zeitraum asks for. */
export const rangePoints = (points: DashboardMonthlyPoint[], range: SalesRange) =>
    (points.length > range ? points.slice(points.length - range) : points);

export type SalesSeriesSpec = {
    key: SalesSeriesKey;
    metric: SalesMetric;
    label: string;
    /** One line under the name in the sheet — what the series means. */
    hint: string;
    /** The period's total, for the sheet's right column. */
    value: string;
    color: string;
};

export type SalesPalette = { navy: string; orange: string; muted: string; rest: string };

/**
 * Every series the sheet can offer, with the total of the CHOSEN period —
 * picking "3 Monate" changes the figures in the sheet too.
 */
export const buildSalesSeries = (
    points: DashboardMonthlyPoint[],
    t: TFunction,
    colors: SalesPalette,
): Record<SalesSeriesKey, SalesSeriesSpec> => {
    const sum = (key: SalesSeriesKey) => points.reduce((total, point) => total + (point[key] ?? 0), 0);
    return {
        tenders: {
            key: 'tenders',
            metric: 'count',
            label: t('dash.monthly.seriesQuotes', { defaultValue: 'Angebote' }),
            hint: t('dash.sales.hintQuotes', { defaultValue: 'Erstellte Angebote je Monat' }),
            value: compactNumber(sum('tenders')),
            color: colors.navy,
        },
        orders: {
            key: 'orders',
            metric: 'count',
            label: t('dash.monthly.seriesOrders', { defaultValue: 'Aufträge' }),
            hint: t('dash.sales.hintOrders', { defaultValue: 'Erteilte Aufträge je Monat' }),
            value: compactNumber(sum('orders')),
            color: colors.orange,
        },
        orderValue: {
            key: 'orderValue',
            metric: 'amount',
            label: t('dash.monthly.orderValue', { defaultValue: 'Auftragswert' }),
            hint: t('dash.sales.hintOrderValue', { defaultValue: 'Auftragsvolumen je Monat' }),
            value: chf0(sum('orderValue')),
            color: colors.navy,
        },
        invoiced: {
            key: 'invoiced',
            metric: 'amount',
            label: t('dash.monthly.invoiced', { defaultValue: 'Fakturiert' }),
            hint: t('dash.sales.hintInvoiced', { defaultValue: 'Fakturierter Betrag je Monat' }),
            value: chf0(sum('invoiced')),
            color: colors.orange,
        },
    };
};

export type ConversionSliceSpec = {
    key: ConversionSliceKey;
    label: string;
    hint: string;
    count: number;
    color: string;
};

/** The donut's four slices — one table for the chart and for the sheet. */
export const buildConversionSlices = (
    summary: DashboardSummaryDto,
    t: TFunction,
    colors: SalesPalette,
): Record<ConversionSliceKey, ConversionSliceSpec> => {
    const { conversion } = summary;
    const otherConverted = Math.max(0, conversion.converted - conversion.toProject - conversion.toDelivery);
    return {
        project: {
            key: 'project',
            label: t('dash.conv.quoteToProject', { defaultValue: 'Angebot → Projekt' }),
            hint: t('dash.sales.hintToProject', { defaultValue: 'Angebote, aus denen ein Projekt wurde' }),
            count: conversion.toProject,
            color: colors.navy,
        },
        delivery: {
            key: 'delivery',
            label: t('dash.conv.quoteToDelivery', { defaultValue: 'Angebot → Lieferauftrag' }),
            hint: t('dash.sales.hintToDelivery', { defaultValue: 'Angebote, aus denen ein Lieferauftrag wurde' }),
            count: conversion.toDelivery,
            color: colors.orange,
        },
        otherConverted: {
            key: 'otherConverted',
            label: t('dash.conv.otherConverted', { defaultValue: 'Andere Aufträge' }),
            hint: t('dash.sales.hintOtherConverted', { defaultValue: 'Aufträge anderer Art' }),
            count: otherConverted,
            color: colors.muted,
        },
        open: {
            key: 'open',
            label: t('dash.conv.open', { defaultValue: 'Noch offen' }),
            hint: t('dash.sales.hintOpen', { defaultValue: 'Angebote ohne Auftrag' }),
            count: Math.max(0, conversion.tenders - conversion.converted),
            color: colors.rest,
        },
    };
};

/** «Letzte 6 Monate · Anzahl» — the line under the section's card titles. */
export const describeSalesFilters = (filters: SalesFilters, t: TFunction) => [
    t('dash.sales.lastMonths', { defaultValue: 'Letzte {{count}} Monate', count: filters.range }),
    filters.metric === 'amount'
        ? t('dash.sales.metricAmount', { defaultValue: 'Betrag' })
        : t('dash.sales.metricCount', { defaultValue: 'Anzahl' }),
].join(' · ');
