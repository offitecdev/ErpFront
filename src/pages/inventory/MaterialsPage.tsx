import { ArticleListView } from './components/ArticleListView';

/**
 * Malzeme listesi — ortak Article listesinin MATERIAL görünümü. Ürün sayfasıyla
 * aynı tablo ve aynı işlevler; malzemeler de aynı stok/tedarikçi süreçlerine
 * girer, kod kolonu "Malzeme Kodu" olarak adlandırılır.
 */
export const MaterialsPage = () => (
    <ArticleListView itemType="MATERIAL" copyPrefix="inv.materials" createPath="/inventory/materials/new" />
);
