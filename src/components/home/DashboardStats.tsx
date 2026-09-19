import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    Briefcase01,
    Coins01,
    File05,
    Package,
    Percent01,
    Receipt,
    Sliders02,
    User01,
} from '@/components/icons/antIconCompat';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { cx } from '../../lib/utils/cx';
import { useDashboardStats } from './useDashboardStats';
import { CHART_PALETTE, ConversionDonut, MonthlyBarChart, StackedSplit, chf0, type ChartMode } from './DashboardCharts';
import { buildOverviewTiles, useOverviewTiles, type OverviewTileKey, type OverviewTileSpec } from './overviewTiles';
import { OverviewTilesDialog } from './OverviewTilesDialog';

/* ── The start page in the Mac look (10.09.2026) ────────────────────────────
   Samet: «die Startseite so sauber und aufgeräumt wie die Angebotsseite —
   ein echtes macOS/SwiftUI-Programm». What that means here is the same list
   as on the quote page ([[quote-detail-macos-clean]]): white panels with ONE
   hairline and a 10px corner, no shadow, no watermark glyphs, no dot grids,
   sentence-case section titles, 28px bordered push buttons, one system blue.
   The chrome lives in styles/home.css (`.ofi-home-*`); this file only says
   what stands where. */

export const SectionHeader: React.FC<{ label: string; action?: React.ReactNode }> = ({ label, action }) => (
    <div className="ofi-home-section__head">
        <h2 className="ofi-home-h2">{label}</h2>
        {action}
    </div>
);

export const Card: React.FC<{
    title?: string;
    subtitle?: string;
    actions?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}> = ({ title, subtitle, actions, className, children }) => (
    <section className={cx('ofi-home-card', className)}>
        {(title || actions) && (
            <header className="ofi-home-card__head">
                <div className="min-w-0">
                    {title && <h3 className="ofi-home-card__title">{title}</h3>}
                    {subtitle && <p className="ofi-home-card__sub">{subtitle}</p>}
                </div>
                {actions && <div className="shrink-0">{actions}</div>}
            </header>
        )}
        <div className="ofi-home-card__body">{children}</div>
    </section>
);

/** The Mac segmented control (Diagramm | Tabelle). */
const Segmented = <K extends string>({ options, value, onChange }: {
    options: Array<{ key: K; label: string }>;
    value: K;
    onChange: (key: K) => void;
}) => (
    <div className="ofi-home-seg" role="tablist">
        {options.map((option) => (
            <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={value === option.key}
                className={cx('ofi-home-seg__btn', value === option.key && 'is-on')}
                onClick={() => onChange(option.key)}
            >
                {option.label}
            </button>
        ))}
    </div>
);

const TILE_ICON: Record<OverviewTileKey, React.ComponentType<{ size?: number; className?: string }>> = {
    customers: User01,
    tenders: File05,
    orders: Package,
    projects: Briefcase01,
    activeProjects: Briefcase01,
    invoiced: Receipt,
    openReceivables: Receipt,
    paid: Coins01,
    unbilled: Coins01,
    quoteValue: File05,
    orderValue: Package,
    conversion: Percent01,
};

/**
 * One overview tile: the name with its glyph, the figure, a footnote. A tile
 * with a destination is a button — the hover is a quiet fill, nothing moves.
 */
const OverviewTile: React.FC<{ spec: OverviewTileSpec; onOpen?: () => void }> = ({ spec, onOpen }) => {
    const Icon = TILE_ICON[spec.key];
    const Tag = onOpen ? 'button' : 'div';
    return (
        <Tag
            type={onOpen ? 'button' : undefined}
            onClick={onOpen}
            className={cx('ofi-home-tile', onOpen && 'is-link', spec.tone === 'red' && 'is-red')}
        >
            <span className="ofi-home-tile__label">
                <Icon size={14} className="ofi-home-tile__icon" />
                <span className="truncate">{spec.label}</span>
            </span>
            <span className="ofi-home-tile__value">{spec.value}</span>
            {spec.sub && <span className="ofi-home-tile__sub">{spec.sub}</span>}
        </Tag>
    );
};

/* The loading state is the page itself, drawn empty: the same sections, the
   same hairline tiles and cards, with quiet grey bones where the words and
   figures will stand. Big grey slabs with a sweeping band read as a broken
   page (Samet, 14.09.2026, loadingbad.png) — one calm, in-phase pulse on
   small bones reads as "loading". Nothing moves when the data arrives. */
const Bone: React.FC<{ w: string; h?: number; className?: string }> = ({ w, h = 10, className }) => (
    <span aria-hidden="true" className={cx('ofi-home-bone', className)} style={{ width: w, height: h }} />
);

const SkeletonCard: React.FC<{ className?: string; bodyHeight: number; titleW: string; subW: string; children?: React.ReactNode }> = ({
    className, bodyHeight, titleW, subW, children,
}) => (
    <section className={cx('ofi-home-card', className)}>
        <header className="ofi-home-card__head">
            <div className="flex w-full min-w-0 flex-col gap-[7px] pt-[3px]">
                <Bone w={titleW} h={11} />
                <Bone w={subW} h={9} />
            </div>
        </header>
        <div className="ofi-home-card__body" style={{ minHeight: bodyHeight }}>{children}</div>
    </section>
);

const StatsSkeleton: React.FC = () => (
    <div className="ofi-home-stats" role="status" aria-busy="true">
        <section className="ofi-home-section">
            <div className="ofi-home-section__head"><Bone w="72px" h={11} /></div>
            <div className="ofi-home-tiles">
                {['46%', '38%', '52%', '42%'].map((w, i) => (
                    <div key={i} className="ofi-home-tile ofi-home-tile--skeleton">
                        <Bone w={w} h={10} />
                        <Bone w="34%" h={22} className="mt-[9px]" />
                        <Bone w="58%" h={9} className="mt-auto" />
                    </div>
                ))}
            </div>
        </section>
        <section className="ofi-home-section">
            <div className="ofi-home-section__head"><Bone w="132px" h={11} /></div>
            <div className="grid gap-4 xl:grid-cols-3">
                <SkeletonCard className="xl:col-span-2" bodyHeight={296} titleW="44%" subW="30%">
                    <div className="ofi-home-skel-bars">
                        {[38, 62, 48, 74, 56, 82, 44, 66, 52, 78, 60, 70].map((pct, i) => (
                            <span key={i} className="ofi-home-bone" style={{ height: `${pct}%` }} />
                        ))}
                    </div>
                </SkeletonCard>
                <SkeletonCard bodyHeight={296} titleW="40%" subW="62%">
                    <div className="flex h-full flex-col items-center justify-center gap-5">
                        <span className="ofi-home-bone ofi-home-skel-ring" />
                        <div className="flex w-full flex-col gap-2">
                            <Bone w="70%" h={9} />
                            <Bone w="56%" h={9} />
                        </div>
                    </div>
                </SkeletonCard>
            </div>
        </section>
        <section className="ofi-home-section">
            <div className="ofi-home-section__head"><Bone w="84px" h={11} /></div>
            <div className="grid gap-4 lg:grid-cols-2">
                {['48%', '42%'].map((titleW, i) => (
                    <SkeletonCard key={i} bodyHeight={150} titleW={titleW} subW="64%">
                        <div className="flex flex-col gap-3">
                            <Bone w="100%" h={14} />
                            <Bone w="62%" h={9} />
                            <Bone w="54%" h={9} />
                            <Bone w="46%" h={9} />
                        </div>
                    </SkeletonCard>
                ))}
            </div>
        </section>
    </div>
);

export const DashboardStats: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const isDark = useThemeStore((s) => s.isDarkMode);
    const userId = useAuthStore((state) => state.user?.id);
    const mode: ChartMode = isDark ? 'dark' : 'light';
    const colors = CHART_PALETTE[mode];
    const { summary, charts, loading, denied, error, refresh } = useDashboardStats();
    const [monthlyView, setMonthlyView] = useState<'chart' | 'table'>('chart');
    const [pickOpen, setPickOpen] = useState(false);
    const { tiles, setTiles, reset, isDefault } = useOverviewTiles(userId);

    const specs = useMemo(() => (summary ? buildOverviewTiles(summary, t) : null), [summary, t]);

    // No business view permission at all: the dashboard quietly stays a
    // quick-access page instead of showing an error the user cannot fix.
    if (denied) return null;
    if (loading) return <StatsSkeleton />;

    if (error && !summary && !charts) {
        return (
            <div className="ofi-home-card ofi-home-error">
                <p>{t('dash.error', { defaultValue: 'Kennzahlen konnten nicht geladen werden.' })}</p>
                <button type="button" onClick={refresh} className="ofi-home-btn">
                    {t('dash.retry', { defaultValue: 'Erneut versuchen' })}
                </button>
            </div>
        );
    }

    return (
        <div className="ofi-home-stats">
            {/* ── Überblick: the tiles the user picked ───────────────────── */}
            {summary && specs && (
                <section className="ofi-home-section">
                    <SectionHeader
                        label={t('dash.sectionOverview', { defaultValue: 'Überblick' })}
                        action={(
                            <button type="button" className="ofi-home-btn" onClick={() => setPickOpen(true)}>
                                <Sliders02 size={13} />
                                {t('dash.customize.button', { defaultValue: 'Anpassen' })}
                            </button>
                        )}
                    />
                    <div className="ofi-home-tiles">
                        {tiles.map((key) => {
                            const spec = specs[key];
                            return (
                                <OverviewTile
                                    key={key}
                                    spec={spec}
                                    onOpen={spec.to ? () => navigate(spec.to!) : undefined}
                                />
                            );
                        })}
                    </div>
                    <OverviewTilesDialog
                        open={pickOpen}
                        onClose={() => setPickOpen(false)}
                        specs={specs}
                        tiles={tiles}
                        onChange={setTiles}
                        onReset={reset}
                        isDefault={isDefault}
                    />
                </section>
            )}

            {/* ── Vertrieb: 12-month history + conversion ────────────────── */}
            {(charts || summary) && (
                <section className="ofi-home-section">
                    <SectionHeader label={t('dash.sectionSales', { defaultValue: 'Vertrieb & Konversion' })} />
                    <div className="grid gap-4 xl:grid-cols-3">
                        {charts && (
                            <Card
                                className="xl:col-span-2"
                                title={t('dash.monthly.title', { defaultValue: 'Angebote & Aufträge — 12 Monate' })}
                                subtitle={t('dash.clickHint', { defaultValue: 'Für Details auf einen Monat klicken' })}
                                actions={(
                                    <Segmented
                                        options={[
                                            { key: 'chart' as const, label: t('dash.viewChart', { defaultValue: 'Diagramm' }) },
                                            { key: 'table' as const, label: t('dash.viewTable', { defaultValue: 'Tabelle' }) },
                                        ]}
                                        value={monthlyView}
                                        onChange={setMonthlyView}
                                    />
                                )}
                            >
                                {monthlyView === 'chart' ? (
                                    <MonthlyBarChart points={charts.monthly} mode={mode} />
                                ) : (
                                    <div className="ofi-home-tablewrap">
                                        <table data-inv-table data-unstyled-table data-no-col-resize className="ofi-home-table w-full">
                                            <thead>
                                                <tr>
                                                    <th className="text-left">{t('dash.monthly.month', { defaultValue: 'Monat' })}</th>
                                                    <th className="text-right">{t('dash.monthly.seriesQuotes', { defaultValue: 'Angebote' })}</th>
                                                    <th className="text-right">{t('dash.monthly.seriesOrders', { defaultValue: 'Aufträge' })}</th>
                                                    <th className="text-right">{t('dash.monthly.orderValue', { defaultValue: 'Auftragswert' })}</th>
                                                    <th className="text-right">{t('dash.monthly.invoiced', { defaultValue: 'Fakturiert' })}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* Newest month first — the table reads top-down as "what just happened". */}
                                                {[...charts.monthly].reverse().map((row) => (
                                                    <tr key={row.month}>
                                                        <td>{row.month}</td>
                                                        <td className="text-right">{row.tenders}</td>
                                                        <td className="text-right">{row.orders}</td>
                                                        <td className="text-right">{chf0(row.orderValue)}</td>
                                                        <td className="text-right">{chf0(row.invoiced)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </Card>
                        )}
                        {summary && (
                            <Card
                                title={t('dash.conv.title', { defaultValue: 'Konversion' })}
                                subtitle={t('dash.conv.subtitle', { defaultValue: 'Was aus den Angeboten wird' })}
                            >
                                <ConversionDonut
                                    mode={mode}
                                    centerLabel={t('dash.kpi.quotes', { defaultValue: 'Angebote' })}
                                    slices={[
                                        {
                                            key: 'project',
                                            label: t('dash.conv.quoteToProject', { defaultValue: 'Angebot → Projekt' }),
                                            count: summary.conversion.toProject,
                                            color: colors.navy,
                                        },
                                        {
                                            key: 'delivery',
                                            label: t('dash.conv.quoteToDelivery', { defaultValue: 'Angebot → Lieferauftrag' }),
                                            count: summary.conversion.toDelivery,
                                            color: colors.orange,
                                        },
                                        ...(summary.conversion.converted - summary.conversion.toProject - summary.conversion.toDelivery > 0
                                            ? [{
                                                key: 'otherConverted',
                                                label: t('dash.conv.otherConverted', { defaultValue: 'Andere Aufträge' }),
                                                count: summary.conversion.converted - summary.conversion.toProject - summary.conversion.toDelivery,
                                                color: mode === 'dark' ? '#98989d' : '#8e8e93',
                                            }]
                                            : []),
                                        {
                                            key: 'open',
                                            label: t('dash.conv.open', { defaultValue: 'Noch offen' }),
                                            count: Math.max(0, summary.conversion.tenders - summary.conversion.converted),
                                            color: colors.rest,
                                        },
                                    ]}
                                />
                            </Card>
                        )}
                    </div>
                </section>
            )}

            {/* ── Finanzen: the two splits (the figures are tiles now) ───── */}
            {summary && (
                <section className="ofi-home-section">
                    <SectionHeader label={t('dash.sectionFinance', { defaultValue: 'Finanzen' })} />
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card
                            title={t('dash.fin.splitTitle', { defaultValue: 'Auftragswert nach Art' })}
                            subtitle={t('dash.clickHintSegment', { defaultValue: 'Für Details auf ein Segment klicken' })}
                        >
                            <StackedSplit
                                segments={[
                                    { key: 'delivery', label: t('dash.fin.delivery', { defaultValue: 'Lieferaufträge' }), value: summary.financials.orderValue.delivery, color: colors.navy },
                                    { key: 'project', label: t('dash.fin.project', { defaultValue: 'Projektaufträge' }), value: summary.financials.orderValue.project, color: colors.orange },
                                    { key: 'other', label: t('dash.fin.other', { defaultValue: 'Übrige' }), value: summary.financials.orderValue.other, color: colors.rest },
                                ]}
                            />
                        </Card>
                        <Card
                            title={t('dash.fin.billingTitle', { defaultValue: 'Fakturierungsstand' })}
                            subtitle={t('dash.fin.billingSubtitle', { defaultValue: 'Auftragsvolumen: bezahlt, offen, nicht fakturiert' })}
                        >
                            <StackedSplit
                                segments={[
                                    { key: 'paid', label: t('dash.fin.paid', { defaultValue: 'Bezahlt' }), value: summary.financials.paid, color: colors.navy },
                                    { key: 'open', label: t('dash.fin.openReceivables', { defaultValue: 'Offene Forderungen' }), value: summary.financials.open, color: colors.red },
                                    { key: 'unbilled', label: t('dash.fin.unbilled', { defaultValue: 'Nicht fakturiert' }), value: summary.financials.unbilled, color: colors.rest },
                                ]}
                            />
                        </Card>
                    </div>
                </section>
            )}
        </div>
    );
};
