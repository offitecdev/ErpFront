import type { ReactNode } from 'react';
import { t } from '@/i18n/translate';
import { formatAddressLines, fitsInChars } from '@/utils/address';
import { addressParts } from './addressForm';
import type { AddressFormValue } from './addressForm';

/**
 * Adresin giriş ve gösterim bileşenleri. Alanların anlamı, tekrarsızlık kuralı
 * ve "çıktı en fazla iki satır" kuralı `addressForm.ts` başındaki notta —
 * yardımcılar (EMPTY_ADDRESS / toAddressForm / toAddressPayload) da oradadır.
 */

const DEFAULT_INPUT_CLASS =
    'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13.5px] text-slate-800 placeholder:text-slate-300 transition-colors hover:border-slate-300 focus:border-[#1f2654] focus:outline-none dark:border-white/15 dark:bg-transparent dark:text-white';

const AddressField = ({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) => (
    <label className={`flex flex-col gap-1 ${className}`}>
        <span className="text-[12px] font-semibold text-slate-600 dark:text-white/70">{label}</span>
        {children}
    </label>
);

/**
 * Adres giriş bileşenleri: sokak + bina no, adres eki / daire, PLZ, şehir,
 * eyalet, ülke. İki kolonluk bir ızgara döndürür — çağıran onu kendi form
 * ızgarasının içine tam genişlikte (`col-span-2` / `col-span-3`) yerleştirir.
 */
export const AddressFields = ({
    value,
    onChange,
    inputClassName = DEFAULT_INPUT_CLASS,
    disabled = false,
}: {
    value: AddressFormValue;
    onChange: (next: AddressFormValue) => void;
    inputClassName?: string;
    disabled?: boolean;
}) => {
    const input = (key: keyof AddressFormValue) => (
        <input
            value={value[key]}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
            className={inputClassName}
        />
    );

    return (
        <div className="grid gap-3.5 sm:grid-cols-2">
            <AddressField label={t('address.street')} className="sm:col-span-2">{input('address')}</AddressField>
            <AddressField label={t('address.supplement')} className="sm:col-span-2">{input('addressSupplement')}</AddressField>
            <AddressField label={t('address.postalCode')}>{input('postalCode')}</AddressField>
            <AddressField label={t('address.city')}>{input('city')}</AddressField>
            <AddressField label={t('address.state')}>{input('state')}</AddressField>
            <AddressField label={t('address.country')}>{input('country')}</AddressField>
        </div>
    );
};

/**
 * Adresin salt-okunur gösterimi: EN FAZLA iki satır (metin taşarsa üç).
 * `maxChars` satır genişliğinin kaba ölçüsüdür — sığmayan satır kendi
 * ayıracından bölünür, böylece bileşenler asla tek uzun satıra ezilmez.
 */
export const AddressLines = ({
    value,
    maxChars = 48,
    className = '',
    emptyText,
}: {
    value: Partial<Record<keyof AddressFormValue, string | null | undefined>>;
    maxChars?: number;
    className?: string;
    emptyText?: string;
}) => {
    const lines = formatAddressLines(addressParts(value), { fits: fitsInChars(maxChars) });
    if (!lines.length) {
        return emptyText
            ? <span className={`text-slate-400 dark:text-white/50 ${className}`}>{emptyText}</span>
            : null;
    }
    return (
        <span className={className}>
            {lines.map((line, index) => <span key={index} className="block truncate">{line}</span>)}
        </span>
    );
};
