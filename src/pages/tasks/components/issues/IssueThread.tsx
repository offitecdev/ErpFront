import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { LuChevronDown, LuCircleAlert, LuCircleCheck, LuPaperclip, LuSend, LuTrash2 } from 'react-icons/lu';

import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { t } from '@/i18n/translate';
import { tasksErrorMessage } from '@/lib/api/tasksModule';
import type { PeopleMap, TaskIssue } from '@/types/tasksModule';
import { personName, smartDate, statusTone } from '../../utils/taskFormat';
import { TaskButton, TaskIconButton } from '../shared/TaskButton';
import { IssueBubble } from './IssueBubble';
import { IssueFileStrip } from './IssueFileStrip';
import { MentionField, mentionsOf, type Mention, type MentionPerson } from './MentionField';

const MAX_FILES = 10;

/**
 * EIN FADEN — ZUGEKLAPPT EINE ZEILE (16.09.2026, 3. Runde; Samet: «soru
 * başlıkları olup, aşağı oka tıklanırsa açılması lazım … bir soruyu açtık ya,
 * diğeri açılmamalı»).
 *
 * Zu sehen ist zuerst nur die ÜBERSCHRIFT in ihrer Farbe, daneben das
 * Ausrufezeichen, der Stand und die Zahl der Antworten. Der Pfeil klappt auf —
 * und immer nur EINEN Faden (die Liste hält den offenen fest, wie eine
 * Ziehharmonika).
 *
 * Aufgeklappt steht der Verlauf wie im Messenger: eigene Blasen rechts, fremde
 * links, je Tag eine Marke. Markiert wird mit «@» im Text — keine eigenen
 * Knöpfe. Wer antwortet, nimmt die fragende Person automatisch mit auf.
 *
 * Erledigt heisst bei einer FRAGE «Anlaşıldı», bei einem PROBLEM «Çözüldü» —
 * dieselbe Handlung, das richtige Wort.
 */
export const IssueThread = ({
    issue,
    people,
    me,
    mentionPeople,
    open,
    onToggle,
    focused,
    onReply,
    onResolve,
    onDelete,
}: {
    issue: TaskIssue;
    people: PeopleMap;
    /** Die eigene Kennung — sie entscheidet, welche Blase rechts steht. */
    me: string;
    /** Markierbar sind nur die Menschen DIESER Aufgabe. */
    mentionPeople: readonly MentionPerson[];
    open: boolean;
    onToggle: () => void;
    /** Aus der Mail gekommen (`?issue=`): der Faden wird hervorgehoben. */
    focused: boolean;
    onReply: (issueId: string, text: string, files: File[], personIds: string[]) => Promise<void>;
    onResolve: (issueId: string, resolved: boolean) => Promise<void>;
    onDelete: (issueId: string) => Promise<void>;
}) => {
    const tone = issue.kind === 'ISSUE' ? 'issue' : 'question';
    const done = issue.status === 'RESOLVED';
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [picked, setPicked] = useState<Mention[]>([]);
    const [sending, setSending] = useState(false);
    const [askDelete, setAskDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const rootRef = useRef<HTMLElement | null>(null);

    useLayoutEffect(() => {
        if (focused) rootRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [focused]);

    /** Namen und Titel, die in den Blasen als Markierung leuchten. */
    const mentionLabels = useMemo(() => [
        ...issue.people.map((person) => personName(people, person.employeeId)),
        ...issue.links.map((link) => link.title),
        ...mentionPeople.map((person) => person.name),
    ], [issue.links, issue.people, mentionPeople, people]);

    /** Der Verlauf mit Tagesmarken; `first/last` gruppiert Blasen derselben Person. */
    const rows = useMemo(() => issue.messages.map((message, index) => {
        const previous = issue.messages[index - 1];
        const next = issue.messages[index + 1];
        const day = new Date(message.createdAt).toDateString();
        return {
            message,
            own: message.authorId === me,
            newDay: !previous || new Date(previous.createdAt).toDateString() !== day,
            first: !previous || previous.authorId !== message.authorId
                || new Date(previous.createdAt).toDateString() !== day,
            last: !next || next.authorId !== message.authorId,
        };
    }), [issue.messages, me]);

    const addFiles = (list: FileList | File[] | null) => {
        const chosen = Array.from(list ?? []);
        if (!chosen.length) return;
        const next = [...files, ...chosen];
        if (next.length > MAX_FILES) toast.error(t('tasksModule.issues.tooManyFiles', { count: MAX_FILES }));
        setFiles(next.slice(0, MAX_FILES));
    };

    const send = async () => {
        if ((!text.trim() && !files.length) || sending) return;
        setSending(true);
        try {
            const mentions = mentionsOf(text, picked);
            await onReply(
                issue.id,
                text.trim(),
                files,
                mentions.filter((mention) => mention.kind === 'person').map((mention) => mention.id),
            );
            setText('');
            setFiles([]);
            setPicked([]);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setSending(false);
        }
    };

    const answers = Math.max(0, issue.messages.length - 1);

    return (
        <section
            ref={rootRef}
            id={`ofi-issue-${issue.id}`}
            className={`ofi-gv-issue is-${tone} ${done ? 'is-resolved' : ''} ${open ? 'is-open' : ''} ${focused ? 'is-focused' : ''}`}
        >
            {/* ZUGEKLAPPT: nur diese Zeile. Der ganze Kopf ist der Schalter. */}
            <button type="button" className="ofi-gv-issue__head ofi-btn-plain" aria-expanded={open} onClick={onToggle}>
                <span className={`ofi-gv-issue__kind is-${tone}`}>{t(`tasksModule.issues.kind.${issue.kind}`)}</span>
                <span className={`ofi-gv-issue__title is-${tone}`}>{issue.title}</span>
                {issue.important && (
                    <span className="ofi-gv-issue__bang" title={t('tasksModule.issues.importantHint')}>
                        <LuCircleAlert size={13} aria-hidden />
                        {t('tasksModule.issues.importantShort')}
                    </span>
                )}
                {done && (
                    <span className="ofi-gv-issue__done">
                        <LuCircleCheck size={13} aria-hidden />
                        {t(`tasksModule.issues.doneWord.${issue.kind}`)}
                    </span>
                )}
                <span className="flex-1" />
                {answers > 0 && <span className="ofi-gv-issue__count">{t('tasksModule.issues.answers', { count: answers })}</span>}
                <LuChevronDown className="ofi-gv-issue__chev" size={16} aria-hidden />
            </button>

            {open && (
                <div className="ofi-gv-issue__body">
                    <div className="ofi-gv-issue__tools">
                        {/* Wer angeschrieben wurde (die erste Markierung stand im An-Feld)
                            und welche Aufgaben im Faden stehen — zum Lesen, nicht zum Klicken. */}
                        {issue.people.map((person) => (
                            <span key={person.employeeId} className={`ofi-gv-issue-chip ${person.role === 'TO' ? 'is-to' : ''}`}>
                                {person.role === 'TO' && <b className="ofi-gv-issue-chip__role">{t('tasksModule.issues.roleTo')}</b>}
                                <span className="ofi-gv-issue-chip__name">{personName(people, person.employeeId)}</span>
                            </span>
                        ))}
                        {issue.links.map((link) => (
                            <Link key={link.taskId} to={`/tasks/${link.taskId}`} className="ofi-gv-issue-chip is-task" title={link.title}>
                                <i className={`ofi-gv-issue-dot is-${statusTone(link.status)}`} aria-hidden />
                                <span className="ofi-gv-issue-chip__name">{link.title}</span>
                            </Link>
                        ))}
                        <span className="flex-1" />
                        {issue.canResolve && (
                            <TaskIconButton
                                small
                                active={done}
                                label={done
                                    ? t('tasksModule.issues.reopen')
                                    : t(`tasksModule.issues.doneAction.${issue.kind}`)}
                                onClick={() => void onResolve(issue.id, !done)}
                            >
                                <LuCircleCheck size={14} />
                            </TaskIconButton>
                        )}
                        {issue.canDelete && (
                            <TaskIconButton small danger label={t('tasksModule.issues.delete')} onClick={() => setAskDelete(true)}>
                                <LuTrash2 size={13} />
                            </TaskIconButton>
                        )}
                    </div>

                    <div className="ofi-gv-issue__stream">
                        {rows.map((row) => (
                            <Fragment key={row.message.id}>
                                {row.newDay && (
                                    <div className="ofi-gv-issue__day"><span>{smartDate(row.message.createdAt)}</span></div>
                                )}
                                <IssueBubble
                                    message={row.message}
                                    people={people}
                                    tone={tone}
                                    own={row.own}
                                    first={row.first}
                                    last={row.last}
                                    mentionLabels={mentionLabels}
                                />
                            </Fragment>
                        ))}
                    </div>

                    {issue.canReply && (
                        <div className="ofi-gv-issue__replybox">
                            <MentionField
                                rows={2}
                                value={text}
                                onChange={setText}
                                onPick={(mention) => setPicked((current) => (
                                    current.some((entry) => entry.kind === mention.kind && entry.id === mention.id)
                                        ? current
                                        : [...current, mention]))}
                                known={picked}
                                people={mentionPeople}
                                placeholder={t('tasksModule.issues.replyPlaceholder')}
                                onSubmit={() => void send()}
                                onPasteFiles={(pasted) => addFiles(pasted)}
                            />
                            <IssueFileStrip files={files} onRemove={(index) => setFiles(files.filter((_, at) => at !== index))} />
                            <div className="ofi-gv-issue-new__actions">
                                <TaskIconButton label={t('tasksModule.issues.attach')} onClick={() => fileInputRef.current?.click()}>
                                    <LuPaperclip size={15} />
                                </TaskIconButton>
                                <span className="ofi-gv-issue-new__hint">{t('tasksModule.issues.replyHint')}</span>
                                <span className="flex-1" />
                                <TaskButton
                                    variant="primary"
                                    icon={<LuSend size={14} />}
                                    disabled={sending || (!text.trim() && !files.length)}
                                    onClick={() => void send()}
                                >
                                    {t('tasksModule.issues.sendReply')}
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
                </div>
            )}

            <ConfirmDialog
                open={askDelete}
                title={t('tasksModule.issues.deleteTitle')}
                message={t('tasksModule.issues.deleteMessage')}
                confirmLabel={t('common.delete')}
                tone="danger"
                busy={deleting}
                onConfirm={() => {
                    setDeleting(true);
                    void onDelete(issue.id)
                        .catch((error) => toast.error(tasksErrorMessage(error)))
                        .finally(() => { setDeleting(false); setAskDelete(false); });
                }}
                onCancel={() => setAskDelete(false)}
            />
        </section>
    );
};
