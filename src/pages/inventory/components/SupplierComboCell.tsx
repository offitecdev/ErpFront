import { useState } from 'react';
import { Building02, Plus } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { useSupplierLookup } from '../hooks/useInlineLookup';
import type { SupplierChoice } from '../types';
import { ComboCell } from './ComboCell';

/**
 * Tedarikçi hücresi — ürün hücresiyle aynı desen: hücreye yazılır, altına kısa
 * liste açılır (boş yazıldığında ilk tedarikçiler listelenir). Listede olmayan
 * bir ad elle giriş olarak kalır; kaydederken backend aynı adla tedarikçiyi
 * bulur ya da oluşturur. `onOpenAll` verilirse listenin altına ürün
 * hücresindeki gibi "Tüm tedarikçiler …" eylemi eklenir (büyük pencere).
 */
export const SupplierComboCell = ({
    value,
    onChange,
    onSelect,
    onOpenAll,
    viewAllLabel,
    placeholder,
    autoFocus,
    inputClassName,
}: {
    value: string;
    onChange: (next: string) => void;
    onSelect: (choice: SupplierChoice) => void;
    onOpenAll?: () => void;
    viewAllLabel?: string;
    placeholder?: string;
    autoFocus?: boolean;
    inputClassName?: string;
}) => {
    const [open, setOpen] = useState(false);
    const { items, loading } = useSupplierLookup(value, open);

    const typed = value.trim();

    return (
        <ComboCell
            open={open}
            onOpenChange={setOpen}
            value={value}
            onChange={onChange}
            loading={loading}
            options={items.map((supplier) => ({
                id: supplier.id,
                label: supplier.companyName,
                meta: String(supplier.purchaseCount),
            }))}
            onSelect={(option) => {
                const supplier = items.find((item) => item.id === option.id);
                if (!supplier) return;
                onSelect({ supplierId: supplier.id, supplierName: supplier.companyName, label: supplier.companyName });
            }}
            placeholder={placeholder ?? t('inv.bulkProducts.pickSupplier')}
            autoFocus={autoFocus}
            inputClassName={inputClassName ?? ''}
            emptyText={t('inv.supplierPicker.empty')}
            actions={[
                {
                    key: 'manual',
                    icon: <Plus size={12} />,
                    label: t('inv.supplierPicker.useManual', { name: typed }),
                    disabled: !typed,
                    onSelect: () => onSelect({ supplierId: null, supplierName: typed, label: typed }),
                },
                ...(onOpenAll ? [{
                    key: 'all',
                    icon: <Building02 size={12} />,
                    label: viewAllLabel ?? t('inv.orders.allSuppliers'),
                    onSelect: onOpenAll,
                }] : []),
            ]}
        />
    );
};
