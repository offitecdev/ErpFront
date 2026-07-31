import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { RefreshCcw01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '../../../components/inventory/InventoryListHeader';

/**
 * CRM overview (/crm/overview) — temporarily emptied.
 *
 * The dashboard widgets are being reworked, so the page only renders a notice
 * and performs no data fetching. The widget components and the data hooks stay
 * in ./components + ./useCrmOverviewData.ts so the page can be reassembled in a
 * later version of the application.
 */
export const CrmOverview = () => {
    const { t } = useTranslation();

    return (
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-5 pb-6">
            <motion.header
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
            >
                <InventoryListHeader title={t('crmOverview.title', { defaultValue: 'Genel Bakış' })} />
            </motion.header>

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.05, ease: 'easeOut' }}
                className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#E3E7F0] bg-white px-6 py-16 text-center dark:border-white/12 dark:bg-white/4"
            >
                <span className="flex size-12 items-center justify-center rounded-full bg-[#07145c]/8 text-[#07145c] dark:bg-[#e6cf9e]/12 dark:text-[#e6cf9e]">
                    <RefreshCcw01 size={22} />
                </span>
                <p className="max-w-[520px] text-[14.5px] font-semibold leading-relaxed text-[#3F4350] dark:text-[#d9dce3]">
                    {t('crmOverview.refreshNotice', {
                        defaultValue: 'Sayfa yenileniyor, uygulamanın diğer sürümlerinde yayınlanacaktır.',
                    })}
                </p>
            </motion.div>
        </div>
    );
};

export default CrmOverview;
