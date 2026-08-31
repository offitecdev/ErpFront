import { useCallback, useEffect, useRef, useState } from 'react';

import { mailApi, projectApi, type ProjectDetailScope } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import { lazyToast as toast } from '@/lib/lazyToast';
import type { MailSettingDto, ProjectDto, ProjectMaterial } from '@/types/project';

import type { ProjectDetailView } from '../types/projectDetailNavigation';

const scopeForView = (view: ProjectDetailView): ProjectDetailScope => {
    switch (view.section) {
        case 'planning':
            return 'planning';
        case 'field':
            // The consolidated Reports hub always runs on the lean fieldReports
            // read model; PDF preview/download fetch the full 'generalReport'
            // graph on demand instead of paying for images/signatures up front.
            return 'fieldReports';
        // One costs tab, one read model: the merged table needs the expenses, the
        // extra materials and the reports (extra work) in the same payload.
        case 'costs':
            return 'expenses';
        case 'addons':
            return 'addons';
        // Positions fetches its own light tender detail. Billing fetches invoice
        // summaries itself. Both can reuse the already-loaded overview read model.
        case 'positions':
        case 'billing':
        case 'overview':
        default:
            return 'overview';
    }
};

const needsMaterialPicker = (view: ProjectDetailView) =>
    view.section === 'planning'
    // The whole Reports hub can open the field-report editor (and its product
    // picker popup), regardless of which legacy sub-section the URL carries.
    || view.section === 'field';

// The appointment calendar hosts the mail composer itself (header button and the
// day pop-up), so the whole planning section needs the sender settings — not just
// the mail leaf that used to hang under it.
const needsMailSettings = (view: ProjectDetailView) => view.section === 'planning';

// Loads the compact overview first, then swaps to a section-specific read model
// only when that section is opened. Project responses are cached per section for
// instant back-navigation; any mutation clears that cache and refreshes the
// current section. The material picker and mail settings follow the same lazy rule.
export const useProjectDetailData = (id: string | undefined, view: ProjectDetailView) => {
    const scope = scopeForView(view);
    const shouldLoadMaterials = needsMaterialPicker(view);
    const shouldLoadMailSettings = needsMailSettings(view);

    const [project, setProject] = useState<ProjectDto | null>(null);
    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [mailSettings, setMailSettings] = useState<MailSettingDto | null>(null);
    const [loading, setLoading] = useState(false);
    const [sectionLoading, setSectionLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const projectRef = useRef<ProjectDto | null>(null);
    const projectCacheRef = useRef(new Map<string, ProjectDto>());
    const materialsRef = useRef<ProjectMaterial[]>([]);
    const materialsLoadedRef = useRef(false);
    const mailSettingsRef = useRef<MailSettingDto | null>(null);
    const mailSettingsLoadedRef = useRef(false);
    const requestSequenceRef = useRef(0);
    const currentKey = id ? `${id}:${scope}` : '';
    const currentKeyRef = useRef(currentKey);

    useEffect(() => {
        currentKeyRef.current = currentKey;
    }, [currentKey]);

    const ensureSectionResources = useCallback(async () => {
        const jobs: Promise<void>[] = [];

        if (shouldLoadMaterials && !materialsLoadedRef.current) {
            jobs.push(
                projectApi.materials({ compact: true })
                    .then((rows) => {
                        materialsLoadedRef.current = true;
                        materialsRef.current = rows;
                        setMaterials(rows);
                    })
                    .catch(() => {
                        materialsLoadedRef.current = true;
                        materialsRef.current = [];
                        setMaterials([]);
                    }),
            );
        }

        if (shouldLoadMailSettings && !mailSettingsLoadedRef.current) {
            jobs.push(
                mailApi.getSettings()
                    .then((settings) => {
                        mailSettingsLoadedRef.current = true;
                        mailSettingsRef.current = settings;
                        setMailSettings(settings);
                    })
                    .catch(() => {
                        mailSettingsLoadedRef.current = true;
                        mailSettingsRef.current = null;
                        setMailSettings(null);
                    }),
            );
        }

        await Promise.all(jobs);
    }, [shouldLoadMailSettings, shouldLoadMaterials]);

    const fetchCurrent = useCallback(async (silent = false, force = false) => {
        if (!id) return;
        const key = `${id}:${scope}`;
        const requestSequence = ++requestSequenceRef.current;

        if (force) projectCacheRef.current.clear();

        const cached = !force ? projectCacheRef.current.get(key) : undefined;
        const isInitialLoad = projectRef.current?.id !== id;

        // Keep effect-triggered loads asynchronous before publishing React state.
        // This also gives a newer section change a chance to supersede this request.
        await Promise.resolve();
        if (currentKeyRef.current !== key || requestSequenceRef.current !== requestSequence) return;

        // A silent reload must NOT raise the section skeleton. `ProjectDetail`
        // swaps the whole section out for the skeleton while `sectionLoading` is
        // set, which unmounts whatever is open inside it — deleting a row from a
        // popup refreshed the project and tore the popup down with it. Silent is
        // exactly the "refresh underneath what the user is looking at" case.
        if (!silent) {
            if (isInitialLoad) setLoading(true);
            else setSectionLoading(true);
            setLoadError(null);
        }

        try {
            const [projectData] = await Promise.all([
                cached ? Promise.resolve(cached) : projectApi.getById(id, scope),
                ensureSectionResources(),
            ]);
            if (!cached) projectCacheRef.current.set(key, projectData);

            // A slower request from a section the user already left must not
            // overwrite the currently visible section's richer/leaner payload.
            if (currentKeyRef.current !== key || requestSequenceRef.current !== requestSequence) return;

            projectRef.current = projectData;
            setProject(projectData);
            setMaterials(materialsRef.current);
            setMailSettings(mailSettingsRef.current);
            setLoadError(null);
        } catch (error: unknown) {
            if (currentKeyRef.current !== key || requestSequenceRef.current !== requestSequence) return;
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
                || t('auto.proje_yuklenemedi');
            toast.error(message);
            if (isInitialLoad) {
                projectRef.current = null;
                setProject(null);
                setLoadError(message);
            }
        } finally {
            if (currentKeyRef.current === key && requestSequenceRef.current === requestSequence) {
                setLoading(false);
                setSectionLoading(false);
            }
        }
    }, [ensureSectionResources, id, scope]);

    useEffect(() => {
        let cancelled = false;
        void Promise.resolve().then(() => {
            if (!cancelled) return fetchCurrent(false, false);
            return undefined;
        });
        return () => { cancelled = true; };
    }, [fetchCurrent]);

    // Public reload used after saves/deletes: invalidate every project-section
    // response because totals and badges can affect tabs other than the current one.
    const load = useCallback(
        async (silent = false) => fetchCurrent(silent, true),
        [fetchCurrent],
    );

    /**
     * Nur ENTWERTEN, nicht nachladen. Für Änderungen, die der sichtbare Bereich
     * bereits selbst kennt — der Terminbereich ist der Kalender und lädt seine
     * Termine selbst. Die ganze Projektabfrage dafür noch einmal zu stellen,
     * hiesse die Seite hinter dem Fenster neu aufzubauen (Vorgabe 19.08.2026).
     * Zahlen und Abzeichen der anderen Bereiche holen sich beim Wechsel dorthin
     * ohnehin frische Daten, weil der Zwischenspeicher hier geleert wird.
     */
    const invalidate = useCallback(() => {
        projectCacheRef.current.clear();
    }, []);

    const visibleProject = project?.id === id ? project : null;

    return {
        project: visibleProject,
        materials,
        mailSettings,
        loading: loading || Boolean(id && !visibleProject),
        sectionLoading,
        loadError,
        load,
        invalidate,
    };
};
