import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { LuTrash2, LuUpload, LuX } from 'react-icons/lu';

import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { Spinner } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { attachmentUrl, tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { TaskAttachment, TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useNow } from '../../hooks/useNow';
import { formatBytes, relativeTime } from '../../utils/taskFormat';
import { TaskIconButton } from '../shared/TaskButton';
import { AttachmentChip } from './AttachmentChip';

/**
 * Reiter «Dosyalar» (Görevly renderFiles): Ablagefläche (Klick oder Ziehen),
 * darunter Bilder als Raster und übrige Dateien als Liste. Hinzufügen und
 * Entfernen nur mit `permissions.canUpload`.
 */
export const FilesTab = ({ ctl, data }: { ctl: TaskDetailController; data: TaskDetailResult }) => {
    const { task, permissions, attachments } = data;
    const now = useNow(60_000);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [over, setOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [pendingRemove, setPendingRemove] = useState<TaskAttachment | null>(null);
    const [removing, setRemoving] = useState(false);
    const { addAttachments, removeAttachment, notify } = ctl;

    const images = attachments.filter((attachment) => attachment.isImage);
    const files = attachments.filter((attachment) => !attachment.isImage);

    const upload = async (list: File[]) => {
        if (!list.length || uploading) return;
        setUploading(true);
        try {
            const uploaded = await tasksApi.uploadAttachments(task.id, list);
            addAttachments(uploaded);
            notify('task', false);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setUploading(false);
        }
    };

    const remove = async () => {
        if (!pendingRemove) return;
        setRemoving(true);
        try {
            await tasksApi.deleteAttachment(pendingRemove.id);
            removeAttachment(pendingRemove.id);
            setPendingRemove(null);
            notify('task', false);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setRemoving(false);
        }
    };

    const onDrag = (event: DragEvent<HTMLDivElement>, entering: boolean) => {
        event.preventDefault();
        setOver(entering);
    };

    return (
        <section className="ofi-gv-panel ofi-gv-files">
            {permissions.canUpload && (
                <div
                    role="button"
                    tabIndex={0}
                    className={`ofi-gv-files-drop ${over ? 'is-over' : ''} ${uploading ? 'is-busy' : ''}`}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            inputRef.current?.click();
                        }
                    }}
                    onDragEnter={(event) => onDrag(event, true)}
                    onDragOver={(event) => onDrag(event, true)}
                    onDragLeave={(event) => onDrag(event, false)}
                    onDrop={(event) => {
                        onDrag(event, false);
                        void upload(Array.from(event.dataTransfer.files ?? []));
                    }}
                >
                    <span className="ofi-gv-files-drop__icon">{uploading ? <Spinner size="sm" /> : <LuUpload size={18} />}</span>
                    <span className="ofi-gv-files-drop__text">{uploading ? t('tasksModule.files.uploading') : t('tasksModule.files.dropText')}</span>
                    <span className="ofi-gv-caption">{t('tasksModule.files.dropHint')}</span>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        hidden
                        onChange={(event) => {
                            const list = Array.from(event.target.files ?? []);
                            event.target.value = '';
                            void upload(list);
                        }}
                    />
                </div>
            )}

            {images.length > 0 && (
                <div className="ofi-gv-files-section">
                    <div className="ofi-gv-group__head">{t('tasksModule.files.images')}<span className="ofi-gv-count">{images.length}</span></div>
                    <div className="ofi-gv-files-grid">
                        {images.map((attachment) => (
                            <figure key={attachment.id} className="ofi-gv-files-thumb">
                                <a href={attachmentUrl(attachment)} target="_blank" rel="noopener noreferrer" title={attachment.fileName}>
                                    <img src={attachmentUrl(attachment)} alt={attachment.fileName} loading="lazy" />
                                </a>
                                {permissions.canUpload && (
                                    <button
                                        type="button"
                                        className="ofi-gv-files-thumb__remove ofi-btn-plain"
                                        aria-label={t('tasksModule.files.remove')}
                                        title={t('tasksModule.files.remove')}
                                        onClick={() => setPendingRemove(attachment)}
                                    >
                                        <LuX size={12} />
                                    </button>
                                )}
                            </figure>
                        ))}
                    </div>
                </div>
            )}

            {files.length > 0 && (
                <div className="ofi-gv-files-section">
                    <div className="ofi-gv-group__head">{t('tasksModule.files.files')}<span className="ofi-gv-count">{files.length}</span></div>
                    <div className="ofi-gv-files-list">
                        {files.map((attachment) => (
                            <AttachmentChip
                                key={attachment.id}
                                attachment={attachment}
                                meta={`${formatBytes(attachment.sizeBytes)} · ${relativeTime(attachment.createdAt, now)}`}
                                extra={permissions.canUpload ? (
                                    <TaskIconButton small danger label={t('tasksModule.files.remove')} onClick={() => setPendingRemove(attachment)}>
                                        <LuTrash2 size={13} />
                                    </TaskIconButton>
                                ) : undefined}
                            />
                        ))}
                    </div>
                </div>
            )}

            {!attachments.length && !permissions.canUpload && <div className="ofi-gv-empty">{t('tasksModule.files.empty')}</div>}

            <ConfirmDialog
                open={pendingRemove !== null}
                title={t('tasksModule.files.removeTitle')}
                message={pendingRemove?.fileName}
                confirmLabel={t('tasksModule.files.remove')}
                tone="danger"
                busy={removing}
                onConfirm={() => void remove()}
                onCancel={() => setPendingRemove(null)}
            />
        </section>
    );
};
