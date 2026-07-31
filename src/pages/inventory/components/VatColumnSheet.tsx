import { useState } from 'react';
import { t } from '@/i18n/translate';
import { BottomSheet } from './BottomSheet';
import { COUNTRY_VAT_RATES, clampPercent, fmtPercent, vatRatesForCountry } from '../utils/orderPricing';

/**
 * KDV sütunu ayarları — sipariş tablosunda "KDV" başlığına (altı çizili)
 * tıklanınca açılır ve iki işi birlikte yapar:
 *
 *  1. Sütunu tamamen GÖSTER/GİZLE (KDV'siz çalışan tedarikçilerde tablo
 *     gereksiz kolon taşımaz; gizliyken satırlar %0 KDV ile kaydedilir).
 *  2. ÜLKEYE GÖRE oran seçimi: ülke seçilince o ülkenin yasal oranları düğme
 *     olarak listelenir; birine basmak oranı TÜM satırlara uygular. Listede
 *     olmayan bir oran gerekiyorsa "özel oran" alanından eklenir — eklenen oran
 *     seçili ülkenin düğmeleri arasına girer.
 *
 * Satır bazında farklı oran gerekiyorsa hücre elle düzenlenebilir; bu pencere
 * yalnızca toplu uygulama içindir.
 */
export const VatColumnSheet = ({
    open,
    onClose,
    visible,
    onVisibleChange,
    country,
    onCountryChange,
    customRates,
    onAddCustomRate,
    onApplyRate,
}: {
    open: boolean;
    onClose: () => void;
    visible: boolean;
    onVisibleChange: (next: boolean) => void;
    /** Seçili ülke kodu (ISO alpha-2). */
    country: string;
    onCountryChange: (code: string) => void;
    /** Kullanıcının eklediği ek oranlar (ülke kodu → oranlar). */
    customRates: Record<string, number[]>;
    onAddCustomRate: (code: string, rate: number) => void;
    /** Oranı tüm satırlara uygula. */
    onApplyRate: (rate: number) => void;
}) => {
    const [draftRate, setDraftRate] = useState('');
    const selected = vatRatesForCountry(country);
    // Ülkenin yasal oranları + kullanıcının eklediği oranlar (tekrarsız, azalan).
    const rates = Array.from(new Set([...selected.rates, ...(customRates[selected.code] ?? [])]))
        .sort((a, b) => b - a);

    const addCustomRate = () => {
        const parsed = clampPercent(draftRate.replace(',', '.'));
        if (!draftRate.trim() || rates.includes(parsed)) { setDraftRate(''); return; }
        onAddCustomRate(selected.code, parsed);
        onApplyRate(parsed);
        setDraftRate('');
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={t('inv.orders.vatColumn.title')}
            subtitle={t('inv.orders.vatColumn.hint')}
            width={640}
            height={480}
            zIndex={90}
            footer={(
                <>
                    <span className="text-[11.5px] text-slate-400 dark:text-white/50">
                        {t('inv.orders.vatColumn.perRowNote')}
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
            <div className="flex flex-col gap-3.5 p-4">
                {/* 1) Sütunu göster / gizle */}
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3.5 py-3 transition-colors hover:border-[#1f2654]/40 dark:border-white/10">
                    <span className="text-[13px] font-semibold text-slate-800 dark:text-white">
                        {t('inv.orders.vatColumn.showColumn')}
                    </span>
                    <input
                        type="checkbox"
                        checked={visible}
                        onChange={(event) => onVisibleChange(event.target.checked)}
                        className="size-4 accent-[#272f67]"
                    />
                </label>

                {/* 2) Ülke + o ülkenin oranları */}
                <label className="flex flex-col gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                    {t('inv.orders.vatColumn.country')}
                    <select
                        value={selected.code}
                        onChange={(event) => onCountryChange(event.target.value)}
                        disabled={!visible}
                        className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] font-normal normal-case tracking-normal text-slate-700 focus:border-[#1f2654] focus:outline-none disabled:opacity-40 dark:border-white/20 dark:bg-transparent dark:text-white"
                    >
                        {COUNTRY_VAT_RATES.map((entry) => (
                            <option key={entry.code} value={entry.code}>{entry.label}</option>
                        ))}
                    </select>
                </label>

                <div className="flex flex-col gap-2">
                    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.orders.vatColumn.rates')}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {rates.map((rate) => (
                            <button
                                key={rate}
                                type="button"
                                disabled={!visible}
                                onClick={() => onApplyRate(rate)}
                                className="rounded-md border border-slate-200 px-3 py-1.5 font-mono text-[12.5px] font-semibold text-slate-700 transition-colors hover:border-[#1f2654] hover:bg-[#272f67] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:text-white/80"
                            >
                                {fmtPercent(rate)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 3) Listede olmayan oranı ekle */}
                <div className="flex items-end gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.orders.vatColumn.custom')}
                        <input
                            value={draftRate}
                            onChange={(event) => setDraftRate(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomRate(); } }}
                            inputMode="decimal"
                            placeholder="0.00"
                            disabled={!visible}
                            className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-right font-mono text-[13px] font-normal normal-case tracking-normal text-slate-700 focus:border-[#1f2654] focus:outline-none disabled:opacity-40 dark:border-white/20 dark:bg-transparent dark:text-white"
                        />
                    </label>
                    <button
                        type="button"
                        disabled={!visible || !draftRate.trim()}
                        onClick={addCustomRate}
                        className="h-9 rounded-md border border-slate-300 px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:text-white/70"
                    >
                        {t('inv.orders.vatColumn.add')}
                    </button>
                </div>

                <div className="rounded-lg bg-slate-50 px-3.5 py-3 text-[12.5px] text-slate-600 dark:bg-white/5 dark:text-white/70">
                    {t('inv.orders.vatColumn.applyNote')}
                </div>
            </div>
        </BottomSheet>
    );
};
