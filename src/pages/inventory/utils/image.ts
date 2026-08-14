import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { ARTICLE_IMAGE_MAX_BYTES, ARTICLE_IMAGE_TYPES } from '@/types/inventory';

const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

/**
 * Seçilen dosyayı ürün görseli olarak doğrular ve data URL'e çevirir.
 * Tür/boyut sınırı detay ekranıyla AYNIDIR (sunucu da aynı sınırı uygular);
 * geçersiz dosyada kullanıcıya toast gösterilir ve `null` döner.
 */
export const readArticleImageFile = async (file: File | null | undefined): Promise<string | null> => {
    if (!file) return null;
    if (!ARTICLE_IMAGE_TYPES.includes(file.type)) {
        toast.error(t('inv.detail.imageInvalid'));
        return null;
    }
    if (file.size > ARTICLE_IMAGE_MAX_BYTES) {
        toast.error(t('inv.detail.imageTooLarge'));
        return null;
    }
    return fileToDataUrl(file);
};
