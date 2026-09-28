import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calculator, CalendarClock, ChevronLeft, ChevronRight, History, Inbox, Search, TriangleAlert } from 'lucide-react';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { ProcurementList, ProcurementRequest, ProcurementRevision } from '@/types/productionBom';
import '@/styles/modules/warehouse.css';
import '@/styles/modules/productionBom.css';

import { shortDate } from '../bom/bomFormat';
import { EmptyState, LoadingState } from '../bom/bomUi';
import { ProcurementKindTag, ProcurementStatusPill } from '../bom/device/BomProcurementPanels';
import { ProgressRing } from '../bom/device/BomProcessButton';
import { ChangeChips } from '../bom/device/BomRevisionsView';
import { PurchasingBomArea, type PurchasingTarget } from './PurchasingBomArea';

/* «Her şey tek yerde olsun … alt menülere ayrılmasın» (28.09.2026): EINE Liste.
   Später am selben Tag: «tümü, açık, iptal, tamamlanan demesine gerek yok» —
   kein Standfilter mehr; der Stand steht als Plakette an jeder Zeile. */

/** «15 page sonra sayfaya geçsin» (28.09.2026). */
const PAGE_SIZE = 15;

/** Ein Eintrag der Liste: ein Talep oder eine freigegebene Revision. */
type FeedEntry =
    | { type: 'request'; at: string; request: ProcurementRequest }
    | { type: 'revision'; at: string; revision: ProcurementRevision };

const fold = (value: string | null | undefined): string => String(value ?? '').toLocaleLowerCase('tr-TR');
const matches = (needle: string, values: Array<string | null | undefined>): boolean =>
    !needle || values.some((value) => fold(value).includes(needle));

/** Heute nur die Uhrzeit, sonst das Datum. */
const whenText = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toDateString() === new Date().toDateString()
        ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : shortDate(iso);
};

/** Seitenzahlen mit Lücken: 1 … 4 5 6 … 12. */
const pageWindow = (page: number, pages: number): Array<number | 'gap'> => {
    if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
    const near = [page - 1, page, page + 1].filter((value) => value > 1 && value < pages);
    const steps: Array<number | 'gap'> = [1];
    if (near[0] !== undefined && near[0] > 2) steps.push('gap');
    steps.push(...near);
    if ((near[near.length - 1] ?? 1) < pages - 1) steps.push('gap');
    steps.push(pages);
    return steps;
};

/**
 * ── ÜRETİM › SATIN ALMA ──────────────────────────────────────────────────────
 *
 * 27.09.2026 abends: «Fiyat talepleri ve siparişleri muhasebe ve yöneticiler
 * yapacak … bom'da sadece sipariş ve fiyat talep istekleri oluşsun … başka bir
 * sayfada talep olarak gelsin.»
 *
 * 28.09.2026 (Samet): «her şey tek yerde olsun, alt menülere ayrılmasın …
 * işlem yapılan ve yeni gelen talepler listede en başa düşsün» — und gleich
 * danach: «[Ausgaben-Kacheln] kaldır … taleplerin siparişleri diğer sayfada
 * gözüksün ilk sayfada değil … 15 page sonra sayfaya geçsin».
 *
 * Darum: EINE Liste ohne Seitenleiste, nur Talepler beider Arten und die
 * freigegebenen Revisionen, sortiert nach dem letzten Handgriff
 * (`lastActivityAt`) — was neu kam oder gerade bearbeitet wurde, steht oben.
 * Preisanfragen und Bestellungen eines Talep stehen erst auf SEINER Seite
 * (PurchasingRequestView), nicht in der Liste. 15 Einträge je Seite; die
 * Seite steht in der Adresse, damit der Weg zurück aus einem Talep dort landet.
 */
export const ProductionPurchasingPage = () => {
    useLanguageTick();
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const mainRef = useRef<HTMLDivElement>(null);
    const rawPage = Number(params.get('page'));
    const wantedPage = Number.isInteger(rawPage) && rawPage > 1 ? rawPage : 1;
    const requestId = params.get('req');
    const docId = params.get('doc');
    const docBom = params.get('bom');
    // «bomId~revision» — eine Revision im Einzelnen.
    const revisionParam = params.get('rev');

    const [list, setList] = useState<ProcurementList | null>(null);
    const [revisions, setRevisions] = useState<ProcurementRevision[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const [query, setQuery] = useState('');

    useEffect(() => {
        let alive = true;
        const fail = (failure: unknown) => { if (alive) setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')); };
        productionBomApi.procurementList()
            .then((value) => { if (alive) { setList(value); setError(null); } })
            .catch(fail);
        productionBomApi.procurementRevisions()
            .then((value) => { if (alive) setRevisions(value.revisions); })
            .catch(fail);
        return () => { alive = false; };
    }, [tick]);

    const setParam = (patch: Record<string, string | null>) => {
        const next = new URLSearchParams(params);
        for (const [key, value] of Object.entries(patch)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
        }
        setParams(next);
    };
    const refresh = useCallback(() => setTick((value) => value + 1), []);

    const target = useMemo<PurchasingTarget | null>(() => {
        if (requestId) return { kind: 'request', requestId };
        if (docId && docBom) return { kind: 'document', bomId: docBom, purchaseOrderId: docId };
        if (revisionParam) {
            const cut = revisionParam.lastIndexOf('~');
            const revision = Number(revisionParam.slice(cut + 1));
            if (cut > 0 && Number.isInteger(revision)) return { kind: 'revision', bomId: revisionParam.slice(0, cut), revision };
        }
        return null;
    }, [requestId, docId, docBom, revisionParam]);

    const feed = useMemo<FeedEntry[]>(() => {
        const needle = fold(query.trim());
        const entries: FeedEntry[] = (list?.requests ?? [])
            .filter((request) => matches(needle, [
                request.requestNumber,
                request.project?.projectNumber,
                request.project?.projectName,
                request.device?.name,
                request.bom?.bomNumber,
                ...request.lines.flatMap((line) => [line.name, line.erpCode, line.modelNumber]),
                ...request.documents.flatMap((doc) => [doc.referenceNumber, doc.supplierName]),
            ]))
            .map((request): FeedEntry => ({ type: 'request', at: request.lastActivityAt ?? request.createdAt, request }));
        for (const revision of revisions ?? []) {
            if (!matches(needle, [
                revision.bomNumber,
                revision.reason,
                revision.project?.projectNumber,
                revision.project?.projectName,
                revision.device?.name,
                ...revision.orderActions.flatMap((action) => [action.referenceNumber, action.supplierName]),
            ])) continue;
            entries.push({ type: 'revision', at: revision.approvedAt ?? '', revision });
        }
        // Neu oder gerade bearbeitet steht oben.
        return entries.sort((a, b) => b.at.localeCompare(a.at));
    }, [list, revisions, query]);

    const pages = Math.max(1, Math.ceil(feed.length / PAGE_SIZE));
    // Eine Seite, die es nicht mehr gibt (Suche verengt die Liste), zeigt die letzte.
    const page = Math.min(wantedPage, pages);
    const shown = feed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const goPage = (next: number) => {
        setParam({ page: next > 1 ? String(next) : null });
        // Die neue Seite beginnt oben: am Rechner rollt die Liste selbst, am
        // Telefon die Schale darum (die Seite hat dort keine feste Höhe).
        const el = mainRef.current;
        if (!el) return;
        el.scrollTo({ top: 0 });
        if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
    };

    /* «0/3 şeklinde sipariş onaylananın» (28.09.2026): sobald ein Satın alma
       talebi Bestellungen hat, zählt die Zeile die BESTÄTIGTEN davon; vorher
       (und bei Preisanfragen) wie bisher die abgedeckten Kalemler. */
    const progressOf = (request: ProcurementRequest): { value: number; text: string } => {
        const orders = request.documents.filter((doc) => doc.kind === 'ORDER');
        if (request.kind === 'ORDER' && orders.length) {
            const done = orders.filter((doc) => doc.confirmed).length;
            return { value: done / orders.length, text: t('productionBom.purchasing.confirmedOf', { done, total: orders.length }) };
        }
        const { covered, total } = request.progress;
        return { value: total ? covered / total : 0, text: t(`productionBom.procurement.progress.${request.kind}`, { done: covered, total }) };
    };

    const renderRequest = (request: ProcurementRequest) => {
        const progress = progressOf(request);
        const delivery = request.project?.deliveryDate ?? null;
        return (
            <div key={`req:${request.id}`} className="ofi-pur-item">
                <button type="button" className="ofi-pur-row ofi-nosize" onClick={() => setParam({ req: request.id, doc: null, bom: null, rev: null })}>
                    <span className="ofi-pur-row__main">
                        <span className="ofi-pur-row__top">
                            <b className="ofi-bom-code">{request.requestNumber}</b>
                            <ProcurementKindTag kind={request.kind} />
                            <ProcurementStatusPill status={request.status} />
                        </span>
                        <span className="ofi-pur-row__where">
                            <b>{request.project ? [request.project.projectNumber, request.project.projectName].filter(Boolean).join(' · ') : '—'}</b>
                            <span className="ofi-bom-dot">·</span>
                            {request.device?.name ?? '—'}
                            <span className="ofi-bom-dot">·</span>
                            <span className="ofi-bom-code">{request.bom?.bomNumber ?? '—'}</span>
                        </span>
                        <small className="ofi-pur-row__lines">
                            {request.lines.slice(0, 3).map((line) => line.name).join(' · ')}
                            {request.lines.length > 3 ? ` · +${request.lines.length - 3}` : ''}
                        </small>
                    </span>
                    <span className="ofi-pur-row__delivery">
                        <CalendarClock aria-hidden />
                        <span>
                            <b>{delivery ? shortDate(delivery) : '—'}</b>
                            <small>{t('productionBom.purchasing.fact.delivery')}</small>
                        </span>
                    </span>
                    <span className="ofi-pur-row__progress">
                        <ProgressRing value={progress.value} size={16} />
                        <small>{progress.text}</small>
                    </span>
                    <span className="ofi-pur-row__meta">
                        <small>{t('productionBom.purchasing.lastActivity')}</small>
                        <b>{whenText(request.lastActivityAt ?? request.createdAt)}</b>
                        <small>{request.createdByName ?? ''}</small>
                    </span>
                </button>
            </div>
        );
    };

    // Die betroffenen Bestellungen stehen erst in der Revision selbst — hier nur ihre Zahl.
    const renderRevision = (entry: ProcurementRevision) => (
        <div key={`rev:${entry.bomId}~${entry.revision}`} className="ofi-pur-item">
            <button
                type="button"
                className="ofi-pur-revrow ofi-nosize"
                onClick={() => setParam({ rev: `${entry.bomId}~${entry.revision}`, req: null, doc: null, bom: null })}
            >
                <span className="ofi-pur-row__top">
                    <History aria-hidden className="ofi-pur-revrow__icon" />
                    <b className="ofi-bom-code">{entry.bomNumber}</b>
                    <span className="ofi-bom-revpill">{t('productionBom.revision.label', { revision: entry.revision })}</span>
                    <ChangeChips counts={entry.changes} />
                    <small className="ofi-pur-revrow__when">
                        {entry.approvedAt ? whenText(entry.approvedAt) : '—'}
                        {entry.approvedByName ? ` · ${entry.approvedByName}` : ''}
                    </small>
                </span>
                <span className="ofi-pur-row__where">
                    <b>{entry.project ? [entry.project.projectNumber, entry.project.projectName].filter(Boolean).join(' · ') : '—'}</b>
                    <span className="ofi-bom-dot">·</span>
                    {entry.device?.name ?? '—'}
                </span>
                {entry.reason && <small className="ofi-pur-revrow__reason">{entry.reason}</small>}
                <small className="ofi-pur-revrow__none">
                    {entry.orderActions.length
                        ? t('productionBom.purchasing.revisionOrders', { count: entry.orderActions.length })
                        : t('productionBom.purchasing.revisionNoOrders')}
                </small>
            </button>
        </div>
    );

    const main = () => {
        if (target) {
            return (
                <PurchasingBomArea
                    key={requestId ?? revisionParam ?? `${docBom}:${docId}`}
                    target={target}
                    onExit={() => setParam({ req: null, doc: null, bom: null, rev: null })}
                    onChanged={refresh}
                />
            );
        }
        if (error && !list) return <div className="ofi-bom-state is-error"><TriangleAlert aria-hidden /><b>{error}</b></div>;
        if (!list) return <LoadingState />;

        const from = feed.length ? (page - 1) * PAGE_SIZE + 1 : 0;
        const to = Math.min(feed.length, page * PAGE_SIZE);
        return (
            <div className="ofi-pur-content">
                {feed.length ? (
                    <div className="ofi-bom-group__box is-list ofi-pur-list">
                        {shown.map((entry) => (entry.type === 'request' ? renderRequest(entry.request) : renderRevision(entry.revision)))}
                        <footer className="ofi-pur-pager">
                            <span className="ofi-pur-pager__range">{t('productionBom.purchasing.pageRange', { from, to, total: feed.length })}</span>
                            {pages > 1 && (
                                <span className="ofi-pur-pager__steps">
                                    <button
                                        type="button"
                                        className="ofi-pur-pager__arrow ofi-nosize"
                                        aria-label={t('productionBom.purchasing.prevPage')}
                                        title={t('productionBom.purchasing.prevPage')}
                                        disabled={page <= 1}
                                        onClick={() => goPage(page - 1)}
                                    >
                                        <ChevronLeft aria-hidden />
                                    </button>
                                    {pageWindow(page, pages).map((step, index) => (step === 'gap' ? (
                                        <span key={`gap-${index}`} className="ofi-pur-pager__gap">…</span>
                                    ) : (
                                        <button
                                            key={step}
                                            type="button"
                                            className={`ofi-pur-pager__page ofi-nosize${step === page ? ' is-on' : ''}`}
                                            aria-current={step === page ? 'page' : undefined}
                                            onClick={() => goPage(step)}
                                        >
                                            {step}
                                        </button>
                                    )))}
                                    <button
                                        type="button"
                                        className="ofi-pur-pager__arrow ofi-nosize"
                                        aria-label={t('productionBom.purchasing.nextPage')}
                                        title={t('productionBom.purchasing.nextPage')}
                                        disabled={page >= pages}
                                        onClick={() => goPage(page + 1)}
                                    >
                                        <ChevronRight aria-hidden />
                                    </button>
                                </span>
                            )}
                        </footer>
                    </div>
                ) : (
                    <EmptyState
                        icon={<Inbox />}
                        title={t('productionBom.purchasing.empty.feed.all')}
                        hint={t('productionBom.purchasing.emptyHint.feed')}
                    />
                )}
                <p className="ofi-bom-group__foot">{t('productionBom.purchasing.sideNote')}</p>
            </div>
        );
    };

    return (
        <div className="ofi-bom is-page ofi-pur">
            <header className="ofi-bom-head">
                <h1 className="ofi-bom-head__title">{t('productionBom.purchasing.title')}</h1>
                {!target && (
                    <label className="ofi-pur-search">
                        <Search aria-hidden />
                        <input
                            value={query}
                            placeholder={t('productionBom.purchasing.search')}
                            aria-label={t('productionBom.purchasing.search')}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                if (params.get('page')) setParam({ page: null });
                            }}
                        />
                    </label>
                )}
                {!target && (
                    <button
                        type="button"
                        className="ofi-pur-costlink is-head ofi-nosize"
                        onClick={() => navigate('/production/costing')}
                        title={t('productionBom.purchasing.costingHint')}
                    >
                        <Calculator aria-hidden />
                        <span><b>{t('productionBom.costing.title')}</b></span>
                        <ChevronRight aria-hidden />
                    </button>
                )}
            </header>
            <div ref={mainRef} className="ofi-bom-main ofi-pur-single">{main()}</div>
        </div>
    );
};

export default ProductionPurchasingPage;
