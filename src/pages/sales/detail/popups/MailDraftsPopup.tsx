import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ArrowLeft, CornerDownRight, Edit01, Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { tenderApi } from '@/lib/api/tender';
import type { TenderMailDraftDto } from '@/types/tender';

import { RichTextMarkdownEditor, richTextToPlain } from '../TenderRichText';
import { PopupActions, PopupButton, PopupEmpty, PopupField, TenderFloatCard } from './shell/TenderPopupShell';

// ── one draft row ────────────────────────────────────────────────────────────
// Click the row to apply the draft to the composer; edit / delete on the right.

const MailDraftRow = ({
    draft,
    onApply,
    onEdit,
    onDelete,
    deleting,
}: {
    draft: TenderMailDraftDto;
    onApply: (draft: TenderMailDraftDto) => void;
    onEdit: (draft: TenderMailDraftDto) => void;
    onDelete: (draft: TenderMailDraftDto) => void;
    deleting: boolean;
}) => (
    <div className="ofi-tp-row__wrap">
        <div className="ofi-tp-row is-clickable" role="button" tabIndex={0} title={t('tenders.mail_draft_apply')}
            onClick={() => onApply(draft)}
            onKeyDown={(event) => { if (event.key === 'Enter') onApply(draft); }}
        >
            <CornerDownRight size={15} className="shrink-0" style={{ color: 'var(--ofi-cal-accent)' }} />
            <span className="ofi-tp-row__main">
                <span className="ofi-tp-row__title">{draft.subject || t('tenders.mail_draft_untitled')}</span>
                {draft.message && <span className="ofi-tp-row__meta">{richTextToPlain(draft.message)}</span>}
            </span>
            <button
                type="button"
                title={t('common.edit')}
                aria-label={t('common.edit')}
                onClick={(event) => { event.stopPropagation(); onEdit(draft); }}
                className="ofi-tp-rowbtn"
            >
                <Edit01 size={14} />
            </button>
            <button
                type="button"
                title={t('common.remove')}
                aria-label={t('common.remove')}
                disabled={deleting}
                onClick={(event) => { event.stopPropagation(); onDelete(draft); }}
                className="ofi-tp-rowbtn is-danger"
            >
                <Trash01 size={14} />
            </button>
        </div>
    </div>
);

// ── the popup ────────────────────────────────────────────────────────────────
// Floats beside the "Drafts" button of the mail form. Lists the tenant-wide
// drafts from the database; stays open until explicitly closed. Clicking a
// draft applies it to the mail composer (via onApply) and closes. Editing swaps
// the list for the inline edit view — no extra popup.

type MailDraftsPopupProps = {
    open: boolean;
    onClose: () => void;
    // Current compose-form content — used to seed a NEW draft.
    currentSubject: string;
    currentMessage: string;
    onApply: (draft: Pick<TenderMailDraftDto, 'subject' | 'message'>) => void;
};

export const MailDraftsPopup = ({ open, onClose, currentSubject, currentMessage, onApply }: MailDraftsPopupProps) => {
    const [drafts, setDrafts] = useState<TenderMailDraftDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    // null = list view; 'new' = creating; otherwise the draft being edited.
    const [editing, setEditing] = useState<'new' | TenderMailDraftDto | null>(null);
    const [editSubject, setEditSubject] = useState('');
    const [editMessage, setEditMessage] = useState('');

    useEffect(() => {
        if (!open) return;
        setEditing(null);
        void (async () => {
            setLoading(true);
            try {
                setDrafts(await tenderApi.listMailDrafts());
            } catch (e: any) {
                toast.error(e.response?.data?.error || t('tenders.mail_draft_load_failed'));
            } finally {
                setLoading(false);
            }
        })();
    }, [open]);

    const startEdit = (target: 'new' | TenderMailDraftDto) => {
        // Create mode seeds from the compose form; edit mode from the draft.
        setEditSubject(target === 'new' ? currentSubject : target.subject);
        setEditMessage(target === 'new' ? currentMessage : (target.message || ''));
        setEditing(target);
    };

    const saveDraft = async () => {
        setSaving(true);
        try {
            if (editing && editing !== 'new') {
                const updated = await tenderApi.updateMailDraft(editing.id, { subject: editSubject, message: editMessage || null });
                setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            } else {
                const created = await tenderApi.createMailDraft({ subject: editSubject, message: editMessage || null });
                setDrafts((prev) => [created, ...prev]);
            }
            setEditing(null);
            toast.success(t('tenders.mail_draft_saved'));
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('tenders.mail_draft_save_failed'));
        } finally {
            setSaving(false);
        }
    };

    const deleteDraft = async (draft: TenderMailDraftDto) => {
        setDeletingId(draft.id);
        try {
            await tenderApi.deleteMailDraft(draft.id);
            setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
            toast.success(t('tenders.mail_draft_deleted'));
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('tenders.mail_draft_delete_failed'));
        } finally {
            setDeletingId(null);
        }
    };

    const applyToForm = (values: Pick<TenderMailDraftDto, 'subject' | 'message'>) => {
        onApply(values);
        toast.success(t('tenders.mail_draft_applied'));
        // Back to the mail section with the content loaded.
        onClose();
    };

    const isEditing = editing !== null;

    return (
        <TenderFloatCard
            open={open}
            onClose={onClose}
            title={isEditing
                ? (editing === 'new' ? t('tenders.mail_draft_new') : t('tenders.mail_draft_edit_title'))
                : t('tenders.mail_drafts')}
            subtitle={isEditing ? undefined : t('tenders.mail_drafts_description')}
            width={560}
            footer={isEditing ? (
                <PopupActions
                    start={(
                        <PopupButton onClick={() => setEditing(null)} icon={<ArrowLeft size={14} />}>{t('common.back')}</PopupButton>
                    )}
                >
                    <PopupButton onClick={() => applyToForm({ subject: editSubject, message: editMessage })} icon={<CornerDownRight size={14} />}>
                        {t('tenders.mail_draft_transfer')}
                    </PopupButton>
                    <PopupButton variant="primary" loading={saving} onClick={saveDraft}>{t('common.save')}</PopupButton>
                </PopupActions>
            ) : (
                <PopupActions>
                    <PopupButton variant="primary" icon={<Plus size={14} />} onClick={() => startEdit('new')}>{t('tenders.mail_draft_new')}</PopupButton>
                </PopupActions>
            )}
        >
            {isEditing ? (
                <>
                    <PopupField label={t('tenders.konu')}>
                        <input autoFocus className="ofi-cal-input w-full" value={editSubject} onChange={(event) => setEditSubject(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('tenders.mail_draft_message')}>
                        <RichTextMarkdownEditor value={editMessage} onChange={setEditMessage} minHeight={220} placeholder="" />
                    </PopupField>
                </>
            ) : loading ? (
                <PopupEmpty>{t('common.loading')}</PopupEmpty>
            ) : drafts.length === 0 ? (
                <div className="ofi-cal-emptyline my-2">{t('tenders.mail_draft_empty')}</div>
            ) : (
                <div className="ofi-tp-list ofi-tp-list--scroll" style={{ maxHeight: 420 }}>
                    {drafts.map((draft) => (
                        <MailDraftRow
                            key={draft.id}
                            draft={draft}
                            onApply={applyToForm}
                            onEdit={startEdit}
                            onDelete={deleteDraft}
                            deleting={deletingId === draft.id}
                        />
                    ))}
                </div>
            )}
        </TenderFloatCard>
    );
};
