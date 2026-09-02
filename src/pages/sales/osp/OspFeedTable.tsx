import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ArrowRight } from '@/components/icons/antIconCompat';
import { Pager, SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { ospApi, type OspFeedEntryDto, type OspFeedResponse } from '@/lib/api/osp';
import { useNavigate } from 'react-router-dom';

/**
 * ── DER AKTIVITÄTSSTROM (§1c) ────────────────────────────────────────────────
 *
 * Was in der OSP gerechnet wird, sobald es gerechnet wird — und AUSDRÜCKLICH
 * keine Anfrage. Niemand hat um eine Offerte gebeten, es hängt kein Stand
 * daran, und die OSP erwartet keine Antwort. Genau deshalb steht der Strom in
 * einem eigenen Reiter und nicht in der Anfrageliste: er sagt, was gerechnet
 * wird, nicht, was jemand einer Verkäuferin aufgetragen hat.
 *
 * Es gibt hier folglich weder Zuständigkeit noch Stand noch einen Knopf, der
 * daraus eine Offerte machte. Zu sehen ist nur, WER an WELCHEM Projekt WAS
 * rechnet — und ob wir zu diesem Beleg bereits eine Anfrage halten. Taucht er
 * später doch in einer Anfrage auf, erkennt man ihn an der Projektnummer.
 */

const PAGE_SIZE = 15;

/** CALCULATION / ADDED_TO_PROJECT sind NEUE Belege, die übrigen Änderungen. */
const isNewSource = (source: string): boolean => source === 'CALCULATION' || source === 'ADDED_TO_PROJECT';

const sourceLabel = (source: string): string => {
    const known = [
        'CALCULATION', 'ADDED_TO_PROJECT', 'RECALCULATED', 'OPTIONS_CHANGED',
        'CUSTOM_VALUES_CHANGED', 'PROJECT_INFO_CHANGED', 'LANGUAGE_CHANGED',
    ];
    // Ein unbekannter Grund bleibt stehen, wie er kam — die Liste ist eine
    // Beschreibung, kein geschlossener Wortschatz.
    return known.includes(source) ? t(`osp.feed.source_${source}`) : source;
};

const fmtDateTime = (value: string | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${
        date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Die Zahlen der Einheit als eine Zeile — was nicht gilt, fällt weg. */
const figures = (row: OspFeedEntryDto): string => [
    row.coolingCapacityKw && `${t('osp.import.coolingPower')} ${row.coolingCapacityKw} kW`,
    row.heatingCapacityKw && `${t('osp.import.heatingPower')} ${row.heatingCapacityKw} kW`,
    row.cop && `COP ${row.cop}`,
    row.eer && `EER ${row.eer}`,
].filter(Boolean).join(' · ');

export const OspFeedTable = () => {
    const navigate = useNavigate();
    const [data, setData] = useState<OspFeedResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');

    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const changeSearch = (next: string) => {
        setSearch(next);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => { setQuery(next.trim()); setPage(1); }, 300);
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await ospApi.listFeed({ page, pageSize: PAGE_SIZE, q: query }));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('osp.feed.loadError'));
        } finally {
            setLoading(false);
        }
    }, [page, query]);

    useEffect(() => { void load(); }, [load]);

    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = data?.totalPages ?? 1;

    const colLabel = {
        project: t('osp.feed.colProject'),
        requester: t('osp.colRequester'),
        unit: t('osp.colUnit'),
        source: t('osp.feed.colSource'),
        filedAt: t('osp.feed.colFiledAt'),
        state: t('osp.feed.colState'),
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <SearchBox
                value={search}
                onChange={changeSearch}
                placeholder={t('osp.feed.searchPlaceholder')}
                className="w-full sm:w-72"
            />
            <SectionCard title={`${t('osp.feed.title')} (${total})`}>
                {/* Der Satz steht ÜBER der Tabelle, nicht in einer Fussnote:
                    wer hier hereinschaut, soll sofort wissen, dass niemand
                    etwas von ihm will. */}
                <p className="px-4 pt-3 text-[12.5px] text-slate-500 dark:text-white/60">
                    {t('osp.feed.hint')}
                </p>
                <table data-inv-table data-list-table data-unstyled-table className="ofi-osp-table w-full">
                    <thead>
                        <tr>
                            <th>{colLabel.project}</th>
                            <th>{colLabel.requester}</th>
                            <th>{colLabel.unit}</th>
                            <th>{colLabel.source}</th>
                            <th>{colLabel.filedAt}</th>
                            <th>{colLabel.state}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || items.length === 0) && (
                            <TableStateRow
                                colSpan={6}
                                loading={loading}
                                emptyText={query ? t('osp.emptyFiltered') : t('osp.feed.empty')}
                            />
                        )}
                        {!loading && items.map((row) => {
                            const requester = [row.requesterFirstName, row.requesterLastName].filter(Boolean).join(' ');
                            const numbers = figures(row);
                            return (
                                <tr key={row.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td data-label={colLabel.project}>
                                        <div className="ofi-osp-stack">
                                            <span className="ofi-osp-ref">{row.projectNumber || '—'}</span>
                                            <span className="ofi-osp-sub">{row.projectName || '—'}</span>
                                        </div>
                                    </td>
                                    <td data-label={colLabel.requester}>
                                        <div className="ofi-osp-stack">
                                            <span className="ofi-osp-requester">{row.company || requester || '—'}</span>
                                            {row.company && requester && <span className="ofi-osp-sub">{requester}</span>}
                                            {row.requesterEmail && <span className="ofi-osp-sub">{row.requesterEmail}</span>}
                                        </div>
                                    </td>
                                    <td data-label={colLabel.unit}>
                                        <div className="ofi-osp-stack">
                                            <span className="ofi-osp-model">
                                                {row.unitModel || row.unitName || t('osp.unitFallback', { id: row.ospDocumentId })}
                                            </span>
                                            {row.unitModel && row.unitName && (
                                                <span className="ofi-osp-sub">{row.unitName}</span>
                                            )}
                                            {numbers && <span className="ofi-osp-sub">{numbers}</span>}
                                        </div>
                                    </td>
                                    <td data-label={colLabel.source}>
                                        <span className={`ofi-osp-chip ${isNewSource(row.source) ? 'is-new' : 'is-update'}`}>
                                            {sourceLabel(row.source)}
                                        </span>
                                    </td>
                                    <td data-label={colLabel.filedAt}>
                                        <span className="ofi-osp-sub">{fmtDateTime(row.filedAt)}</span>
                                    </td>
                                    {/* Halten wir dazu eine Anfrage? Das ist eine Tatsache
                                        über UNSERE Aufzeichnungen — die OSP sagt sie nicht. */}
                                    <td data-label={colLabel.state}>
                                        {row.tenderId ? (
                                            <button
                                                type="button"
                                                className="ofi-osp-import-btn is-open"
                                                onClick={() => navigate(`/sales/quotes/${row.tenderId}`)}
                                            >
                                                {row.tenderNumber || t('osp.openOffer')}
                                                <ArrowRight size={13} />
                                            </button>
                                        ) : (
                                            <span className="ofi-osp-sub">
                                                {row.requestId ? t('osp.feed.held') : t('osp.feed.notHeld')}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={Math.min(page, Math.max(1, totalPages))}
                        totalPages={Math.max(1, totalPages)}
                        total={total}
                        pageSize={PAGE_SIZE}
                        onPage={setPage}
                    />
                </div>
            </SectionCard>
        </div>
    );
};

export default OspFeedTable;
