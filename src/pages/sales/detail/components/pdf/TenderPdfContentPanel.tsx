import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import {
    File05 as FileText,
    Plus,
    Trash01,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { tenderApi } from '../../../../../lib/api/tender';
import type { TenderTextTemplateDto } from '../../../../../types/tender';
import { PlainButton as Button } from '../common/PlainUi';
import { TextTemplatesPopup } from '../../popups/TextTemplatesPopup';

const LazyRichTextEditor = lazy(() =>
    import('../RichTextMarkdownEditor').then((mod) => ({ default: mod.RichTextMarkdownEditor })),
);

/** 6 MB of binary — a data URI is ~4/3 the size, which is what actually travels. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg'];

export type TenderPdfContent = {
    /** Intro text — printed on page 1, directly below the offer title. */
    coverLetter: string | null;
    /** Related images, printed after the totals. */
    closingImages: string[];
};

type TenderPdfContentPanelProps = {
    value: TenderPdfContent;
    /** Stages a change; persisted with the quote's own Save, like any other field. */
    onChange: (patch: Partial<TenderPdfContent>) => void;
    canEdit: boolean;
    onError: (message: string) => void;
};

const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

/** A text block counts as present once it holds something other than empty markup. */
const hasText = (value: string | null) => Boolean(value && value.replace(/<[^>]*>/g, '').trim());

const BlockShell = ({
    title,
    hint,
    onRemove,
    canEdit,
    headerAction,
    children,
}: {
    title: string;
    hint: string;
    onRemove: () => void;
    canEdit: boolean;
    /** Extra header control (e.g. the template picker), left of Remove. */
    headerAction?: React.ReactNode;
    children: React.ReactNode;
}) => (
    <section className="ofi-quote-card rounded-lg border border-[#e6e8eb] bg-white">
        <header className="ofi-quote-card__head flex items-center justify-between gap-3 border-b border-[#eef0f2] bg-white px-3.5 py-2">
            <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-[#1f2654]">{title}</span>
                <span className="block text-[11.5px] text-slate-500">{hint}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
                {canEdit && headerAction}
                {canEdit && (
                    <button
                        type="button"
                        onClick={onRemove}
                        title={t('tenders.remove_block')}
                        aria-label={t('tenders.remove_block')}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                        <Trash01 size={13} />
                    </button>
                )}
            </span>
        </header>
        <div className="p-2.5">{children}</div>
    </section>
);

/**
 * The optional blocks appended to an offer's PDF: an intro text (page 1,
 * directly below the offer title) and any number of images printed after the
 * totals. There is no "final text" any more — the block, its add-button and its
 * PDF rendering were removed; images now stand alone at the end of the document.
 *
 * The intro text is not gated behind an add-button: the editor is always on
 * screen, plain, with the image slot directly underneath. It is backed by
 * tenant-wide templates (Textbausteine) stored in the database: the picker popup
 * lists them, applying one replaces the editor content, and "+" saves the
 * current text as a new template. The template marked as default is loaded into
 * an empty editor when the panel opens — the add-button used to do that.
 *
 * Rendered in the quote's PDF tab, lazy-loaded — it pulls in the rich-text
 * editor, which must not sit in the tender detail bundle for a tab most offers
 * never visit.
 */
export const TenderPdfContentPanel = ({ value, onChange, canEdit, onError }: TenderPdfContentPanelProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Intro-text templates (Textbausteine) ─────────────────────────────────
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [templates, setTemplates] = useState<TenderTextTemplateDto[] | null>(null);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templateBusy, setTemplateBusy] = useState(false);
    // Das Sheet behält seine Grösse; nur der INHALT wechselt zwischen Liste und
    // Formular und schiebt sich dabei nach links/rechts (`ofi-slide-in-*`).
    const [templateView, setTemplateView] = useState<'list' | 'form'>('list');
    const [editingTemplate, setEditingTemplate] = useState<TenderTextTemplateDto | null>(null);
    const [formTitle, setFormTitle] = useState('');
    const [formContent, setFormContent] = useState('');

    const images = value.closingImages ?? [];

    const loadTemplates = async (): Promise<TenderTextTemplateDto[]> => {
        if (templates) return templates;
        setTemplatesLoading(true);
        try {
            const list = await tenderApi.listTextTemplates();
            setTemplates(list);
            return list;
        } finally {
            setTemplatesLoading(false);
        }
    };

    const openTemplatePicker = () => {
        setTemplateView('list');
        setTemplatesOpen(true);
        void loadTemplates().catch(() => onError(t('tenders.text_templates_load_error')));
    };

    /** "+" — öffnet das Formular, vorbelegt mit dem aktuellen Einleitungstext. */
    const startNewTemplate = () => {
        setEditingTemplate(null);
        setFormTitle('');
        setFormContent(value.coverLetter ?? '');
        setTemplateView('form');
    };

    const startEditTemplate = (template: TenderTextTemplateDto) => {
        setEditingTemplate(template);
        setFormTitle(template.title);
        setFormContent(template.content ?? '');
        setTemplateView('form');
    };

    const saveTemplateForm = async () => {
        const title = formTitle.trim();
        if (!title) {
            onError(t('tenders.text_template_title_required'));
            return;
        }
        if (!hasText(formContent)) {
            onError(t('tenders.text_template_content_required'));
            return;
        }
        setTemplateBusy(true);
        try {
            if (editingTemplate) {
                const updated = await tenderApi.updateTextTemplate(editingTemplate.id, { title, content: formContent });
                setTemplates((current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item)));
            } else {
                const created = await tenderApi.createTextTemplate({ title, content: formContent });
                setTemplates((current) => [created, ...(current ?? [])]);
            }
            setTemplateView('list');
        } catch {
            onError(t('tenders.text_template_save_error'));
        } finally {
            setTemplateBusy(false);
        }
    };

    const applyTemplate = (template: TenderTextTemplateDto) => {
        onChange({ coverLetter: template.content ?? '' });
        setTemplatesOpen(false);
    };

    const deleteTemplate = async (template: TenderTextTemplateDto) => {
        setTemplateBusy(true);
        try {
            await tenderApi.deleteTextTemplate(template.id);
            setTemplates((current) => (current ?? []).filter((item) => item.id !== template.id));
        } catch {
            onError(t('tenders.text_template_delete_error'));
        } finally {
            setTemplateBusy(false);
        }
    };

    const makeDefaultTemplate = async (template: TenderTextTemplateDto) => {
        setTemplateBusy(true);
        try {
            await tenderApi.updateTextTemplate(template.id, { isDefault: true });
            setTemplates((current) => (current ?? []).map((item) => ({ ...item, isDefault: item.id === template.id })));
        } catch {
            onError(t('tenders.text_template_save_error'));
        } finally {
            setTemplateBusy(false);
        }
    };

    /**
     * Vorbelegung: Der Einleitungstext hat keinen Hinzufügen-Button mehr, also
     * übernimmt das Öffnen des Panels dessen Aufgabe — ein leerer Editor wird
     * einmalig mit dem Standard-Textbaustein gefüllt. Der Aufrufer rendert das
     * Panel erst, wenn der gespeicherte Text geladen ist; sonst würde die
     * Vorbelegung einen vorhandenen Text überschreiben. Best effort: schlägt der
     * Abruf fehl, bleibt der Editor einfach leer.
     */
    const prefillDone = useRef(false);
    useEffect(() => {
        if (prefillDone.current || !canEdit || hasText(value.coverLetter)) return;
        prefillDone.current = true;
        void loadTemplates()
            .then((list) => {
                const fallback = list.find((item) => item.isDefault) ?? null;
                if (fallback?.content) onChange({ coverLetter: fallback.content });
            })
            .catch(() => { /* stiller Fehlschlag — der Editor bleibt leer */ });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canEdit]);

    const addImages = async (files: FileList | null) => {
        if (!files?.length) return;
        const file = files[0];
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
            onError(t('tenders.image_invalid_type'));
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            onError(t('tenders.image_too_large').replace('6 MB', '5 MB'));
            return;
        }
        const image = await fileToDataUrl(file);
        onChange({ closingImages: [...images, image] });
    };

    const removeImage = (index: number) => {
        onChange({ closingImages: images.filter((_, position) => position !== index) });
    };

    return (
        <div className="space-y-2.5">
            <p className="text-[12px] text-slate-500">{t('tenders.pdf_content_hint')}</p>

            {/* Der Einleitungstext ist immer offen — kein Hinzufügen-Button
                mehr davor; der Papierkorb leert nur noch das Feld. Direkt
                darunter folgt der Bildblock, genau wie im PDF. */}
            <BlockShell
                title={t('tenders.cover_letter')}
                hint={t('tenders.cover_letter_hint')}
                canEdit={canEdit}
                onRemove={() => onChange({ coverLetter: null })}
                headerAction={(
                    <Button size="sm" variant="secondary" icon={<FileText size={12} />} onClick={openTemplatePicker}>
                        {t('tenders.text_templates')}
                    </Button>
                )}
            >
                <Suspense fallback={<div className="h-32 animate-pulse rounded-[3px] bg-slate-100" />}>
                    <LazyRichTextEditor
                        value={value.coverLetter ?? ''}
                        onChange={(next) => onChange({ coverLetter: next })}
                        minHeight={160}
                    />
                </Suspense>
            </BlockShell>

            {(images.length > 0 || canEdit) && (
                <BlockShell
                    title={t('tenders.closing_image')}
                    hint={t('tenders.closing_image_hint').replace('6 MB', '5 MB')}
                    canEdit={canEdit && images.length > 0}
                    onRemove={() => onChange({ closingImages: [] })}
                >
                    <div className="flex flex-wrap gap-2">
                        {images.map((image, index) => (
                            <div
                                key={`${index}-${image.slice(-24)}`}
                                className="group relative h-24 w-32 overflow-hidden rounded-[3px] border border-slate-200 bg-slate-50"
                            >
                                <img src={image} alt="" className="h-full w-full object-contain" />
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={() => removeImage(index)}
                                        title={t('tenders.remove_image')}
                                        aria-label={t('tenders.remove_image')}
                                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-[3px] bg-white/90 text-slate-500 opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100"
                                    >
                                        <Trash01 size={12} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {/* The add target is the dashed tile itself — a big, obvious
                            drop-in slot that sits in line with the thumbnails. */}
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                title={t('tenders.add_closing_image')}
                                aria-label={t('tenders.add_closing_image')}
                                className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-[3px] border-2 border-dashed border-slate-300 bg-white text-slate-400 transition-colors hover:border-[#1f2654] hover:bg-slate-50 hover:text-[#1f2654]"
                            >
                                <Plus size={22} />
                                <span className="text-[11px] font-medium">{t('tenders.add_closing_image')}</span>
                            </button>
                        )}
                    </div>
                </BlockShell>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                className="hidden"
                onChange={(event) => {
                    void addImages(event.target.files);
                    // Reset so re-picking the same file fires change again.
                    event.target.value = '';
                }}
            />

            {/* ── Textbausteine: floating card beside the button (popups/TextTemplatesPopup) ── */}
            <TextTemplatesPopup
                open={templatesOpen}
                onClose={() => setTemplatesOpen(false)}
                canEdit={canEdit}
                view={templateView}
                onViewChange={setTemplateView}
                templates={templates}
                loading={templatesLoading}
                busy={templateBusy}
                editingTemplate={editingTemplate}
                formTitle={formTitle}
                onFormTitleChange={setFormTitle}
                formContent={formContent}
                onFormContentChange={setFormContent}
                onApply={applyTemplate}
                onStartNew={startNewTemplate}
                onStartEdit={startEditTemplate}
                onMakeDefault={(template) => void makeDefaultTemplate(template)}
                onDelete={(template) => void deleteTemplate(template)}
                onSave={() => void saveTemplateForm()}
            />
        </div>
    );
};
