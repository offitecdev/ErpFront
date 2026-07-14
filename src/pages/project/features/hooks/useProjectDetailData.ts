import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { mailApi, projectApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { MailSettingDto, ProjectDto, ProjectMaterial } from '@/types/project';

// Owns everything the project detail screen needs to fetch: the project itself,
// the material catalog and the tenant mail settings. `load(silent)` refetches
// without flashing the skeleton so inline saves can refresh data in place.
export const useProjectDetailData = (id: string | undefined) => {
    const [project, setProject] = useState<ProjectDto | null>(null);
    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [mailSettings, setMailSettings] = useState<MailSettingDto | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!id) return;
        if (!silent) {
            setLoading(true);
            setLoadError(null);
        }
        try {
            const [projectData, materialData] = await Promise.all([
                projectApi.getById(id),
                projectApi.materials().catch(() => []),
            ]);
            setProject(projectData);
            setMaterials(materialData);
            setLoadError(null);
        } catch (e: any) {
            const message = e.response?.data?.error || t('auto.proje_yuklenemedi');
            toast.error(message);
            if (!silent) {
                setProject(null);
                setLoadError(message);
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
        void mailApi.getSettings().then(setMailSettings).catch(() => undefined);
    }, [id, load]);

    return { project, materials, mailSettings, loading, loadError, load };
};
