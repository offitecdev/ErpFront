import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, RotateCcw, Sparkles, XCircle } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import i18n from '@/i18n';
import type { ProductionTask, TaskFileAnalysis, TaskFileAnalysisResult, TaskSubtask, TaskSubtaskFile } from '@/types/productionTasks';

import { formatMoment, isAnalysisActive, type SubtaskActions } from './subtaskFileModel';

/**
 * ── KI-PRÜFUNG DER PDFs (01.10.2026, Vorgabe Samet) ─────────────────────────
 *
 * «It will send the analysis report and we will show a button under document
 *  standards in the approve the files modal. Each PDF will have its analysis …
 *  the employees should also be able to see the AI analysis results under
 *  their subtasks.» Ein Zeichen je Datei (läuft · erfüllt · nicht erfüllt ·
 * unklar · gescheitert) und der Bericht: Zusammenfassung, dann je Standard
 * Urteil und Grund. Nur ein Rat — freigegeben wird von Hand.
 */

const RESULT_ICON: Record<TaskFileAnalysisResult, typeof CheckCircle2> = {
    MET: CheckCircle2,
    NOT_MET: XCircle,
    UNCLEAR: CircleHelp,
};

/** Die Standards der Unteraufgabe heute: Text und PDF (01.10.2026) — null ohne «Document» oder ohne Standards. */
type CurrentStandards = { text: string | null; fileRef: string | null };
const standardsOf = (subtask: TaskSubtask): CurrentStandards | null =>
    (subtask.requiresDocument && (subtask.documentStandards || subtask.documentStandardsFile)
        ? { text: subtask.documentStandards, fileRef: subtask.documentStandardsFile?.ref ?? null }
        : null);

/** Die Ursache einer gescheiterten Prüfung — bekannt übersetzt, sonst allgemein. */
const errorText = (code: string | null): string => {
    const key = `productionTasks.ai.errors.${code ?? ''}`;
    return code && i18n.exists(key) ? t(key) : t('productionTasks.ai.errors.generic');
};

/** Das Zeichen einer Prüfung: läuft, ihr Urteil oder gescheitert. */
export const AiAnalysisTag = ({ analysis }: { analysis: TaskFileAnalysis }) => {
    if (isAnalysisActive(analysis)) {
        return (
            <span className="ofi-ptk-aitag is-running">
                <Loader2 className="is-spinning" aria-hidden />
                {t(`productionTasks.ai.status.${analysis.status}`)}
            </span>
        );
    }
    if (analysis.status === 'FAILED') {
        return (
            <span className="ofi-ptk-aitag is-failed" title={errorText(analysis.errorCode)}>
                <AlertTriangle aria-hidden />
                {t('productionTasks.ai.status.FAILED')}
            </span>
        );
    }
    const verdict = analysis.verdict ?? 'UNCLEAR';
    const Icon = verdict === 'PASS' ? CheckCircle2 : verdict === 'FAIL' ? XCircle : CircleHelp;
    return (
        <span className={`ofi-ptk-aitag is-${verdict.toLowerCase()}`}>
            <Icon aria-hidden />
            {t(`productionTasks.ai.verdict.${verdict}`)}
        </span>
    );
};

/** Der Bericht einer Datei. `onRetry` nur für die Verwaltung. */
export const AiAnalysisDialog = ({
    file,
    analysis,
    currentStandards,
    onRetry,
    onClose,
}: {
    file: TaskSubtaskFile;
    analysis: TaskFileAnalysis;
    /** Die Standards der Unteraufgabe heute — weichen sie ab, sagt der Bericht es. */
    currentStandards: CurrentStandards | null;
    onRetry?: () => Promise<boolean>;
    onClose: () => void;
}) => {
    const [retrying, setRetrying] = useState(false);
    // Der Bericht in der Sprache, die gerade eingestellt ist (02.10.2026) — sonst wie gespeichert.
    const lang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2) as 'tr' | 'en' | 'de';
    const localized = analysis.i18n?.[lang] ?? null;
    const summary = localized?.summary ?? analysis.summary;
    const checks = analysis.checks.map((check, index) => ({
        ...check,
        standard: localized?.checks[index]?.standard || check.standard,
        reason: localized?.checks[index]?.reason || check.reason,
    }));
    const active = isAnalysisActive(analysis);
    const outdated = analysis.status === 'DONE' && Boolean(currentStandards) && ((currentStandards?.text ?? '') !== analysis.standards
        || (currentStandards?.fileRef ?? null) !== (analysis.standardsFileRef ?? null));
    const retry = async () => {
        if (!onRetry || retrying) return;
        setRetrying(true);
        await onRetry();
        setRetrying(false);
    };
    return (
        <PopupDialog
            closeOnBackdrop={false}
            open
            onClose={onClose}
            title={t('productionTasks.ai.title')}
            subtitle={`${file.name} · ${t('productionTasks.files.versionShort', { version: file.version || 1 })}`}
            icon={<Sparkles size={18} />}
            width={640}
            // Über «Approve the files» (z 800).
            z={850}
            footer={(
                <PopupActions
                    start={onRetry && !active && (analysis.status === 'FAILED' || outdated) ? (
                        <PopupButton loading={retrying} icon={<RotateCcw size={14} />} onClick={() => void retry()}>
                            {t('productionTasks.ai.rerun')}
                        </PopupButton>
                    ) : undefined}
                >
                    <PopupButton variant="primary" onClick={onClose}>{t('productionTasks.ai.close')}</PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-ptk-pop ofi-ptk-aireport">
                <div className="ofi-ptk-aireport__head">
                    <AiAnalysisTag analysis={analysis} />
                    {/* Nur wann — das Modell steht nicht auf der Karte (01.10.2026). */}
                    {analysis.finishedAt && <span className="ofi-ptk-aireport__meta">{formatMoment(analysis.finishedAt)}</span>}
                </div>
                {active && <p className="ofi-ptk-field__hint">{t('productionTasks.ai.runningHint')}</p>}
                {analysis.status === 'FAILED' && (
                    <p className="ofi-ptk-note is-info ofi-ptk-aireport__error" role="status">
                        <AlertTriangle aria-hidden />
                        <span>{errorText(analysis.errorCode)}</span>
                    </p>
                )}
                {outdated && (
                    <p className="ofi-ptk-note is-info" role="status">
                        <AlertTriangle aria-hidden />
                        <span>{t('productionTasks.ai.outdated')}</span>
                    </p>
                )}
                {analysis.status === 'DONE' && (
                    <>
                        {summary && (
                            <section className="ofi-ptk-complete__block">
                                <h3 className="ofi-ptk-complete__label">{t('productionTasks.ai.summary')}</h3>
                                <p className="ofi-ptk-aireport__summary">{summary}</p>
                            </section>
                        )}
                        <section className="ofi-ptk-complete__block">
                            <h3 className="ofi-ptk-complete__label">{t('productionTasks.ai.checks')}</h3>
                            <ul className="ofi-ptk-aireport__checks">
                                {checks.map((check, index) => {
                                    const Icon = RESULT_ICON[check.result];
                                    return (
                                        <li key={`${index}-${check.standard}`} className={`is-${check.result.toLowerCase()}`}>
                                            <Icon aria-hidden />
                                            <span>
                                                <b>{check.standard}</b>
                                                <em>{t(`productionTasks.ai.result.${check.result}`)}</em>
                                                {check.reason && <small>{check.reason}</small>}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    </>
                )}
                <p className="ofi-ptk-field__hint">{t('productionTasks.ai.advice')}</p>
            </div>
        </PopupDialog>
    );
};

/**
 * Nur «KI-Bericht ansehen» neben einer Datei der Unteraufgabe (01.10.2026: «only show view
 * AI report next to them») — läuft die Prüfung noch, dreht sich das Zeichen im Knopf.
 * Ohne Prüfung kein Knopf.
 */
export const AiReportButton = ({
    task,
    subtask,
    file,
    actions,
}: {
    task: ProductionTask;
    subtask: TaskSubtask;
    file: TaskSubtaskFile;
    actions: SubtaskActions;
}) => {
    const [open, setOpen] = useState(false);
    const analysis = file.analysis ?? null;
    /* Nach der Prüfung geht der Bericht von selbst auf (02.10.2026: «this analysis result modal
       should open automatically after analysis») — für wen die Datei hochgeladen hat, und nur,
       wenn er die Prüfung hier laufen sah (ein alter Bericht springt beim Öffnen nicht auf). */
    const active = isAnalysisActive(analysis);
    const [wasActive, setWasActive] = useState(active);
    if (wasActive !== active) {
        setWasActive(active);
        if (wasActive && !active && file.uploadedById === actions.meId) setOpen(true);
    }
    if (!analysis) return null;
    const retry = actions.retryAnalysis ? () => actions.retryAnalysis!(task, subtask, file) : undefined;
    return (
        <>
            <button
                type="button"
                className="ofi-ptk-btn is-small ofi-nosize ofi-ptk-aireportbtn"
                title={isAnalysisActive(analysis) ? t(`productionTasks.ai.status.${analysis.status}`) : undefined}
                onClick={() => setOpen(true)}
            >
                {isAnalysisActive(analysis) ? <Loader2 className="is-spinning" aria-hidden /> : <Sparkles aria-hidden />}
                {t('productionTasks.ai.open')}
            </button>
            {open && (
                <AiAnalysisDialog
                    file={file}
                    analysis={analysis}
                    currentStandards={standardsOf(subtask)}
                    onRetry={retry}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
};

/**
 * Das Zeichen einer Datei mit «Bericht ansehen» — beim Prüfen der Dateien.
 * Ohne Prüfung: für die Verwaltung «KI-Prüfung starten».
 */
export const AiAnalysisEntry = ({
    task,
    subtask,
    file,
    actions,
}: {
    task: ProductionTask;
    subtask: TaskSubtask;
    file: TaskSubtaskFile;
    actions: SubtaskActions;
}) => {
    const [open, setOpen] = useState(false);
    const [starting, setStarting] = useState(false);
    const analysis = file.analysis ?? null;
    const retry = actions.retryAnalysis ? () => actions.retryAnalysis!(task, subtask, file) : undefined;
    const start = async () => {
        if (!retry || starting) return;
        setStarting(true);
        await retry();
        setStarting(false);
    };
    if (!analysis) {
        if (!retry) return <p className="ofi-ptk-field__hint">{t('productionTasks.ai.notAnalysed')}</p>;
        return (
            <div className="ofi-ptk-aientry">
                <button type="button" className="ofi-ptk-btn is-small ofi-nosize" disabled={starting} onClick={() => void start()}>
                    {starting ? <Loader2 className="is-spinning" aria-hidden /> : <Sparkles aria-hidden />}
                    {t('productionTasks.ai.run')}
                </button>
            </div>
        );
    }
    return (
        <div className="ofi-ptk-aientry">
            <AiAnalysisTag analysis={analysis} />
            <button type="button" className="ofi-ptk-btn is-small ofi-nosize" onClick={() => setOpen(true)}>
                <Sparkles aria-hidden />
                {t('productionTasks.ai.open')}
            </button>
            {open && (
                <AiAnalysisDialog
                    file={file}
                    analysis={analysis}
                    currentStandards={standardsOf(subtask)}
                    onRetry={retry}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
};
