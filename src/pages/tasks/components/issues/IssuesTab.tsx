import { useEffect, useMemo, useState } from 'react';
import { LuPlus } from 'react-icons/lu';

import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import type { IssueKind, TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useTaskIssues } from '../../hooks/useTaskIssues';
import { useTasksActorId } from '../../store/tasksModuleStore';
import { personName } from '../../utils/taskFormat';
import { TaskButton } from '../shared/TaskButton';
import { IssueComposer } from './IssueComposer';
import { IssueThread } from './IssueThread';
import type { MentionPerson } from './MentionField';

/**
 * ── REITER «SORULAR & SORUNLAR» (16.09.2026, Vorgabe Samet) ─────────────────
 *
 * Zwei Reiter in EINER Kapsel — genau die, an der im Kalender Termin und
 * Besprechung gewählt werden («hani randevu toplantı seçim yeri var ya»):
 * Sorular (Fragen) und Sorunlar (Probleme). Darunter die Fäden untereinander,
 * der zuletzt beantwortete zuunterst.
 *
 * `focusIssueId` kommt aus der Mail (`/tasks/:id?issue=…`): der Reiter stellt
 * sich auf die richtige Art und rollt den Faden in die Mitte.
 */
export const IssuesTab = ({
    ctl,
    data,
    focusIssueId,
    onOpenCount,
}: {
    ctl: TaskDetailController;
    data: TaskDetailResult;
    focusIssueId: string | null;
    /** Die Marke am Reiter zählt mit, ohne dass die Seite neu lädt. */
    onOpenCount: (open: number) => void;
}) => {
    const { task, permissions } = data;
    const issues = useTaskIssues(task.id, true);
    const me = useTasksActorId();
    const [kind, setKind] = useState<IssueKind>('QUESTION');
    /* EINER auf einmal (Samet: «bir soruyu açtık ya, diğeri açılmamalı»): der
       offene Faden steht hier, ein Klick auf einen anderen schliesst ihn. */
    const [openId, setOpenId] = useState<string | null>(null);
    const [composing, setComposing] = useState(false);
    const [busy, setBusy] = useState(false);
    const { notify } = ctl;

    // Aus der Mail gekommen: die Kapsel stellt sich auf die Art DIESES Fadens — und er klappt auf.
    useEffect(() => {
        if (!focusIssueId) return;
        const found = issues.issues.find((issue) => issue.id === focusIssueId);
        if (found) {
            setKind(found.kind);
            setOpenId(found.id);
        }
    }, [focusIssueId, issues.issues]);

    /* OFFENES ZUERST, darin das zuletzt Bewegte oben — was noch hängt, soll man
       nicht suchen müssen; Erledigtes sinkt nach unten. (Die BLASEN innerhalb
       eines Fadens stehen weiterhin chronologisch untereinander.) */
    const shown = useMemo(
        () => issues.issues
            .filter((issue) => issue.kind === kind)
            .sort((left, right) => (left.status === right.status
                ? right.lastMessageAt.localeCompare(left.lastMessageAt)
                : (left.status === 'OPEN' ? -1 : 1))),
        [issues.issues, kind],
    );

    const counts = useMemo(() => ({
        QUESTION: issues.issues.filter((issue) => issue.kind === 'QUESTION' && issue.status === 'OPEN').length,
        ISSUE: issues.issues.filter((issue) => issue.kind === 'ISSUE' && issue.status === 'OPEN').length,
    }), [issues.issues]);

    useEffect(() => {
        if (!issues.loading) onOpenCount(counts.QUESTION + counts.ISSUE);
    }, [counts, issues.loading, onOpenCount]);

    /* MARKIERBAR SIND NUR DIE MENSCHEN DIESER AUFGABE (Vorgabe Samet: «sadece
       görevdeki kişileri etiketleyebilirsiniz»): Verantwortliche, die anlegende
       Person — und wer in einem Faden schon markiert ist oder darin geschrieben
       hat, denn sonst könnte man der eigenen Gegenüberin nicht antworten.
       Aufgaben sind dagegen ALLE markierbar, auch diese (die Suche im «@»). */
    const mentionPeople = useMemo<MentionPerson[]>(() => {
        const ids = new Set<string>([...task.assigneeIds, task.createdById]);
        for (const issue of issues.issues) {
            ids.add(issue.authorId);
            for (const person of issue.people) ids.add(person.employeeId);
            for (const message of issue.messages) ids.add(message.authorId);
        }
        ids.delete(me);
        const all = { ...data.people, ...issues.people };
        return [...ids]
            .filter(Boolean)
            .map((id) => ({ id, name: personName(all, id), title: all[id]?.title ?? null }))
            .filter((person) => Boolean(person.name))
            .sort((left, right) => left.name.localeCompare(right.name));
    }, [data.people, issues.issues, issues.people, me, task.assigneeIds, task.createdById]);

    /* Jede Schreibhandlung frischt die Aufgabe mit auf: an ihr hängt die Marke
       am Reiter (offene Fragen) und der Verlauf. */
    const after = () => notify('task', false);

    return (
        <section className="ofi-gv-panel ofi-gv-issues">
            <div className="ofi-gv-issues__bar">
                <div className="ofi-gv-issues__seg" role="tablist" aria-label={t('tasksModule.issues.tabsLabel')}>
                    {(['QUESTION', 'ISSUE'] as IssueKind[]).map((option) => (
                        <button
                            key={option}
                            type="button"
                            role="tab"
                            aria-selected={kind === option}
                            className={`ofi-gv-issues__segbtn ofi-btn-plain ${kind === option ? 'is-active' : ''} is-${option === 'ISSUE' ? 'issue' : 'question'}`}
                            onClick={() => { setKind(option); setComposing(false); setOpenId(null); }}
                        >
                            {t(`tasksModule.issues.tab.${option}`)}
                            {counts[option] > 0 && <span className="ofi-gv-count">{counts[option]}</span>}
                        </button>
                    ))}
                </div>
                <span className="flex-1" />
                {permissions.canComment && !composing && (
                    <TaskButton variant="primary" icon={<LuPlus size={14} />} onClick={() => setComposing(true)}>
                        {t(`tasksModule.issues.new.${kind}`)}
                    </TaskButton>
                )}
            </div>

            {composing && (
                <IssueComposer
                    kind={kind}
                    mentionPeople={mentionPeople}
                    busy={busy}
                    onCancel={() => setComposing(false)}
                    onSubmit={async (input, files) => {
                        setBusy(true);
                        try {
                            const created = await issues.create(input, files);
                            setOpenId(created.id);
                            setComposing(false);
                            after();
                        } finally {
                            setBusy(false);
                        }
                    }}
                />
            )}

            {issues.loading && !issues.issues.length && <LoadingPanel />}

            {!issues.loading && !shown.length && !composing && (
                <div className="ofi-gv-empty">{t(`tasksModule.issues.empty.${kind}`)}</div>
            )}

            <div className="ofi-gv-issues__list">
                {shown.map((issue) => (
                    <IssueThread
                        key={issue.id}
                        issue={issue}
                        people={{ ...data.people, ...issues.people }}
                        me={me}
                        mentionPeople={mentionPeople}
                        open={openId === issue.id}
                        onToggle={() => setOpenId((current) => (current === issue.id ? null : issue.id))}
                        focused={issue.id === focusIssueId}
                        onReply={async (issueId, text, files, personIds) => {
                            await issues.reply(issueId, text, files, personIds);
                            after();
                        }}
                        onResolve={async (issueId, resolved) => {
                            await issues.setResolved(issueId, resolved);
                            after();
                        }}
                        onDelete={async (issueId) => {
                            await issues.remove(issueId);
                            after();
                        }}
                    />
                ))}
            </div>
        </section>
    );
};
