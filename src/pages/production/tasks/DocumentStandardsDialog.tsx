import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { BookmarkPlus, Loader2, ScrollText, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { t } from '@/i18n/translate';
import { productionTaskErrorText, productionTasksApi } from '@/lib/api/productionTasks';
import type { TaskStandardsFile, TaskStandardsTemplate } from '@/types/productionTasks';

import { openBlob } from '../bom/device/bomFiles';
import { FileGlyph } from './SubtaskFiles';
import { TASK_LIMITS } from './taskModel';

/** So gross darf das PDF der Standards sein (wie der Server). */
const STANDARDS_PDF_MAX_BYTES = 10 * 1024 * 1024;

const sizeText = (bytes: number): string =>
    (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * ── STANDARDS DER DOKUMENTE (01.10.2026) ───────────────────────────────────
 *
 * «The admin will write standarts that the documents that are added to that
 *  subtask should meet.» Freier Text mit Zeilen UND/ODER ein PDF mit den
 * Standards («admins should be able to both upload pdf and write text, in this
 * case the AI should consider both») — je Unteraufgabe mit «Document». Das PDF
 * liegt gleich beim Server; «Tamam» ändert nur den Entwurf der Aufgabe,
 * gespeichert wird mit der Aufgabe. Beim Prüfen der Dateien stehen die
 * Standards unter der Checkliste (FileReviewDialog).
 */
export const DocumentStandardsDialog = ({
    subtaskName,
    value,
    file: initialFile,
    onSave,
    onClose,
}: {
    subtaskName: string;
    value: string | null;
    file: TaskStandardsFile | null;
    onSave: (text: string, file: TaskStandardsFile | null) => void;
    onClose: () => void;
}) => {
    const [text, setText] = useState(value ?? '');
    const [file, setFile] = useState<TaskStandardsFile | null>(initialFile);
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    /* Vorlagen (02.10.2026: «the admin should be able to add a template for standard and
       select a standard with a combobox»): wählen füllt Text und PDF, «Als Vorlage
       speichern» legt das Jetzige unter einem Namen ab. */
    const [templates, setTemplates] = useState<TaskStandardsTemplate[]>([]);
    const [templateId, setTemplateId] = useState('');
    const [naming, setNaming] = useState<string | null>(null);
    const [savingTemplate, setSavingTemplate] = useState(false);
    useEffect(() => {
        let alive = true;
        void productionTasksApi.standardsTemplates().then((value) => { if (alive) setTemplates(value.items); }, () => undefined);
        return () => { alive = false; };
    }, []);
    const applyTemplate = (id: string) => {
        setTemplateId(id);
        const chosen = templates.find((entry) => entry.id === id);
        if (!chosen) return;
        setText(chosen.text ?? '');
        setFile(chosen.file);
    };
    const saveTemplate = async () => {
        const name = (naming ?? '').replace(/\s+/g, ' ').trim();
        if (!name || savingTemplate) return;
        setSavingTemplate(true);
        try {
            const { template } = await productionTasksApi.createStandardsTemplate({ name, text: text.trim() || null, file });
            setTemplates((current) => [...current, template].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
            setTemplateId(template.id);
            setNaming(null);
            toast.success(t('productionTasks.standardsTemplates.saved', { name }));
        } catch (error) {
            toast.error(productionTaskErrorText(error));
        } finally {
            setSavingTemplate(false);
        }
    };
    const removeTemplate = async () => {
        const chosen = templates.find((entry) => entry.id === templateId);
        if (!chosen) return;
        try {
            await productionTasksApi.removeStandardsTemplate(chosen.id);
            setTemplates((current) => current.filter((entry) => entry.id !== chosen.id));
            setTemplateId('');
            toast.success(t('productionTasks.standardsTemplates.removed', { name: chosen.name }));
        } catch (error) {
            toast.error(productionTaskErrorText(error));
        }
    };

    const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
        const picked = event.target.files?.[0];
        event.target.value = '';
        if (!picked) return;
        if (picked.type !== 'application/pdf' && !picked.name.toLowerCase().endsWith('.pdf')) {
            toast.error(t('productionTasks.subtask.standardsPdfOnly'));
            return;
        }
        if (picked.size > STANDARDS_PDF_MAX_BYTES) {
            toast.error(t('productionTasks.subtask.standardsPdfTooLarge', { max: 10 }));
            return;
        }
        setUploading(true);
        try {
            setFile((await productionTasksApi.uploadStandardsFile(picked)).file);
        } catch (error) {
            toast.error(productionTaskErrorText(error));
        } finally {
            setUploading(false);
        }
    };

    return (
        <PopupDialog
            closeOnBackdrop={false}
            open
            onClose={onClose}
            title={t('productionTasks.subtask.standardsTitle')}
            subtitle={subtaskName.trim() || undefined}
            icon={<ScrollText size={18} />}
            width={560}
            // Über dem Fenster der Aufgabe.
            z={760}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('productionTasks.actions.cancel')}</PopupButton>
                    <PopupButton variant="primary" disabled={uploading} onClick={() => onSave(text, file)}>{t('productionTasks.actions.apply')}</PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-ptk-pop ofi-ptk-form">
                {/* Eine Vorlage wählen oder das Jetzige als Vorlage ablegen (02.10.2026). */}
                <div className="ofi-ptk-field">
                    <span className="ofi-ptk-field__label">{t('productionTasks.standardsTemplates.label')}</span>
                    <div className="ofi-ptk-stdtemplates">
                        <SelectMenu
                            className="ofi-ptk-stdtemplates__select"
                            value={templateId}
                            placeholder={templates.length ? t('productionTasks.standardsTemplates.choose') : t('productionTasks.standardsTemplates.none')}
                            disabled={!templates.length}
                            ariaLabel={t('productionTasks.standardsTemplates.label')}
                            options={templates.map((entry) => ({ value: entry.id, label: entry.name, hint: entry.file ? 'PDF' : undefined }))}
                            onChange={applyTemplate}
                        />
                        {templateId && (
                            <button
                                type="button"
                                className="ofi-ptk-toolbtn is-danger ofi-nosize"
                                title={t('productionTasks.standardsTemplates.remove')}
                                aria-label={t('productionTasks.standardsTemplates.remove')}
                                onClick={() => void removeTemplate()}
                            >
                                <Trash2 aria-hidden />
                            </button>
                        )}
                        {naming === null ? (
                            <button
                                type="button"
                                className="ofi-ptk-files__add ofi-nosize"
                                disabled={!text.trim() && !file}
                                title={!text.trim() && !file ? t('productionTasks.standardsTemplates.emptyHint') : undefined}
                                onClick={() => setNaming('')}
                            >
                                <BookmarkPlus aria-hidden />
                                {t('productionTasks.standardsTemplates.saveAs')}
                            </button>
                        ) : (
                            <span className="ofi-ptk-stdtemplates__name">
                                <input
                                    className="ofi-ptk-input"
                                    value={naming}
                                    maxLength={120}
                                    autoFocus
                                    placeholder={t('productionTasks.standardsTemplates.namePlaceholder')}
                                    aria-label={t('productionTasks.standardsTemplates.namePlaceholder')}
                                    onChange={(event) => setNaming(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') { event.preventDefault(); void saveTemplate(); }
                                        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setNaming(null); }
                                    }}
                                />
                                <button type="button" className="ofi-ptk-btn is-small ofi-nosize" disabled={!naming.trim() || savingTemplate} onClick={() => void saveTemplate()}>
                                    {savingTemplate ? <Loader2 className="is-spinning" aria-hidden /> : t('productionTasks.actions.apply')}
                                </button>
                            </span>
                        )}
                    </div>
                </div>
                {/* Das PDF der Standards (01.10.2026) — die KI liest es mit. */}
                <div className="ofi-ptk-field">
                    <span className="ofi-ptk-field__label">{t('productionTasks.subtask.standardsPdf')}</span>
                    <div className="ofi-ptk-standardspdf">
                        {file && (
                            <span className="ofi-ptk-filechip">
                                <button
                                    type="button"
                                    className="ofi-ptk-filechip__open ofi-nosize"
                                    title={t('productionTasks.files.open', { name: file.name })}
                                    onClick={() => void openBlob(() => productionTasksApi.standardsFile(file), (error) => productionTaskErrorText(error))}
                                >
                                    <FileGlyph type="application/pdf" />
                                    <span className="ofi-ptk-filechip__text">
                                        <b><span className="ofi-ptk-filechip__name">{file.name}</span></b>
                                        <small>{sizeText(file.size)}</small>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="ofi-ptk-filechip__remove ofi-nosize"
                                    aria-label={t('productionTasks.subtask.standardsPdfRemove')}
                                    title={t('productionTasks.subtask.standardsPdfRemove')}
                                    onClick={() => setFile(null)}
                                >
                                    <X aria-hidden />
                                </button>
                            </span>
                        )}
                        <button
                            type="button"
                            className="ofi-ptk-files__add ofi-nosize"
                            disabled={uploading}
                            onClick={() => inputRef.current?.click()}
                        >
                            {uploading ? <Loader2 className="is-spinning" aria-hidden /> : <Upload aria-hidden />}
                            {uploading
                                ? t('productionTasks.files.adding')
                                : file ? t('productionTasks.subtask.standardsPdfReplace') : t('productionTasks.subtask.standardsPdfUpload')}
                        </button>
                        <input ref={inputRef} type="file" hidden accept="application/pdf,.pdf" onChange={(event) => void onPick(event)} />
                    </div>
                </div>
                <label className="ofi-ptk-field">
                    <span className="ofi-ptk-field__label">{t('productionTasks.subtask.standardsLabel')}</span>
                    <textarea
                        className="ofi-ptk-input ofi-ptk-complete__note ofi-ptk-standards__input"
                        rows={8}
                        maxLength={TASK_LIMITS.documentStandards}
                        autoFocus={!file}
                        value={text}
                        placeholder={t('productionTasks.subtask.standardsPlaceholder')}
                        onChange={(event) => setText(event.target.value)}
                    />
                    <span className="ofi-ptk-field__hint">{t('productionTasks.subtask.standardsBothHint')}</span>
                </label>
            </div>
        </PopupDialog>
    );
};
