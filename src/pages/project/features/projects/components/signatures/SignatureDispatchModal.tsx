import { Send01 as Send, Bell01 as Bell, Mail01 as Mail } from '@/components/icons/antIconCompat';

import { Button } from '@/components/ui-shared/Button';
import { Checkbox } from '@/components/ui-shared/Checkbox';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { SnapshotView } from '@/components/ui-shared/SnapshotView';
import { t } from '@/i18n/translate';

import type { SignatureDispatchTarget } from '../../types/signatureTypes';

/**
 * Dispatch modal for a selected signature target: snapshot preview plus the
 * dual send channel (notify technician / email customer) and the send action.
 */
export const SignatureDispatchModal = ({
    target,
    notifyTech,
    emailCustomer,
    email,
    busy,
    onNotifyTechChange,
    onEmailCustomerChange,
    onEmailChange,
    onClose,
    onSend,
}: {
    target: SignatureDispatchTarget | null;
    notifyTech: boolean;
    emailCustomer: boolean;
    email: string;
    busy: boolean;
    onNotifyTechChange: (value: boolean) => void;
    onEmailCustomerChange: (value: boolean) => void;
    onEmailChange: (value: string) => void;
    onClose: () => void;
    onSend: () => void;
}) => (
    <Modal
        open={Boolean(target)}
        title={t('signatures.sendForSignature')}
        description={target?.title || ''}
        onClose={onClose}
        width="xl"
        footer={
            <>
                <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
                <Button variant="primary" icon={<Send size={13} />} loading={busy} onClick={onSend}>{t('signatures.send')}</Button>
            </>
        }
    >
        {target && (
            <div className="max-h-[64vh] space-y-4 overflow-y-auto pr-1">
                {target.alreadySigned && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('signatures.alreadySignedNote')}</div>
                )}
                <SnapshotView snapshot={target.snapshot} />

                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <div className="text-[12px] font-semibold text-slate-700">{t('signatures.dualOption')}</div>
                    <Checkbox
                        label={<span className="inline-flex items-center gap-1.5"><Bell size={13} /> {t('signatures.notifyTechnician')}</span>}
                        hint={t('signatures.notifyTechnicianHint')}
                        size="sm"
                        isSelected={notifyTech}
                        onChange={onNotifyTechChange}
                        className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
                    />
                    <Checkbox
                        label={<span className="inline-flex items-center gap-1.5"><Mail size={13} /> {t('signatures.emailCustomerOpt')}</span>}
                        hint={t('signatures.emailCustomerHint')}
                        size="sm"
                        isSelected={emailCustomer}
                        onChange={onEmailCustomerChange}
                        className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
                    />
                    {emailCustomer && (
                        <Field label={t('signatures.customerEmail')}>
                            <Input type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="kunde@example.ch" />
                        </Field>
                    )}
                </div>
            </div>
        )}
    </Modal>
);

export default SignatureDispatchModal;
