import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleAlert, CircleCheck, Clock3, FileSpreadsheet, FileUp, Inbox, ShieldCheck, TriangleAlert, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import { readWarehouseCatalog, warehouseApi, warehouseErrorText } from '@/lib/api/warehouse';
import { useAuthStore } from '@/store/authStore';
import type {
    WarehouseCatalog,
    WarehouseImportDetail,
    WarehouseImportIssue,
    WarehouseImportList,
    WarehouseImportPreview,
    WarehouseImportRow,
    WarehouseImportRowInput,
    WarehouseImportStatus,
    WarehouseImportSummary,
} from '@/types/warehouse';

import { templateTexts } from '../export/exportTexts';
import { fmtQuantity } from '../warehouseFormat';

/** Mehr Zeilen zeichnet die Tabelle nicht auf einmal (die Zählung stimmt trotzdem). */
const RENDER_LIMIT = 400;

type RowFilter = 'all' | 'errors' | 'warnings';

const hasError = (row: WarehouseImportRow) => row.issues.some((issue) => issue.level === 'error');
const hasWarning = (row: WarehouseImportRow) => row.issues.some((issue) => issue.level === 'warning');

/** Die Meldung zu einem Problem einer Zeile, in der Sprache der Oberfläche. */
const issueText = (issue: WarehouseImportIssue): string => {
    const key = `warehouse.importIssue.${issue.code}`;
    if (i18n.exists(key)) return t(key, issue.params ?? {});
    const fallback = `warehouse.err.${issue.code}`;
    return i18n.exists(fallback) ? t(fallback, issue.params ?? {}) : issue.code;
};

const fmtDateTime = (value: string | null): string => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const StatusPill = ({ status }: { status: WarehouseImportStatus }) => (
    <span className={`ofi-wh-pill is-${status.toLowerCase()}`}>
        {status === 'PENDING' ? <Clock3 /> : status === 'DONE' ? <CircleCheck /> : status === 'REJECTED' ? <CircleAlert /> : <X />}
        {t(`warehouse.imports.status.${status}`)}
    </span>
);

/** Die Zeilen eines Aktarım: Filter «alle / Fehler / Hinweise» und die Tabelle. */
const RowsTable = ({ rows }: { rows: WarehouseImportRow[] }) => {
    const [filter, setFilter] = useState<RowFilter>('all');
    const errors = rows.filter(hasError).length;
    const warnings = rows.filter((row) => !hasError(row) && hasWarning(row)).length;
    const shown = rows.filter((row) => (filter === 'errors' ? hasError(row) : filter === 'warnings' ? !hasError(row) && hasWarning(row) : true));
    return (
        <div className="ofi-wh-importrows">
            <div className="ofi-wh-seg is-small" role="radiogroup" aria-label={t('warehouse.imports.filter')}>
                {([
                    ['all', t('warehouse.imports.filterAll', { count: rows.length })],
                    ['errors', t('warehouse.imports.filterErrors', { count: errors })],
                    ['warnings', t('warehouse.imports.filterWarnings', { count: warnings })],
                ] as Array<[RowFilter, string]>).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={filter === key}
                        className={`ofi-nosize ${filter === key ? 'is-on' : ''}`}
                        onClick={() => setFilter(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className="ofi-wh-tablewrap is-static">
                <div className="ofi-wh-tablescroll">
                    <table className="ofi-wh-table is-import" data-unstyled-table>
                        <colgroup>
                            <col style={{ width: 60 }} />
                            <col style={{ width: '21%' }} />
                            <col />
                            <col style={{ width: '16%' }} />
                            <col style={{ width: 76 }} />
                            <col style={{ width: '24%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="is-num"><span className="ofi-wh-th is-static">{t('warehouse.imports.columns.row')}</span></th>
                                <th><span className="ofi-wh-th is-static">{t('warehouse.fields.materialGroup')}</span></th>
                                <th><span className="ofi-wh-th is-static">{t('warehouse.columns.name')}</span></th>
                                <th><span className="ofi-wh-th is-static">{t('warehouse.add.brandModel')}</span></th>
                                <th className="is-num"><span className="ofi-wh-th is-static">{t('warehouse.columns.quantity')}</span></th>
                                <th><span className="ofi-wh-th is-static">{t('warehouse.imports.columns.status')}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {!shown.length && (
                                <tr><td colSpan={6} className="ofi-wh-cell-sub" style={{ textAlign: 'center' }}>{t('warehouse.imports.noRows')}</td></tr>
                            )}
                            {shown.slice(0, RENDER_LIMIT).map((row) => {
                                const error = row.issues.find((issue) => issue.level === 'error');
                                const warning = row.issues.find((issue) => issue.level === 'warning');
                                return (
                                    <tr key={row.row} className={error ? 'is-bad' : ''}>
                                        <td className="is-num ofi-wh-cell-sub">{row.row}</td>
                                        <td title={row.groupLabel ?? row.group ?? undefined}>
                                            {row.groupLabel ?? row.group ?? <span className="ofi-wh-empty-cell">—</span>}
                                        </td>
                                        <td className="is-name" title={row.name}>{row.name || <span className="ofi-wh-empty-cell">—</span>}</td>
                                        <td className="ofi-wh-cell-sub">{[row.brand, row.modelNumber].filter(Boolean).join(' · ') || '—'}</td>
                                        <td className="is-num">{row.serialRequired ? <span className="ofi-wh-sn">{t('warehouse.products.serialBadge')}</span> : fmtQuantity(row.quantity)}</td>
                                        <td className="ofi-wh-issuecell" title={row.issues.map(issueText).join('\n') || undefined}>
                                            {error ? (
                                                <span className="ofi-wh-issue is-error"><CircleAlert />{issueText(error)}</span>
                                            ) : warning ? (
                                                <span className="ofi-wh-issue is-warning"><TriangleAlert />{issueText(warning)}</span>
                                            ) : (
                                                <span className="ofi-wh-issue is-ok"><CircleCheck />{t('warehouse.imports.ready')}</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            {shown.length > RENDER_LIMIT && (
                <span className="ofi-wh-row__hint">{t('warehouse.imports.renderLimit', { shown: RENDER_LIMIT, total: shown.length })}</span>
            )}
        </div>
    );
};

/**
 * Ein Aktarım im Fenster. Wartet er und liest die Verwaltung: «Aktarılsın
 * mı?» mit Aktar / Reddet; die einreichende Person kann ihn zurückziehen.
 */
const ImportDialog = ({
    id,
    onClose,
    onDecided,
}: {
    id: string;
    onClose: () => void;
    onDecided: () => void;
}) => {
    const isAdmin = useAuthStore((state) => state.isSystemAdmin);
    const userId = useAuthStore((state) => state.user?.id ?? null);
    const [detail, setDetail] = useState<WarehouseImportDetail | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [busy, setBusy] = useState<'approve' | 'reject' | 'cancel' | null>(null);
    const [rejecting, setRejecting] = useState(false);
    const [note, setNote] = useState('');

    useEffect(() => {
        let alive = true;
        warehouseApi.importDetail(id)
            .then((value) => { if (alive) setDetail(value); })
            .catch((error) => { if (alive) setFailure(warehouseErrorText(error)); });
        return () => { alive = false; };
    }, [id]);

    const pending = detail?.status === 'PENDING';
    const errors = detail ? detail.rows.filter(hasError).length : 0;
    const importable = detail ? detail.rows.length - errors : 0;
    const mine = Boolean(detail && userId && detail.requestedBy.id === userId);

    const approve = async () => {
        if (!detail || busy) return;
        setBusy('approve');
        try {
            const { result } = await warehouseApi.approveImport(detail.id);
            toast.success(t('warehouse.imports.approved', { count: result.created }), {
                ...(result.firstCode ? { description: t('warehouse.imports.codeRange', { first: result.firstCode, last: result.lastCode ?? result.firstCode }) } : {}),
            });
            onDecided();
            onClose();
        } catch (error) {
            toast.error(warehouseErrorText(error));
        } finally {
            setBusy(null);
        }
    };

    const reject = async () => {
        if (!detail || busy) return;
        setBusy('reject');
        try {
            await warehouseApi.rejectImport(detail.id, note.trim());
            toast.success(t('warehouse.imports.rejected'));
            onDecided();
            onClose();
        } catch (error) {
            toast.error(warehouseErrorText(error));
        } finally {
            setBusy(null);
        }
    };

    const cancel = async () => {
        if (!detail || busy) return;
        setBusy('cancel');
        try {
            await warehouseApi.cancelImport(detail.id);
            toast.success(t('warehouse.imports.cancelled'));
            onDecided();
            onClose();
        } catch (error) {
            toast.error(warehouseErrorText(error));
        } finally {
            setBusy(null);
        }
    };

    const title = pending && isAdmin ? t('warehouse.imports.approveTitle') : t('warehouse.imports.detailTitle');
    const footer = !detail ? undefined : pending && isAdmin ? (
        rejecting ? (
            <PopupActions start={<PopupButton onClick={() => setRejecting(false)} disabled={Boolean(busy)}>{t('warehouse.actions.cancel')}</PopupButton>}>
                <PopupButton variant="danger" loading={busy === 'reject'} onClick={() => void reject()}>{t('warehouse.imports.reject')}</PopupButton>
            </PopupActions>
        ) : (
            <PopupActions start={<PopupButton variant="danger" onClick={() => setRejecting(true)} disabled={Boolean(busy)}>{t('warehouse.imports.reject')}</PopupButton>}>
                <PopupButton onClick={onClose} disabled={Boolean(busy)}>{t('warehouse.actions.close')}</PopupButton>
                <PopupButton variant="primary" loading={busy === 'approve'} disabled={!importable} onClick={() => void approve()}>
                    {t('warehouse.imports.approve', { count: importable })}
                </PopupButton>
            </PopupActions>
        )
    ) : (
        <PopupActions start={pending && mine ? (
            <PopupButton variant="danger" loading={busy === 'cancel'} onClick={() => void cancel()}>{t('warehouse.imports.cancel')}</PopupButton>
        ) : undefined}
        >
            <PopupButton variant="primary" onClick={onClose}>{t('warehouse.actions.close')}</PopupButton>
        </PopupActions>
    );

    return (
        <PopupDialog
            open
            onClose={onClose}
            title={title}
            subtitle={detail ? `${detail.fileName ?? 'Excel'} · ${t('warehouse.imports.rows', { count: detail.rowCount })}` : undefined}
            icon={<ShieldCheck size={18} />}
            tone={pending ? 'warning' : 'neutral'}
            width={980}
            footer={footer}
        >
            <div className="ofi-wh-pop ofi-wh-importdialog">
                {!detail && !failure && <div className="ofi-wh-state"><span className="ofi-wh-spinner" /></div>}
                {failure && <div className="ofi-wh-note is-error">{failure}</div>}
                {detail && (
                    <>
                        <dl className="ofi-wh-facts">
                            <dt>{t('warehouse.imports.columns.status')}</dt>
                            <dd><StatusPill status={detail.status} /></dd>
                            <dt>{t('warehouse.imports.requestedBy')}</dt>
                            <dd>{[detail.requestedBy.name, fmtDateTime(detail.createdAt)].filter(Boolean).join(' · ')}</dd>
                            {detail.decidedBy && (
                                <>
                                    <dt>{t('warehouse.imports.decidedBy')}</dt>
                                    <dd>{[detail.decidedBy.name, fmtDateTime(detail.decidedAt)].filter(Boolean).join(' · ')}</dd>
                                </>
                            )}
                            {detail.note && (
                                <>
                                    <dt>{t('warehouse.imports.note')}</dt>
                                    <dd>{detail.note}</dd>
                                </>
                            )}
                            {detail.result && (
                                <>
                                    <dt>{t('warehouse.imports.result')}</dt>
                                    <dd>
                                        {t('warehouse.imports.resultLine', { created: detail.result.created, skipped: detail.result.skipped })}
                                        {detail.result.firstCode && ` · ${t('warehouse.imports.codeRange', { first: detail.result.firstCode, last: detail.result.lastCode ?? detail.result.firstCode })}`}
                                    </dd>
                                </>
                            )}
                        </dl>
                        {pending && isAdmin && (
                            <div className={`ofi-wh-note ${errors ? 'is-warn' : 'is-ok'}`}>
                                <ShieldCheck />
                                <span>
                                    {t('warehouse.imports.approveText', { count: importable })}
                                    {errors > 0 && ` ${t('warehouse.imports.approveErrors', { count: errors })}`}
                                </span>
                            </div>
                        )}
                        {pending && !isAdmin && (
                            <div className="ofi-wh-note is-warn">
                                <Clock3 />
                                <span>{t('warehouse.imports.waitingAdmin')}</span>
                            </div>
                        )}
                        {rejecting && (
                            <label className="ofi-wh-rejectnote">
                                <span>{t('warehouse.imports.rejectNote')}</span>
                                <textarea
                                    className="ofi-wh-input"
                                    value={note}
                                    rows={2}
                                    maxLength={500}
                                    autoFocus
                                    onChange={(event) => setNote(event.target.value)}
                                />
                            </label>
                        )}
                        <RowsTable rows={detail.rows} />
                    </>
                )}
            </div>
        </PopupDialog>
    );
};

/**
 * ── AYARLAR › EXCEL AKTARIMI (26.09.2026, Vorgabe Samet) ────────────────────
 *
 * «Bana Excel örneği indirme yeri olması lazım … malzeme grubu seçilebilir
 *  olması lazım. Bir de biz bunları aktarmamız lazım, ama her aktarımdan önce
 *  toplu aktarım administratöre izin gitmesi lazım — Excel seçim aktarılacak
 *  ama izin bekleniyor; izin verildiğinde olması lazım: aktarılsın mı diye?»
 *
 *   1. Vorlage herunterladen (Gruppe, Währung, Seriennummer als Auswahl).
 *   2. Datei wählen: die Zeilen werden gelesen und am Server geprüft — jede
 *      Zeile zeigt «hazır», einen Hinweis oder den Fehler.
 *   3. «Onaya gönder»: die guten Zeilen warten, die Verwaltung bekommt die
 *      Glocke; der Aktarım steht als «İzin bekleniyor» in der Liste.
 *   4. Die Verwaltung öffnet ihn: «Aktarılsın mı?» — Aktar oder Reddet.
 */
export const ImportsTab = ({ canManage, onChanged }: { canManage: boolean; onChanged: () => void }) => {
    const [params, setParams] = useSearchParams();
    const isAdmin = useAuthStore((state) => state.isSystemAdmin);
    const userId = useAuthStore((state) => state.user?.id ?? null);
    const [list, setList] = useState<WarehouseImportList | null>(null);
    const [listFailed, setListFailed] = useState<string | null>(null);
    const [listTick, setListTick] = useState(0);
    const [catalog, setCatalog] = useState<WarehouseCatalog | null>(null);
    const [upload, setUpload] = useState<{ fileName: string; rows: WarehouseImportRowInput[]; preview: WarehouseImportPreview } | null>(null);
    const [reading, setReading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [templating, setTemplating] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const openId = params.get('import');

    useEffect(() => {
        let alive = true;
        warehouseApi.imports()
            .then((value) => { if (alive) { setList(value); setListFailed(null); } })
            .catch((error) => { if (alive) setListFailed(warehouseErrorText(error, 'warehouse.err.loadFailed')); });
        return () => { alive = false; };
    }, [listTick]);

    useEffect(() => readWarehouseCatalog(
        (value) => setCatalog(value),
        () => setCatalog({ categories: [], ungroupedCount: 0 }),
    ), []);

    const refresh = useCallback(() => {
        setListTick((value) => value + 1);
        onChanged();
    }, [onChanged]);

    const openImport = (id: string | null) => setParams((current) => {
        const next = new URLSearchParams(current);
        if (id) next.set('import', id);
        else next.delete('import');
        return next;
    }, { replace: !id });

    const groupCount = useMemo(
        () => (catalog?.categories ?? []).reduce((sum, category) => sum + category.groups.filter((group) => group.code).length, 0),
        [catalog],
    );

    const downloadTemplate = async () => {
        if (!catalog || templating) return;
        setTemplating(true);
        try {
            const excel = await import('../export/warehouseExcel');
            excel.downloadTemplate(catalog, templateTexts());
        } catch (error) {
            toast.error(warehouseErrorText(error, 'warehouse.pdf.failed'));
        } finally {
            setTemplating(false);
        }
    };

    const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setReading(true);
        try {
            const excel = await import('../export/warehouseExcel');
            const parsed = await excel.parseImportFile(file);
            if (!parsed) {
                toast.error(t('warehouse.imports.noSheet'));
                return;
            }
            if (!parsed.rows.length) {
                toast.error(t('warehouse.err.IMPORT_EMPTY'));
                return;
            }
            const preview = await warehouseApi.previewImport(parsed.rows);
            setUpload({ fileName: file.name, rows: parsed.rows, preview });
        } catch (error) {
            toast.error(warehouseErrorText(error, 'warehouse.imports.readFailed'));
        } finally {
            setReading(false);
        }
    };

    const submit = async () => {
        if (!upload || submitting) return;
        setSubmitting(true);
        try {
            const result = await warehouseApi.requestImport(upload.fileName, upload.rows);
            toast.success(t('warehouse.imports.submitted'), {
                description: result.skipped ? t('warehouse.imports.submittedSkipped', { count: result.skipped }) : t('warehouse.imports.submittedHint'),
            });
            setUpload(null);
            refresh();
        } catch (error) {
            toast.error(warehouseErrorText(error));
        } finally {
            setSubmitting(false);
        }
    };

    const cancelRequest = async (entry: WarehouseImportSummary) => {
        try {
            await warehouseApi.cancelImport(entry.id);
            toast.success(t('warehouse.imports.cancelled'));
            refresh();
        } catch (error) {
            toast.error(warehouseErrorText(error));
        }
    };

    return (
        <div className="ofi-wh-imports">
            <div className="ofi-wh-form">
                <section className="ofi-wh-group">
                    <h2 className="ofi-wh-group__title">{t('warehouse.imports.templateTitle')}</h2>
                    <div className="ofi-wh-group__box ofi-wh-actioncard">
                        <span className="ofi-wh-actioncard__icon"><FileSpreadsheet /></span>
                        <span className="ofi-wh-actioncard__text">
                            <b>{t('warehouse.imports.templateHead')}</b>
                            <small>{t('warehouse.imports.templateHint')}</small>
                            {catalog && !groupCount && <small className="is-warn">{t('warehouse.imports.templateNoGroups')}</small>}
                        </span>
                        <button type="button" className="ofi-wh-btn ofi-nosize" disabled={!catalog || templating} onClick={() => void downloadTemplate()}>
                            {templating ? <span className="ofi-wh-spinner" aria-hidden /> : <FileSpreadsheet />}
                            {t('warehouse.imports.templateDownload')}
                        </button>
                    </div>
                </section>

                <section className="ofi-wh-group">
                    <h2 className="ofi-wh-group__title">{t('warehouse.imports.uploadTitle')}</h2>
                    <div className="ofi-wh-group__box ofi-wh-actioncard">
                        <span className="ofi-wh-actioncard__icon is-accent"><FileUp /></span>
                        <span className="ofi-wh-actioncard__text">
                            <b>{t('warehouse.imports.uploadHead')}</b>
                            <small>{t('warehouse.imports.uploadHint')}</small>
                        </span>
                        <input
                            ref={fileRef}
                            type="file"
                            hidden
                            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                            onChange={(event) => void onFile(event)}
                        />
                        <button
                            type="button"
                            className="ofi-wh-btn is-primary ofi-nosize"
                            disabled={!canManage || reading}
                            title={canManage ? undefined : t('warehouse.err.forbidden')}
                            onClick={() => fileRef.current?.click()}
                        >
                            {reading ? <span className="ofi-wh-spinner" aria-hidden /> : <Upload />}
                            {reading ? t('warehouse.imports.reading') : t('warehouse.imports.choose')}
                        </button>
                    </div>
                </section>
            </div>

            {upload && (
                <section className="ofi-wh-group ofi-wh-uploadpreview">
                    <div className="ofi-wh-uploadpreview__head">
                        <h2 className="ofi-wh-group__title">{upload.fileName}</h2>
                        <span className="ofi-wh-pill is-done"><CircleCheck />{t('warehouse.imports.validCount', { count: upload.preview.valid })}</span>
                        {upload.preview.invalid > 0 && (
                            <span className="ofi-wh-pill is-rejected"><CircleAlert />{t('warehouse.imports.invalidCount', { count: upload.preview.invalid })}</span>
                        )}
                        {upload.preview.warnings > 0 && (
                            <span className="ofi-wh-pill is-pending"><TriangleAlert />{t('warehouse.imports.warningCount', { count: upload.preview.warnings })}</span>
                        )}
                        <span className="ofi-wh-spacer" />
                        <button type="button" className="ofi-wh-btn ofi-nosize" onClick={() => setUpload(null)} disabled={submitting}>
                            {t('warehouse.actions.cancel')}
                        </button>
                        <button
                            type="button"
                            className="ofi-wh-btn is-primary ofi-nosize"
                            disabled={!upload.preview.valid || submitting}
                            onClick={() => void submit()}
                        >
                            <ShieldCheck />
                            {submitting ? t('warehouse.actions.saving') : t('warehouse.imports.submit', { count: upload.preview.valid })}
                        </button>
                    </div>
                    <p className="ofi-wh-row__hint">
                        {upload.preview.invalid > 0
                            ? t('warehouse.imports.invalidHint', { count: upload.preview.invalid })
                            : t('warehouse.imports.approvalHint')}
                    </p>
                    <RowsTable rows={upload.preview.rows} />
                </section>
            )}

            <section className="ofi-wh-group">
                <h2 className="ofi-wh-group__title">{t('warehouse.imports.listTitle')}</h2>
                <div className="ofi-wh-group__box ofi-wh-requests">
                    {!list && !listFailed && <div className="ofi-wh-state is-small"><span className="ofi-wh-spinner" /></div>}
                    {listFailed && <div className="ofi-wh-state is-small is-error"><b>{listFailed}</b></div>}
                    {list && !list.items.length && (
                        <div className="ofi-wh-state is-small">
                            <Inbox />
                            <b>{t('warehouse.imports.listEmpty')}</b>
                        </div>
                    )}
                    {list?.items.map((entry) => {
                        const mine = Boolean(userId && entry.requestedBy.id === userId);
                        return (
                            <div key={entry.id} className={`ofi-wh-request ${entry.status === 'PENDING' ? 'is-pending' : ''}`}>
                                <StatusPill status={entry.status} />
                                <button type="button" className="ofi-wh-request__main ofi-nosize" onClick={() => openImport(entry.id)}>
                                    <b>{entry.fileName ?? 'Excel'}</b>
                                    <small>
                                        {[
                                            t('warehouse.imports.rows', { count: entry.rowCount }),
                                            entry.requestedBy.name,
                                            fmtDateTime(entry.createdAt),
                                        ].filter(Boolean).join(' · ')}
                                        {entry.result && ` · ${t('warehouse.imports.resultLine', { created: entry.result.created, skipped: entry.result.skipped })}`}
                                    </small>
                                </button>
                                <span className="ofi-wh-request__actions">
                                    {entry.status === 'PENDING' && mine && !isAdmin && (
                                        <button type="button" className="ofi-wh-btn is-small is-quiet ofi-nosize" onClick={() => void cancelRequest(entry)}>
                                            {t('warehouse.imports.cancel')}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={`ofi-wh-btn is-small ofi-nosize ${entry.status === 'PENDING' && isAdmin ? 'is-primary' : ''}`}
                                        onClick={() => openImport(entry.id)}
                                    >
                                        {entry.status === 'PENDING' && isAdmin ? t('warehouse.imports.review') : t('warehouse.imports.open')}
                                    </button>
                                </span>
                            </div>
                        );
                    })}
                </div>
            </section>

            {openId && <ImportDialog id={openId} onClose={() => openImport(null)} onDecided={refresh} />}
        </div>
    );
};
