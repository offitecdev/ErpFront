import { Mail01, MarkerPin01, Phone, User01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { CenterModal } from '@/pages/calendar/components/shells';

/**
 * Kundenkarte der Offerte — dasselbe Fenster wie im Kalender (Termindetail):
 * der Kunde mit seinen Kontaktdaten, geöffnet durch einen Klick auf den Kunden
 * in der Offertkarte.
 *
 * Die CC-Empfänger stehen hier BEWUSST NICHT (Benutzerwunsch 13.08.2026): sie
 * gehören in den Mailbereich der Offerte (`TenderCcField`) und haben in den
 * Kundendetails nichts zu suchen.
 */
export const TenderCustomerContactPopup = ({
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
        <CenterModal
            open={open}
            onClose={onClose}
            title={t('tenders.customer_details')}
            subtitle={customerName || undefined}
            width={560}
            z={140}
        >
            <div className="space-y-4 px-5 py-4 md:px-6">
                <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#07145c]/8 text-[#07145c] dark:bg-[#d48f16]/12 dark:text-[#d48f16]">
                        <User01 size={15} />
                    </span>
                    <span className="min-w-0 text-[13.5px] font-semibold text-slate-800 dark:text-white">
                        {customerName || t('tenders.customer_not_found')}
                    </span>
                </div>

                {hasContact ? (
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
                        <div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                            {t('calendar.detail.contact')}
                        </div>
                        <div className="space-y-1 text-[12.5px] text-slate-700 dark:text-white/80">
                            {customerEmail && <div className="flex items-center gap-2"><Mail01 size={13} className="text-slate-400" />{customerEmail}</div>}
                            {customerPhone && <div className="flex items-center gap-2"><Phone size={13} className="text-slate-400" />{customerPhone}</div>}
                            {customerAddress && (
                                <div className="flex items-start gap-2">
                                    <MarkerPin01 size={13} className="mt-0.5 shrink-0 text-slate-400" />
                                    <span className="whitespace-pre-line">{customerAddress}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="text-[12.5px] text-slate-400 dark:text-white/40">{t('tenders.customer_contact_missing')}</p>
                )}
            </div>
        </CenterModal>
    );
};
