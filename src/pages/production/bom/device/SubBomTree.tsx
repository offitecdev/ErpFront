import { ChevronRight, FolderTree, Plus } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { Bom, BomSummary } from '@/types/productionBom';

import { CompletionChecks, StatusPill } from '../bomUi';

/**
 * ── DIE ALT-BOMs UNTER DER HAUPT-BOM (27.09.2026, Vorgabe Samet) ─────────────
 *
 * «Bu ana BOM'un altında alt BOM'lar olmalıdır … iki ayrı yine kart, BOM kartı
 *  gibi olsun bu alt BOM'lar, ancak biz görebilelim en üst BOM'dan en alt
 *  BOM'a hiyerarşik birleştiğini.» Oben der Knoten der Haupt-BOM, von ihm
 * führt eine Linie zu jeder Alt-BOM-Karte (wie eine Gliederung im Finder);
 * jede Karte zeigt Nummer, Stand, Name, Mengen und die Bedingungen von «BOM
 * tamamla» und öffnet ihre BOM. Die letzte Zeile: «+ Alt BOM ekle».
 */
export const SubBomTree = ({
    main,
    subs,
    max,
    canAdd,
    onOpen,
    onAdd,
}: {
    main: Bom;
    subs: BomSummary[];
    max: number;
    canAdd: boolean;
    onOpen: (bom: BomSummary) => void;
    onAdd: () => void;
}) => {
    const full = subs.length >= max;
    const totalLines = main.counts.lines + subs.reduce((sum, sub) => sum + sub.counts.lines, 0);
    return (
        <section className="ofi-bom-tree" aria-label={t('productionBom.sub.title')}>
            <div className="ofi-bom-tree__root">
                <span className="ofi-bom-tree__icon" aria-hidden><FolderTree /></span>
                <span className="ofi-bom-code is-title">{main.bomNumber}</span>
                <span className="ofi-bom-tree__meta">
                    {main.counts.lines > 0
                        ? t('productionBom.sub.rootMeta', { lines: main.counts.lines, subs: subs.length, total: totalLines })
                        : t('productionBom.sub.rootMetaSubs', { subs: subs.length, total: totalLines })}
                </span>
                <span className="ofi-bom-count">{t('productionBom.device.count', { count: subs.length, max })}</span>
            </div>
            <ul className="ofi-bom-tree__children">
                {subs.map((sub) => {
                    const orders = sub.activity?.orderCount ?? ('purchases' in sub ? (sub as Bom).purchases.filter((purchase) => purchase.kind === 'ORDER').length : 0);
                    const active = sub.status !== 'DRAFT' && !sub.consumedAt;
                    return (
                        <li key={sub.id}>
                            <button type="button" className="ofi-bom-subcard ofi-nosize" onClick={() => onOpen(sub)}>
                                <span className="ofi-bom-subcard__head">
                                    <span className="ofi-bom-code is-large">{sub.bomNumber}</span>
                                    <StatusPill status={sub.status} consumed={Boolean(sub.consumedAt)} />
                                    <span className="ofi-bom-subcard__title">{sub.templateName}</span>
                                    <ChevronRight className="ofi-bom-subcard__chev" aria-hidden />
                                </span>
                                <span className="ofi-bom-subcard__meta">
                                    <span>{t('productionBom.device.cardLines', { count: sub.counts.lines })}</span>
                                    {active && (
                                        <>
                                            <span className="ofi-bom-dot">·</span>
                                            <span>{t('productionBom.device.cardReserved', { done: sub.counts.reserved, total: sub.counts.lines })}</span>
                                            {sub.counts.missing > 0 && (
                                                <>
                                                    <span className="ofi-bom-dot">·</span>
                                                    <span className="is-missing">{t('productionBom.device.cardMissing', { count: sub.counts.missing })}</span>
                                                </>
                                            )}
                                        </>
                                    )}
                                    {orders > 0 && (
                                        <>
                                            <span className="ofi-bom-dot">·</span>
                                            <span>{t('productionBom.device.cardOrders', { count: orders })}</span>
                                        </>
                                    )}
                                    {active && <span className="ofi-bom-subcard__checks"><CompletionChecks completion={sub.completion} compact /></span>}
                                </span>
                            </button>
                        </li>
                    );
                })}
                {canAdd && (
                    <li>
                        <button
                            type="button"
                            className="ofi-bom-subcard is-add ofi-nosize"
                            disabled={full}
                            title={full ? t('productionBom.device.maxReached', { max }) : undefined}
                            onClick={onAdd}
                        >
                            <Plus aria-hidden />
                            <span>{full ? t('productionBom.device.maxReached', { max }) : t('productionBom.sub.add')}</span>
                        </button>
                    </li>
                )}
                {!subs.length && !canAdd && (
                    <li><span className="ofi-bom-subcard is-empty">{t('productionBom.sub.none')}</span></li>
                )}
            </ul>
            {!subs.length && canAdd && <p className="ofi-bom-tree__hint">{t('productionBom.sub.emptyText')}</p>}
        </section>
    );
};
