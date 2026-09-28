import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Calculator, CalendarClock, ChevronDown, ChevronLeft, Search, TriangleAlert } from 'lucide-react';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { CostingDevice, CostingProject, CostingProjectSummary, CostingTotal } from '@/types/productionBom';
import '@/styles/modules/warehouse.css';
import '@/styles/modules/productionBom.css';

import { fmtPrice, fmtQty, shortDate, unitLabel } from '../bom/bomFormat';
import { EmptyState, LoadingState } from '../bom/bomUi';

const fold = (value: string | null | undefined): string => String(value ?? '').toLocaleLowerCase('tr-TR');

/** «+CHF 12.00» / «−CHF 916.00» — das Vorzeichen vor dem Betrag, nicht zwischen Währung und Zahl. */
const signedPrice = (value: number, currency: string): string =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmtPrice(Math.abs(value), currency)}`;

/** Beträge je Währung untereinander — umgerechnet wird nie. */
const Amounts = ({ totals, field, signed }: { totals: CostingTotal[]; field: 'plan' | 'forecast' | 'diff' | 'actual'; signed?: boolean }) => {
    const shown = totals.filter((entry) => Math.abs(entry[field]) > 1e-9);
    if (!shown.length) return <span className="ofi-bom-dash">—</span>;
    return (
        <span className="ofi-cost-amounts">
            {shown.map((entry) => (
                <span key={entry.currency} className={signed ? (entry[field] > 0 ? 'is-over' : 'is-under') : undefined}>
                    {signed ? signedPrice(entry[field], entry.currency) : fmtPrice(entry[field], entry.currency)}
                </span>
            ))}
        </span>
    );
};

/** «+4.2 %» über die vergleichbaren Kalemler (beide Preise bekannt). */
const diffPercent = (totals: CostingTotal[]): string | null => {
    const main = totals.find((entry) => entry.comparablePlan > 1e-9);
    if (!main) return null;
    const value = (main.diff / main.comparablePlan) * 100;
    return `${value > 0 ? '+' : ''}${value.toFixed(1)} %`;
};

/**
 * ── ÜRETİM › KALKÜLASYON (27.09.2026 abends, Vorgabe Samet) ──────────────────
 *
 * «BOM'dan otomatik bir kalkülasyon listesi oluşsun. Her kalemin miktarı, alış
 *  fiyatı ve toplamı hesaplansın, en altta da makinenin/projenin toplam
 *  malzeme maliyetini görelim. Sonradan gerçek alış fiyatları gelince
 *  planlanan maliyet ile gerçek maliyeti de karşılaştırabilelim … başka bir
 *  sayfada olsun, temiz olsun, çok detay olmasın.»
 *
 * Links die Projekte, rechts drei Kacheln (geplant · tatsächlich · Differenz)
 * und je Maschine eine ruhige Liste: Kalem, Menge, Alışpreis, Summe, echte
 * Summe, Differenz — ganz unten die Summe der Maschine, darunter die des
 * Projekts. Gerechnet wird am Server aus BOM, Depo-Karte und Bestellungen.
 */
export const ProductionCostingPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const location = useLocation();
    const [params, setParams] = useSearchParams();
    const projectId = params.get('project');
    const [list, setList] = useState<CostingProjectSummary[] | null>(null);
    const [project, setProject] = useState<CostingProject | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [closed, setClosed] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        let alive = true;
        productionBomApi.costingProjects()
            .then((value) => { if (alive) { setList(value.projects); setError(null); } })
            .catch((failure) => { if (alive) setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')); });
        return () => { alive = false; };
    }, []);

    // Ohne Wahl: das erste Projekt (frühester Liefertermin).
    const selectedId = projectId ?? list?.[0]?.id ?? null;
    useEffect(() => {
        if (!selectedId) return undefined;
        let alive = true;
        productionBomApi.costingProject(selectedId)
            .then((value) => { if (alive) setProject(value); })
            .catch((failure) => { if (alive) setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')); });
        return () => { alive = false; };
    }, [selectedId]);

    const projects = useMemo(() => {
        const needle = fold(query.trim());
        return (list ?? []).filter((entry) => !needle
            || [entry.projectNumber, entry.projectName, entry.customerName].some((value) => fold(value).includes(needle)));
    }, [list, query]);

    // Die Antwort eines anderen Projekts zeigt nichts — bis das gewählte da ist, lädt es.
    const shown = project && project.id === selectedId ? project : null;

    const toggle = (id: string) => setClosed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const main = () => {
        if (error && !list) return <div className="ofi-bom-state is-error"><TriangleAlert aria-hidden /><b>{error}</b></div>;
        if (!list) return <LoadingState />;
        if (!list.length) return <EmptyState icon={<Calculator />} title={t('productionBom.costing.empty')} hint={t('productionBom.costing.emptyHint')} />;
        if (!shown) return <LoadingState />;
        const project = shown;
        const percent = diffPercent(project.totals);
        return (
            <div className="ofi-cost">
                <header className="ofi-cost-head">
                    <span className="ofi-cost-head__title">
                        <b>{project.projectNumber}</b>
                        <small>{[project.projectName, project.customerName].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="ofi-cost-head__delivery">
                        <CalendarClock aria-hidden />
                        {project.deliveryDate ? t('productionBom.device.delivery', { date: shortDate(project.deliveryDate) }) : t('productionBom.device.noDelivery')}
                    </span>
                </header>

                <div className="ofi-pur-tiles">
                    <div className="ofi-pur-tile">
                        <span>{t('productionBom.costing.plan')}</span>
                        <Amounts totals={project.totals} field="plan" />
                        <small className={project.missingPrice ? 'is-warn' : undefined}>
                            {project.missingPrice
                                ? t('productionBom.costing.missingPrice', { count: project.missingPrice, total: project.lines })
                                : t('productionBom.costing.allPriced', { total: project.lines })}
                        </small>
                    </div>
                    <div className="ofi-pur-tile">
                        <span>{t('productionBom.costing.forecast')}</span>
                        <Amounts totals={project.totals} field="forecast" />
                        <small>{t('productionBom.costing.actualLines', { count: project.actualLines, total: project.lines })}</small>
                    </div>
                    <div className="ofi-pur-tile">
                        <span>{t('productionBom.costing.diff')}</span>
                        {percent ? <Amounts totals={project.totals} field="diff" signed /> : <span className="ofi-bom-dash">—</span>}
                        <small>{percent ? t('productionBom.costing.diffHint', { percent }) : t('productionBom.costing.noCompare')}</small>
                    </div>
                </div>

                {project.deviceList.map((device) => (
                    <DeviceCosting key={device.id} device={device} open={!closed.has(device.id)} onToggle={() => toggle(device.id)} />
                ))}

                <footer className="ofi-cost-total">
                    <span>{t('productionBom.costing.projectTotal')}</span>
                    <span className="ofi-cost-total__cells">
                        <span><small>{t('productionBom.costing.planShort')}</small><Amounts totals={project.totals} field="plan" /></span>
                        <span><small>{t('productionBom.costing.forecastShort')}</small><Amounts totals={project.totals} field="forecast" /></span>
                        <span><small>{t('productionBom.costing.diffShort')}</small>{percent ? <Amounts totals={project.totals} field="diff" signed /> : <span className="ofi-bom-dash">—</span>}</span>
                    </span>
                </footer>
                <p className="ofi-bom-group__foot">{t('productionBom.costing.note')}</p>
            </div>
        );
    };

    return (
        <div className="ofi-bom is-page ofi-pur">
            <header className="ofi-bom-head">
                {/* Kalkülasyon ist seit 28.09.2026 kein Menüpunkt mehr, sondern ein Knopf im
                    Einkauf — «tıklayınca geri butonu çıkmalı»: zurück dorthin (mit Seite und Suche). */}
                <div className="ofi-bom-nav__arrows">
                    <button
                        type="button"
                        className="ofi-bom-nav__back ofi-nosize"
                        onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/production/purchasing'))}
                        aria-label={`${t('productionBom.common.back')}: ${t('productionBom.purchasing.title')}`}
                    >
                        <ChevronLeft aria-hidden />
                        <span>{t('productionBom.purchasing.title')}</span>
                    </button>
                </div>
                <h1 className="ofi-bom-head__title">{t('productionBom.costing.title')}</h1>
                <label className="ofi-pur-search">
                    <Search aria-hidden />
                    <input
                        value={query}
                        placeholder={t('productionBom.costing.search')}
                        aria-label={t('productionBom.costing.search')}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </label>
            </header>
            <div className="ofi-bom-split is-narrow">
                <aside className="ofi-bom-side">
                    <div className="ofi-bom-source" role="tablist" aria-label={t('productionBom.costing.projects')}>
                        {projects.map((entry) => {
                            const main = entry.totals[0];
                            return (
                                <button
                                    key={entry.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={entry.id === selectedId}
                                    className={`ofi-bom-source__row ofi-nosize${entry.id === selectedId ? ' is-selected' : ''}`}
                                    onClick={() => setParams({ project: entry.id }, { replace: true })}
                                >
                                    <span className="ofi-bom-source__icon"><Calculator /></span>
                                    <span className="ofi-bom-source__text">
                                        <b>{entry.projectNumber}</b>
                                        <small>{entry.projectName || entry.customerName || '—'}</small>
                                    </span>
                                    <i className="ofi-cost-side__sum">{main && main.plan > 0 ? fmtPrice(main.plan, main.currency) : '—'}</i>
                                </button>
                            );
                        })}
                    </div>
                    <p className="ofi-bom-group__foot">{t('productionBom.costing.sideNote')}</p>
                </aside>
                <div className="ofi-bom-main">{main()}</div>
            </div>
        </div>
    );
};

/** Eine Maschine: ihre Kalemler und ganz unten ihre Summe. */
const DeviceCosting = ({ device, open, onToggle }: { device: CostingDevice; open: boolean; onToggle: () => void }) => {
    const percent = diffPercent(device.totals);
    return (
        <section className={`ofi-cost-device${open ? ' is-open' : ''}`}>
            <button type="button" className="ofi-cost-device__head ofi-nosize" aria-expanded={open} onClick={onToggle}>
                <ChevronDown className="ofi-cost-device__chev" aria-hidden />
                <span className="ofi-cost-device__title">
                    <b>{device.name}</b>
                    <small>
                        {[device.positionNumber ? t('productionBom.costing.position', { number: device.positionNumber }) : null, device.bomNumbers.join(', ')]
                            .filter(Boolean).join(' · ')}
                    </small>
                </span>
                <span className="ofi-cost-device__sum">
                    <small>{t('productionBom.costing.planShort')}</small>
                    <Amounts totals={device.totals} field="plan" />
                </span>
                <span className="ofi-cost-device__sum">
                    <small>{t('productionBom.costing.forecastShort')}</small>
                    <Amounts totals={device.totals} field="forecast" />
                </span>
            </button>
            {open && (
                <div className="ofi-bom-tablewrap is-plain">
                    <table className="ofi-bom-table ofi-cost-table" data-unstyled-table>
                        <thead>
                            <tr>
                                <th className="is-code">{t('productionBom.columns.erpCode')}</th>
                                <th className="is-name">{t('productionBom.costing.item')}</th>
                                <th className="is-num">{t('productionBom.costing.quantity')}</th>
                                <th className="is-num">{t('productionBom.costing.unitPrice')}</th>
                                <th className="is-num">{t('productionBom.costing.planTotal')}</th>
                                <th className="is-num">{t('productionBom.costing.actualTotal')}</th>
                                <th className="is-num">{t('productionBom.costing.diffShort')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {device.lines.map((line) => (
                                <tr key={line.key}>
                                    <td className="is-code"><span className="ofi-bom-code">{line.erpCode ?? '—'}</span></td>
                                    <td className="is-name"><span className="ofi-cost-name" title={line.name}>{line.name}</span></td>
                                    <td className="is-num"><span className="ofi-bom-qty">{fmtQty(line.quantity)}<small>{unitLabel(line.unit)}</small></span></td>
                                    <td className="is-num">
                                        {line.plan ? (
                                            <span className="ofi-cost-price">
                                                {fmtPrice(line.plan.unit, line.plan.currency)}
                                                {line.plan.source === 'QUOTE' && <small title={t('productionBom.costing.fromQuoteTitle')}>{t('productionBom.costing.fromQuote')}</small>}
                                            </span>
                                        ) : <span className="ofi-cost-missing">{t('productionBom.costing.noPrice')}</span>}
                                    </td>
                                    <td className="is-num">{line.planTotal !== null && line.plan ? fmtPrice(line.planTotal, line.plan.currency) : <span className="ofi-bom-dash">—</span>}</td>
                                    <td className="is-num">
                                        {line.actual && line.actualTotal !== null ? (
                                            <span className="ofi-cost-price" title={t('productionBom.costing.actualUnitTitle', { price: fmtPrice(line.actual.unit, line.actual.currency) })}>
                                                {fmtPrice(line.actualTotal, line.actual.currency)}
                                                <small>{fmtPrice(line.actual.unit, line.actual.currency)} / {unitLabel(line.unit)}</small>
                                            </span>
                                        ) : <span className="ofi-bom-dash">—</span>}
                                    </td>
                                    <td className={`is-num${line.diff !== null ? (line.diff > 0 ? ' is-over' : line.diff < 0 ? ' is-under' : '') : ''}`}>
                                        {line.diff !== null && line.actual ? signedPrice(line.diff, line.actual.currency) : <span className="ofi-bom-dash">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="ofi-cost-foot">
                                <td colSpan={4}>{t('productionBom.costing.deviceTotal')}</td>
                                <td className="is-num"><Amounts totals={device.totals} field="plan" /></td>
                                <td className="is-num"><Amounts totals={device.totals} field="actual" /></td>
                                <td className="is-num">{percent ? <Amounts totals={device.totals} field="diff" signed /> : <span className="ofi-bom-dash">—</span>}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </section>
    );
};

export default ProductionCostingPage;
