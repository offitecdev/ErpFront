import { ArticleListView } from './components/ArticleListView';

/**
 * Ürün listesi — malzeme/ürün birleşmesinden (2026-08-14) beri TEK Article
 * listesi (eski malzemeler de burada; ürün/hizmet ayrımı satır rozetiyle).
 * "Ürün Ekle" ayrı bir tam sayfaya götürür.
 */
export const ProductsPage = () => (
    <ArticleListView
        copyPrefix="inv.products"
        createPath="/inventory/articles/new"
        bulkCreatePath="/inventory/articles/bulk-new"
        detailPath="/inventory/articles"
    />
);
