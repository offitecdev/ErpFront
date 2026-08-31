import { ArticleDetailView } from './detail/ArticleDetailView';

/** Ürün detayı — ortak Article detayının PRODUCT görünümü. */
export const ProductDetailPage = () => (
    <ArticleDetailView copyPrefix="inv.products" />
);
