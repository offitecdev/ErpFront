import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Check } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupCard } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { enquiriesApi, type EnquiryRow } from '@/lib/api/enquiries';

import { enquiryError } from './enquiryShared';

/**
 * ── ANFRAGE VON HAND ERFASSEN ────────────────────────────────────────────────
 *
 *   «Die Anfragen kann man auch von Hand anlegen.»
 *
 * Für den Anruf, die Messe, die Empfehlung — alles, was nicht durch das
 * Formular und nicht durch das Postfach kommt. Das Fenster fragt bewusst WENIG:
 * Betreff und eine Erreichbarkeit reichen, um die Anfrage überhaupt festzu-
 * halten. Alles Weitere trägt man im Fenster der Anfrage nach, wenn man es
 * weiss — eine lange Maske am Telefon führt nur dazu, dass gar nichts erfasst
 * wird.
 *
 * KEINE KUNDENWAHL: eine Anfrage steht VOR dem Kunden. Wer schon Kunde ist,
 * bekommt keine Anfrage, sondern einen Eintrag im Interaktionsverlauf.
 */

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: (created: EnquiryRow) => void;
};

const EMPTY = { subject: '', companyName: '', contactName: '', email: '', phone: '', message: '' };

export const EnquiryComposePopup = ({ open, onClose, onCreated }: Props) => {
    const [draft, setDraft] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

    // Beim Schliessen leeren, damit das nächste Öffnen nicht die Reste des
    // letzten Anrufs zeigt.
    useEffect(() => { if (!open) setDraft(EMPTY); }, [open]);

    const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
        setDraft((current) => ({ ...current, [key]: event.target.value }));

    /* Betreff ist Pflicht (der Server verlangt ihn), und OHNE Erreichbarkeit
       ist die Anfrage wertlos — man könnte niemandem antworten. */
    const canSave = Boolean(draft.subject.trim()) && Boolean(draft.email.trim() || draft.phone.trim());

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            const created = await enquiriesApi.create({
                subject: draft.subject.trim(),
                companyName: draft.companyName.trim() || null,
                contactName: draft.contactName.trim() || null,
                email: draft.email.trim() || null,
                phone: draft.phone.trim() || null,
                message: draft.message.trim() || null,
            });
            toast.success(t('crm.enquiry.created'));
            onCreated(created);
        } catch (error) {
            toast.error(enquiryError(error, 'crm.enquiry.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PopupCard
            open={open}
            onClose={onClose}
            width={620}
            title={t('crm.enquiry.new')}
            subtitle={t('crm.enquiry.newHint')}
            footer={
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" icon={<Check size={15} />} loading={saving} disabled={!canSave} onClick={() => void save()}>
                        {t('common.save')}
                    </PopupButton>
                </PopupActions>
            }
        >
            <label className="ofi-crm-field">
                <span>{t('crm.enquiry.subject')}</span>
                <input
                    className="ofi-crm-input"
                    value={draft.subject}
                    onChange={set('subject')}
                    placeholder={t('crm.enquiry.subjectHint')}
                    autoFocus
                />
            </label>

            <div className="ofi-crm-fields is-two" style={{ marginTop: 12 }}>
                <label className="ofi-crm-field">
                    <span>{t('crm.enquiry.companyName')}</span>
                    <input className="ofi-crm-input" value={draft.companyName} onChange={set('companyName')} />
                </label>
                <label className="ofi-crm-field">
                    <span>{t('crm.enquiry.contactName')}</span>
                    <input className="ofi-crm-input" value={draft.contactName} onChange={set('contactName')} />
                </label>
                <label className="ofi-crm-field">
                    <span>{t('crm.enquiry.email')}</span>
                    <input type="email" className="ofi-crm-input" value={draft.email} onChange={set('email')} />
                </label>
                <label className="ofi-crm-field">
                    <span>{t('crm.enquiry.phone')}</span>
                    <input className="ofi-crm-input" value={draft.phone} onChange={set('phone')} />
                </label>
            </div>

            <label className="ofi-crm-field" style={{ marginTop: 12 }}>
                <span>{t('crm.enquiry.message')}</span>
                <textarea
                    className="ofi-crm-input"
                    value={draft.message}
                    onChange={set('message')}
                    placeholder={t('crm.enquiry.messageHint')}
                />
            </label>
        </PopupCard>
    );
};
