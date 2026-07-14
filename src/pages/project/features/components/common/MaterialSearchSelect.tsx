import { useMemo } from 'react';

import { Select } from '@/components/ui-shared/Field';
import type { ProjectMaterial } from '@/types/project';
import { t } from '@/i18n/translate';
import { numberFmt } from '../../utils/projectFormatters';

export const MaterialSearchSelect = ({
    value,
    materials,
    disabled,
    onChange,
}: {
    value: string;
    materials: ProjectMaterial[];
    disabled?: boolean;
    onChange: (materialId: string) => void;
}) => {
    // Single type-to-filter combobox: options narrow live as you type and are picked
    // directly. Keep the currently-selected material listed even if it is now inactive.
    const options = useMemo(() => {
        const activeMaterials = materials.filter((material) => material.isActive !== false);
        const selectedMaterial = materials.find((material) => material.id === value);
        return selectedMaterial && !activeMaterials.some((material) => material.id === selectedMaterial.id)
            ? [selectedMaterial, ...activeMaterials]
            : activeMaterials;
    }, [materials, value]);

    return (
        <Select
            showSearch
            value={value}
            disabled={disabled || materials.length === 0}
            onChange={(event) => onChange(event.target.value)}
        >
            <option value="">{materials.length ?t('auto.malzeme_secin') :t('auto.malzeme_bulunamadi')}</option>
            {options.map((material) => (
                <option key={material.id} value={material.id}>
                    {material.name} ({material.serialId || t('auto.kod_yok')}) · {t('projects.stok')}: {numberFmt(material.stockQuantity)}
                </option>
            ))}
        </Select>
    );
};
