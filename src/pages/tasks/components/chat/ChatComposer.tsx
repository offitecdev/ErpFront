import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { LuPaperclip, LuSendHorizontal, LuX } from 'react-icons/lu';
import { toast } from 'sonner';

import { Spinner } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { formatBytes } from '../../utils/taskFormat';
import { TaskButton, TaskIconButton } from '../shared/TaskButton';
import { MAX_CHAT_FILE_BYTES, MAX_CHAT_FILES } from './chatFormat';

const MAX_INPUT_PX = 120;

/**
 * Eingabe unten im Raum: wachsendes Textfeld (bis 120px), Enter sendet,
 * Umschalt+Enter bricht um. Dateien über die Büroklammer, Einfügen oder
 * Hineinziehen (höchstens 10, je 12 MB) — als entfernbare Chips über dem Feld.
 * Während des Sendens gesperrt; der Text bleibt stehen, wenn es scheitert.
 */
export const ChatComposer = ({
    sending,
    autoFocus,
    onSend,
}: {
    sending: boolean;
    autoFocus: boolean;
    onSend: (text: string, files: File[]) => Promise<boolean>;
}) => {
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    useLayoutEffect(() => {
        const element = inputRef.current;
        if (!element) return;
        // border-box: die Rahmenbreite gehört zur Höhe dazu.
        const frame = element.offsetHeight - element.clientHeight;
        element.style.height = 'auto';
        element.style.height = `${Math.min(MAX_INPUT_PX, element.scrollHeight + frame)}px`;
    }, [text]);

    const addFiles = (incoming: File[]) => {
        if (!incoming.length) return;
        const accepted: File[] = [];
        for (const file of incoming) {
            if (file.size > MAX_CHAT_FILE_BYTES) {
                toast.error(t('tasksModule.chat.composer.fileTooLarge', { name: file.name }));
                continue;
            }
            accepted.push(file);
        }
        const free = MAX_CHAT_FILES - files.length;
        if (accepted.length > free) toast.error(t('tasksModule.chat.composer.tooManyFiles', { max: MAX_CHAT_FILES }));
        const taken = accepted.slice(0, Math.max(0, free));
        if (taken.length) setFiles([...files, ...taken]);
    };

    const submit = async () => {
        if (sending) return;
        const trimmed = text.trim();
        if (!trimmed && !files.length) return;
        const sent = await onSend(trimmed, files);
        if (!sent) return;
        setText('');
        setFiles([]);
        inputRef.current?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
        event.preventDefault();
        void submit();
    };

    const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
        const pasted = Array.from(event.clipboardData.files);
        if (!pasted.length) return;
        if (!event.clipboardData.types.includes('text/plain')) event.preventDefault();
        addFiles(pasted);
    };

    const onDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        addFiles(Array.from(event.dataTransfer.files));
    };

    const canSend = !sending && (text.trim().length > 0 || files.length > 0);

    return (
        <div className="ofi-gv-chat-composer" onDragOver={onDragOver} onDrop={onDrop}>
            {files.length > 0 && (
                <div className="ofi-gv-chat-composer__files">
                    {files.map((file, index) => (
                        <span key={`${file.name}-${file.size}-${index}`} className="ofi-gv-chat-pending" title={file.name}>
                            <LuPaperclip size={12} aria-hidden />
                            <span className="ofi-gv-chat-pending__name">{file.name}</span>
                            <span className="ofi-gv-chat-pending__size">{formatBytes(file.size)}</span>
                            <button
                                type="button"
                                className="ofi-gv-chat-pending__remove ofi-btn-plain"
                                aria-label={t('tasksModule.chat.composer.removeFile', { name: file.name })}
                                disabled={sending}
                                onClick={() => setFiles((previous) => previous.filter((_, position) => position !== index))}
                            >
                                <LuX size={11} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="ofi-gv-chat-composer__row">
                <TaskIconButton
                    label={t('tasksModule.chat.composer.attach')}
                    disabled={sending || files.length >= MAX_CHAT_FILES}
                    onClick={() => fileRef.current?.click()}
                >
                    <LuPaperclip size={15} />
                </TaskIconButton>
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(event) => {
                        addFiles(Array.from(event.target.files ?? []));
                        event.target.value = '';
                    }}
                />
                <textarea
                    ref={inputRef}
                    rows={1}
                    value={text}
                    maxLength={5000}
                    autoFocus={autoFocus}
                    readOnly={sending}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                    placeholder={t('tasksModule.chat.composer.placeholder')}
                    aria-label={t('tasksModule.chat.composer.placeholder')}
                    className="ofi-gv-chat-composer__input"
                />
                <TaskButton
                    variant="primary"
                    className="ofi-gv-chat-composer__send"
                    disabled={!canSend}
                    aria-label={t('tasksModule.chat.composer.send')}
                    title={t('tasksModule.chat.composer.send')}
                    onClick={() => void submit()}
                    icon={sending ? <Spinner size="sm" /> : <LuSendHorizontal size={14} />}
                />
            </div>
        </div>
    );
};
