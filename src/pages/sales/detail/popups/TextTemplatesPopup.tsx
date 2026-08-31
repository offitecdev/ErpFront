import { lazy, Suspense } from 'react';

import { ArrowLeft, Check, Edit01, Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { TenderTextTemplateDto } from '@/types/tender';

import { PopupActions, PopupButton, PopupEmpty, PopupField, TenderFloatCard } from './shell/TenderPopupShell';

const LazyRichTextEditor = lazy(() =>
    import('../components/RichTextMarkdownEditor').then((mod) => ({ default: mod.RichTextMarkdownEditor })),
);

const previewOf = (content: string | null | undefined) =>
    (content ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);

type TextTemplatesPopupProps = {
    open: boolean;
    onClose: () => void;
    canEdit: boolean;
    /* list = pick / manage; form = create or edit one template. */
    view: 'list' | 'form';
    onViewChange: (view: 'list' | 'form') => void;
    templates: TenderTextTemplateDto[] | null;
    loading: boolean;
    busy: boolean;
    editingTemplate: TenderTextTemplateDto | null;
    formTitle: string;
    onFormTitleChange: (value: string) => void;
    formContent: string;
    onFormContentChange: (value: string) => void;
    onApply: (template: TenderTextTemplateDto) => void;
    onStartNew: () => void;
    onStartEdit: (template: TenderTextTemplateDto) => void;
    onMakeDefault: (template: TenderTextTemplateDto) => void;
    onDelete: (template: TenderTextTemplateDto) => void;
    onSave: () => void;
};

/**
 * Textbausteine — the intro-text templates of the PDF tab. Floats beside the
 * "Textbausteine" button of the intro block; the editor it fills stays visible.
 * List view: click a row to apply it, edit / default / delete on the right.
 * Form view: title + rich text, Back returns to the list. The panel owns the
 * data and the handlers; this is only the window.
 */
export const TextTemplatesPopup = ({
    open,
    onClose,
    canEdit,
    view,
    onViewChange,
    templates,
    loading,
    busy,
    editingTemplate,
    formTitle,
    onFormTitleChange,
    formContent,
    onFormContentChange,
    onApply,
    onStartNew,
    onStartEdit,
    onMakeDefault,
    onDelete,
    onSave,
}: TextTemplatesPopupProps) => (
    <TenderFloatCard
        open={open}
        onClose={onClose}
        title={view === 'form'
            ? (editingTemplate ? editingTemplate.title : t('tenders.text_template_add'))
            : t('tenders.text_templates')}
        subtitle={view === 'form' ? undefined : t('tenders.text_templates_hint')}
        width={620}
        footer={view === 'list' ? (
            canEdit ? (
                <PopupActions>
                    <PopupButton icon={<Plus size={14} />} onClick={onStartNew}>{t('tenders.text_template_add')}</PopupButton>
                </PopupActions>
            ) : undefined
        ) : (
            <PopupActions start={<PopupButton icon={<ArrowLeft size={14} />} onClick={() => onViewChange('list')}>{t('common.back')}</PopupButton>}>
                <PopupButton variant="primary" disabled={busy} onClick={onSave}>{t('common.save')}</PopupButton>
            </PopupActions>
        )}
    >
        {view === 'list' ? (
            <>
                {loading && (
                    <div className="space-y-2 py-1">
                        <div className="ofi-shimmer h-11 rounded-[8px]" style={{ background: 'var(--ofi-cal-hover)' }} />
                        <div className="ofi-shimmer h-11 rounded-[8px]" style={{ background: 'var(--ofi-cal-hover)' }} />
                    </div>
                )}
                {!loading && (templates?.length ?? 0) === 0 && <PopupEmpty>{t('tenders.text_templates_empty')}</PopupEmpty>}
                {!loading && (templates?.length ?? 0) > 0 && (
                    <div className="ofi-tp-list ofi-tp-list--scroll" style={{ maxHeight: 440 }}>
                        {(templates ?? []).map((template) => (
                            <div key={template.id} className="ofi-tp-row__wrap">
                                <div
                                    role="button"
                                    tabIndex={0}
                                    title={t('tenders.text_template_apply')}
                                    onClick={() => onApply(template)}
                                    onKeyDown={(event) => { if (event.key === 'Enter') onApply(template); }}
                                    className="ofi-tp-row is-clickable"
                                >
                                    <span className="ofi-tp-row__main">
                                        <span className="ofi-tp-row__title flex items-center gap-2">
                                            <span className="min-w-0 truncate">{template.title || t('tenders.text_template_untitled')}</span>
                                            {template.isDefault && <span className="ofi-tp-badge">{t('tenders.text_template_default')}</span>}
                                        </span>
                                        <span className="ofi-tp-row__meta">{previewOf(template.content)}</span>
                                    </span>
                                    {canEdit && (
                                        <button
                                            type="button"
                                            onClick={(event) => { event.stopPropagation(); onStartEdit(template); }}
                                            title={t('common.edit')}
                                            aria-label={t('common.edit')}
                                            className="ofi-tp-rowbtn"
                                        >
                                            <Edit01 size={14} />
                                        </button>
                                    )}
                                    {canEdit && !template.isDefault && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={(event) => { event.stopPropagation(); onMakeDefault(template); }}
                                            title={t('tenders.text_template_make_default')}
                                            aria-label={t('tenders.text_template_make_default')}
                                            className="ofi-tp-rowbtn"
                                        >
                                            <Check size={14} />
                                        </button>
                                    )}
                                    {canEdit && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={(event) => { event.stopPropagation(); onDelete(template); }}
                                            title={t('common.delete')}
                                            aria-label={t('common.delete')}
                                            className="ofi-tp-rowbtn is-danger"
                                        >
                                            <Trash01 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </>
        ) : (
            <>
                <PopupField label={t('tenders.text_template_title_placeholder')}>
                    <input autoFocus className="ofi-cal-input w-full" value={formTitle} onChange={(event) => onFormTitleChange(event.target.value)} />
                </PopupField>
                <Suspense fallback={<div className="ofi-shimmer h-40 rounded-[8px]" style={{ background: 'var(--ofi-cal-hover)' }} />}>
                    <LazyRichTextEditor value={formContent} onChange={onFormContentChange} minHeight={240} />
                </Suspense>
            </>
        )}
    </TenderFloatCard>
);
