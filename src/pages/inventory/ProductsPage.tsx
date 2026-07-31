import { ArticleListView } from './components/ArticleListView';

/**
 * Ürün listesi — ortak Article listesinin PRODUCT görünümü.
 * Malzeme listesiyle (MaterialsPage) birebir aynı tablo; tek fark `itemType`
 * ve metin anahtarları. "Ürün Ekle" ayrı bir tam sayfaya götürür.
 */
export const ProductsPage = () => (
    <ArticleListView itemType="PRODUCT" copyPrefix="inv.products" createPath="/inventory/articles/new" />
);
