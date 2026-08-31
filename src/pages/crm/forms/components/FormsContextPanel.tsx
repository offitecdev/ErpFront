import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LuFileText, LuListChecks, LuStickyNote } from 'react-icons/lu';
import { Edit01, Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { formsApi, type FieldNoteDto, type FormContextKind, type FormContextResult, type FormSubmissionRow, type FormTemplateDto } from '@/lib/api/forms';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { TemplatePickerModal } from './TemplatePickerModal';
import { FormFillSheet } from './FormFillSheet';
import { apiErrorMessage, BTN_ICON, BTN_ICON_DANGER, BTN_PRIMARY, BTN_SECONDARY, fmtDate, fmtDateTime, linkedCustomerLine, TEXTAREA_CLASS } from '../ui';

/**
 * "Checklisten & Hinweise" eines Bildschirms — EIN Baustein für Kundenakte,
 * Angebot, Auftrag, Projekt und Technikerbildschirm. Er holt mit einer
 * Anfrage (`/forms/context/:kind/:id`) die aufgelöste Kette, alle dazu
 * gehörenden Formulare (schlank) und die Einsatz-Hinweise.
 *
 * Verknüpfung: was hier neu ausgefüllt wird, hängt an GENAU diesem Kontext
 * (der Server ergänzt Kunde/Angebot/Projekt aus der Kette) — ein beim Angebot
 * erfasstes Formular erscheint darum später am Auftrag, im Projekt, am Termin
 * und beim Techniker, ohne dass jemand es umhängen muss.
 *
 * `onOpen` überschreibt das Öffnen (Technikerbildschirm: eigene Seite statt
 * Untenfenster); ohne `onOpen` öffnet der Baustein das Untenfenster selbst.
 */
export const FormsContextPanel = ({
    kind,
    id,
    sections = ['forms', 'notes'],
    onOpen,
    variant = 'default',
    canCreate = true,
}: {
    kind: FormContextKind;
    id: string;
    sections?: Array<'forms' | 'notes'>;
    onOpen?: (submissionId: string) => void;
    variant?: 'default' | 'montage';
    canCreate?: boolean;
}) => {
    const [data, setData] = useState<FormContextResult | null>(null);
    // "lädt" = für diesen Kontext noch nichts geladen (abgeleitet, kein
    // setState im Effekt); ein Neuladen nach Änderungen flackert nicht.
    const [loadedKey, setLoadedKey] = useState('');
    const loading = loadedKey !== `${kind}:${id}`;
    const [pickerOpen, setPickerOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<FormSubmissionRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [busyPdf, setBusyPdf] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setData(await formsApi.getContext(kind, id));
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.load')));
        } finally {
            setLoadedKey(`${kind}:${id}`);
        }
    }, [kind, id]);

    useEffect(() => { void load(); }, [load]);

    const linkFor = () => {
        switch (kind) {
            case 'customer': return { customerId: id };
            case 'tender': return { tenderId: id };
            case 'salesOrder': return { salesOrderId: id };
            case 'project': return { projectId: id };
            case 'appointment': return { appointmentId: id };
            default: return {};
        }
    };

    const startNew = async (template: FormTemplateDto) => {
        setCreating(true);
        try {
            const created = await formsApi.createSubmission({ templateId: template.id, ...linkFor() });
            await load();
            if (onOpen) onOpen(created.id); else setOpenId(created.id);
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.create')));
        } finally {
            setCreating(false);
        }
    };

    const open = (row: FormSubmissionRow) => {
        if (onOpen) onOpen(row.id); else setOpenId(row.id);
    };

    const downloadPdf = async (row: FormSubmissionRow) => {
        setBusyPdf(row.id);
        try {
            const [full, { exportFormSubmissionPdf }] = await Promise.all([
                formsApi.getSubmission(row.id),
                import('@/utils/pdf/formSubmissionPdf'),
            ]);
            await exportFormSubmissionPdf({ submission: full, output: 'download' });
        } catch {
            toast.error(t('forms.errors.pdf'));
        } finally {
            setBusyPdf(null);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const target = pendingDelete;
        setDeleting(true);
        try {
            await formsApi.deleteSubmission(target.id);
            setPendingDelete(null);
            toast.success(t('forms.toasts.deleted'));
            // Örtlich entfernen statt den ganzen Kontext neu zu holen.
            setData((current) => (current ? { ...current, submissions: current.submissions.filter((row) => row.id !== target.id) } : current));
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.delete')));
        } finally {
            setDeleting(false);
        }
    };

    const submissions = data?.submissions ?? [];
    const notes = data?.notes ?? [];
    const big = variant === 'montage' ? ' !min-h-11 !px-5 !text-[13.5px]' : '';

    return (
        <div className="space-y-4">
            {sections.includes('notes') && (
                <FieldNotesBlock
                    kind={kind}
                    id={id}
                    notes={notes}
                    loading={loading}
                    onChanged={() => load()}
                    variant={variant}
                    canCreate={canCreate}
                />
            )}

            {sections.includes('forms') && (
                <SectionCard
                    title={<span className="inline-flex items-center gap-2"><LuListChecks size={15} className="text-[#1f2654] dark:text-amber-400" />{t('forms.panel.title')} ({submissions.length})</span>}
                    action={canCreate ? (
                        <button type="button" className={`${BTN_PRIMARY}${big}`} disabled={creating} onClick={() => setPickerOpen(true)}>
                            <Plus size={14} />{t('forms.panel.new')}
                        </button>
                    ) : undefined}
                >
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            <col />
                            <col style={{ width: 260 }} />
                            <col style={{ width: 160 }} />
                            <col style={{ width: 130 }} />
                            <col style={{ width: 132 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('forms.panel.colTemplate')}</th>
                                <th className="text-left">{t('forms.panel.colLinks')}</th>
                                <th className="text-left">{t('forms.panel.colFilledBy')}</th>
                                <th className="text-left">{t('forms.panel.colDate')}</th>
                                <th className="text-right">{t('forms.panel.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || submissions.length === 0) && (
                                <TableStateRow colSpan={5} loading={loading} emptyText={t('forms.panel.empty')} skeletonRows={3} />
                            )}
                            {!loading && submissions.map((row) => (
                                <tr key={row.id} className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => open(row)}>
                                    <td>
                                        <span className="block truncate font-semibold text-slate-900 dark:text-white">{row.templateName}</span>
                                        {row.notes && <span className="block truncate text-[11.5px] text-slate-400">{row.notes}</span>}
                                    </td>
                                    <td><LinkChips row={row} /></td>
                                    <td className="truncate text-[12.5px] text-slate-600 dark:text-white/70">{row.filledByName || <span className="text-slate-300">—</span>}</td>
                                    <td className="whitespace-nowrap text-[12.5px] text-slate-600 dark:text-white/70">{fmtDate(row.updatedAt)}</td>
                                    <td onClick={(event) => event.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button type="button" className={BTN_ICON} title={t('forms.panel.edit')} onClick={() => open(row)}>
                                                <Edit01 size={14} />
                                            </button>
                                            <button type="button" className={BTN_ICON} title={t('forms.fill.pdf')} disabled={busyPdf === row.id} onClick={() => void downloadPdf(row)}>
                                                <LuFileText size={14} />
                                            </button>
                                            {canCreate && (
                                                <button type="button" className={BTN_ICON_DANGER} title={t('common.delete')} onClick={() => setPendingDelete(row)}>
                                                    <Trash01 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SectionCard>
            )}

            <TemplatePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(template) => void startNew(template)} />

            {!onOpen && (
                <FormFillSheet
                    submissionId={openId}
                    open={Boolean(openId)}
                    // Ansehen/Schliessen lädt NICHTS neu (Vorgabe 16.08.2026);
                    // Gespeichertes schreibt sich in die geladene Zeile.
                    onClose={() => setOpenId(null)}
                    onSaved={(submission) => setData((current) => (current ? {
                        ...current,
                        submissions: current.submissions.map((row) => (row.id === submission.id
                            ? { ...row, notes: submission.notes, filledByName: submission.filledByName, updatedAt: submission.updatedAt }
                            : row)),
                    } : current))}
                    onDeleted={() => setData((current) => (current ? {
                        ...current,
                        submissions: current.submissions.filter((row) => row.id !== openId),
                    } : current))}
                />
            )}

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t('forms.fill.deleteTitle')}
                message={pendingDelete?.templateName}
                tone="danger"
                busy={deleting}
                confirmLabel={t('common.delete')}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
};

/** Verknüpfungen einer Zeile als kleine Marken (Kunde / AN / AU / PR / Termin). */
/**
 * Die Kundenspalte einer Checkliste. Eine Checkliste kann an MEHREREN Kunden
 * hängen (16.08.2026): dann steht die ganze Namensreihe in einer Zeile — sie
 * wird gekürzt, der volle Text steht im Tooltip — und ein Anhänger nennt die
 * Zahl. Bei genau einem Kunden sieht die Zelle aus wie zuvor.
 */
export const CustomerCell = ({ row }: { row: FormSubmissionRow }) => {
    const line = linkedCustomerLine(row);
    if (!line) return <span className="text-slate-300 dark:text-white/30">—</span>;
    return (
        <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate" title={line}>{line}</span>
            {row.customerCount > 1 && (
                <span
                    title={t('forms.links.customerCount', { count: row.customerCount })}
                    className="shrink-0 rounded bg-[#eef2fb] px-1.5 py-0.5 text-[11px] font-semibold text-[#1f2654] dark:bg-white/10 dark:text-white/80"
                >
                    {row.customerCount}
                </span>
            )}
        </span>
    );
};

/**
 * Die Kette einer Checkliste als kleine Anhänger. `showCustomer=false`, wo der
 * Kunde schon eine eigene Spalte hat (Modulliste).
 *
 * Hängt die Checkliste an MEHREREN Kunden/Angeboten (16.08.2026), nennt der
 * Anhänger die ZAHL statt nur des ersten Namens — in der Kundenakte stünde
 * sonst ein fremder Kundenname in der Zeile. Die ganze Reihe steht im
 * Tooltip.
 */
export const LinkChips = ({ row, showCustomer = true }: { row: FormSubmissionRow; showCustomer?: boolean }) => {
    const chips: Array<{ key: string; text: string; title: string }> = [];
    if (showCustomer) {
        if (row.customerCount > 1) {
            chips.push({
                key: 'customer',
                text: t('forms.links.customerCount', { count: row.customerCount }),
                title: linkedCustomerLine(row) || t('forms.links.customer'),
            });
        } else if (row.customerName) {
            chips.push({ key: 'customer', text: row.customerName, title: t('forms.links.customer') });
        }
    }
    if (row.tenderCount > 1) {
        chips.push({ key: 'tender', text: t('forms.link.tenderCount', { count: row.tenderCount }), title: t('forms.links.tender') });
    } else if (row.tenderNumber) {
        chips.push({ key: 'tender', text: row.tenderNumber, title: t('forms.links.tender') });
    }
    if (row.orderNumber) chips.push({ key: 'order', text: row.orderNumber, title: t('forms.links.order') });
    if (row.projectNumber) chips.push({ key: 'project', text: row.projectNumber, title: t('forms.links.project') });
    if (row.appointmentStart) chips.push({ key: 'appointment', text: fmtDate(row.appointmentStart), title: t('forms.links.appointment') });
    if (chips.length === 0) return <span className="text-slate-300 dark:text-white/30">—</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {chips.map((chip) => (
                <span key={chip.key} title={chip.title} className="inline-flex max-w-[160px] items-center truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-px font-mono text-[11px] text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
                    {chip.text}
                </span>
            ))}
        </div>
    );
};

/**
 * Einsatz-Hinweise ("Bitte ohne Schuhe eintreten", "Hund im Garten"): freie
 * Notizen des Technikers oder des Büros zum Objekt. Neue Hinweise hängen am
 * Kontext (Projekt/Auftrag/Termin → mit Kunde), Bearbeiten und Löschen inline.
 */
const FieldNotesBlock = ({
    kind,
    id,
    notes,
    loading,
    onChanged,
    variant,
    canCreate,
}: {
    kind: FormContextKind;
    id: string;
    notes: FieldNoteDto[];
    loading: boolean;
    onChanged: () => void;
    variant: 'default' | 'montage';
    canCreate: boolean;
}) => {
    const [adding, setAdding] = useState(false);
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [pendingDelete, setPendingDelete] = useState<FieldNoteDto | null>(null);
    const [deleting, setDeleting] = useState(false);
    const big = variant === 'montage' ? ' !min-h-11 !px-5 !text-[13.5px]' : '';

    const link = () => {
        switch (kind) {
            case 'customer': return { customerId: id };
            case 'tender': return { tenderId: id };
            case 'salesOrder': return { salesOrderId: id };
            case 'project': return { projectId: id };
            case 'appointment': return { appointmentId: id };
            default: return {};
        }
    };

    const create = async () => {
        if (!text.trim()) return;
        setSaving(true);
        try {
            await formsApi.createNote({ text: text.trim(), ...link() });
            setText('');
            setAdding(false);
            onChanged();
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.noteSave')));
        } finally {
            setSaving(false);
        }
    };

    const saveEdit = async () => {
        if (!editingId || !editText.trim()) return;
        setSaving(true);
        try {
            await formsApi.updateNote(editingId, editText.trim());
            setEditingId(null);
            onChanged();
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.noteSave')));
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await formsApi.deleteNote(pendingDelete.id);
            setPendingDelete(null);
            onChanged();
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.noteDelete')));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <SectionCard
            title={<span className="inline-flex items-center gap-2"><LuStickyNote size={15} className="text-amber-500" />{t('forms.notes.title')} ({notes.length})</span>}
            action={canCreate && !adding ? (
                <button type="button" className={`${BTN_SECONDARY}${big}`} onClick={() => setAdding(true)}>
                    <Plus size={14} />{t('forms.notes.add')}
                </button>
            ) : undefined}
        >
            <div className="divide-y divide-slate-100 dark:divide-white/10">
                {adding && (
                    <div className="space-y-2 bg-amber-50/40 px-4 py-3 dark:bg-amber-500/5">
                        <textarea
                            autoFocus
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            rows={2}
                            placeholder={t('forms.notes.placeholder')}
                            className={TEXTAREA_CLASS}
                        />
                        <div className="flex items-center gap-2">
                            <button type="button" className={`${BTN_PRIMARY}${big}`} disabled={saving || !text.trim()} onClick={() => void create()}>{t('common.save')}</button>
                            <button type="button" className={`${BTN_SECONDARY}${big}`} onClick={() => { setAdding(false); setText(''); }}>{t('common.cancel')}</button>
                        </div>
                    </div>
                )}
                {loading && notes.length === 0 && (
                    <div className="px-4 py-6 text-center text-[12.5px] text-slate-400">{t('common.loading')}</div>
                )}
                {!loading && notes.length === 0 && !adding && (
                    <div className="px-4 py-6 text-center text-[12.5px] text-slate-400">{t('forms.notes.empty')}</div>
                )}
                {notes.map((note) => (
                    <div key={note.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="mt-1 size-2 shrink-0 rounded-full bg-amber-400" />
                        <div className="min-w-0 flex-1">
                            {editingId === note.id ? (
                                <div className="space-y-2">
                                    <textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={2} className={TEXTAREA_CLASS} autoFocus />
                                    <div className="flex items-center gap-2">
                                        <button type="button" className={BTN_PRIMARY} disabled={saving || !editText.trim()} onClick={() => void saveEdit()}>{t('common.save')}</button>
                                        <button type="button" className={BTN_SECONDARY} onClick={() => setEditingId(null)}>{t('common.cancel')}</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="whitespace-pre-line break-words text-[13.5px] font-medium leading-relaxed text-slate-800 dark:text-white">{note.text}</p>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-slate-400">
                                        {note.createdByName && <span>{note.createdByName}</span>}
                                        <span>{fmtDateTime(note.createdAt)}</span>
                                        {note.projectNumber && <span className="font-mono">{note.projectNumber}</span>}
                                        {note.orderNumber && <span className="font-mono">{note.orderNumber}</span>}
                                    </div>
                                </>
                            )}
                        </div>
                        {canCreate && editingId !== note.id && (
                            <div className="flex shrink-0 items-center gap-1.5">
                                <button type="button" className={BTN_ICON} title={t('common.edit')} onClick={() => { setEditingId(note.id); setEditText(note.text); }}><Edit01 size={14} /></button>
                                <button type="button" className={BTN_ICON_DANGER} title={t('common.delete')} onClick={() => setPendingDelete(note)}><Trash01 size={14} /></button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t('forms.notes.deleteTitle')}
                message={pendingDelete?.text}
                tone="danger"
                busy={deleting}
                confirmLabel={t('common.delete')}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </SectionCard>
    );
};
