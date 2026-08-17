import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    ArrowLeft,
    Edit01 as Pencil,
    Plus,
    Trash01 as Trash2,
} from '@/components/icons/antIconCompat';

import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { tenderApi } from '@/lib/api/tender';
import type { TenderMailDraftDto } from '@/types/tender';
import { t } from '@/i18n/translate';
import { RichTextMarkdownEditor, richTextToPlain } from '../../TenderRichText';

// ── MailDraftCard ────────────────────────────────────────────────────────────
// One draft row in the side pop-up: apply arrow on the LEFT, subject + message
// preview in the middle, Edit / Delete on the right.

type MailDraftCardProps = {
    draft: TenderMailDraftDto;
    onApply: (draft: TenderMailDraftDto) => void;
    onEdit: (draft: TenderMailDraftDto) => void;
    onDelete: (draft: TenderMailDraftDto) => void;
    deleting: boolean;
};

const MailDraftCard: React.FC<MailDraftCardProps> = ({ draft, onApply, onEdit, onDelete, deleting }) => (
    <div className="flex items-start gap-2 rounded-[2px] border border-slate-200 bg-white p-3 shadow-sm">
        <button
            type="button"
            title={t('tenders.mail_draft_apply')}
            onClick={() => onApply(draft)}
            className="mt-0.5 shrink-0 rounded-[2px] border border-blue-200 bg-blue-50 p-1.5 text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100"
        >
            <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-slate-800">
                {draft.subject || t('tenders.mail_draft_untitled')}
            </div>
            {draft.message && (
                <div className="mt-0.5 line-clamp-2 whitespace-pre-line text-[11.5px] text-slate-500">
                    {richTextToPlain(draft.message)}
                </div>
            )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
            <Button
                variant="secondary"
                size="sm"
                icon={<Pencil size={11} />}
                onClick={() => onEdit(draft)}
            >
                {t('common.edit')}
            </Button>
            <button
                type="button"
                title={t('common.remove')}
                disabled={deleting}
                onClick={() => onDelete(draft)}
                className="rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            >
                <Trash2 size={13} />
            </button>
        </div>
    </div>
);

// ── MailDraftEditView ────────────────────────────────────────────────────────
// Inline edit mode rendered INSIDE the side pop-up (no nested modal): subject +
// message fields with Back / Transfer-to-form / Save actions.

type MailDraftEditViewProps = {
    isNew: boolean;
    subject: string;
    message: string;
    saving: boolean;
    onSubjectChange: (value: string) => void;
    onMessageChange: (value: string) => void;
    onBack: () => void;
    onTransfer: () => void;
    onSave: () => void;
};

const MailDraftEditView: React.FC<MailDraftEditViewProps> = ({ isNew, subject, message, saving, onSubjectChange, onMessageChange, onBack, onTransfer, onSave }) => (
    <div className="space-y-3">
        <div className="flex items-center justify-between">
            <Button variant="secondary" size="sm" icon={<ArrowLeft size={12} />} onClick={onBack}>
                {t('common.back')}
            </Button>
            <span className="text-[12px] font-semibold text-slate-600">
                {isNew ? t('tenders.mail_draft_new') : t('tenders.mail_draft_edit_title')}
            </span>
        </div>
        <Field label={t('tenders.konu')}>
            <Input value={subject} onChange={(e) => onSubjectChange(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-secondary">{t('tenders.mail_draft_message')}</span>
            <RichTextMarkdownEditor
                value={message}
                onChange={onMessageChange}
                minHeight={240}
                placeholder=""
            />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={onTransfer}>
                {t('tenders.mail_draft_transfer')}
            </Button>
            <Button variant="primary" loading={saving} onClick={onSave}>
                {t('common.save')}
            </Button>
        </div>
    </div>
);

// ── MailDraftsDrawer ─────────────────────────────────────────────────────────
// The side pop-up. Lists the tenant-wide drafts from the database; stays open
// until explicitly closed. The ← arrow on a draft applies it to the mail
// composer (via onApply) and returns to the mail section. Editing swaps the
// list for the inline edit view — no extra pop-up.

type MailDraftsDrawerProps = {
    open: boolean;
    onClose: () => void;
    // Current compose-form content — used to seed a NEW draft.
    currentSubject: string;
    currentMessage: string;
    onApply: (draft: Pick<TenderMailDraftDto, 'subject' | 'message'>) => void;
};

export const MailDraftsDrawer: React.FC<MailDraftsDrawerProps> = ({ open, onClose, currentSubject, currentMessage, onApply }) => {
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
        // ← navigates back to the mail section with the content loaded.
        onClose();
    };

    return (
        <Modal
            open={open}
            title={t('tenders.mail_drafts')}
            description={t('tenders.mail_drafts_description')}
            onClose={onClose}
            placement="drawer"
            drawerWidth="md"
            footer={editing === null ? (
                <Button
                    variant="primary"
                    icon={<Plus size={13} />}
                    onClick={() => startEdit('new')}
                >
                    {t('tenders.mail_draft_new')}
                </Button>
            ) : undefined}
        >
            {editing !== null ? (
                <MailDraftEditView
                    isNew={editing === 'new'}
                    subject={editSubject}
                    message={editMessage}
                    saving={saving}
                    onSubjectChange={setEditSubject}
                    onMessageChange={setEditMessage}
                    onBack={() => setEditing(null)}
                    onTransfer={() => applyToForm({ subject: editSubject, message: editMessage })}
                    onSave={saveDraft}
                />
            ) : loading ? (
                <div className="py-10 text-center text-[12px] text-slate-400">…</div>
            ) : drafts.length === 0 ? (
                <div className="rounded-[2px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[12px] text-slate-400">
                    {t('tenders.mail_draft_empty')}
                </div>
            ) : (
                <div className="space-y-2">
                    {drafts.map((draft) => (
                        <MailDraftCard
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
        </Modal>
    );
};
