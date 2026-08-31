import { useState } from 'react';
import { toast } from 'sonner';

import { Bell01 as Bell, Mail01 as Mail, Send01 as Send } from '@/components/icons/antIconCompat';
import { Checkbox } from '@/components/ui-shared/Checkbox';
import { Field, Input } from '@/components/ui-shared/Field';
import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';

export type SignatureDispatchChannels = {
    notifyTechnician: boolean;
    sendEmail: boolean;
    email: string;
};

/**
 * Channel picker for one signature request: notify the technician in the app,
 * e-mail the customer a signing link, or both.
 *
 * Since 19.08.2026 it is a POPUP, not a strip under the table (user request):
 * "Zur Signatur senden" is a decision, and a decision belongs in front of the
 * list it was taken from — appended at the bottom it was easy to miss and, on
 * a long list, off screen entirely. Mount it with `key={rowKey}` — the channel
 * state is per selected document and resets on remount.
 */
export const SignatureDispatchDialog = ({
    open = true,
    title,
    signatories,
    defaultEmail,
    busy,
    onCancel,
    onSend,
}: {
    open?: boolean;
    title: string;
    /** Everyone whose signature the request asks for, shown before sending. */
    signatories: string[];
    defaultEmail: string;
    busy: boolean;
    onCancel: () => void;
    onSend: (channels: SignatureDispatchChannels) => void;
}) => {
    const [notifyTechnician, setNotifyTechnician] = useState(true);
    const [emailCustomer, setEmailCustomer] = useState(Boolean(defaultEmail));
    const [email, setEmail] = useState(defaultEmail);

    const send = () => {
        const sendEmail = emailCustomer && Boolean(email.trim());
        if (!notifyTechnician && !sendEmail) {
            toast.error(t('signatures.chooseChannel'));
            return;
        }
        onSend({ notifyTechnician, sendEmail, email: email.trim() });
    };

    return (
        <PopupDialog
            open={open}
            onClose={onCancel}
            width={460}
            icon={<Send size={16} />}
            title={`${title} · ${t('signatures.dualOption')}`}
            subtitle={signatories.length > 0
                ? `${t('projects.reportsHub.signatories')}: ${signatories.join(', ')}`
                : undefined}
            /* Eine halb gewählte Versandart darf kein Klick daneben verwerfen. */
            closeOnBackdrop={false}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onCancel}>{t('common.close')}</PopupButton>
                    <PopupButton variant="primary" loading={busy} icon={<Send size={14} />} onClick={send}>
                        {t('signatures.send')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="space-y-2.5">
                <Checkbox
                    label={<span className="inline-flex items-center gap-1.5"><Bell size={13} /> {t('signatures.notifyTechnician')}</span>}
                    hint={t('signatures.notifyTechnicianHint')}
                    size="sm"
                    isSelected={notifyTechnician}
                    onChange={setNotifyTechnician}
                />
                <Checkbox
                    label={<span className="inline-flex items-center gap-1.5"><Mail size={13} /> {t('signatures.emailCustomerOpt')}</span>}
                    hint={t('signatures.emailCustomerHint')}
                    size="sm"
                    isSelected={emailCustomer}
                    onChange={setEmailCustomer}
                />
                {emailCustomer && (
                    <Field label={t('signatures.customerEmail')}>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kunde@example.ch" />
                    </Field>
                )}
            </div>
        </PopupDialog>
    );
};
