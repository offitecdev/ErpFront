import type { ArticleDetail, ArticleDetailPatch } from '@/types/inventory';
import { parseNum } from '../utils/format';

/** Düzenlenebilir alanların taslak hâli — hepsi metin, kaydederken çevrilir. */
export interface DetailDraft {
    articleCode: string;
    name: string;
    unit: string;
    salePrice: string;
    description: string;
}

/** Sunucudaki kayıttan taslak üretir (ekranın başlangıç değerleri). */
export const draftFromDetail = (detail: ArticleDetail): DetailDraft => ({
    articleCode: detail.articleCode,
    name: detail.name,
    unit: detail.unit,
    salePrice: String(detail.salePrice ?? 0),
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

    const unit = draft.unit.trim();
    if (unit !== detail.unit) patch.unit = unit;

    // Boş bırakılan fiyat 0 sayılır; "1'234.50" gibi yerel biçimler de çözülür.
    const salePrice = parseNum(draft.salePrice) ?? 0;
    if (salePrice !== (detail.salePrice ?? 0)) patch.salePrice = salePrice;

    if (draft.description !== (detail.description ?? '')) patch.description = draft.description;

    if (pendingImage !== undefined) patch.imageUrl = pendingImage;

    return Object.keys(patch).length ? patch : null;
};
