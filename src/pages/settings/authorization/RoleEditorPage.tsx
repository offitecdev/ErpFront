import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Save01 as Save, Trash01 as Trash } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { Chip, GhostButton, Labelled, PrimaryButton } from '@/pages/personnel/components/primitives';
import { PageLevelTable } from './components/PageLevelTable';
import { PAGE_MODULES, TOTAL_PAGE_COUNT, countGrantedPages } from '@/lib/pageCatalog';
import {
    roleTemplateApi,
    type CatalogModuleDto,
    type PageLevel,
    type RoleTemplate,
} from '@/lib/api/authorization';

/**
 * ── ROLLE BAUEN (Einstellungen → Berechtigungen → Rolle) ─────────────────────
 *
 * Ein Name und die Tabelle: Modul für Modul, Seite für Seite, je Seite eine
 * Stufe. Was daraus an Rechten folgt, rechnet der SERVER aus — dieselbe Karte
 * füttert danach das Menü und den Seitenwächter.
 *
 * Die Administratorrolle ist fest: sie wird angezeigt (damit man nachschlagen
 * kann, was sie umfasst), aber nicht bearbeitet.
 *
 * Der Katalog kommt vom Server; die Browserkopie (lib/pageCatalog.ts) ist nur
 * der Notnagel, falls der Aufruf scheitert — sonst stünde man vor einer leeren
 * Tabelle statt vor einer, die vielleicht eine Zeile zu wenig führt.
 */

const FALLBACK_CATALOG: CatalogModuleDto[] = PAGE_MODULES.map((moduleDef) => ({
    key: moduleDef.key,
    labelKey: moduleDef.labelKey,
    pages: moduleDef.pages.map((page) => ({
        key: page.key,
        path: page.path,
        labelKey: page.labelKey,
        maxLevel: page.maxLevel,
    })),
}));

export const RoleEditorPage = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    /* «Neue Rolle» kommt über die FESTE Route /settings/authorization/new an —
       sie hat KEIN :id-Segment, useParams liefert also ''. Der alte Vergleich
       `id === 'new'` war deshalb immer falsch: die Seite suchte eine Rolle mit
       leerer id, fand nichts und warf einen mit «Rolle nicht gefunden» zur
       Liste zurück — der Knopf «Rolle anlegen» war damit tot. */
    const isNew = !id || id === 'new';

    const [catalog, setCatalog] = useState<CatalogModuleDto[]>(FALLBACK_CATALOG);
    const [role, setRole] = useState<RoleTemplate | null>(null);
    const [roleName, setRoleName] = useState('');
    const [levels, setLevels] = useState<Record<string, PageLevel>>({});
    /* Der Firmenwechsel steht NEBEN der Stufenkarte, nicht darin: er ist keine
       Seite, sondern die Reichweite des Umschalters im Kopf (31.08.2026). */
    const [canSwitchTenant, setCanSwitchTenant] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        // Katalog und Rollenliste zusammen: die Tabelle braucht beides, und zwei
        // Wartezeiten hintereinander wären für dieselbe Seite eine zu viel.
        Promise.all([
            roleTemplateApi.catalog().catch(() => FALLBACK_CATALOG),
            isNew ? Promise.resolve<RoleTemplate[]>([]) : roleTemplateApi.list(),
        ])
            .then(([modules, roles]) => {
                if (cancelled) return;
                setCatalog(modules.length ? modules : FALLBACK_CATALOG);
                if (isNew) return;
                const found = roles.find((entry) => entry.id === id) ?? null;
                if (!found) {
                    toast.error(t('settings.roles.notFound'));
                    navigate('/settings/authorization', { replace: true });
                    return;
                }
                setRole(found);
                setRoleName(found.roleName);
                setLevels(found.pageLevels ?? {});
                setCanSwitchTenant(Boolean(found.canSwitchTenant));
            })
            .catch(() => { if (!cancelled) toast.error(t('settings.roles.errorLoad')); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [id, isNew, navigate]);

    const readOnly = Boolean(role?.isSystemAdmin);
    /* Die Purser-Rolle: die STUFEN bleiben bearbeitbar (welche Seiten der
       Purser sieht, entscheidet das Haus), Name und Bestand sind fest — die
       Antragslogik erkennt die Rolle an ihrer Flagge. */
    const isPurser = Boolean(role?.isPurser);
    const grantedCount = useMemo(() => countGrantedPages(levels), [levels]);

    const setLevel = (pageKey: string, level: PageLevel) => {
        setLevels((current) => {
            const next = { ...current };
            if (level === 0) delete next[pageKey];
            else next[pageKey] = level;
            return next;
        });
    };

    const save = async () => {
        const name = roleName.trim();
        if (!name) {
            toast.error(t('settings.roles.nameRequired'));
            return;
        }
        try {
            setSaving(true);
            if (isNew) {
                const created = await roleTemplateApi.create({ roleName: name, pageLevels: levels, canSwitchTenant });
                toast.success(t('settings.roles.created'));
                navigate(`/settings/authorization/${created.id}`, { replace: true });
            } else {
                await roleTemplateApi.update(id, { roleName: name, pageLevels: levels, canSwitchTenant });
                toast.success(t('settings.roles.saved'));
            }
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : t('settings.roles.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        try {
            setSaving(true);
            await roleTemplateApi.remove(id);
            toast.success(t('settings.roles.deleted'));
            navigate('/settings/authorization', { replace: true });
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : t('settings.roles.deleteError'));
        } finally {
            setSaving(false);
            setConfirmDelete(false);
        }
    };

    return (
        <div className="flex w-full flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h1 className="ofi-serif flex min-w-0 items-center gap-2 text-[19px] font-bold text-slate-900 dark:text-white">
                    <span className="truncate">
                        {isNew ? t('settings.roles.newTitle') : roleName || t('settings.roles.title')}
                    </span>
                    {readOnly && (
                        <Chip className="bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30">
                            {t('settings.roles.fixed')}
                        </Chip>
                    )}
                </h1>
            </div>

            {loading ? (
                <div className="py-10"><InlineLoading label={t('common.loading')} /></div>
            ) : (
                <>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <Labelled label={t('settings.roles.roleName')} className="w-72">
                            <input
                                value={roleName}
                                disabled={readOnly || isPurser}
                                onChange={(event) => setRoleName(event.target.value)}
                                placeholder={t('settings.roles.roleNamePlaceholder')}
                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#272f67] disabled:bg-slate-50 disabled:text-slate-400 dark:border-white/15 dark:bg-transparent dark:text-white"
                            />
                        </Labelled>
                        <span className="pb-1 text-[12px] text-slate-500 dark:text-white/55">
                            {t('settings.roles.pagesOf', { granted: grantedCount, total: TOTAL_PAGE_COUNT })}
                        </span>
                    </div>

                    {readOnly && (
                        <p className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                            {t('settings.roles.adminHint')}
                        </p>
                    )}
                    {isPurser && (
                        <p className="rounded-md bg-sky-50 px-3 py-2 text-[12px] text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
                            {t('settings.roles.purserHint')}
                        </p>
                    )}

                    {/* ── FIRMENWECHSEL (31.08.2026, Vorgabe) ────────────────
                        «Der Firmenwechsel gehört den Administratoren und der
                        Projektleitung.» Er steht bewusst NICHT in der
                        Stufenkarte darunter: die vergibt Seiten, dieser
                        Schalter dagegen sagt, wie weit der Umschalter im Kopf
                        reicht — der ganze eigene Konzernbaum statt nur der
                        Firmen, die unter Person → Zugang angehakt sind. Die
                        Administratorrolle trägt ihn fest und zeigt ihn nur an. */}
                    <label
                        className={`flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/15 ${readOnly ? '' : 'cursor-pointer'}`}
                    >
                        <input
                            type="checkbox"
                            checked={readOnly ? true : canSwitchTenant}
                            disabled={readOnly}
                            onChange={(event) => setCanSwitchTenant(event.target.checked)}
                            className="mt-0.5 accent-[#272f67]"
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[12.5px] font-semibold text-slate-800 dark:text-white/85">
                                {t('settings.roles.tenantSwitch')}
                            </span>
                            <span className="text-[11.5px] text-slate-500 dark:text-white/50">
                                {readOnly ? t('settings.roles.tenantSwitchAdminHint') : t('settings.roles.tenantSwitchHint')}
                            </span>
                        </span>
                    </label>

                    <SectionCard title={t('settings.roles.tableTitle')}>
                        <p className="px-3 pt-2 text-[11.5px] text-slate-500 dark:text-white/50">
                            {t('settings.roles.levelsLegend')}
                            {' '}
                            {t('settings.roles.expandHint')}
                        </p>
                        <PageLevelTable
                            modules={catalog}
                            levels={readOnly ? adminLevels(catalog) : levels}
                            onChange={setLevel}
                            readOnly={readOnly}
                        />
                    </SectionCard>

                    {!readOnly && (
                        <div className="flex items-center justify-between gap-3 pb-2">
                            {!isNew && !isPurser && (role?.userCount ?? 0) === 0 ? (
                                <GhostButton
                                    icon={<Trash size={13} />}
                                    onClick={() => setConfirmDelete(true)}
                                    className="!text-red-600 hover:!border-red-300 dark:!text-red-400"
                                >
                                    {t('common.delete')}
                                </GhostButton>
                            ) : (
                                <span className="text-[11.5px] text-slate-400 dark:text-white/40">
                                    {!isNew && (role?.userCount ?? 0) > 0 ? t('settings.roles.deleteBlocked') : ''}
                                </span>
                            )}
                            <PrimaryButton icon={<Save size={13} />} disabled={saving} onClick={() => void save()}>
                                {t('common.save')}
                            </PrimaryButton>
                        </div>
                    )}
                </>
            )}

            <ConfirmDialog
                open={confirmDelete}
                tone="danger"
                busy={saving}
                title={t('settings.roles.deleteTitle')}
                message={t('settings.roles.deleteMessage', { name: roleName })}
                confirmLabel={t('common.delete')}
                onConfirm={() => void remove()}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    );
};

/** Die feste Rolle zeigt jede Seite auf ihrem Höchstrang. */
const adminLevels = (modules: CatalogModuleDto[]): Record<string, PageLevel> =>
    Object.fromEntries(modules.flatMap((moduleDef) => moduleDef.pages.map((page) => [page.key, page.maxLevel])));
