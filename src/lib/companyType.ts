import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';

/**
 * ŞİRKET TÜRÜ (23.09.2026) — şirket kategorileri ekranında her şirkete seçilir:
 * A = Üretim, B = Proje, C = Satış. Kodda İngilizce değer durur (sunucudaki
 * `shared/companyType.ts` ile aynı liste); arayüz etiketi çeviriden gelir.
 *
 * Şimdilik tek etkisi yeni ürün formudur: proje ve satış şirketlerinde ürün
 * türü ve en az bir tedarikçi zorunludur; üretim şirketinde (ve türü henüz
 * seçilmemiş şirkette) yalnızca ürün adı.
 */
export const COMPANY_TYPES = ['PRODUCTION', 'PROJECT', 'SALES'] as const;
export type CompanyType = typeof COMPANY_TYPES[number];

/** Seçimde görünen harf — A Üretim, B Proje, C Satış. */
export const COMPANY_TYPE_LETTER: Record<CompanyType, string> = {
    PRODUCTION: 'A',
    PROJECT: 'B',
    SALES: 'C',
};

const LABEL_KEY: Record<CompanyType, string> = {
    PRODUCTION: 'settings.companyCategories.typeProduction',
    PROJECT: 'settings.companyCategories.typeProject',
    SALES: 'settings.companyCategories.typeSales',
};

export const companyTypeLabel = (type: CompanyType): string => t(LABEL_KEY[type]);

/** Yeni üründe tür + tedarikçi zorunlu mu? Proje ve satış şirketlerinde evet. */
export const companyRequiresArticleKindAndSupplier = (type: CompanyType | null | undefined): boolean =>
    type === 'PROJECT' || type === 'SALES';

/**
 * ALICI ADI + PROJE ADI (01.10.2026, Samet: «proje ve satış şirketleri için çok
 * önemli alıcı adı … bir de proje adı girmemiz lazım»): stok siparişinde ve
 * stok fiyat talebinde ikisi de girilebilir ve PDF'te basılır — zorunlu değil,
 * yalnızca proje ve satış şirketlerinde. Üretim şirketi eskisi gibi kalır.
 */
export const companyRequiresPurchaseRecipientAndProject = (type: CompanyType | null | undefined): boolean =>
    type === 'PROJECT' || type === 'SALES';

/** Şirket değiştiricide seçili şirketin türü; seçilmemişse null. */
export const useCurrentCompanyType = (): CompanyType | null =>
    useAuthStore((state) => {
        const tenant = state.tenants.find((entry) => entry.id === state.selectedTenantId);
        return tenant?.companyType ?? null;
    });

/** Aynısı, hook dışında (PDF kurucuları gibi) — o anki durumdan okunur. */
export const currentCompanyType = (): CompanyType | null => {
    const state = useAuthStore.getState();
    return state.tenants.find((entry) => entry.id === state.selectedTenantId)?.companyType ?? null;
};
