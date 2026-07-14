import { useMemo, useState } from 'react';

type InstallationMaterialMode = 'used' | 'extra';
type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type MaterialRow = { materialId: string; quantity: number; description: string };

// Owns which material list ("used" vs "extra") is active and resolves the matching rows
// + setter, so the editor always reads/writes the currently selected list.
export const useInstallationMaterialMode = ({
    materialRows,
    setMaterialRows,
    usedMaterialRows,
    setUsedMaterialRows,
}: {
    materialRows: MaterialRow[];
    setMaterialRows: StateSetter<MaterialRow[]>;
    usedMaterialRows: MaterialRow[];
    setUsedMaterialRows: StateSetter<MaterialRow[]>;
}) => {
    const [materialMode, setMaterialMode] = useState<InstallationMaterialMode>('used');
    const activeMaterialRows = useMemo(
        () => (materialMode === 'used' ? usedMaterialRows : materialRows),
        [materialMode, usedMaterialRows, materialRows],
    );
    const setActiveMaterialRows = materialMode === 'used' ? setUsedMaterialRows : setMaterialRows;

    return { materialMode, setMaterialMode, activeMaterialRows, setActiveMaterialRows };
};
