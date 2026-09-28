import { useEffect, useState } from 'react';
import { FilePen, History, TriangleAlert } from 'lucide-react';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import type { Bom, BomRevisionDetail, BomRevisionSummary } from '@/types/productionBom';

import { fmtQty, shortDate, unitLabel } from '../bomFormat';
import { Dash, EmptyState, LoadingState } from '../bomUi';
import { NavBar, NavLinkRow } from '../NavStack';
import { changeCounts, type ChangeCounts } from './bomRevision';
import { OrderActionCard, RevisionChangesTable } from './BomRevisionDialogs';
import type { BomViewContext } from './DeviceBomArea';

/** «+2 yeni · 1 artış · 1 çıkarıldı» — nur, was vorkommt. */
export const ChangeChips = ({ counts }: { counts: ChangeCounts }) => {
    const chips = (['added', 'increased', 'decreased', 'removed', 'edited'] as const)
        .filter((key) => counts[key] > 0)
        .map((key) => (
            <span key={key} className={`ofi-bom-revchip is-${key}`}>{t(`productionBom.revision.count.${key}`, { count: counts[key] })}</span>
        ));
    return chips.length ? <span className="ofi-bom-revchips">{chips}</span> : null;
};

/**
 * ── DIE GESCHICHTE EINER BOM (27.09.2026) ───────────────────────────────────
 * «Eski bom artık kayıt edilmeli»: jede freigegebene Revision mit Tag, Person,
 * Grund und dem, was sie änderte — die neueste oben. Eine Revision im Entwurf
 * steht als Hinweis darüber (bearbeitet wird sie in der BOM selbst).
 */
export const BomRevisionsView = ({ context, bom }: { context: BomViewContext; bom: Bom }) => {
    const { nav } = context;
    const list = [...bom.revisions].sort((a, b) => b.revision - a.revision);
    const draft = bom.revisionDraft;

    const row = (entry: BomRevisionSummary) => (
        <button
            key={entry.revision}
            type="button"
            className="ofi-bom-porow ofi-nosize"
            onClick={() => context.open({ kind: 'revision', bomId: bom.id, revision: entry.revision })}
        >
            <span className="ofi-bom-porow__main">
                <span className="ofi-bom-porow__top">
                    <span className="ofi-bom-revpill">{t('productionBom.revision.label', { revision: entry.revision })}</span>
                    {entry.revision === bom.revision && <span className="ofi-bom-tag">{t('productionBom.revision.current')}</span>}
                    <span className="ofi-bom-porow__sub">
                        {entry.approvedAt ? shortDate(entry.approvedAt) : '—'}
                        {entry.approvedByName && <><span className="ofi-bom-dot">·</span>{entry.approvedByName}</>}
                    </span>
                </span>
                <span className="ofi-bom-porow__sub">
                    {entry.revision === 0 ? t('productionBom.revision.firstApproval') : entry.reason || '—'}
                </span>
                {entry.revision > 0 && (
                    <span className="ofi-bom-revchips">
                        <ChangeChips counts={changeCounts(entry.changes)} />
                        {entry.orderActions.length > 0 && (
                            <span className="ofi-bom-revchip">{t('productionBom.revision.ordersAffected', { count: entry.orderActions.length })}</span>
                        )}
                    </span>
                )}
            </span>
        </button>
    );

    return (
        <>
            <NavBar nav={nav} backTitle={context.backTitle} title={t('productionBom.revision.history')} subtitle={bom.bomNumber} />
            <div className="ofi-bom-body">
                {draft && (
                    <div className="ofi-bom-links is-draft">
                        <NavLinkRow
                            icon={<FilePen />}
                            label={t('productionBom.revision.draftPill', { revision: draft.revision })}
                            detail={draft.reason ?? undefined}
                            tone="accent"
                            onClick={() => nav.back()}
                        />
                    </div>
                )}
                {list.length ? (
                    <section className="ofi-bom-group">
                        <h3 className="ofi-bom-group__title">
                            {t('productionBom.revision.approvedTitle')}
                            <span className="ofi-bom-group__count">{list.length}</span>
                        </h3>
                        <div className="ofi-bom-group__box is-list">{list.map(row)}</div>
                    </section>
                ) : (
                    <EmptyState icon={<History />} title={t('productionBom.revision.historyEmpty')} hint={t('productionBom.revision.historyEmptyHint')} />
                )}
            </div>
        </>
    );
};

/** Eine Revision: wer, wann, warum — der Unterschied, die Bestellungen und ihre Zeilen (nur lesen). */
export const BomRevisionView = ({ context, bom, revision }: { context: BomViewContext; bom: Bom; revision: number }) => {
    const { nav } = context;
    const [state, setState] = useState<{ key: string; detail: BomRevisionDetail | null; error: string | null } | null>(null);
    const key = `${bom.id}:${revision}:${bom.revision}`;
    useEffect(() => {
        let alive = true;
        productionBomApi.revisionDetail(bom.id, revision)
            .then((detail) => { if (alive) setState({ key, detail, error: null }); })
            .catch((failure) => { if (alive) setState({ key, detail: null, error: productionBomErrorText(failure) }); });
        return () => { alive = false; };
    }, [bom.id, revision, key]);
    const detail = state?.key === key ? state.detail : null;
    const error = state?.key === key ? state.error : null;

    return (
        <>
            <NavBar
                nav={nav}
                backTitle={context.backTitle}
                title={<span className="ofi-bom-revpill is-title">{t('productionBom.revision.label', { revision })}</span>}
                badge={revision === bom.revision ? <span className="ofi-bom-tag">{t('productionBom.revision.current')}</span> : undefined}
                subtitle={bom.bomNumber}
            />
            <div className="ofi-bom-body">
                {error && (
                    <div className="ofi-bom-state is-error">
                        <TriangleAlert aria-hidden />
                        <b>{error}</b>
                    </div>
                )}
                {!detail && !error && <LoadingState />}
                {detail && (
                    <>
                        <section className="ofi-bom-group">
                            <div className="ofi-bom-group__box">
                                <div className="ofi-bom-row">
                                    <span className="ofi-bom-row__label">{t('productionBom.revision.approvedAt')}</span>
                                    <span className="ofi-bom-row__control">
                                        {detail.approvedAt ? shortDate(detail.approvedAt) : '—'}
                                        {detail.approvedByName ? ` · ${detail.approvedByName}` : ''}
                                    </span>
                                </div>
                                <div className="ofi-bom-row is-top">
                                    <span className="ofi-bom-row__label">{t('productionBom.revision.reasonLabel')}</span>
                                    <span className="ofi-bom-row__control ofi-bom-revreason">
                                        {detail.revision === 0 ? t('productionBom.revision.firstApproval') : detail.reason || '—'}
                                    </span>
                                </div>
                            </div>
                        </section>

                        {detail.revision > 0 && (
                            <section className="ofi-bom-group">
                                <h3 className="ofi-bom-group__title">
                                    {t('productionBom.revision.changesSince', { revision: detail.revision - 1 })}
                                    <span className="ofi-bom-group__count">{detail.changes.length}</span>
                                </h3>
                                <div className="ofi-bom-group__box ofi-bom-revbox">
                                    <RevisionChangesTable changes={detail.changes} />
                                </div>
                            </section>
                        )}

                        {detail.orderActions.length > 0 && (
                            <section className="ofi-bom-group">
                                <h3 className="ofi-bom-group__title">
                                    {t('productionBom.revision.ordersTitle')}
                                    <span className="ofi-bom-group__count">{detail.orderActions.length}</span>
                                </h3>
                                <div className="ofi-bom-revdialog__orders">
                                    {detail.orderActions.map((action) => (
                                        <OrderActionCard
                                            key={action.purchaseOrderId}
                                            action={action}
                                            done
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        <section className="ofi-bom-group is-lines">
                            <h3 className="ofi-bom-group__title">
                                {t('productionBom.revision.linesOf', { revision: detail.revision })}
                                <span className="ofi-bom-group__count">{detail.lines.length}</span>
                            </h3>
                            <div className="ofi-bom-tablewrap is-plain">
                                <table className="ofi-bom-table" data-unstyled-table>
                                    <thead>
                                        <tr>
                                            <th className="is-code">{t('productionBom.columns.erpCode')}</th>
                                            <th className="is-name">{t('productionBom.columns.name')}</th>
                                            <th>{t('productionBom.columns.brand')}</th>
                                            <th>{t('productionBom.columns.modelNumber')}</th>
                                            <th className="is-num is-accent">{t('productionBom.columns.need')}</th>
                                            <th>{t('productionBom.columns.note')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {!detail.lines.length && (
                                            <tr className="is-empty"><td colSpan={6}>{t('productionBom.detail.empty')}</td></tr>
                                        )}
                                        {detail.lines.map((line) => (
                                            <tr key={line.id}>
                                                <td className="is-code"><span className="ofi-bom-code">{line.erpCode ?? '—'}</span></td>
                                                <td className="is-name">{line.name}</td>
                                                <td>{line.brand ?? <Dash />}</td>
                                                <td className="is-mono">{line.modelNumber ?? <Dash />}</td>
                                                <td className="is-num is-accent"><span className="ofi-bom-qty">{fmtQty(line.quantity)}<small>{unitLabel(line.unit)}</small></span></td>
                                                <td>{line.note ?? <Dash />}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </>
    );
};
