import { useState } from 'react';
import { toast } from 'sonner';

import { Bell01 as Bell, Mail01 as Mail, Send01 as Send } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Checkbox } from '@/components/ui-shared/Checkbox';
import { Field, Input } from '@/components/ui-shared/Field';
import { t } from '@/i18n/translate';

export type SignatureDispatchChannels = {
    notifyTechnician: boolean;
    sendEmail: boolean;
    email: string;
};

/**
 * Channel picker for one signature request: notify the technician in the app,
 * e-mail the customer a signing link, or both. Mount it with `key={rowKey}` —
 * the channel state is per selected document and resets on remount.
 */
export const SignatureDispatchPanel = ({
    title,
    signatories,
    defaultEmail,
    busy,
    onCancel,
    onSend,
}: {
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
        <div className="space-y-2 rounded-[3px] border border-slate-200 bg-white p-3 dark:border-white/15 dark:bg-transparent">
            <div className="text-[12px] font-semibold text-slate-700 dark:text-white/80">{title} · {t('signatures.dualOption')}</div>
            {signatories.length > 0 && (
                <div className="text-[11.5px] text-slate-500 dark:text-white/60">
                    <span className="font-semibold">{t('projects.reportsHub.signatories')}: </span>
                    {signatories.join(', ')}
                </div>
            )}
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
            <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={onCancel}>{t('common.close')}</Button>
                <Button variant="primary" size="sm" icon={<Send size={13} />} loading={busy} onClick={send}>{t('signatures.send')}</Button>
            </div>
        </div>
    );
};
