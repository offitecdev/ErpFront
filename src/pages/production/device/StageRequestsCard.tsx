import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CheckCheck, Inbox, LockOpen, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionTaskErrorText, productionTasksApi } from '@/lib/api/productionTasks';
import type { TaskRequest, TaskRequestKind, TaskRequestList } from '@/types/productionTasks';

import { formatDateTime } from '../tasks/subtaskFileModel';

type Status = 'open' | 'solved' | 'all';
type KindFilter = 'all' | TaskRequestKind;

const STATUSES: readonly Status[] = ['open', 'solved', 'all'];
const KINDS: readonly KindFilter[] = ['all', 'APPROVAL', 'UNLOCK'];

/**
 * ── DIE ANFRAGEN EINER STUFE (30.09.2026, Vorgabe Samet) ────────────────────
 *
 * «Show this request under a new tab. To open this tab create a button under
 * the activities button. Requests should show the approvement requests and
 * unlock requests: who sent the request, when was it sent, for which subtask
 * under which task. To mark the requests as solved add a button.»
 *
 * Offen zuerst (umschaltbar: erledigt, alle), dazu die Art. Jede Zeile: die
 * Art, Unteraufgabe und Aufgabe, wer und wann, die Notiz — und «Mark as
 * solved». Erledigt steht, von wem, wann und wie (von Hand, durch Freigabe,
 * Rückgabe oder Entsperren). Jede bestätigte Änderung lädt nach.
 */
export const StageRequestsCard = ({
    deviceId,
    revision,
    area,
    stageKey,
    stageName,
    stageNameOf,
    onGoTo,
    onChanged,
    onClose,
}: {
    deviceId: string;
    /** Zählt die vom Server bestätigten Änderungen — jede lädt nach. */
    revision: number;
    /** Bereich und Stufe — null (30.09.2026): die Anfragen des ganzen Geräts, jede Zeile nennt ihre Stufe. */
    area: string | null;
    stageKey: string | null;
    stageName: string;
    /** Der Name einer Stufe — für die Liste des ganzen Geräts. */
    stageNameOf?: (area: string | null, stage: string | null) => string;
    /**
     * «Go to subtask» statt «Mark as solved» (30.09.2026, Startseite: «instead of mark as resolved
     * add go to subtask button») — dort, an der Unteraufgabe, handelt die Verwaltung.
     */
    onGoTo?: (request: TaskRequest) => void;
    /** Eine Anfrage wurde erledigt — die Zahl am Plättchen stimmt nicht mehr. */
    onChanged: () => void;
    onClose: () => void;
}) => {
    const [status, setStatus] = useState<Status>('open');
    const [kind, setKind] = useState<KindFilter>('all');
    const [tick, setTick] = useState(0);
    const [result, setResult] = useState<{ key: string; list: TaskRequestList | null; error: string | null } | null>(null);
    const [solving, setSolving] = useState<string | null>(null);

    const key = `${deviceId}|${area}|${stageKey}|${status}|${tick}|${revision}`;
    useEffect(() => {
        let cancelled = false;
        void productionTasksApi.requests(deviceId, area, stageKey, status).then(
            (list) => { if (!cancelled) setResult({ key, list, error: null }); },
            (failure: unknown) => {
                if (cancelled) return;
                setResult((current) => ({ key, list: current?.list ?? null, error: productionTaskErrorText(failure, 'productionTasks.requests.loadFailed') }));
            },
        );
        return () => { cancelled = true; };
    }, [deviceId, area, stageKey, status, key]);

    const list = result?.list ?? null;
    const loading = result === null;
    const busy = result !== null && result.key !== key;
    const error = result?.key === key ? result.error : null;
    const shown = useMemo(
        () => (list?.items ?? []).filter((entry) => kind === 'all' || entry.kind === kind),
        [list, kind],
    );

    const solve = async (request: TaskRequest) => {
        setSolving(request.id);
        try {
            await productionTasksApi.solveRequest(deviceId, request.id);
            toast.success(t('productionTasks.requests.solvedToast', { subtask: request.subtaskCode }));
            setTick((value) => value + 1);
            onChanged();
        } catch (failure) {
            toast.error(productionTaskErrorText(failure));
        } finally {
            setSolving(null);
        }
    };

    return (
        <section className="ofi-ptk-card ofi-ptk-stagefiles ofi-ptk-requests" aria-label={t('productionTasks.requests.region', { stage: stageName })}>
            <header className="ofi-ptk-card__head">
                <span className="ofi-ptk-stagefiles__icon is-requests" aria-hidden><Inbox /></span>
                <h3 className="ofi-ptk-card__title">
                    {t('productionTasks.requests.title')}
                    <small>{stageName}</small>
                </h3>
                {list && list.openCount > 0 && (
                    <span className="ofi-ptk-card__sum">
                        <b>{t('productionTasks.requests.openCount', { count: list.openCount })}</b>
                    </span>
                )}
                <button
                    type="button"
                    className="ofi-ptk-card__close ofi-nosize"
                    aria-label={t('productionTasks.stageFloat.close')}
                    title={t('productionTasks.stageFloat.close')}
                    onClick={onClose}
                >
                    <X aria-hidden />
                </button>
            </header>

            <div className="ofi-ptk-stagefiles__body">
                <div className="ofi-ptk-stagefiles__bar">
                    <div className="ofi-ptk-seg" role="group" aria-label={t('productionTasks.requests.statusLabel')}>
                        {STATUSES.map((value) => (
                            <button key={value} type="button" aria-pressed={status === value} className="ofi-ptk-seg__btn ofi-nosize" onClick={() => setStatus(value)}>
                                {t(`productionTasks.requests.status.${value}`)}
                            </button>
                        ))}
                    </div>
                    <div className="ofi-ptk-seg" role="group" aria-label={t('productionTasks.requests.kindLabel')}>
                        {KINDS.map((value) => (
                            <button key={value} type="button" aria-pressed={kind === value} className="ofi-ptk-seg__btn ofi-nosize" onClick={() => setKind(value)}>
                                {t(`productionTasks.requests.kindFilter.${value}`)}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <p className="ofi-ptk-card__empty is-activity">{t('productionTasks.activity.loading')}</p>
                ) : error && !list ? (
                    <div className="ofi-ptk-activity__error">
                        <p>{error}</p>
                        <button type="button" className="ofi-ptk-btn ofi-nosize" onClick={() => setTick((value) => value + 1)}>
                            {t('productionTasks.activity.retry')}
                        </button>
                    </div>
                ) : !shown.length ? (
                    <p className="ofi-ptk-card__empty is-activity">
                        {status === 'open' ? t('productionTasks.requests.emptyOpen') : t('productionTasks.requests.empty')}
                    </p>
                ) : (
                    <ol className={`ofi-ptk-requests__list ${busy ? 'is-busy' : ''}`} aria-busy={busy}>
                        {shown.map((request) => {
                            const solved = Boolean(request.solvedAt);
                            const Icon = request.kind === 'UNLOCK' ? LockOpen : Send;
                            return (
                                <li key={request.id} className={`ofi-ptk-request ${solved ? 'is-solved' : ''}`}>
                                    <span className={`ofi-ptk-request__kind is-${request.kind.toLowerCase()}`}>
                                        <Icon aria-hidden />
                                        {t(`productionTasks.requests.kind.${request.kind}`)}
                                    </span>
                                    <div className="ofi-ptk-request__main">
                                        <p className="ofi-ptk-request__what">
                                            {!stageKey && stageNameOf && <span className="ofi-ptk-act__stage">{stageNameOf(request.area, request.stage)}</span>}
                                            <b>{`${request.subtaskCode} · ${request.subtaskName}`}</b>
                                            <span>{t('productionTasks.requests.underTask', { task: `${request.taskCode} · ${request.taskName}` })}</span>
                                        </p>
                                        <p className="ofi-ptk-request__meta">
                                            {t('productionTasks.requests.sentBy', {
                                                name: request.requestedByName || t('productionTasks.activity.someone'),
                                                time: formatDateTime(request.createdAt),
                                            })}
                                        </p>
                                        {request.note && (
                                            <p className="ofi-ptk-actnote is-small">
                                                <span>{t('productionTasks.requests.unlockReason')}</span>
                                                {request.note}
                                            </p>
                                        )}
                                        {solved && (
                                            <p className="ofi-ptk-request__solved">
                                                <CheckCheck aria-hidden />
                                                {t(`productionTasks.requests.solvedBy.${request.resolution ?? 'MANUAL'}`, {
                                                    name: request.solvedByName || '—',
                                                    time: formatDateTime(request.solvedAt),
                                                })}
                                            </p>
                                        )}
                                    </div>
                                    {onGoTo ? (
                                        <button
                                            type="button"
                                            className="ofi-ptk-btn is-small ofi-ptk-request__solve ofi-nosize"
                                            onClick={() => onGoTo(request)}
                                        >
                                            <ArrowUpRight aria-hidden />
                                            {t('productionTasks.requests.goToSubtask')}
                                        </button>
                                    ) : !solved && (
                                        <button
                                            type="button"
                                            className="ofi-ptk-btn is-small ofi-ptk-request__solve ofi-nosize"
                                            disabled={solving === request.id}
                                            onClick={() => void solve(request)}
                                        >
                                            <CheckCheck aria-hidden />
                                            {t('productionTasks.requests.markSolved')}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        </section>
    );
};
