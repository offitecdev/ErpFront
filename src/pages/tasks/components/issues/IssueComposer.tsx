import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { LuCircleAlert, LuPaperclip, LuSend } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { tasksErrorMessage } from '@/lib/api/tasksModule';
import type { IssueKind } from '@/types/tasksModule';
import { TaskButton, TaskIconButton } from '../shared/TaskButton';
import { IssueFileStrip } from './IssueFileStrip';
import { MentionField, mentionsOf, type Mention, type MentionPerson } from './MentionField';

const MAX_FILES = 10;

/**
 * DAS FENSTER, IN DEM EINE FRAGE ENTSTEHT (16.09.2026, 2. Runde).
 *
 * Oben die Überschrift — sie ist das farbige Etikett über dem Faden und steht
 * später als Kopf auf der Mailkarte. Darunter die Frage selbst; markiert wird
 * DARIN mit «@» (Vorgabe Samet: «böyle ayrı butonlar falan olmasın»).
 *
 * WER ZUERST GENANNT WIRD, BEKOMMT DIE MAIL ins An-Feld — alle weiteren in
 * Kopie. Die Reihenfolge liest `mentionsOf` aus dem fertigen Satz, nicht aus
 * der Klickreihenfolge: wer eine Markierung wieder herauslöscht, schreibt ihr
 * auch nicht mehr.
 *
 * Das Ausrufezeichen macht die Frage wichtig: rot auf der Karte, «❗» im
 * Betreff und die Prioritätsköpfe der Mail.
 */
export const IssueComposer = ({
    kind,
    mentionPeople,
    busy,
    onCancel,
    onSubmit,
}: {
    kind: IssueKind;
    /** Markierbar sind nur die Menschen DIESER Aufgabe. */
    mentionPeople: readonly MentionPerson[];
    busy: boolean;
    onCancel: () => void;
    onSubmit: (
        input: { kind: IssueKind; title: string; text: string; important: boolean; personIds: string[]; taskIds: string[] },
        files: File[],
    ) => Promise<void>;
}) => {
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [important, setImportant] = useState(false);
    const [picked, setPicked] = useState<Mention[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const addFiles = (list: FileList | File[] | null) => {
        const chosen = Array.from(list ?? []);
        if (!chosen.length) return;
        const next = [...files, ...chosen];
        if (next.length > MAX_FILES) toast.error(t('tasksModule.issues.tooManyFiles', { count: MAX_FILES }));
        setFiles(next.slice(0, MAX_FILES));
    };

    const send = async () => {
        const cleanTitle = title.trim();
        const cleanText = text.trim();
        if (!cleanTitle) {
            toast.error(t('tasksModule.issues.titleRequired'));
            return;
        }
        if (!cleanText && !files.length) {
            toast.error(t('tasksModule.issues.textRequired'));
            return;
        }
        const mentions = mentionsOf(text, picked);
        try {
            await onSubmit({
                kind,
                title: cleanTitle,
                text: cleanText,
                important,
                personIds: mentions.filter((mention) => mention.kind === 'person').map((mention) => mention.id),
                taskIds: mentions.filter((mention) => mention.kind === 'task').map((mention) => mention.id),
            }, files);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        }
    };

    return (
        <section className={`ofi-gv-issue-new is-${kind === 'ISSUE' ? 'issue' : 'question'}`}>
            <input
                autoFocus
                value={title}
                maxLength={160}
                className="ofi-gv-issue-new__title"
                placeholder={t(`tasksModule.issues.titlePlaceholder.${kind}`)}
                aria-label={t('tasksModule.issues.titleLabel')}
                onChange={(event) => setTitle(event.target.value)}
            />
            <MentionField
                value={text}
                onChange={setText}
                onPick={(mention) => setPicked((current) => (
                    current.some((entry) => entry.kind === mention.kind && entry.id === mention.id)
                        ? current
                        : [...current, mention]))}
                known={picked}
                people={mentionPeople}
                placeholder={t(`tasksModule.issues.textPlaceholder.${kind}`)}
                onSubmit={() => void send()}
                onPasteFiles={(pasted) => addFiles(pasted)}
            />
            <IssueFileStrip files={files} onRemove={(index) => setFiles(files.filter((_, at) => at !== index))} />

            <div className="ofi-gv-issue-new__actions">
                <TaskIconButton label={t('tasksModule.issues.attach')} onClick={() => fileInputRef.current?.click()}>
                    <LuPaperclip size={15} />
                </TaskIconButton>
                <TaskIconButton
                    active={important}
                    className={important ? 'ofi-gv-issue-bang-on' : ''}
                    label={t('tasksModule.issues.important')}
                    onClick={() => setImportant(!important)}
                >
                    <LuCircleAlert size={15} />
                </TaskIconButton>
                <span className="ofi-gv-issue-new__hint">
                    {important ? t('tasksModule.issues.importantHint') : t('tasksModule.issues.mentionHint')}
                </span>
                <span className="flex-1" />
                <TaskButton onClick={onCancel} disabled={busy}>{t('common.cancel')}</TaskButton>
                <TaskButton
                    variant="primary"
                    icon={<LuSend size={14} />}
                    disabled={busy || !title.trim() || (!text.trim() && !files.length)}
                    onClick={() => void send()}
                >
                    {t('tasksModule.issues.send')}
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
        </section>
    );
};
