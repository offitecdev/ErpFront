/**
 * Malzeme/ürün birleşmesi (2026-08-14): sunucu grafiği "malzeme" satırlarını
 * artık `article {id, articleCode, name, salePrice}` ilişkisiyle gönderir.
 * Eski ekran/PDF tüketicileri `material {serialId, name, unitCost}` biçimini
 * okur — bu yardımcı iki biçimi tek eski biçime indirger, böylece satır
 * nereden gelirse gelsin (eski kayıt yanıtı, yeni grafik) aynı görünür.
 */
export type LegacyMaterialShape = {
    id: string;
    serialId?: string;
    name: string;
    unitCost?: number;
};

export const rowMaterial = (row: {
    material?: LegacyMaterialShape | null;
    article?: { id: string; articleCode?: string; name: string; salePrice?: number } | null;
} | null | undefined): LegacyMaterialShape | undefined => {
    if (!row) return undefined;
    if (row.material) return row.material;
    if (row.article) {
        return {
            id: row.article.id,
            serialId: row.article.articleCode,
            name: row.article.name,
            unitCost: row.article.salePrice,
        };
    }
    return undefined;
};

/** Satırın kalem id'si — yeni `articleId` öncelikli, eski `materialId` yedek. */
export const rowMaterialId = (row: { articleId?: string | null; materialId?: string | null } | null | undefined): string | null =>
    (row?.articleId ?? row?.materialId) || null;
