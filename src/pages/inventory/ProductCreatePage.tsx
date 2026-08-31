import { ArticleSingleCreateView } from './components/ArticleSingleCreateView';

/**
 * "Ürün Ekle" — TEKLİ ürün oluşturma (detay ekranı düzeninde form).
 * Toplu tablo ayrı sayfadadır: ProductBulkCreatePage ("Toplu Ürün Ekle").
 */
export const ProductCreatePage = () => (
    <ArticleSingleCreateView
        copyPrefix="inv.newProduct"
        detailRoot="/inventory/articles"
    />
);
