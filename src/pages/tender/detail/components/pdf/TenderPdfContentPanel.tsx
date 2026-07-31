import { lazy, Suspense, useRef, useState } from 'react';

import {
    File05 as FileText,
    Image01 as ImageIcon,
    Plus,
    Trash01,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { PlainButton as Button } from '../common/PlainUi';

const LazyRichTextEditor = lazy(() =>
    import('../RichTextMarkdownEditor').then((mod) => ({ default: mod.RichTextMarkdownEditor })),
);

/** 6 MB of binary — a data URI is ~4/3 the size, which is what actually travels. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg'];

export type TenderPdfContent = {
    /** Intro text — its own page, after the cover page. */
    coverLetter: string | null;
    /** Final text — printed after the totals. */
    closingNote: string | null;
    /** Related images, printed after the final text. */
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
    children,
}: {
    title: string;
    hint: string;
    onRemove: () => void;
    canEdit: boolean;
    children: React.ReactNode;
}) => (
    <section className="rounded-[3px] border border-slate-300 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[#f1f5fd] px-3 py-1.5">
            <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-[#1f2654]">{title}</span>
                <span className="block text-[11.5px] text-slate-500">{hint}</span>
            </span>
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
        </header>
        <div className="p-2.5">{children}</div>
    </section>
);

/**
 * The optional blocks appended to an offer's PDF: an intro text (its own page,
 * after the cover), a final text (printed after the totals) and any number of
 * related images printed after that text.
 *
 * Rendered inline in the quote's lines tab, right under the row-entry menu,
 * but still lazy-loaded — it pulls in the rich-text editor, which must not sit
 * in the tender detail bundle for blocks most offers never fill in.
 *
 * The add-buttons render BELOW the blocks: once an intro text exists, the row
 * that adds the remaining blocks belongs under it rather than pushing the text
 * the user is writing down the page.
 */
export const TenderPdfContentPanel = ({ value, onChange, canEdit, onError }: TenderPdfContentPanelProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    // A block can be open while still empty — the user has just added it and is
    // about to type. Emptying a saved block does not close it; only Remove does.
    const [openBlocks, setOpenBlocks] = useState({
        coverLetter: hasText(value.coverLetter),
        closingNote: hasText(value.closingNote),
    });

    const showCoverLetter = openBlocks.coverLetter || hasText(value.coverLetter);
    const showClosingNote = openBlocks.closingNote || hasText(value.closingNote);
    const images = value.closingImages ?? [];

    const removeBlock = (key: 'coverLetter' | 'closingNote') => {
        setOpenBlocks((current) => ({ ...current, [key]: false }));
        onChange({ [key]: null });
    };

    const addImages = async (files: FileList | null) => {
        if (!files?.length) return;
        const accepted: string[] = [];
        for (const file of Array.from(files)) {
            if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
                onError(t('tenders.image_invalid_type'));
                continue;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                onError(t('tenders.image_too_large'));
                continue;
            }
            accepted.push(await fileToDataUrl(file));
        }
        if (accepted.length) onChange({ closingImages: [...images, ...accepted] });
    };

    const removeImage = (index: number) => {
        onChange({ closingImages: images.filter((_, position) => position !== index) });
    };

    return (
        <div className="space-y-2.5">
            <p className="text-[12px] text-slate-500">{t('tenders.pdf_content_hint')}</p>

            {showCoverLetter && (
                <BlockShell
                    title={t('tenders.cover_letter')}
                    hint={t('tenders.cover_letter_hint')}
                    canEdit={canEdit}
                    onRemove={() => removeBlock('coverLetter')}
                >
                    <Suspense fallback={<div className="h-32 animate-pulse rounded-[3px] bg-slate-100" />}>
                        <LazyRichTextEditor
                            value={value.coverLetter ?? ''}
                            onChange={(next) => onChange({ coverLetter: next })}
                            minHeight={160}
                        />
                    </Suspense>
                </BlockShell>
            )}

            {showClosingNote && (
                <BlockShell
                    title={t('tenders.closing_note')}
                    hint={t('tenders.closing_note_hint')}
                    canEdit={canEdit}
                    onRemove={() => removeBlock('closingNote')}
                >
                    <Suspense fallback={<div className="h-32 animate-pulse rounded-[3px] bg-slate-100" />}>
                        <LazyRichTextEditor
                            value={value.closingNote ?? ''}
                            onChange={(next) => onChange({ closingNote: next })}
                            minHeight={140}
                        />
                    </Suspense>
                </BlockShell>
            )}

            {(images.length > 0 || canEdit) && (
                <BlockShell
                    title={t('tenders.closing_image')}
                    hint={t('tenders.closing_image_hint')}
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
                multiple
                className="hidden"
                onChange={(event) => {
                    void addImages(event.target.files);
                    // Reset so re-picking the same file fires change again.
                    event.target.value = '';
                }}
            />

            {/* Quick-add row, BELOW the blocks so it never displaces text being
                written. It doubles as the readout of what this PDF carries: a
                button is only offered for a block the offer does not have yet. */}
            {canEdit && (!showCoverLetter || !showClosingNote) && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2.5">
                    {!showCoverLetter && (
                        <Button
                            size="sm"
                            variant="secondary"
                            icon={<FileText size={13} />}
                            onClick={() => setOpenBlocks((current) => ({ ...current, coverLetter: true }))}
                        >
                            {t('tenders.add_cover_letter')}
                        </Button>
                    )}
                    {!showClosingNote && (
                        <Button
                            size="sm"
                            variant="secondary"
                            icon={<ImageIcon size={13} />}
                            onClick={() => setOpenBlocks((current) => ({ ...current, closingNote: true }))}
                        >
                            {t('tenders.add_closing_note')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};
