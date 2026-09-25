import { t } from '@/i18n/translate';
import type { ArticleKind } from '@/types/inventory';

const KIND_LABEL: Record<ArticleKind, string> = {
    MANUFACTURED: 'inv.newProduct.kindManufactured',
    RESALE: 'inv.newProduct.kindResale',
    SERVICE: 'inv.newProduct.kindService',
};

/** Üçlü ürün türünün etiketi: Üretilecek / Satın Alınacak / Ek Hizmet. */
export const articleKindLabel = (kind: ArticleKind): string => t(KIND_LABEL[kind]);
