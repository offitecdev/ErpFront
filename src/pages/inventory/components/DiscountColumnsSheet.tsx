import { t } from '@/i18n/translate';
import { BottomSheet } from './BottomSheet';
import { EXTRA_DISCOUNT_KEYS, combinedDiscountPercent, fmtPercent } from '../utils/orderPricing';
import type { ExtraDiscountKey } from '../utils/orderPricing';

/**
 * İndirim sütunu ayarları — sipariş tablosunda "İndirim" başlığına (altı çizili)
 * tıklanınca açılır. Bir satırda birden fazla ek indirim olabildiği için ana
 * indirimin yanına en fazla İKİ sütun daha açılabilir: İndirim 2 ve İndirim 3.
 *
 * Yüzdeler SIRAYLA uygulanır (toplanmaz) — teklif tarafındaki direct/extra
 * indirim deseniyle aynı; pencere alt kısmında örnek üzerinden bileşik oran
 * gösterilir, böylece "%10 + %5 = %15 değil %14.5" yanılgısı oluşmaz.
 */
export const DiscountColumnsSheet = ({
    open,
    onClose,
    enabled,
    onToggle,
    sample,
}: {
    open: boolean;
    onClose: () => void;
    /** Açık ek indirim sütunları. */
    enabled: Record<ExtraDiscountKey, boolean>;
    onToggle: (key: ExtraDiscountKey, next: boolean) => void;
    /** Bileşik oran örneği: tablodaki ilk satırın yüzdeleri. */
    sample: { discount: number; discount2: number; discount3: number };
}) => {
    const labels: Record<ExtraDiscountKey, string> = {
        discount2: t('inv.orders.columns.discount2'),
        discount3: t('inv.orders.columns.discount3'),
    };

    const combined = combinedDiscountPercent(
        sample.discount,
        enabled.discount2 ? sample.discount2 : 0,
        enabled.discount3 ? sample.discount3 : 0,
    );

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={t('inv.orders.discountColumns.title')}
            subtitle={t('inv.orders.discountColumns.hint')}
            width={640}
            height={420}
            zIndex={90}
            footer={(
                <>
                    <span className="text-[11.5px] text-slate-400 dark:text-white/50">
                        {t('inv.orders.discountColumns.sequentialNote')}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md bg-[#272f67] px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                    >
                        {t('common.done')}
                    </button>
                </>
            )}
        >
            <div className="flex flex-col gap-3 p-4">
                {/* Ana indirim her zaman açıktır — kapatılamaz, referans olarak listelenir. */}
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-3 dark:border-white/10">
                    <span className="text-[13px] font-semibold text-slate-800 dark:text-white">
                        {t('inv.orders.columns.discount')}
                    </span>
                    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.orders.discountColumns.always')}
                    </span>
                </div>

                {EXTRA_DISCOUNT_KEYS.map((key) => (
                    <label
                        key={key}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3.5 py-3 transition-colors hover:border-[#1f2654]/40 dark:border-white/10"
                    >
                        <span className="text-[13px] font-semibold text-slate-800 dark:text-white">{labels[key]}</span>
                        <input
                            type="checkbox"
                            checked={enabled[key]}
                            onChange={(event) => onToggle(key, event.target.checked)}
                            className="size-4 accent-[#272f67]"
                        />
                    </label>
                ))}

                <div className="rounded-lg bg-slate-50 px-3.5 py-3 text-[12.5px] text-slate-600 dark:bg-white/5 dark:text-white/70">
                    {t('inv.orders.discountColumns.combined', { percent: fmtPercent(combined) })}
                </div>
            </div>
        </BottomSheet>
    );
};
