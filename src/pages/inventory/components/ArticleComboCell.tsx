import { useState } from 'react';
import { Package, Plus } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { ArticleListItem, ItemType } from '@/types/inventory';
import { useArticleLookup } from '../hooks/useInlineLookup';
import { fmtQty } from '../utils/format';
import { ComboCell } from './ComboCell';

/**
 * Stok satırının ürün/malzeme hücresi: doğrudan hücreye yazılır, altına 7
 * sonuçluk kısa liste açılır. Liste `itemType` ile daraltılır — üstteki
 * Ürün/Malzeme anahtarı hangisindeyse yalnızca o tür listelenir. Liste
 * altındaki eylemler:
 *  • "+ … olarak ekle" — eşleşme bulunmasa da yazılanı yeni kayda hazırlar.
 *  • "Tümü …" — tam listeyi büyük pencerede açar.
 */
export const ArticleComboCell = ({
    value,
    onChange,
    onPick,
    onCreate,
    onOpenAll,
    linked,
    itemType,
    canCreate,
    autoFocus,
    placeholder,
    addLabel,
    viewAllLabel,
}: {
    value: string;
    onChange: (next: string) => void;
    onPick: (article: ArticleListItem) => void;
    onCreate: (name: string) => void;
    onOpenAll: () => void;
    /** Satır mevcut bir ürüne bağlı mı (değilse yeni ürün satırı). */
    linked: boolean;
    itemType?: ItemType;
    canCreate: boolean;
    /** Yeni eklenen satırda hücre hazır olsun diye. */
    autoFocus?: boolean;
    /** Metinler türe göre değişir (ürün / malzeme). */
    placeholder: string;
    addLabel: string;
    viewAllLabel: string;
}) => {
    const [open, setOpen] = useState(false);
    const { items, loading } = useArticleLookup(value, open, itemType);

    const typed = value.trim();

    return (
        <ComboCell
            open={open}
            onOpenChange={setOpen}
            value={value}
            onChange={onChange}
            loading={loading}
            options={items.map((article) => ({
                id: article.id,
                label: article.name,
                meta: `${fmtQty(article.totalQuantity)} ${article.unit}`,
            }))}
            onSelect={(option) => {
                const article = items.find((item) => item.id === option.id);
                if (article) onPick(article);
            }}
            autoFocus={autoFocus}
            placeholder={placeholder}
            invalid={!linked}
            emptyText={t('inv.productPicker.empty')}
            actions={[
                {
                    key: 'create',
                    icon: <Plus size={12} />,
                    label: addLabel,
                    disabled: !canCreate || !typed,
                    onSelect: () => onCreate(typed),
                },
                {
                    key: 'all',
                    icon: <Package size={12} />,
                    label: viewAllLabel,
                    onSelect: onOpenAll,
                },
            ]}
        />
    );
};
