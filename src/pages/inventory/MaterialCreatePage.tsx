import { ArticleCreateView } from './components/ArticleCreateView';

/** "Malzeme Ekle" — ürün ekleme sayfasının aynısı, MATERIAL türüyle. */
export const MaterialCreatePage = () => (
    <ArticleCreateView itemType="MATERIAL" copyPrefix="inv.bulkMaterials" backPath="/inventory/materials" />
);
