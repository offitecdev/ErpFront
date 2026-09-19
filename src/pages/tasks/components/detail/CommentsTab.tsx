import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LuPaperclip, LuSend, LuTrash2, LuX } from 'react-icons/lu';

import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { t } from '@/i18n/translate';
import { attachmentUrl, tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { PeopleMap, TaskComment, TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useNow } from '../../hooks/useNow';
import { useTasksActorId } from '../../store/tasksModuleStore';
import { clipboardFiles } from '../../utils/clipboardFiles';
import { formatBytes, formatDayTime, personName, relativeTime } from '../../utils/taskFormat';
import { TaskButton, TaskIconButton } from '../shared/TaskButton';
import { AttachmentChip } from './AttachmentChip';

const MAX_FILES = 10;

/**
 * Reiter «Yorumlar» (Görevly renderComments): Verlauf aufsteigend, darunter
 * das Eingabefeld mit Büroklammer. Strg/⌘+Enter sendet. Löschen dürfen die
 * Verfassenden und die Leitung (`comment.canDelete` vom Server).
 */
export const CommentsTab = ({ ctl, data }: { ctl: TaskDetailController; data: TaskDetailResult }) => {
    const { task, permissions } = data;
    const me = useTasksActorId();
    const now = useNow(60_000);
    const [comments, setComments] = useState<TaskComment[]>(data.comments);
    const [people, setPeople] = useState<PeopleMap>(data.people);
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [sending, setSending] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<TaskComment | null>(null);
    const [deleting, setDeleting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const { setComments: setDetailComments, notify } = ctl;

    useEffect(() => {
        setComments(data.comments);
        setPeople(data.people);
        // Nur beim Wechsel der Aufgabe neu initialisieren. Lokale Antworten
        // bleiben beim stillen Nachladen erhalten, bis der Reiter neu oeffnet.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task.id]);

    useLayoutEffect(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.style.height = 'auto';
        element.style.height = `${Math.min(element.scrollHeight + 2, 200)}px`;
    }, [text]);

    const allPeople = { ...data.people, ...people };

    const send = async () => {
        const body = text.trim();
        if ((!body && !files.length) || sending) return;
        setSending(true);
        try {
            const result = await tasksApi.addComment(task.id, body, files);
            const next = [...comments, result.comment];
            setComments(next);
            setDetailComments(next);
            setPeople((current) => ({ ...current, ...result.people }));
            setText('');
            setFiles([]);
            notify('task', false);
            textareaRef.current?.focus();
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setSending(false);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await tasksApi.deleteComment(pendingDelete.id);
            const next = comments.filter((comment) => comment.id !== pendingDelete.id);
            setComments(next);
            setDetailComments(next);
            setPendingDelete(null);
            notify('task', false);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setDeleting(false);
        }
    };

    const addFiles = (list: FileList | File[] | null) => {
        const chosen = Array.from(list ?? []);
        if (!chosen.length) return;
        const next = [...files, ...chosen];
        if (next.length > MAX_FILES) toast.error(t('tasksModule.comments.tooManyFiles', { count: MAX_FILES }));
        setFiles(next.slice(0, MAX_FILES));
    };

    return (
        <section className="ofi-gv-panel ofi-gv-comments">
            <div className="ofi-gv-comments__list">
                {!comments.length && (
                    <div className="ofi-gv-empty">{t('tasksModule.comments.empty')}</div>
                )}
                {comments.map((comment) => {
                    const images = comment.attachments.filter((attachment) => attachment.isImage);
                    const others = comment.attachments.filter((attachment) => !attachment.isImage);
                    return (
                        <article key={comment.id} className={`ofi-gv-comments__item ${comment.authorId === me ? 'is-own' : ''}`}>
                            <div className="ofi-gv-comments__body">
                                <header className="ofi-gv-comments__head">
                                    <span className="ofi-gv-comments__author">{personName(allPeople, comment.authorId)}</span>
                                    <time className="ofi-gv-caption" dateTime={comment.createdAt} title={formatDayTime(comment.createdAt)}>
                                        {relativeTime(comment.createdAt, now)}
                                    </time>
                                    <span className="flex-1" />
                                    {comment.canDelete && (
                                        <TaskIconButton small danger label={t('tasksModule.comments.delete')} onClick={() => setPendingDelete(comment)}>
                                            <LuTrash2 size={13} />
                                        </TaskIconButton>
                                    )}
                                </header>
                                {comment.text && <div className="ofi-gv-comments__text">{comment.text}</div>}
                                {images.length > 0 && (
                                    <div className="ofi-gv-comments__images">
                                        {images.map((attachment) => (
                                            <a key={attachment.id} href={attachmentUrl(attachment)} target="_blank" rel="noopener noreferrer" title={attachment.fileName}>
                                                <img src={attachmentUrl(attachment)} alt={attachment.fileName} loading="lazy" />
                                            </a>
                                        ))}
                                    </div>
                                )}
                                {others.length > 0 && (
                                    <div className="ofi-gv-comments__files">
                                        {others.map((attachment) => <AttachmentChip key={attachment.id} attachment={attachment} />)}
                                    </div>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>

            {permissions.canComment && (
                <div className="ofi-gv-comments__composer">
                    <textarea
                        ref={textareaRef}
                        rows={2}
                        value={text}
                        maxLength={5000}
                        placeholder={t('tasksModule.comments.placeholder')}
                        aria-label={t('tasksModule.comments.placeholder')}
                        className="ofi-gv-comments__input"
                        onChange={(event) => setText(event.target.value)}
                        onPaste={(event) => {
                            // Kopiertes Bild (Strg/⌘+V) wird Anhang des Kommentars; Text fügt sich normal ein.
                            const pasted = clipboardFiles(event.clipboardData);
                            if (!pasted.length) return;
                            event.preventDefault();
                            addFiles(pasted);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                event.preventDefault();
                                void send();
                            }
                        }}
                    />
                    {files.length > 0 && (
                        <div className="ofi-gv-comments__pending">
                            {files.map((file, index) => (
                                <span key={`${file.name}-${index}`} className="ofi-gv-comments__pendingfile" title={file.name}>
                                    <span className="truncate">{file.name}</span>
                                    <span className="ofi-gv-caption">{formatBytes(file.size)}</span>
                                    <button
                                        type="button"
                                        className="ofi-gv-label__remove ofi-btn-plain"
                                        aria-label={t('tasksModule.comments.removeFile', { name: file.name })}
                                        onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}
                                    >
                                        <LuX size={11} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="ofi-gv-comments__actions">
                        <TaskIconButton label={t('tasksModule.comments.attach')} onClick={() => fileInputRef.current?.click()}>
                            <LuPaperclip size={15} />
                        </TaskIconButton>
                        <span className="ofi-gv-caption ofi-gv-comments__hint">{t('tasksModule.comments.shortcut')}</span>
                        <span className="flex-1" />
                        <TaskButton
                            variant="primary"
                            icon={<LuSend size={14} />}
                            disabled={sending || (!text.trim() && !files.length)}
                            onClick={() => void send()}
                        >
                            {t('tasksModule.comments.send')}
                        </TaskButton>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        hidden
                        onChange={(event) => {
                            addFiles(event.target.files);
                            event.target.value = '';
                        }}
                    />
                </div>
            )}

            <ConfirmDialog
                open={pendingDelete !== null}
                title={t('tasksModule.comments.deleteTitle')}
                message={t('tasksModule.comments.deleteMessage')}
                confirmLabel={t('common.delete')}
                tone="danger"
                busy={deleting}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </section>
    );
};
