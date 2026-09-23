import { useTranslation } from 'react-i18next';

import { PopupActions, PopupDialog } from '@/components/ui-shared/PopupKit';

import {
    CONVERSION_SLICES,
    SALES_METRICS,
    SALES_RANGES,
    SERIES_OF_METRIC,
    type ConversionSliceKey,
    type ConversionSliceSpec,
    type SalesFilters,
    type SalesMetric,
    type SalesSeriesKey,
    type SalesSeriesSpec,
} from './salesFilters';

/**
 * «Vertrieb & Konversion anpassen» — the sheet behind the section's own
 * Anpassen button (21.09.2026). Same Mac sheet as the tile picker
 * ([[apple-modal-skin]]): grouped rows, a checkbox in front of each, two
 * segmented controls on top. Every change applies at once — the charts
 * behind the scrim redraw while one picks, «Fertig» only closes.
 */
export const SalesFiltersDialog = ({ open, onClose, filters, onChange, onReset, isDefault, series, slices }: {
    open: boolean;
    onClose: () => void;
    filters: SalesFilters;
    onChange: (next: SalesFilters) => void;
    onReset: () => void;
    isDefault: boolean;
    series: Record<SalesSeriesKey, SalesSeriesSpec>;
    slices: Record<ConversionSliceKey, ConversionSliceSpec>;
}) => {
    const { t } = useTranslation();

    const metricSeries = SERIES_OF_METRIC[filters.metric];
    const onCount = metricSeries.filter((key) => filters.series.includes(key)).length;
    const sliceCount = filters.slices.length;

    const toggleSeries = (key: SalesSeriesKey) => {
        const on = filters.series.includes(key);
        // The chart always keeps one line of the active metric.
        if (on && onCount <= 1) return;
        onChange({
            ...filters,
            series: on ? filters.series.filter((item) => item !== key) : [...filters.series, key],
        });
    };

    const toggleSlice = (key: ConversionSliceKey) => {
        const on = filters.slices.includes(key);
        if (on && sliceCount <= 1) return;
        onChange({
            ...filters,
            slices: on
                ? filters.slices.filter((item) => item !== key)
                : CONVERSION_SLICES.filter((item) => item === key || filters.slices.includes(item)),
        });
    };

    const metricLabel = (metric: SalesMetric) => (metric === 'amount'
        ? t('dash.sales.metricAmount', { defaultValue: 'Betrag' })
        : t('dash.sales.metricCount', { defaultValue: 'Anzahl' }));

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            width={520}
            title={t('dash.sales.title', { defaultValue: 'Vertrieb & Konversion anpassen' })}
            subtitle={t('dash.sales.subtitle', { defaultValue: 'Zeitraum, Kennzahl und Serien dieser Sektion.' })}
            bodyClassName="ofi-home-pick"
            footer={(
                <PopupActions
                    start={(
                        <span className="ofi-home-pick__count">
                            {t('dash.sales.summary', {
                                defaultValue: 'Letzte {{count}} Monate · {{metric}}',
                                count: filters.range,
                                metric: metricLabel(filters.metric),
                            })}
                        </span>
                    )}
                >
                    <button type="button" className="ofi-cal-btn" onClick={onReset} disabled={isDefault}>
                        {t('dash.customize.reset', { defaultValue: 'Standard' })}
                    </button>
                    <button type="button" className="ofi-cal-btn is-primary" onClick={onClose}>
                        {t('common.done', { defaultValue: 'Fertig' })}
                    </button>
                </PopupActions>
            )}
        >
            <section className="ofi-home-pick__group">
                <h3 className="ofi-home-pick__caption">{t('dash.sales.groupRange', { defaultValue: 'Zeitraum' })}</h3>
                <div className="ofi-home-pick__seg" role="group">
                    {SALES_RANGES.map((range) => (
                        <button
                            key={range}
                            type="button"
                            aria-pressed={filters.range === range}
                            className={`ofi-home-pick__segbtn ${filters.range === range ? 'is-on' : ''}`}
                            onClick={() => onChange({ ...filters, range })}
                        >
                            {t('dash.sales.months', { defaultValue: '{{count}} Monate', count: range })}
                        </button>
                    ))}
                </div>
            </section>

            <section className="ofi-home-pick__group">
                <h3 className="ofi-home-pick__caption">{t('dash.sales.groupMetric', { defaultValue: 'Kennzahl' })}</h3>
                <div className="ofi-home-pick__seg" role="group">
                    {SALES_METRICS.map((metric) => (
                        <button
                            key={metric}
                            type="button"
                            aria-pressed={filters.metric === metric}
                            className={`ofi-home-pick__segbtn ${filters.metric === metric ? 'is-on' : ''}`}
                            onClick={() => onChange({ ...filters, metric })}
                        >
                            {metricLabel(metric)}
                        </button>
                    ))}
                </div>
                <p className="ofi-home-pick__note">
                    {filters.metric === 'amount'
                        ? t('dash.sales.metricAmountHint', { defaultValue: 'Franken je Monat — Auftragswert und fakturierter Betrag.' })
                        : t('dash.sales.metricCountHint', { defaultValue: 'Stückzahlen je Monat — Angebote und Aufträge.' })}
                </p>
            </section>

            <section className="ofi-home-pick__group">
                <h3 className="ofi-home-pick__caption">{t('dash.sales.groupSeries', { defaultValue: 'Serien' })}</h3>
                <ul className="ofi-home-pick__list">
                    {metricSeries.map((key) => {
                        const spec = series[key];
                        const on = filters.series.includes(key);
                        const last = on && onCount <= 1;
                        return (
                            <li key={key} className={`ofi-home-pick__row ${on ? 'is-on' : ''}`}>
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={on}
                                    disabled={last}
                                    className="ofi-home-pick__toggle"
                                    onClick={() => toggleSeries(key)}
                                >
                                    <span className={`ofi-cal-check ${on ? 'is-on' : ''}`}>
                                        {on && <span className="ofi-cal-check__mark" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="ofi-home-pick__label">
                                            <i className="ofi-home-pick__dot" style={{ background: spec.color }} />
                                            {spec.label}
                                        </span>
                                        <span className="ofi-home-pick__hint">{spec.hint}</span>
                                    </span>
                                    <span className="ofi-home-pick__value">{spec.value}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section className="ofi-home-pick__group">
                <h3 className="ofi-home-pick__caption">{t('dash.sales.groupSlices', { defaultValue: 'Konversion' })}</h3>
                <ul className="ofi-home-pick__list">
                    {CONVERSION_SLICES.map((key) => {
                        const spec = slices[key];
                        const on = filters.slices.includes(key);
                        const last = on && sliceCount <= 1;
                        return (
                            <li key={key} className={`ofi-home-pick__row ${on ? 'is-on' : ''}`}>
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={on}
                                    disabled={last}
                                    className="ofi-home-pick__toggle"
                                    onClick={() => toggleSlice(key)}
                                >
                                    <span className={`ofi-cal-check ${on ? 'is-on' : ''}`}>
                                        {on && <span className="ofi-cal-check__mark" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="ofi-home-pick__label">
                                            <i className="ofi-home-pick__dot" style={{ background: spec.color }} />
                                            {spec.label}
                                        </span>
                                        <span className="ofi-home-pick__hint">{spec.hint}</span>
                                    </span>
                                    <span className="ofi-home-pick__value">{spec.count}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </PopupDialog>
    );
};
