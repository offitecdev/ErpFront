import { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { ProductionTask, TaskSubtask } from '@/types/productionTasks';

import { CheckRow, PriorStepsRow } from './CompleteSubtaskDialog';
import { FileDropZone } from './FileDropZone';
import type { PersonNames } from './PeopleCell';
import { FileChip } from './SubtaskFiles';
import { fileProblem, filesLocked, isPdf, latestFiles, type SubtaskActions } from './subtaskFileModel';
import { formatFee, hasSubtaskDocument, isSubtaskPhotoType, parseFee, SUBMISSION_NOTE_MAX, subtaskFileAccept } from './taskModel';

/**
 * ── «GÖREVİ TAMAMLA» MIT FOTOS UND KURZER NOTIZ (02.10.2026, OCC-Standard) ────
 *
 * «Montaj, test ve sevkiyat alt görevlerinde fotoğraf yeterli … Ölçülen değerler ve nakliye
 *  ücreti, «Görevi tamamla» penceresindeki «Kısa not» alanına yazılıyor. Yapay zekâ fotoğrafları
 *  ve bu notu birlikte okuyor.» Nur für Unteraufgaben mit «Fotoğraf yeterli» oder «Ücret
 * girilsin» — ohne bleibt «Görevi tamamla» ein Klick wie bisher. Oben die Prüfliste (Dokument,
 * Betrag, Schritte davor, wer verantwortlich ist), darunter die Fläche für Fotos/PDF, der Betrag
 * und die kurze Notiz; gesendet wird erst, wenn alles da ist.
 *
 * DER BETRAG (02.10.2026, Samet: «sevkiyat adımında bir ücretin de girilmesi gerekiyordu»):
 * OCC-Standard S. 7 «Teklif/fiyat … kayıtlı olur» — mit «Ücret girilsin» ein Pflichtfeld in CHF.
 */
export const SubmitSubtaskDialog = ({
    task,
    subtask,
    code,
    stageName,
    names,
    actions,
    onClose,
}: {
    task: ProductionTask;
    subtask: TaskSubtask;
    /** Das Kürzel der Unteraufgabe, z. B. «M-09.1». */
    code: string;
    stageName: string;
    names: PersonNames;
    actions: SubtaskActions;
    onClose: () => void;
}) => {
    const [note, setNote] = useState(subtask.submissionNote ?? '');
    const [feeText, setFeeText] = useState(subtask.fee != null ? String(subtask.fee) : '');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const photoAllowed = subtask.photoAllowed === true;
    const withDocument = subtask.requiresDocument || photoAllowed;
    // Je Datei die aktuelle Fassung — PDFs (und mit «Fotoğraf yeterli» Fotos) zählen als Dokument.
    const documents = latestFiles(subtask.files).filter((file) => isPdf(file) || (photoAllowed && isSubtaskPhotoType(file.type)));
    const documentOk = !subtask.requiresDocument || hasSubtaskDocument(subtask);
    // Der Betrag (02.10.2026): Pflicht mit «Ücret girilsin», in CHF.
    const feeRequired = subtask.feeRequired === true;
    const fee = parseFee(feeText);
    const feeOk = !feeRequired || typeof fee === 'number';
    // «Sistem kilidi» (02.10.2026): mit «Kilit» erst, wenn die Schritte davor erledigt sind.
    const openBefore = subtask.priorStepsRequired ? actions.openBefore?.(task, subtask) ?? null : null;
    const priorOk = !openBefore?.length;
    const people = subtask.assigneeIds.map((id) => {
        const name = names.get(id)?.name ?? '—';
        return id === actions.meId ? `${name} ${t('productionTasks.complete.you')}` : name;
    });

    const upload = async (files: File[]) => {
        setUploading(true);
        for (const file of files) {
            const problem = fileProblem(file, photoAllowed);
            if (problem) { toast.error(`${file.name}: ${problem}`); continue; }
            if (!(await actions.upload(task, subtask, file))) break;
        }
        setUploading(false);
    };

    const ready = documentOk && feeOk && priorOk;
    const submit = async () => {
        if (!ready || saving || uploading) return;
        setSaving(true);
        // Mit «Approval» wartet sie dann auf die Freigabe, sonst ist sie erledigt — Notiz und Betrag gehen mit.
        const done = await actions.setStatus(
            task,
            subtask,
            subtask.requiresApproval ? 'PENDING' : 'DONE',
            note.trim(),
            feeRequired && typeof fee === 'number' ? fee : undefined,
        );
        setSaving(false);
        if (done !== false) onClose();
    };

    return (
        <PopupDialog
            closeOnBackdrop={false}
            open
            onClose={() => { if (!saving) onClose(); }}
            title={t('productionTasks.subtask.completeTask')}
            subtitle={`${code} · ${subtask.name} — ${[actions.deviceName, stageName].filter(Boolean).join(' · ')}`}
            icon={<Check size={18} strokeWidth={2.6} />}
            width={620}
            footer={(
                <PopupActions
                    start={subtask.requiresApproval ? (
                        <span className="ofi-ptk-complete__hint">
                            <Bell aria-hidden />
                            {t('productionTasks.subtask.completeHint')}
                        </span>
                    ) : undefined}
                >
                    <PopupButton onClick={onClose} disabled={saving}>{t('productionTasks.actions.cancel')}</PopupButton>
                    <PopupButton variant="primary" disabled={!ready || uploading} loading={saving} onClick={() => void submit()}>
                        {t(subtask.requiresApproval ? 'productionTasks.submit.confirm' : 'productionTasks.subtask.completeTask')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-ptk-pop ofi-ptk-complete">
                <ul className="ofi-ptk-checklist">
                    {subtask.requiresDocument && (
                        <CheckRow
                            ok={documentOk}
                            title={t(photoAllowed ? 'productionTasks.complete.documentRowPhoto' : 'productionTasks.complete.documentRow')}
                            detail={documentOk
                                ? photoAllowed
                                    ? t('productionTasks.complete.documentOkPhoto', { count: documents.length })
                                    : t('productionTasks.complete.documentOk', { count: documents.length })
                                : t(photoAllowed ? 'productionTasks.complete.documentMissingPhoto' : 'productionTasks.complete.documentMissing')}
                            value={documentOk ? t('productionTasks.complete.attached') : t('productionTasks.complete.missing')}
                        />
                    )}
                    {feeRequired && (
                        <CheckRow
                            ok={feeOk}
                            title={t('productionTasks.fee.row')}
                            detail={feeOk ? t('productionTasks.fee.okDetail') : t('productionTasks.fee.missingDetail')}
                            value={typeof fee === 'number' ? formatFee(fee) : t('productionTasks.complete.missing')}
                        />
                    )}
                    {openBefore && <PriorStepsRow open={openBefore} />}
                    <CheckRow
                        ok={people.length > 0}
                        title={t('productionTasks.complete.peopleRow')}
                        detail={people.length ? people.join(' · ') : t('productionTasks.complete.nobody')}
                        value={t('productionTasks.complete.peopleCount', { count: people.length })}
                    />
                </ul>

                {withDocument && (
                    <section className="ofi-ptk-complete__block">
                        <h3 className="ofi-ptk-complete__label">{t('productionTasks.complete.documentLabel')}</h3>
                        {!filesLocked(subtask) && (
                            <FileDropZone
                                title={t(photoAllowed ? 'productionTasks.complete.dropTitlePhoto' : 'productionTasks.complete.dropTitle')}
                                accept={subtaskFileAccept(subtask)}
                                multiple
                                busy={uploading}
                                onFiles={(files) => void upload(files)}
                            />
                        )}
                        {documents.length > 0 && (
                            <div className="ofi-ptk-files__list is-dialog">
                                {documents.map((file) => (
                                    <FileChip
                                        key={file.id}
                                        file={file}
                                        showVersion={(file.version || 1) > 1}
                                        onOpen={() => actions.openFile(task, subtask, file)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Der Betrag (02.10.2026) — Pflicht mit «Ücret girilsin»; die KI liest ihn mit der Notiz. */}
                {feeRequired && (
                    <label className="ofi-ptk-complete__block">
                        <span className="ofi-ptk-complete__label">{t('productionTasks.fee.label')}</span>
                        <input
                            className="ofi-ptk-input ofi-ptk-complete__fee"
                            inputMode="decimal"
                            autoComplete="off"
                            value={feeText}
                            placeholder={t('productionTasks.fee.placeholder')}
                            aria-invalid={feeText !== '' && fee === undefined}
                            onChange={(event) => setFeeText(event.target.value)}
                        />
                        <span className="ofi-ptk-field__hint">
                            {feeText !== '' && fee === undefined ? t('productionTasks.fee.invalid') : t('productionTasks.fee.hint')}
                        </span>
                    </label>
                )}

                <label className="ofi-ptk-complete__block">
                    <span className="ofi-ptk-complete__label">
                        {t('productionTasks.complete.note')} <em>{t('productionTasks.complete.optional')}</em>
                    </span>
                    <textarea
                        className="ofi-ptk-input ofi-ptk-complete__note"
                        rows={4}
                        maxLength={SUBMISSION_NOTE_MAX}
                        value={note}
                        placeholder={t('productionTasks.submit.notePlaceholder')}
                        onChange={(event) => setNote(event.target.value)}
                    />
                    <span className="ofi-ptk-field__hint">{t('productionTasks.submit.noteHint')}</span>
                </label>
            </div>
        </PopupDialog>
    );
};
