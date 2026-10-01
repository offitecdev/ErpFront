import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, Calculator, Inbox, Search, X } from 'lucide-react';

import { t } from '@/i18n/translate';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { ProcurementFeed, ProcurementNextAction } from '@/types/purchasing';

import { Failure, Loading, Placeholder, Segmented } from '../purchasingUi';
import { useInboxCheck } from '../request/useInboxCheck';
import { FeedRow } from './FeedRow';
import { Pager } from './Pager';

const P = 'productionBom.purchasing';

type KindFilter = 'all' | 'price' | 'order';
const KIND_OF: Record<KindFilter, 'PRICE' | 'ORDER' | null> = { all: null, price: 'PRICE', order: 'ORDER' };

/**
 * ── DIE LISTE (28.09.2026) ─────────────────────────────────────────────────
 * 20 Talepler je Seite vom Server, der letzte Handgriff zuerst. Die Seite
 * steht in der Adresse — der Weg zurück aus einem Talep landet dort.
 */
export const PurchasingList = ({ tick, onOpen, onAction }: {
    tick: number;
    onOpen: (requestId: string) => void;
    onAction: (requestId: string, action: ProcurementNextAction, purchaseOrderId: string | null) => void;
}) => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
    /* «Fiyat talebi hangisi, satın alma hangisi» (29.09.2026): EINE Liste, oben das Segment nach Art. */
    const kindParam = params.get('kind');
    const kind: KindFilter = kindParam === 'price' || kindParam === 'order' ? kindParam : 'all';
    const [search, setSearch] = useState(params.get('q') ?? '');
    const [feed, setFeed] = useState<ProcurementFeed | null>(null);
    const [error, setError] = useState<string | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const query = params.get('q') ?? '';
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let alive = true;
        purchasingApi.feed({ page, search: query, kind: KIND_OF[kind] })
            .then((value) => { if (alive) { setFeed(value); setError(null); } })
            .catch((failure) => { if (alive) setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')); });
        return () => { alive = false; };
    }, [page, query, kind, tick, reload]);

    /* Wartet eine Zeile auf den Lieferanten, liest die Seite beim Öffnen gleich den Posteingang (30.09.2026). */
    const awaiting = Boolean(feed?.canProcure && feed.items.some((row) => row.stage.key === 'REPLIES_EXPECTED' || row.stage.key === 'CONFIRMATION_EXPECTED'));
    useInboxCheck(awaiting, (result) => {
        if (result.attached <= 0) return;
        toast.success(t(`${P}.requests.checkFound`, { count: result.attached }));
        setReload((value) => value + 1);
    });

    // Suchen erst nach einer kurzen Pause — und immer ab Seite 1.
    useEffect(() => {
        const value = search.trim();
        if (value === query) return undefined;
        const timer = window.setTimeout(() => {
            const next = new URLSearchParams(params);
            if (value) next.set('q', value);
            else next.delete('q');
            next.delete('page');
            setParams(next, { replace: true });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [search, query, params, setParams]);

    const goKind = (next: KindFilter) => {
        const nextParams = new URLSearchParams(params);
        if (next === 'all') nextParams.delete('kind');
        else nextParams.set('kind', next);
        nextParams.delete('page');
        setParams(nextParams, { replace: true });
    };

    const goPage = (next: number) => {
        const nextParams = new URLSearchParams(params);
        if (next > 1) nextParams.set('page', String(next));
        else nextParams.delete('page');
        setParams(nextParams, { replace: true });
        boxRef.current?.scrollIntoView({ block: 'start' });
    };

    return (
        <>
            <header className="ofi-buy-head">
                <h1>{t(`${P}.title`)}</h1>
                {feed && <span className="ofi-buy-head__count">{t(`${P}.count`, { count: feed.total })}</span>}
                <Segmented
                    tabs={[
                        { key: 'all' as const, label: t(`${P}.kinds.all`) },
                        { key: 'price' as const, label: t(`${P}.kinds.price`) },
                        { key: 'order' as const, label: t(`${P}.kinds.order`) },
                    ]}
                    value={kind}
                    onChange={goKind}
                    label={t(`${P}.kinds.label`)}
                    idPrefix="purchasing-kind"
                />
                <label className="ofi-buy-search">
                    <Search aria-hidden />
                    <input
                        value={search}
                        placeholder={t(`${P}.search`)}
                        aria-label={t(`${P}.search`)}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    {search && (
                        <button type="button" className="ofi-buy-search__clear ofi-nosize" aria-label={t('productionBom.common.clear')} onClick={() => setSearch('')}>
                            <X aria-hidden />
                        </button>
                    )}
                </label>
                <button type="button" className="ofi-buy-btn ofi-nosize" onClick={() => navigate('/production/costing')} title={t(`${P}.costingHint`)}>
                    <Calculator aria-hidden />
                    {t('productionBom.costing.title')}
                </button>
            </header>

            {error && !feed ? <Failure text={error} /> : !feed ? <Loading /> : !feed.items.length ? (
                <Placeholder icon={<Inbox />} title={t(query ? `${P}.emptySearch` : `${P}.empty`)} hint={query ? undefined : t(`${P}.emptyHint`)} />
            ) : (
                <div ref={boxRef} className="ofi-buy-box is-scroll" id="purchasing-kind-panel" role="tabpanel" aria-labelledby={`purchasing-kind-tab-${kind}`}>
                    <table className="ofi-buy-table" data-unstyled-table>
                        <colgroup>
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '11.5%' }} />
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '11.5%' }} />
                            <col style={{ width: '11.5%' }} />
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '8.5%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '11%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>{t(`${P}.col.request`)}</th>
                                <th>{t(`${P}.col.project`)}</th>
                                <th>{t(`${P}.col.commission`)}</th>
                                <th>{t(`${P}.col.device`)}</th>
                                <th>{t(`${P}.col.documents`)}</th>
                                <th>{t(`${P}.col.stage`)}</th>
                                <th>{t(`${P}.col.delivery`)}</th>
                                <th>{t(`${P}.col.last`)}<ArrowDown aria-hidden /></th>
                                <th aria-label={t(`${P}.col.next`)} />
                            </tr>
                        </thead>
                        <tbody>
                            {feed.items.map((row) => (
                                <FeedRow
                                    key={row.id}
                                    row={row}
                                    canProcure={feed.canProcure}
                                    onOpen={() => onOpen(row.id)}
                                    onAction={(action, purchaseOrderId) => onAction(row.id, action, purchaseOrderId)}
                                />
                            ))}
                        </tbody>
                    </table>
                    <Pager page={feed.page} pageSize={feed.pageSize} total={feed.total} onPage={goPage} />
                </div>
            )}
        </>
    );
};
