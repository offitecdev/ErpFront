import { useTranslation } from 'react-i18next';
import { localizePurchaseCode, purchaseLangOf, type PurchaseDocLang } from '@/utils/purchaseCode';

/**
 * SATIN ALMA BELGE KODUNU ARAYÜZ DİLİNDE YAZAR.
 *
 * Kayıt `PA-2026-001` / `BE-2026-004` taşır; ekranda Türkçe `FT-` / `SP-`,
 * İngilizce `PR-` / `PO-` okunur (bkz. `utils/purchaseCode.ts`). Nerede bir
 * satın alma kodu gösteriliyorsa oradan geçmelidir — ham `referenceNumber`
 * basmak, aynı belgeyi iki ekranda iki türlü gösterir.
 */
export const usePurchaseLang = (): PurchaseDocLang => {
    const { i18n } = useTranslation();
    return purchaseLangOf(i18n.resolvedLanguage || i18n.language);
};

export const PurchaseCode = ({ value }: { value: unknown }) => (
    <>{localizePurchaseCode(value, usePurchaseLang())}</>
);

export default PurchaseCode;
