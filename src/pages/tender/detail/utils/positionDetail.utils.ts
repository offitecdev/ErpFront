export const getArticlePrice = (article?: { salePrice?: number | null; baseCost?: number | null } | null) => {
    const salePrice = Number(article?.salePrice ?? 0);
    return salePrice > 0 ? salePrice : Number(article?.baseCost ?? 0);
};
