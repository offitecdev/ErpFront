import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    BarChart03,
    Briefcase01,
    Coins01,
    File05,
    Package,
    Percent01,
    User01,
} from '@/components/icons/antIconCompat';
import { useThemeStore } from '../../store/themeStore';
import { cx } from '../../lib/utils/cx';
import { SkeletonBar } from '../ui-shared/Loader';
import { ToggleGroup } from '../ui-shared/TableKit';
import { useDashboardStats } from './useDashboardStats';
import { CHART_PALETTE, ConversionDonut, MonthlyBarChart, StackedSplit, chf0, compactNumber, type ChartMode } from './DashboardCharts';

/* Same softened chrome as the CRM overview widgets, duplicated on purpose so
   the home dashboard never imports from another page's folder.
   `bg-[#fff]` statt `bg-white` mit Absicht: index.css behandelt jeden
   `button.bg-white` als neutralen Button und erzwingt dort Schriftfarbe UND
   `-webkit-text-fill-color` (#111827 !important). Letztere vererbt sich auf
   alle Kinder — die Kacheln würden beim Überfahren (Navy-Fläche) weiter mit
   dunklen Buchstaben zeichnen, obwohl `group-hover:text-white` greift. */
const SURFACE =
    'rounded-2xl border border-[#E3E7F0] bg-[#fff] shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#151616]';

/* Dark mode wears orange icons (user request); everything else keeps its own
   ink — the accent colors never migrate onto text. */
const SectionHeader: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <div className="mb-3 flex items-center gap-2">
        <span className="text-slate-400 dark:text-[#e8873a]">{icon}</span>
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8f95a1]">{label}</h2>
    </div>
);

const Card: React.FC<{
    title?: string;
    subtitle?: string;
    actions?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}> = ({ title, subtitle, actions, className, children }) => (
    <section className={cx(SURFACE, 'flex flex-col overflow-hidden', className)}>
        {(title || actions) && (
            <header className="flex items-start justify-between gap-3 px-5 pb-0 pt-4">
                <div className="min-w-0">
                    {title && <h3 className="ofi-serif truncate text-[15.5px] font-semibold tracking-tight text-[#1A1A1A] dark:text-white">{title}</h3>}
                    {subtitle && <p className="mt-0.5 truncate text-[12px] text-[#98A0AE] dark:text-[#8f95a1]">{subtitle}</p>}
                </div>
                {actions && <div className="shrink-0">{actions}</div>}
            </header>
        )}
        <div className="flex-1 p-5 pt-4">{children}</div>
    </section>
);

/**
 * Stat tile per the figure contract: label, big proportional value, optional
 * footnote. Clickable tiles navigate to their list page; the hover cue is the
 * house pair — navy border + underlined label.
 */
const StatTile: React.FC<{
    label: string;
    value: string;
    sub?: React.ReactNode;
    accent?: 'red';
    onClick?: () => void;
}> = ({ label, value, sub, accent, onClick }) => {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={cx(
                SURFACE,
                'group flex min-h-[104px] flex-col p-4 text-left',
                onClick &&
                    'cursor-pointer transition-colors duration-150 hover:border-[#1f2654] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#272f67]/30 dark:hover:border-[#6977c7]/60',
            )}
        >
            <p className={cx(
                'text-[12px] font-medium text-[#6B7280] underline-offset-4 dark:text-[#aab0bb]',
                onClick && 'group-hover:underline group-hover:decoration-[#1f2654] dark:group-hover:decoration-[#9faae8]',
            )}>
                {label}
            </p>
            <p className={cx(
                'ofi-dashboard-number mt-1.5 text-[26px] font-bold leading-none tracking-tight',
                accent === 'red' ? 'text-[#d30f15] dark:text-[#e5484d]' : 'text-[#1A1A1A] dark:text-white',
            )}>
                {value}
            </p>
            {sub && <p className="mt-auto pt-2 text-[11.5px] text-[#98A0AE] dark:text-[#8f95a1]">{sub}</p>}
        </Tag>
    );
};

type CountTone = 'navy' | 'orange' | 'red';

/** Faint 2×4 dot grid — the secondary corner pattern on the count tiles. */
const DotPattern: React.FC<{ corner: 'tr' | 'br'; color: string }> = ({ corner, color }) => (
    <svg
        width={44}
        height={26}
        aria-hidden
        className={cx('pointer-events-none absolute right-3', corner === 'tr' ? 'top-3' : 'bottom-3')}
        style={{ opacity: 0.35 }}
    >
        {[0, 1].map((row) =>
            [0, 1, 2, 3].map((col) => (
                <circle key={`${row}-${col}`} cx={4 + col * 12} cy={5 + row * 13} r={2.2} fill={color} />
            )),
        )}
    </svg>
);

/**
 * Count tile in the reference style: big value on top, tinted entity icon
 * beside the label at the bottom. Decoration lives in the right-hand corners —
 * an oversized icon watermark and a dot grid swapping between top-right and
 * bottom-right per tile, in the tile's own palette tone. Dark mode paints the
 * visible icon orange (user request); the watermark keeps the tone.
 */
const CountTile: React.FC<{
    label: string;
    value: string;
    sub?: string;
    icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
    tone: CountTone;
    /** Which right corner the big watermark takes; the dot grid takes the other. */
    watermarkCorner: 'tr' | 'br';
    mode: ChartMode;
    onClick: () => void;
}> = ({ label, value, sub, icon: Icon, tone, watermarkCorner, mode, onClick }) => {
    const toneHex = CHART_PALETTE[mode][tone];
    const iconHex = mode === 'dark' ? '#e8873a' : toneHex;
    return (
        <button
            type="button"
            onClick={onClick}
            className={cx(
                SURFACE,
                /* Hover der Startseite (Nutzerwunsch 15.08.2026): dunkles
                   Marineblau als Fläche, Schrift weiss — dieselbe Sprache wie
                   die Schnellzugriff-Kacheln darüber. `dark:hover:*` steht
                   ausdrücklich daneben, sonst gewinnt im Dunkelmodus die
                   gleich spezifische `dark:bg-*`-Regel je nach Reihenfolge. */
                'group relative flex min-h-[112px] cursor-pointer flex-col overflow-hidden p-4 text-left transition-colors duration-150 hover:border-[#1f2654] hover:bg-[#1f2654] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#272f67]/30 dark:hover:border-[#1f2654] dark:hover:bg-[#1f2654]',
            )}
        >
            <span
                className={cx(
                    'pointer-events-none absolute -right-2.5',
                    watermarkCorner === 'tr' ? '-top-2.5' : '-bottom-2.5',
                )}
                style={{ color: toneHex, opacity: mode === 'dark' ? 0.14 : 0.09 }}
            >
                <Icon size={72} />
            </span>
            <DotPattern corner={watermarkCorner === 'tr' ? 'br' : 'tr'} color={toneHex} />
            <p className="ofi-dashboard-number text-[26px] font-bold leading-none tracking-tight text-[#1A1A1A] transition-colors duration-150 group-hover:text-white dark:text-white">{value}</p>
            {sub && <p className="mt-1.5 text-[11px] text-[#98A0AE] transition-colors duration-150 group-hover:text-white/80 dark:text-[#8f95a1] dark:group-hover:text-white/80">{sub}</p>}
            <p className="mt-auto flex items-center gap-1.5 pt-2.5 text-[12.5px] font-medium text-[#3F4350] transition-colors duration-150 group-hover:text-white dark:text-[#d9dce3] dark:group-hover:text-white">
                {/* Die Kachelfarbe des Symbols kommt über eine CSS-Variable statt
                    über `style="color"` — eine Inline-Farbe liesse sich beim
                    Überfahren nicht auf Weiss umstellen. */}
                <Icon
                    size={15}
                    className="text-[color:var(--ofi-tile-icon)] transition-colors duration-150 group-hover:text-white"
                    style={{ '--ofi-tile-icon': iconHex } as React.CSSProperties}
                />
                <span className="underline-offset-4 group-hover:underline">{label}</span>
            </p>
        </button>
    );
};

const StatsSkeleton: React.FC = () => (
    <div className="space-y-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <SkeletonBar key={i} className="h-[104px] rounded-2xl" delayMs={i * 90} />)}
        </div>
        <SkeletonBar className="h-[340px] rounded-2xl" delayMs={360} />
        <div className="grid gap-4 lg:grid-cols-2">
            <SkeletonBar className="h-[220px] rounded-2xl" delayMs={450} />
            <SkeletonBar className="h-[220px] rounded-2xl" delayMs={540} />
        </div>
    </div>
);

export const DashboardStats: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const isDark = useThemeStore((s) => s.isDarkMode);
    const mode: ChartMode = isDark ? 'dark' : 'light';
    const colors = CHART_PALETTE[mode];
    const { summary, charts, loading, denied, error, refresh } = useDashboardStats();
    const [monthlyView, setMonthlyView] = useState<'chart' | 'table'>('chart');

    // No business view permission at all: the dashboard quietly stays a
    // quick-access page instead of showing an error the user cannot fix.
    if (denied) return null;
    if (loading) return <StatsSkeleton />;

    if (error && !summary && !charts) {
        return (
            <div className={cx(SURFACE, 'px-4 py-10 text-center')}>
                <p className="text-[13px] text-[#6B7280] dark:text-[#aab0bb]">
                    {t('dash.error', { defaultValue: 'Kennzahlen konnten nicht geladen werden.' })}
                </p>
                <button
                    type="button"
                    onClick={refresh}
                    className="mt-2 text-[13px] font-semibold text-[#272f67] underline underline-offset-4 hover:text-[#1f2654] dark:text-[#9faae8] dark:hover:text-white"
                >
                    {t('dash.retry', { defaultValue: 'Erneut versuchen' })}
                </button>
            </div>
        );
    }

    return (
        <div className="ofi-dashboard space-y-8">
            {/* ── Überblick: the four entity counts ─────────────────────── */}
            {summary && (
                <section>
                    <SectionHeader icon={<BarChart03 size={15} />} label={t('dash.sectionOverview', { defaultValue: 'Überblick' })} />
                    {/* Tones: red / navy / orange / navy — neighbors always differ;
                        the corner pattern alternates so the repeated navy reads
                        as its own tile ("same colors, varied pattern"). */}
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <CountTile
                            label={t('dash.kpi.customers', { defaultValue: 'Kunden' })}
                            value={compactNumber(summary.counts.customers)}
                            icon={User01}
                            tone="red"
                            watermarkCorner="tr"
                            mode={mode}
                            onClick={() => navigate('/crm/customers')}
                        />
                        <CountTile
                            label={t('dash.kpi.quotes', { defaultValue: 'Angebote' })}
                            value={compactNumber(summary.counts.tenders)}
                            sub={t('dash.kpi.quotesSub', {
                                defaultValue: '{{rate}}% werden zu Aufträgen',
                                rate: summary.conversion.orderRate,
                            })}
                            icon={File05}
                            tone="navy"
                            watermarkCorner="br"
                            mode={mode}
                            onClick={() => navigate('/sales/quotes')}
                        />
                        <CountTile
                            label={t('dash.kpi.orders', { defaultValue: 'Aufträge' })}
                            value={compactNumber(summary.counts.orders)}
                            sub={t('dash.kpi.ordersSub', {
                                defaultValue: '{{value}} Auftragswert',
                                value: chf0(summary.financials.orderValue.total),
                            })}
                            icon={Package}
                            tone="orange"
                            watermarkCorner="tr"
                            mode={mode}
                            onClick={() => navigate('/sales/orders')}
                        />
                        <CountTile
                            label={t('dash.kpi.projects', { defaultValue: 'Projekte' })}
                            value={compactNumber(summary.counts.projects)}
                            sub={t('dash.kpi.projectsSub', {
                                defaultValue: '{{count}} davon aktiv',
                                count: summary.counts.activeProjects,
                            })}
                            icon={Briefcase01}
                            tone="navy"
                            watermarkCorner="br"
                            mode={mode}
                            onClick={() => navigate('/projects')}
                        />
                    </div>
                </section>
            )}

            {/* ── Vertrieb: 12-month history + conversion meters ─────────── */}
            {(charts || summary) && (
                <section>
                    <SectionHeader icon={<Percent01 size={15} />} label={t('dash.sectionSales', { defaultValue: 'Vertrieb & Konversion' })} />
                    <div className="grid gap-4 xl:grid-cols-3">
                        {charts && (
                            <Card
                                className="xl:col-span-2"
                                title={t('dash.monthly.title', { defaultValue: 'Angebote & Aufträge — 12 Monate' })}
                                subtitle={t('dash.clickHint', { defaultValue: 'Für Details auf einen Monat klicken' })}
                                actions={
                                    <ToggleGroup
                                        options={[
                                            { key: 'chart' as const, label: t('dash.viewChart', { defaultValue: 'Diagramm' }) },
                                            { key: 'table' as const, label: t('dash.viewTable', { defaultValue: 'Tabelle' }) },
                                        ]}
                                        value={monthlyView}
                                        onChange={setMonthlyView}
                                    />
                                }
                            >
                                {monthlyView === 'chart' ? (
                                    <MonthlyBarChart points={charts.monthly} mode={mode} />
                                ) : (
                                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/15">
                                        <table data-inv-table data-unstyled-table className="w-full">
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
                                                        <td className="text-[12.5px] text-[#3F4350] dark:text-[#d9dce3]">{row.month}</td>
                                                        <td className="text-right text-[12.5px] tabular-nums">{row.tenders}</td>
                                                        <td className="text-right text-[12.5px] tabular-nums">{row.orders}</td>
                                                        <td className="text-right text-[12.5px] tabular-nums">{chf0(row.orderValue)}</td>
                                                        <td className="text-right text-[12.5px] tabular-nums">{chf0(row.invoiced)}</td>
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
                                {/* Slice lead-hue follows the mode's accent: navy leads in
                                    light, orange leads in dark; the unconverted rest stays
                                    de-emphasis gray. */}
                                <ConversionDonut
                                    mode={mode}
                                    centerLabel={t('dash.kpi.quotes', { defaultValue: 'Angebote' })}
                                    slices={[
                                        {
                                            key: 'project',
                                            label: t('dash.conv.quoteToProject', { defaultValue: 'Angebot → Projekt' }),
                                            count: summary.conversion.toProject,
                                            color: mode === 'dark' ? colors.orange : colors.navy,
                                        },
                                        {
                                            key: 'delivery',
                                            label: t('dash.conv.quoteToDelivery', { defaultValue: 'Angebot → Lieferauftrag' }),
                                            count: summary.conversion.toDelivery,
                                            color: mode === 'dark' ? colors.navy : colors.orange,
                                        },
                                        ...(summary.conversion.converted - summary.conversion.toProject - summary.conversion.toDelivery > 0
                                            ? [{
                                                key: 'otherConverted',
                                                label: t('dash.conv.otherConverted', { defaultValue: 'Andere Aufträge' }),
                                                count: summary.conversion.converted - summary.conversion.toProject - summary.conversion.toDelivery,
                                                color: mode === 'dark' ? '#8f95a1' : '#aab0bb',
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

            {/* ── Finanzen: the four money figures + the two splits ──────── */}
            {summary && (
                <section>
                    <SectionHeader icon={<Coins01 size={15} />} label={t('dash.sectionFinance', { defaultValue: 'Finanzen' })} />
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <StatTile
                            label={t('dash.fin.quoteValue', { defaultValue: 'Angebotsvolumen' })}
                            value={compactNumber(summary.financials.quoteValue)}
                            sub={chf0(summary.financials.quoteValue)}
                        />
                        <StatTile
                            label={t('dash.fin.orderValue', { defaultValue: 'Auftragsvolumen' })}
                            value={compactNumber(summary.financials.orderValue.total)}
                            sub={chf0(summary.financials.orderValue.total)}
                        />
                        <StatTile
                            label={t('dash.fin.invoiced', { defaultValue: 'Fakturiert' })}
                            value={compactNumber(summary.financials.invoiced)}
                            sub={t('dash.fin.paidSub', {
                                defaultValue: 'davon bezahlt {{value}}',
                                value: chf0(summary.financials.paid),
                            })}
                        />
                        <StatTile
                            label={t('dash.fin.unbilled', { defaultValue: 'Nicht fakturiert' })}
                            value={compactNumber(summary.financials.unbilled)}
                            sub={chf0(summary.financials.unbilled)}
                            accent="red"
                        />
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
