import { Link, useNavigate } from 'react-router-dom';
import { LuTriangleAlert } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { TaskDetail } from '@/types/tasksModule';
import { TaskButton } from '../shared/TaskButton';

/**
 * Gemeinsamer Aufbau einer Freigabe-Karte (Görevly `approve-card`): Titel als Link, eine graue Metazeile, das Zitat (Notiz/Beschreibung), eine
 * Warnzeile und die drei Knöpfe Detay · Reddet · Onayla.
 */
export const ApprovalCard = ({
    task,
    meta,
    quote,
    warning,
    busy,
    onReject,
    onApprove,
    approveLabel,
    rejectLabel,
}: {
    task: TaskDetail;
    /** Teile der Metazeile; leere fallen weg. */
    meta: Array<string | false | null | undefined>;
    quote?: string | null;
    warning?: string | null;
    busy: boolean;
    onReject: () => void;
    onApprove: () => void;
    /** Eigene Knopftexte (Görev-Talep: «Uygun» / «Uygun değil»). */
    approveLabel?: string;
    rejectLabel?: string;
}) => {
    const navigate = useNavigate();
    return (
        <article className="ofi-gv-approvals-card">
            <div className="ofi-gv-approvals-card__main">
                <Link to={`/tasks/${task.id}`} className="ofi-gv-approvals-card__title">{task.title}</Link>
                <div className="ofi-gv-approvals-card__meta">{meta.filter(Boolean).join(' · ')}</div>
                {quote && <blockquote className="ofi-gv-approvals-quote">{quote}</blockquote>}
                {warning && (
                    <div className="ofi-gv-approvals-warning">
                        <LuTriangleAlert size={13} aria-hidden />
                        <span>{warning}</span>
                    </div>
                )}
                <div className="ofi-gv-approvals-card__actions">
                    <TaskButton onClick={() => navigate(`/tasks/${task.id}`)}>{t('tasksModule.approvals.details')}</TaskButton>
                    <span className="ofi-gv-approvals-card__spacer" />
                    <TaskButton variant="danger" disabled={busy} onClick={onReject}>{rejectLabel ?? t('tasksModule.approvals.reject')}</TaskButton>
                    <TaskButton variant="primary" disabled={busy} onClick={onApprove}>{approveLabel ?? t('tasksModule.approvals.approve')}</TaskButton>
                </div>
            </div>
        </article>
    );
};
