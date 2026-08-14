import type { ReactNode } from 'react';
import { t } from '@/i18n/translate';
import { formatAddressLines, fitsInChars } from '@/utils/address';
import { addressParts } from './addressForm';
import type { AddressFormValue } from './addressForm';
import { CountrySelect } from './CountrySelect';
import type { CountryEntry } from './countries';

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
 *
 * `fields` verilirse YALNIZCA o bileşenler çizilir (kullanıcı isteği 2026-08-02:
 * tedarikçi kaydında sokak + PLZ + şehir DIŞINDA alan istenmiyor). Gizlenen
 * bileşenler forma yüklenmeye ve kaydetmede geri gönderilmeye DEVAM EDER —
 * alanı gizlemek eski kayıttaki değeri SİLMEZ.
 *
 * `labels` tek tek etiketleri değiştirir. Uygulamanın genel kuralı "Adres diye
 * TEK bir alan yoktur" olduğu için varsayılan sokak etiketi "Strasse / Nr."dir;
 * TEDARİKÇİ formunda kullanıcı 2026-08-02'de bunun yerine düpedüz "Adresse"
 * istedi (Adresse / PLZ / Stadt). Kural yalnızca o çağrı için gevşetilir; CRM ve
 * teklif formları bileşen etiketlerini korur.
 */
export const AddressFields = ({
    value,
    onChange,
    inputClassName = DEFAULT_INPUT_CLASS,
    disabled = false,
    fields,
    labels,
    onCountryPicked,
}: {
    value: AddressFormValue;
    onChange: (next: AddressFormValue) => void;
    inputClassName?: string;
    disabled?: boolean;
    fields?: Array<keyof AddressFormValue>;
    labels?: Partial<Record<keyof AddressFormValue, string>>;
    /**
     * Meldet die AUSWAHL eines Landes aus der Liste (nicht das blosse Tippen).
     * Das CRM hängt daran die Telefonvorwahl; wer das nicht braucht, lässt es weg.
     */
    onCountryPicked?: (country: CountryEntry) => void;
}) => {
    const shows = (key: keyof AddressFormValue) => !fields || fields.includes(key);
    const label = (key: keyof AddressFormValue, fallback: string) => labels?.[key] ?? fallback;
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
            {shows('address') && <AddressField label={label('address', t('address.street'))} className="sm:col-span-2">{input('address')}</AddressField>}
            {shows('addressSupplement') && <AddressField label={label('addressSupplement', t('address.supplement'))} className="sm:col-span-2">{input('addressSupplement')}</AddressField>}
            {shows('postalCode') && <AddressField label={label('postalCode', t('address.postalCode'))}>{input('postalCode')}</AddressField>}
            {shows('city') && <AddressField label={label('city', t('address.city'))}>{input('city')}</AddressField>}
            {shows('state') && <AddressField label={label('state', t('address.state'))}>{input('state')}</AddressField>}
            {/* Das Land ist das einzige Feld mit Auswahlliste: getippt wird
                weiterhin frei, die Liste schlägt nur vor (häufige Länder oben)
                und gibt bei echter Auswahl die Telefonvorwahl nach oben. */}
            {shows('country') && (
                <AddressField label={label('country', t('address.country'))}>
                    <CountrySelect
                        value={value.country}
                        onChange={(next) => onChange({ ...value, country: next })}
                        onPick={onCountryPicked}
                        disabled={disabled}
                        inputClassName={inputClassName}
                    />
                </AddressField>
            )}
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
