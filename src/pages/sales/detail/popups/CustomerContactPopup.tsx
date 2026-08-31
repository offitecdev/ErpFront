import { Mail01, MarkerPin01, Phone } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { PopupCaption, PopupEmpty, TenderFloatCard } from './shell/TenderPopupShell';

/**
 * Customer card of the quote — the same idea as the calendar's appointment
 * detail: the customer with their contact data, opened by clicking the
 * customer in the quote card. Read-only, so it closes on an outside click.
 *
 * CC recipients are DELIBERATELY not here (user request 13.08.2026): they
 * belong to the quote's mail area (`TenderCcField`).
 */
export const CustomerContactPopup = ({
    open,
    onClose,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
}: {
    open: boolean;
    onClose: () => void;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerAddress?: string | null;
}) => {
    const hasContact = Boolean(customerEmail || customerPhone || customerAddress);

    return (
        <TenderFloatCard
            open={open}
            onClose={onClose}
            title={customerName || t('tenders.customer_not_found')}
            subtitle={t('tenders.customer_details')}
            width={400}
            closeOnOutside
        >
            {hasContact ? (
                <>
                    <PopupCaption>{t('calendar.detail.contact')}</PopupCaption>
                    <div className="space-y-2 pb-1 text-[13px]" style={{ color: 'var(--ofi-cal-text)' }}>
                        {customerEmail && (
                            <a href={`mailto:${customerEmail}`} className="flex items-center gap-2.5 hover:underline">
                                <Mail01 size={14} style={{ color: 'var(--ofi-cal-muted)' }} />
                                <span className="min-w-0 truncate">{customerEmail}</span>
                            </a>
                        )}
                        {customerPhone && (
                            <a href={`tel:${customerPhone}`} className="flex items-center gap-2.5 hover:underline">
                                <Phone size={14} style={{ color: 'var(--ofi-cal-muted)' }} />
                                <span>{customerPhone}</span>
                            </a>
                        )}
                        {customerAddress && (
                            <div className="flex items-start gap-2.5">
                                <MarkerPin01 size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--ofi-cal-muted)' }} />
                                <span className="whitespace-pre-line">{customerAddress}</span>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <PopupEmpty>{t('tenders.customer_contact_missing')}</PopupEmpty>
            )}
        </TenderFloatCard>
    );
};
