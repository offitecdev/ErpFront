import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Check, Copy01, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { PopupActions, PopupButton, PopupCard } from '@/components/ui-shared/PopupKit';
import { Switch } from '@/components/ui-shared/Switch';
import { t } from '@/i18n/translate';
import { enquiriesApi, type EnquiryFormDto } from '@/lib/api/enquiries';

import { enquiryError } from './enquiryShared';

/**
 * ── DAS ÖFFENTLICHE ANFRAGEFORMULAR EINSTELLEN ───────────────────────────────
 *
 * Der Link steht auf der Anfragenseite; hier wird eingestellt, was die Person
 * am anderen Ende sieht: Titel, Einleitung und der Text nach dem Absenden.
 *
 * ZWEI DINGE, DIE MAN NICHT VERSEHENTLICH TUN SOLL:
 *   • ABSCHALTEN — der Link antwortet dann wie ein unbekannter Link (er
 *     verrät nicht, dass es ihn einmal gab).
 *   • NEUER LINK — der alte ist danach tot. Wer ihn auf einer Webseite oder in
 *     einer Signatur stehen hat, muss ihn dort ersetzen; darum fragt es nach.
 */

type Props = {
    open: boolean;
    form: EnquiryFormDto;
    /** Die volle Adresse — sie kommt von der Seite, die den Browser kennt. */
    url: string;
    onClose: () => void;
    onSaved: (next: EnquiryFormDto) => void;
};

export const EnquiryFormPopup = ({ open, form, url, onClose, onSaved }: Props) => {
    const [title, setTitle] = useState(form.title || '');
    const [intro, setIntro] = useState(form.intro || '');
    const [thanks, setThanks] = useState(form.thanks || '');
    const [saving, setSaving] = useState(false);
    const [askRotate, setAskRotate] = useState(false);

    // Beim Öffnen den gespeicherten Stand zeigen — nicht die Reste des letzten Mals.
    useEffect(() => {
        if (!open) return;
        setTitle(form.title || '');
        setIntro(form.intro || '');
        setThanks(form.thanks || '');
    }, [open, form]);

    const patch = async (body: Parameters<typeof enquiriesApi.updateForm>[0], quiet = false) => {
        try {
            const next = await enquiriesApi.updateForm(body);
            onSaved(next);
            if (!quiet) toast.success(t('crm.enquiry.formSaved'));
            return true;
        } catch (error) {
            toast.error(enquiryError(error, 'crm.enquiry.saveError'));
            return false;
        }
    };

    const save = async () => {
        setSaving(true);
        await patch({ title: title.trim() || null, intro: intro.trim() || null, thanks: thanks.trim() || null });
        setSaving(false);
    };

    const rotate = async () => {
        try {
            onSaved(await enquiriesApi.rotateForm());
            setAskRotate(false);
            toast.success(t('crm.enquiry.linkRotated'));
        } catch (error) {
            toast.error(enquiryError(error, 'crm.enquiry.saveError'));
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t('common.copied'));
        } catch {
            toast.error(t('crm.enquiry.copyError'));
        }
    };

    const dirty = title !== (form.title || '') || intro !== (form.intro || '') || thanks !== (form.thanks || '');

    return (
        <>
            <PopupCard
                open={open}
                onClose={onClose}
                width={620}
                title={t('crm.enquiry.formSettings')}
                subtitle={t('crm.enquiry.formSettingsHint')}
                footer={
                    <PopupActions>
                        <PopupButton onClick={onClose}>{t('common.close')}</PopupButton>
                        <PopupButton variant="primary" icon={<Check size={15} />} loading={saving} disabled={!dirty} onClick={() => void save()}>
                            {t('common.save')}
                        </PopupButton>
                    </PopupActions>
                }
            >
                <div className="ofi-crm-link" style={{ border: 0, padding: 0 }}>
                    <code className="ofi-crm-link__url" title={url}>{url}</code>
                    <button type="button" className="ofi-crm-btn" onClick={() => void copy()}>
                        <Copy01 size={14} />
                        {t('common.copy')}
                    </button>
                    <button type="button" className="ofi-crm-btn" onClick={() => setAskRotate(true)}>
                        <RefreshCcw01 size={14} />
                        {t('crm.enquiry.newLink')}
                    </button>
                </div>

                <div className="ofi-crm-sectiontitle">{t('crm.enquiry.formState')}</div>
                <div className="flex items-center gap-3">
                    <Switch
                        checked={form.active}
                        onChange={(next) => void patch({ active: next }, true)}
                        label={t('crm.enquiry.formStateToggle')}
                    />
                    <span className="text-[13px]">
                        {form.active ? t('crm.enquiry.formActive') : t('crm.enquiry.formInactive')}
                    </span>
                </div>

                <div className="ofi-crm-sectiontitle">{t('crm.enquiry.formTexts')}</div>
                <label className="ofi-crm-field">
                    <span>{t('crm.enquiry.formTitle')}</span>
                    <input
                        className="ofi-crm-input"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder={t('crm.enquiry.formTitleDefault')}
                    />
                </label>
                <label className="ofi-crm-field" style={{ marginTop: 12 }}>
                    <span>{t('crm.enquiry.formIntro')}</span>
                    <textarea
                        className="ofi-crm-input"
                        value={intro}
                        onChange={(event) => setIntro(event.target.value)}
                        placeholder={t('crm.enquiry.formIntroDefault')}
                    />
                </label>
                <label className="ofi-crm-field" style={{ marginTop: 12 }}>
                    <span>{t('crm.enquiry.formThanks')}</span>
                    <textarea
                        className="ofi-crm-input"
                        value={thanks}
                        onChange={(event) => setThanks(event.target.value)}
                        placeholder={t('crm.enquiry.formThanksDefault')}
                    />
                </label>
            </PopupCard>

            <ConfirmDialog
                open={askRotate}
                title={t('crm.enquiry.newLinkTitle')}
                message={t('crm.enquiry.newLinkWarning')}
                tone="danger"
                confirmLabel={t('crm.enquiry.newLink')}
                onConfirm={() => void rotate()}
                onCancel={() => setAskRotate(false)}
            />
        </>
    );
};
