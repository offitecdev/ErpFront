import type { ReactNode } from 'react';

import { AlertTriangle } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * Ürün formunun tek satırı — yeni ürün ve ürün detayı AYNI satırı kullanır
 * (23.09.2026): solda etiket, sağda alan; satırın kendisi alandır
 * (`.ofi-ord-row`, sipariş sayfasının macOS formu). Zorunlu alanın etiketinde
 * kırmızı yıldız durur; eksik kalınca etiket kırmızıya, alan kırmızı halkaya
 * döner.
 */
export const FormRow = ({ label, htmlFor, required = false, invalid = false, children }: {
    label: string;
    /** Metin alanı için; segment ve tedarikçi alanı kendi etiketini taşır. */
    htmlFor?: string;
    required?: boolean;
    invalid?: boolean;
    children: ReactNode;
}) => {
    const caption = (
        <>
            {label}
            {required && <span className="ofi-article-form__req" aria-hidden>*</span>}
        </>
    );
    return (
        <div className={`ofi-ord-row${invalid ? ' is-invalid' : ''}`} data-invalid={invalid || undefined}>
            {htmlFor
                ? <label className="ofi-ord-label" htmlFor={htmlFor}>{caption}</label>
                : <span className="ofi-ord-label">{caption}</span>}
            {children}
        </div>
    );
};

/**
 * ZORUNLU ALAN UYARISI (Samet, 23.09.2026: «zorunlu alanları girmeyince uyarı
 * vermeli»). Kaydetme denemesinden sonra formun üstünde durur ve eksik
 * alanları adıyla sayar; alanlar doldukça kısalır, hepsi dolunca kaybolur.
 */
export const RequiredFieldsAlert = ({ missing }: { missing: string[] }) => (
    missing.length ? (
        <div role="alert" className="ofi-article-form__alert">
            <AlertTriangle size={15} aria-hidden />
            <span>{t('inv.newProduct.missingFields', { fields: missing.join(', ') })}</span>
        </div>
    ) : null
);
