import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Check, Edit01, Trash01 } from '@/components/icons/antIconCompat';
import { PersonAvatar } from '@/components/ui-shared/PersonAvatar';
import { ReportImageUploader } from '@/components/ui-shared/ReportImageUploader';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { inputClass } from '@/components/ui-shared/Field';
import { t } from '@/i18n/translate';
import { crmApi, type CrmTaskDetail, type CrmTaskNote } from '@/lib/api/crm';
import { useAuthStore } from '@/store/authStore';
import { StaffMultiCombo } from '../components/StaffMultiCombo';
import { formatCrmDate, formatCrmDateTime, personName, taskStatusLabel, taskStatusVariant } from '../utils/crmFormat.utils';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2">
        <span className="w-36 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">{label}</span>
        <div className="min-w-0 flex-1 text-[13px] text-slate-800 dark:text-white/90">{children}</div>
    </div>
);

/**
 * Die Aufgabenseite (/crm/tasks/:id): Kopf mit Status, zuweisender Person,
 * Verantwortlichen und Terminen, darunter der Verlauf aus Notizen mit Bildern
 * und die Erfassung einer neuen Notiz.
 *
 * Ohne Freigabe (19.08.2026): abhaken erledigt die Aufgabe — auch die, die
 * jemand anderes zugewiesen hat.
 */
export const TaskDetailPage = () => {
    const { id = '' } = useParams();
    const user = useAuthStore((state) => state.user);
    const permissions = useAuthStore((state) => state.permissions);
    const canManage = permissions.includes('crm.activities.create');

    const [task, setTask] = useState<CrmTaskDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [noteImages, setNoteImages] = useState<string[]>([]);
    const [savingNote, setSavingNote] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setTask(await crmApi.getTask(id));
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setError(message || t('crm.tasks.errorLoad'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    const isCreator = Boolean(task && user && task.createdBy?.id === user.id);
    const isAssignee = Boolean(task && user && task.assignees.some((person) => person.id === user.id));
    const participant = isCreator || isAssignee;
    const done = task?.status === 'DONE';

    /* ERST DAS BLATT, DANN DER SERVER — wie überall beim Abhaken: der Haken
       sitzt sofort, die Anfrage läuft im Hintergrund, und scheitert sie,
       springt der Zustand zurück (12.09.2026). Vorher stand die Seite
       unverändert da, bis die Antwort kam. */
    const setStatus = async (status: 'DONE' | 'OPEN') => {
        if (!task) return;
        const previous = { status: task.status, completedAt: task.completedAt ?? null };
        setTask((current) => (current
            ? { ...current, status, completedAt: status === 'DONE' ? new Date().toISOString() : null }
            : current));
        setBusy(true);
        try {
            const saved = await crmApi.updateTask(task.id, { status });
            setTask((current) => current ? { ...current, status: saved.status ?? status, completedAt: saved.completedAt ?? null } : current);
        } catch {
            setTask((current) => (current ? { ...current, ...previous } : current));
            toast.error(t('crm.tasks.updateError'));
        } finally {
            setBusy(false);
        }
    };

    const saveAssignees = async (next: Array<{ id: string; firstName: string; lastName: string }>) => {
        if (!task) return;
        const previous = task.assignees;
        setTask((current) => current ? { ...current, assignees: next } : current);
        try {
            await crmApi.updateTask(task.id, { assigneeEmployeeIds: next.map((person) => person.id) });
        } catch {
            setTask((current) => current ? { ...current, assignees: previous } : current);
            toast.error(t('crm.tasks.updateError'));
        }
    };

    const addNote = async () => {
        if (!task || (!noteText.trim() && noteImages.length === 0)) return;
        setSavingNote(true);
        try {
            const note = await crmApi.addTaskNote(task.id, { text: noteText.trim(), images: noteImages });
            setTask((current) => current ? { ...current, notes: [...current.notes, note] } : current);
            setNoteText('');
            setNoteImages([]);
        } catch {
            toast.error(t('crm.tasks.noteSaveError'));
        } finally {
            setSavingNote(false);
        }
    };

    const removeNote = async (note: CrmTaskNote) => {
        if (!task) return;
        const previous = task.notes;
        setTask((current) => current ? { ...current, notes: current.notes.filter((row) => row.id !== note.id) } : current);
        try {
            await crmApi.deleteTaskNote(task.id, note.id);
        } catch {
            setTask((current) => current ? { ...current, notes: previous } : current);
            toast.error(t('crm.tasks.updateError'));
        }
    };

    if (loading && !task) {
        return <div className="ofi-shimmer h-64 rounded-2xl bg-slate-100 dark:bg-white/5" />;
    }
    if (error || !task) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-[13px] text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {error || t('crm.tasks.errorLoad')}
            </div>
        );
    }

    return (
        <div className="flex w-full flex-col gap-4">
            {/* Zurück zur Aufgabenwoche: oben links in der Marke. */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="ofi-serif whitespace-pre-line text-[21px] font-semibold tracking-tight text-slate-900 dark:text-white">{task.title}</h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-500 dark:text-white/55">
                            <StatusChip variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</StatusChip>
                            {/* Wer sie zugewiesen hat — der Name gehört auf die
                                Aufgabe, nicht nur auf die Karte der Woche. */}
                            <span>{t('crm.tasks.assignedBy', { name: personName(task.createdBy) })} · {formatCrmDate(task.createdAt)}</span>
                        </div>
                    </div>
                    {participant || canManage ? (
                        <div className="flex shrink-0 items-center gap-2">
                            {!done && (
                                <button type="button" disabled={busy} onClick={() => void setStatus('DONE')} className="ofi-btn-brand inline-flex h-9 items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#1f2654] disabled:opacity-60">
                                    <Check size={14} />
                                    {t('crm.tasks.markDone')}
                                </button>
                            )}
                            {done && (
                                <button type="button" disabled={busy} onClick={() => void setStatus('OPEN')} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/10">
                                    {t('crm.tasks.reopen')}
                                </button>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="mt-4 divide-y divide-slate-100 dark:divide-white/10">
                    <Row label={t('crm.tasks.colCustomer')}>
                        {task.customer ? (
                            <>
                                <span>{task.customer.companyName}</span>
                                {task.contact && <span className="text-slate-500 dark:text-white/50"> · {personName(task.contact)}</span>}
                            </>
                        ) : <span className="text-slate-400">—</span>}
                    </Row>
                    <Row label={t('crm.tasks.colDue')}>{task.dueDate ? formatCrmDate(task.dueDate) : <span className="text-slate-400">—</span>}</Row>
                    <Row label={t('crm.tasks.colAssignee')}>
                        {isCreator || canManage ? (
                            <StaffMultiCombo value={task.assignees} onChange={(next) => void saveAssignees(next)} compact />
                        ) : task.assignees.length ? (
                            <div className="flex flex-wrap items-center gap-2">
                                {task.assignees.map((person) => (
                                    <span key={person.id} className="inline-flex items-center gap-1.5">
                                        <PersonAvatar id={person.id} name={personName(person)} size={20} ring={false} tone="subtle" />
                                        {personName(person)}
                                    </span>
                                ))}
                            </div>
                        ) : <span className="text-slate-400">—</span>}
                    </Row>
                    {task.completedAt && (
                        <Row label={t('crm.tasks.completedAt')}>{formatCrmDateTime(task.completedAt)}</Row>
                    )}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
                <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-slate-900 dark:text-white">
                    <Edit01 size={15} />
                    {t('crm.tasks.notesTitle')}
                    <span className="text-[12px] font-semibold text-slate-400">{task.notes.length}</span>
                </h2>

                {task.notes.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-[12.5px] text-slate-400 dark:border-white/15 dark:text-white/40">
                        {t('crm.tasks.notesEmpty')}
                    </div>
                )}
                <div className="space-y-3">
                    {task.notes.map((note) => (
                        <article key={note.id} className="ofi-tasknote">
                            <PersonAvatar id={note.author?.id} name={note.author ? personName(note.author) : ''} size={30} ring={false} tone="subtle" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-[12px]">
                                    <span className="font-semibold text-slate-800 dark:text-white/90">{note.author ? personName(note.author) : '—'}</span>
                                    <span className="text-slate-400 dark:text-white/40">{formatCrmDateTime(note.createdAt)}</span>
                                    {(note.author?.id === user?.id || canManage) && (
                                        <button type="button" onClick={() => void removeNote(note)} aria-label={t('common.delete')} className="ml-auto text-slate-300 transition-colors hover:text-red-600 dark:text-white/30">
                                            <Trash01 size={13} />
                                        </button>
                                    )}
                                </div>
                                {note.text && <p className="mt-1 whitespace-pre-line break-words text-[13px] text-slate-800 dark:text-white/85">{note.text}</p>}
                                {note.images.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {note.images.map((src, index) => (
                                            <button key={index} type="button" onClick={() => setLightbox(src)} className="h-24 w-24 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
                                                <img src={src} alt="" className="h-full w-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </article>
                    ))}
                </div>

                {(participant || canManage) && (
                    <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                        <textarea
                            value={noteText}
                            onChange={(event) => setNoteText(event.target.value)}
                            rows={3}
                            placeholder={t('crm.tasks.notePlaceholder')}
                            className={`${inputClass} resize-y px-3 py-2 text-sm`}
                        />
                        <div className="mt-2">
                            <ReportImageUploader value={noteImages} onChange={setNoteImages} max={6} />
                        </div>
                        <div className="mt-2 flex justify-end">
                            <button
                                type="button"
                                disabled={savingNote || (!noteText.trim() && noteImages.length === 0)}
                                onClick={() => void addNote()}
                                className="ofi-btn-brand inline-flex h-9 items-center gap-1.5 rounded-md bg-[#272f67] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1f2654] disabled:opacity-50"
                            >
                                {savingNote ? t('common.saving') : t('crm.tasks.addNote')}
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {lightbox && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 p-6" onClick={() => setLightbox(null)} role="presentation">
                    <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg shadow-2xl" />
                </div>
            )}
        </div>
    );
};
