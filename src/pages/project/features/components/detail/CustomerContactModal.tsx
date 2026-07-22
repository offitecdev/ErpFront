import { Building02, Mail01 as Mail, MarkerPin01, Phone } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';

import { ContactRow } from './ContactRow';

// Quick customer-communication pop-up opened from the detail header. Pure contact
// actions (call / mail / address) — deliberately no report feed or history noise.
export const CustomerContactModal = ({
    project,
    open,
    onClose,
}: {
    project: ProjectDto;
    open: boolean;
    onClose: () => void;
}) => {
    const customer = project.customer;
    const email = customer?.mainEmail || '';
    const phone = customer?.mainPhone || '';

    return (
        <Modal open={open} width="sm" title={t('projects.detail.contactTitle')} onClose={onClose}>
            <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50/60 px-3.5 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#272f67] text-white">
                        <Building02 size={16} />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold text-slate-900">{customer?.companyName || project.customerId}</div>
                        <div className="text-[11.5px] text-slate-500">{t('projects.customerContact')}</div>
                    </div>
                </div>

                {!email && !phone && !customer?.address ? (
                    <div className="rounded-md border border-slate-200/70 bg-white px-4 py-6 text-center text-[12px] text-slate-500">
                        {t('projects.detail.contactNone')}
                    </div>
                ) : (
                    <div className="space-y-2.5 text-[12.5px]">
                        <ContactRow icon={<Mail size={13} />} value={email || undefined} href={email ? `mailto:${email}` : undefined} />
                        <ContactRow icon={<Phone size={13} />} value={phone || undefined} href={phone ? `tel:${phone}` : undefined} />
                        <ContactRow icon={<MarkerPin01 size={13} />} value={customer?.address || undefined} />
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    {phone && (
                        <a href={`tel:${phone}`} className="inline-flex">
                            <Button variant="secondary" size="sm" icon={<Phone size={13} />}>{t('projects.detail.contactCall')}</Button>
                        </a>
                    )}
                    {email && (
                        <a href={`mailto:${email}`} className="inline-flex">
                            <Button variant="secondary" size="sm" icon={<Mail size={13} />}>{t('projects.detail.contactMail')}</Button>
                        </a>
                    )}
                </div>
            </div>
        </Modal>
    );
};
