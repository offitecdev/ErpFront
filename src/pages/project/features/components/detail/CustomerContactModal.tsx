import { Mail01 as Mail, MarkerPin01, Phone } from '@/components/icons/antIconCompat';
import {
    PopupActions,
    PopupButton,
    PopupCaption,
    PopupCard,
    PopupEmpty,
} from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';

import { ContactRow } from './ContactRow';

/**
 * Quick customer-communication card opened from the detail header — the same
 * shape as the quote module's customer card: a floating card the project stays
 * readable behind, read-only, so an outside click closes it. Pure contact
 * actions (call / mail / address), deliberately no report feed or history noise.
 */
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
    const address = customer?.address || '';
    const hasContact = Boolean(email || phone || address);

    return (
        <PopupCard
            open={open}
            onClose={onClose}
            title={customer?.companyName || project.customerId}
            subtitle={t('projects.customerContact')}
            width={400}
            closeOnOutside
            footer={hasContact && (phone || email) ? (
                <PopupActions>
                    {phone && (
                        <PopupButton icon={<Phone size={14} />} onClick={() => { window.location.href = `tel:${phone}`; }}>
                            {t('projects.detail.contactCall')}
                        </PopupButton>
                    )}
                    {email && (
                        <PopupButton variant="primary" icon={<Mail size={14} />} onClick={() => { window.location.href = `mailto:${email}`; }}>
                            {t('projects.detail.contactMail')}
                        </PopupButton>
                    )}
                </PopupActions>
            ) : undefined}
        >
            {hasContact ? (
                <>
                    <PopupCaption>{t('projects.detail.contactTitle')}</PopupCaption>
                    <div className="space-y-2 pb-1">
                        <ContactRow icon={<Mail size={14} />} value={email || undefined} href={email ? `mailto:${email}` : undefined} />
                        <ContactRow icon={<Phone size={14} />} value={phone || undefined} href={phone ? `tel:${phone}` : undefined} />
                        <ContactRow icon={<MarkerPin01 size={14} />} value={address || undefined} />
                    </div>
                </>
            ) : (
                <PopupEmpty>{t('projects.detail.contactNone')}</PopupEmpty>
            )}
        </PopupCard>
    );
};
