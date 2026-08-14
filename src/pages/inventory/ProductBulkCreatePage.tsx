import { ArticleCreateView } from './components/ArticleCreateView';

/** "Toplu Ürün Ekle" — tam sayfa toplu ekleme tablosu (pop-up değil). */
export const ProductBulkCreatePage = () => (
    <ArticleCreateView copyPrefix="inv.bulkProducts" backPath="/inventory/articles" />
);
