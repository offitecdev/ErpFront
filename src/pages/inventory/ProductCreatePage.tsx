import { ArticleCreateView } from './components/ArticleCreateView';

/** "Ürün Ekle" — tam sayfa toplu ekleme tablosu (pop-up değil). */
export const ProductCreatePage = () => (
    <ArticleCreateView itemType="PRODUCT" copyPrefix="inv.bulkProducts" backPath="/inventory/articles" />
);
