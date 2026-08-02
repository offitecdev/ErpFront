import { ArticleDetailView } from './detail/ArticleDetailView';

/** Malzeme detayı — ürün detayıyla birebir aynı ekran, yalnızca metinler değişir. */
export const MaterialDetailPage = () => (
    <ArticleDetailView itemType="MATERIAL" copyPrefix="inv.materials" listPath="/inventory/materials" />
);
