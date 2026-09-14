import { memo, useMemo, useState } from 'react';

import { SectorRing, SwiftLegend } from '@/components/charts/swiftChart';
import { SWIFT_COLORS, useCountUp, useFirstReveal } from '@/components/charts/swiftChartCore';
import { t } from '@/i18n/translate';
import { useThemeStore } from '@/store/themeStore';

import { money } from '../../../../utils/projectFormatters';
import { CardLink } from './CardLink';
import { OverviewCard } from './OverviewCard';
import '@/styles/modules/projectDetail.css';

/* ── Die Auswertung im Swift-Kleid (10.09.2026) ──────────────────────────────
   Samet: «die Charts im iOS/SwiftUI-Stil». Die neumorphe Scheibe vom
   28.08.2026 (erhabene Platte, Nabe mit Schatten, Prozent-Plaketten auf dem
   Rand) ist durch den Ring des Chart-Bausatzes ersetzt
   (components/charts/swiftChart.tsx): flache Sektoren mit Winkelspalt und
   kleiner Ecke, die Quote in der Mitte, rechts die Mac-Segmentleiste für den
   Ausschnitt und die Legende mit Betrag und Anteil je Stück.

   Was aus der alten Scheibe BLEIBT, weil es Vorgaben waren:
   · EIN Ring für Auftrag und Zusatzaufträge zusammen; die drei Ausschnitte
     (Gesamt / Hauptauftrag / Zusatzaufträge) — Klick wählt, Überfahren zeigt;
   · NICHTS rückt beim Überfahren aus dem Kreis — das gefragte Stück behält
     seine Farbe, die übrigen blassen ab;
   · leer heisst grau: die graue Bahn liegt immer unter den Stücken, ohne
     Daten kommt die Schraffur dazu;
   · die Quote zählt beim Aufziehen mit und wandert beim Umstellen hinüber;
   · Farben bleiben semantisch: verrechnet = Blau, offen = Orange.
   Die Prozent-Plaketten sind weg — der Anteil steht in der Legendenzeile. */

type Figures = { billed: number; unbilled: number };
type ScopeKey = 'all' | 'order' | 'addons';

/** Anteil des verrechneten Geldes in Prozent — `null`, wenn es nichts zu teilen gibt. */
const billedRate = (figures: Figures) => {
    const total = figures.billed + figures.unbilled;
    return total > 0 ? Math.round((figures.billed / total) * 100) : null;
};

const BillingDial = memo(({ order, addons, onOpen }: {
    order: Figures;
    addons: Figures;
    onOpen?: () => void;
}) => {
    const [hot, setHot] = useState<string | null>(null);
    const [scope, setScope] = useState<ScopeKey>('all');
    const [preview, setPreview] = useState<ScopeKey | null>(null);
    const [rootRef, shown] = useFirstReveal<HTMLDivElement>();
    const isDark = useThemeStore((state) => state.isDarkMode);
    const palette = isDark ? SWIFT_COLORS.dark : SWIFT_COLORS.light;

    const options = useMemo(() => [
        {
            key: 'all' as ScopeKey,
            label: t('projects.detail.overview.totalScope'),
            figures: { billed: order.billed + addons.billed, unbilled: order.unbilled + addons.unbilled },
        },
        { key: 'order' as ScopeKey, label: t('projects.mainOrder'), figures: order },
        { key: 'addons' as ScopeKey, label: t('projects.detail.overview.addonsTitle'), figures: addons },
    ], [order, addons]);

    const activeKey = preview ?? scope;
    const active = options.find((option) => option.key === activeKey) ?? options[0];
    const figures = active.figures;
    const total = figures.billed + figures.unbilled;
    const rate = billedRate(figures);
    const counted = useCountUp(rate ?? 0, shown, 620);

    const slices = [
        { key: 'billed', label: t('billing.billed'), value: figures.billed, color: palette.blue },
        { key: 'unbilled', label: t('projects.detail.overview.unbilled'), value: figures.unbilled, color: palette.orange },
    ];

    return (
        <div ref={rootRef} className="ofi-swc ofi-swc-donut is-row ofi-prj-dial">
            <SectorRing
                slices={slices}
                size={176}
                thickness={26}
                active={hot}
                onHover={setHot}
                onPick={onOpen}
                label={t('projects.detail.overview.chartsTitle')}
            >
                <span className={`ofi-swc-hole__big ${total <= 0 ? 'is-empty' : ''}`}>
                    {rate === null ? '–' : `${Math.round(counted)} %`}
                </span>
                <span className="ofi-swc-hole__label">{t('billing.billed')}</span>
                <span className="ofi-swc-hole__sub">{total > 0 ? money(total) : active.label}</span>
            </SectorRing>

            <div className="ofi-swc-donut__side">
                {/* Der Ausschnitt: eine Mac-Segmentleiste. Klick wählt, Überfahren
                    zeigt — Ring, Quote und Legende stellen sich mit um. */}
                <div className="ofi-swc-seg" role="group" aria-label={t('projects.detail.overview.chartsTitle')}>
                    {options.map((option) => {
                        const sum = option.figures.billed + option.figures.unbilled;
                        return (
                            <button
                                key={option.key}
                                type="button"
                                aria-pressed={scope === option.key}
                                className={`ofi-swc-seg__btn ${activeKey === option.key ? 'is-on' : ''} ${sum <= 0 ? 'is-void' : ''}`}
                                onClick={() => setScope(option.key)}
                                onMouseEnter={() => setPreview(option.key)}
                                onMouseLeave={() => setPreview(null)}
                                onFocus={() => setPreview(option.key)}
                                onBlur={() => setPreview(null)}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
                <div className="ofi-prj-dial__scope">
                    <span>{active.label}</span>
                    <span>{money(total)}</span>
                </div>
                <SwiftLegend
                    slices={slices}
                    total={total}
                    format={money}
                    active={hot}
                    onHover={setHot}
                    onPick={onOpen ? () => onOpen() : undefined}
                />
            </div>
        </div>
    );
});

/**
 * Die Auswertungskarte der Projekt-Übersicht. Name und Schnittstelle bleiben,
 * damit die Auftragsansicht (`MyOrderDetail`) sie unverändert einbinden kann.
 */
export const OverviewPieCharts = memo(({ order, addons, bare = false, onOpenBilling }: {
    order: Figures;
    addons: Figures;
    /** Ohne Kartenrahmen — für Popups, deren Kopfzeile den Titel schon trägt. */
    bare?: boolean;
    /** Fehlt er (Popup, Auftragsansicht), bleibt die Scheibe reine Anzeige. */
    onOpenBilling?: () => void;
}) => {
    const content = (
        <div className="ofi-prj-dials">
            <BillingDial order={order} addons={addons} onOpen={onOpenBilling} />
        </div>
    );

    if (bare) return content;

    const title = t('projects.detail.overview.chartsTitle');
    return (
        <OverviewCard
            title={title}
            action={onOpenBilling ? <CardLink label={title} onOpen={onOpenBilling} /> : undefined}
        >
            {content}
        </OverviewCard>
    );
});
