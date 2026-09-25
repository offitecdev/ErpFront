import type { ArticleDetail, ArticleDetailPatch, ArticleKind } from '@/types/inventory';
import type { SupplierPick } from '../components/SupplierMultiSelect';
import { parseNum } from '../utils/format';

/** Düzenlenebilir alanların taslak hâli — hepsi metin, kaydederken çevrilir. */
export interface DetailDraft {
    articleCode: string;
    name: string;
    /* Modell, Serie, Lieferantenbarcode (10.09.2026) — alle freiwillig. */
    modelNumber: string;
    serialNumber: string;
    supplierBarcode: string;
    unit: string;
    salePrice: string;
    /**
     * Üçlü ürün türü (23.09.2026) — eski Ürün/Hizmet anahtarının yerinde.
     * Sunucu ürün/hizmet ayrımını bundan türetir; null = seçilmemiş.
     */
    articleKind: ArticleKind | null;
    /** Tedarikçiler (23.09.2026) — ilki tercih edilen; yeni yazılan yalnızca adıyla. */
    suppliers: SupplierPick[];
    description: string;
}

/**
 * Kayıtlı tür; türü seçilmemiş eski bir HİZMET "Ek Hizmet" olarak görünür —
 * taslak da karşılaştırma da bu aynı değerden başlar, açılışta sahte
 * değişiklik doğmaz.
 */
export const kindOfDetail = (detail: ArticleDetail): ArticleKind | null =>
    detail.articleKind ?? (detail.itemType === 'SERVICE' ? 'SERVICE' : null);

/** Sunucudaki kayıttan taslak üretir (ekranın başlangıç değerleri). */
export const draftFromDetail = (detail: ArticleDetail): DetailDraft => ({
    articleCode: detail.articleCode,
    name: detail.name,
    modelNumber: detail.modelNumber ?? '',
    serialNumber: detail.serialNumber ?? '',
    supplierBarcode: detail.supplierBarcode ?? '',
    unit: detail.unit,
    salePrice: String(detail.salePrice ?? 0),
    articleKind: kindOfDetail(detail),
    suppliers: (detail.suppliers ?? []).map((link) => ({ supplierId: link.supplierId, name: link.companyName })),
    description: detail.description ?? '',
});

/**
 * Ortak "Kaydet" düğmesinin gövdesi: yalnızca GERÇEKTEN değişmiş alanlar.
 * Hiçbir şey değişmediyse `null` döner — düğme de bu yüzden pasif kalır.
 *
 * Görsel üç durumludur: `pendingImage === undefined` seçim yapılmadı demektir
 * (alan hiç gönderilmez, sunucu görseli korur); `null` kaldırıldı; string ise
 * yeni görsel. Seçilen görsel kayıtlının aynısıysa değişiklik sayılmaz.
 */
export const buildDetailPatch = (
    detail: ArticleDetail,
    draft: DetailDraft,
    pendingImage: string | null | undefined,
): ArticleDetailPatch | null => {
    const patch: ArticleDetailPatch = {};

    const articleCode = draft.articleCode.trim();
    if (articleCode !== detail.articleCode) patch.articleCode = articleCode;

    const name = draft.name.trim();
    if (name !== detail.name) patch.name = name;

    // Leer = null: ein geleertes Feld nimmt dem Artikel die Kennung wieder.
    const modelNumber = draft.modelNumber.trim();
    if (modelNumber !== (detail.modelNumber ?? '')) patch.modelNumber = modelNumber || null;
    const serialNumber = draft.serialNumber.trim();
    if (serialNumber !== (detail.serialNumber ?? '')) patch.serialNumber = serialNumber || null;
    const supplierBarcode = draft.supplierBarcode.trim();
    if (supplierBarcode !== (detail.supplierBarcode ?? '')) patch.supplierBarcode = supplierBarcode || null;

    const unit = draft.unit.trim();
    if (unit !== detail.unit) patch.unit = unit;

    // Boş bırakılan fiyat 0 sayılır; "1'234.50" gibi yerel biçimler de çözülür.
    const salePrice = parseNum(draft.salePrice) ?? 0;
    if (salePrice !== (detail.salePrice ?? 0)) patch.salePrice = salePrice;

    if (draft.articleKind !== kindOfDetail(detail)) patch.articleKind = draft.articleKind;

    // Tedarikçiler TAM liste olarak gider — sıra da anlamlıdır (ilki tercih edilen).
    const savedSuppliers = (detail.suppliers ?? []).map((link) => link.supplierId);
    const suppliersSame = draft.suppliers.length === savedSuppliers.length
        && draft.suppliers.every((pick, index) => pick.supplierId === savedSuppliers[index]);
    if (!suppliersSame) {
        patch.suppliers = draft.suppliers.map((pick) => (pick.supplierId
            ? { supplierId: pick.supplierId }
            : { supplierName: pick.name }));
    }

    if (draft.description !== (detail.description ?? '')) patch.description = draft.description;

    if (pendingImage !== undefined) patch.imageUrl = pendingImage;

    return Object.keys(patch).length ? patch : null;
};
