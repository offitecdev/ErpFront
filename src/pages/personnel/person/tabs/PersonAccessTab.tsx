import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Save01 as Save } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { useAuthStore } from '@/store/authStore';
import { PAGE_MODULES } from '@/lib/pageCatalog';
import {
    passwordRequestApi,
    personAccessApi,
    roleTemplateApi,
    type CatalogModuleDto,
    type PageLevel,
    type PersonAccess,
} from '@/lib/api/authorization';
import { PageLevelTable } from '@/pages/settings/authorization/components/PageLevelTable';
import type { PersonHeader } from '../../types/personnel';
import { Chip, GhostButton, Labelled, PrimaryButton } from '../../components/primitives';
import { formatDateTime } from '../../utils/format';

/**
 * ── REITER „ZUGANG" ──────────────────────────────────────────────────────────
 *
 * Zwei Gesichter derselben Fläche (Vorgabe 17.08.2026):
 *
 *   VERWALTUNG (roles.manage) — vergibt EINE der fertigen Rollen, setzt E-Mail,
 *   Kennwort und die sichtbaren Firmen und entscheidet offene Kennwortwünsche.
 *   Gebaut werden die Rollen woanders: Einstellungen → Berechtigungen.
 *
 *   ALLE ANDEREN — sehen ihre Rolle, ändern sie aber nicht („In den Profilen
 *   ohne Verwaltung können Rollen nicht gesetzt werden"). Das Kennwort lässt
 *   sich ändern, es braucht aber die Freigabe der Verwaltung; bis dahin steht
 *   der Wunsch als Hinweis auf der Seite.
 *
 * Die Seitenrechte darunter sind IMMER nur zum Ansehen — sie kommen aus der
 * Rolle, nicht aus der Person. Wer sie ändern will, ändert die Rolle.
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

const inputClass =
    'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#272f67] disabled:bg-slate-50 disabled:text-slate-400 dark:border-white/15 dark:bg-transparent dark:text-white dark:disabled:bg-white/5';

const readApiError = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

export const PersonAccessTab = ({
    person,
    isSelf,
    pendingRequest,
    onChanged,
}: {
    person: PersonHeader;
    isSelf: boolean;
    pendingRequest: { id: string; createdAt: string; note: string | null } | null;
    onChanged: () => void;
}) => {
    const permissions = useAuthStore((state) => state.permissions);
    const ownPageAccess = useAuthStore((state) => state.pageAccess);
    const canManage = permissions.includes('roles.manage');

    const [access, setAccess] = useState<PersonAccess | null>(null);
    const [catalog, setCatalog] = useState<CatalogModuleDto[]>(FALLBACK_CATALOG);
    const [loading, setLoading] = useState(canManage);
    const [saving, setSaving] = useState(false);

    // Formularzustand der Verwaltung.
    const [roleId, setRoleId] = useState<string>('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [allowedTenantIds, setAllowedTenantIds] = useState<string[] | null>(null);

    // Kennwortwunsch (eigenes Profil).
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [requestNote, setRequestNote] = useState('');
    const [requesting, setRequesting] = useState(false);

    useEffect(() => {
        if (!canManage) return;
        let cancelled = false;
        setLoading(true);
        Promise.all([
            personAccessApi.get(person.id),
            roleTemplateApi.catalog().catch(() => FALLBACK_CATALOG),
        ])
            .then(([detail, modules]) => {
                if (cancelled) return;
                setAccess(detail);
                setCatalog(modules.length ? modules : FALLBACK_CATALOG);
                setRoleId(detail.roleId ?? '');
                setEmail(detail.email);
                setAllowedTenantIds(detail.allowedTenantIds);
            })
            .catch(() => { if (!cancelled) toast.error(t('personnel.person.accessLoadFailed')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [canManage, person.id]);

    /* Die Vorschau der Seitenrechte: die Verwaltung sieht die Stufen der
       gewählten Rolle, das eigene Profil die eigene Karte (die kommt ohnehin
       schon mit der Anmeldung). Fremde Seiten ohne Verwaltung zeigen keine —
       dafür fehlt die Berechtigung, die Rolle abzufragen. */
    const previewLevels = useMemo<Record<string, PageLevel> | null>(() => {
        if (canManage) {
            const selected = access?.roles.find((role) => role.id === roleId);
            return selected ? selected.pageLevels : {};
        }
        if (isSelf) return ownPageAccess as Record<string, PageLevel>;
        return null;
    }, [access, canManage, isSelf, ownPageAccess, roleId]);

    /* Die Firmen kommen aus der Zugangsantwort, NICHT aus dem Firmenumschalter:
       der zeigt seit dem 31.08.2026 nur noch die zugeteilten Firmen, und damit
       liesse sich nie eine weitere zuteilen. Ohne gespeicherte Zuteilung gilt
       genau die Firma, unter der die Person angelegt wurde.

       Die Liste fuehrt seit dem 31.08.2026 JEDE aktive Firma - Untergesellschaft
       oder eigene Gruppe, das spielt hier keine Rolle mehr. Vorgabe: eine
       Auswahl muss getroffen werden, sie muss angegeben werden. */
    const companies = access?.companies ?? [];
    const homeTenantId = access?.homeTenantId ?? '';
    const defaultTenantIds = homeTenantId ? [homeTenantId] : [];

    /* WAS DIESE PERSON AM ENDE AUSWAEHLEN KANN - die Verwaltung soll es lesen
       koennen, ohne es sich aus Haken und Rolle zusammenzureimen (Vorgabe
       31.08.2026: die Verwaltung muss wissen, wer was auswaehlen kann und was
       in der Liste steht). Zwei Quellen fliessen zusammen:
         - die Haken unten (ohne Haken: die Heimatfirma),
         - die Rolle, wenn sie den Firmenwechsel traegt - die oeffnet zusaetzlich
           die ganze eigene Gruppe, ohne dass hier etwas angehakt waere. */
    const selectedRole = access?.roles.find((role) => role.id === roleId) ?? null;
    const roleOpensGroup = Boolean(selectedRole?.canSwitchTenant);
    const effectiveTenantIds = allowedTenantIds?.length ? allowedTenantIds : defaultTenantIds;
    const effectiveNames = companies
        .filter((tenant) => effectiveTenantIds.includes(tenant.id))
        .map((tenant) => tenant.tenantName);

    const toggleTenant = (tenantId: string) => {
        setAllowedTenantIds((current) => {
            const selected = new Set(current ?? defaultTenantIds);
            if (selected.has(tenantId)) selected.delete(tenantId);
            else selected.add(tenantId);
            // Immer eine ausdrückliche Liste: «alle angehakt» ist nicht mehr
            // dasselbe wie «keine Zuteilung» (das hiesse jetzt: nur die eigene).
            return [...selected];
        });
    };

    const save = async () => {
        try {
            setSaving(true);
            await personAccessApi.save(person.id, {
                roleId: roleId || null,
                email: email.trim() || undefined,
                password: password || undefined,
                allowedTenantIds: allowedTenantIds ?? [],
            });
            setPassword('');
            toast.success(t('personnel.person.accessSaved'));
            onChanged();
        } catch (error: unknown) {
            toast.error(readApiError(error, t('personnel.person.accessSaveFailed')));
        } finally {
            setSaving(false);
        }
    };

    const submitPasswordRequest = async () => {
        if (!currentPassword || !newPassword) {
            toast.error(t('personnel.person.passwordBothRequired'));
            return;
        }
        try {
            setRequesting(true);
            const result = await passwordRequestApi.submit({
                currentPassword,
                newPassword,
                note: requestNote.trim() || undefined,
            });
            setCurrentPassword('');
            setNewPassword('');
            setRequestNote('');
            toast.success(result.applied ? t('personnel.person.passwordChanged') : t('personnel.person.passwordRequested'));
            onChanged();
        } catch (error: unknown) {
            toast.error(readApiError(error, t('personnel.person.passwordRequestFailed')));
        } finally {
            setRequesting(false);
        }
    };

    const decideRequest = async (approve: boolean) => {
        if (!pendingRequest) return;
        try {
            setSaving(true);
            await passwordRequestApi.decide(pendingRequest.id, approve);
            toast.success(approve ? t('personnel.person.requestApproved') : t('personnel.person.requestRejected'));
            onChanged();
        } catch (error: unknown) {
            toast.error(readApiError(error, t('personnel.person.requestDecideFailed')));
        } finally {
            setSaving(false);
        }
    };

    const allowedSet = new Set(allowedTenantIds ?? defaultTenantIds);

    if (loading) {
        return <div className="py-10"><InlineLoading label={t('common.loading')} /></div>;
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Offener Kennwortwunsch — für die Verwaltung mit Entscheidung,
                für die betroffene Person als Standmeldung. */}
            {pendingRequest && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-400/30 dark:bg-amber-500/10">
                    <div className="min-w-0">
                        <span className="block text-[12.5px] font-semibold text-amber-900 dark:text-amber-200">
                            {t('personnel.person.pendingPasswordTitle')}
                        </span>
                        <span className="block text-[11.5px] text-amber-800/80 dark:text-amber-200/70">
                            {formatDateTime(pendingRequest.createdAt)}
                            {pendingRequest.note ? ` · ${pendingRequest.note}` : ''}
                        </span>
                    </div>
                    {canManage && !isSelf && (
                        <div className="flex shrink-0 items-center gap-2">
                            <GhostButton disabled={saving} onClick={() => void decideRequest(false)}>
                                {t('personnel.person.reject')}
                            </GhostButton>
                            <PrimaryButton disabled={saving} onClick={() => void decideRequest(true)}>
                                {t('personnel.person.approve')}
                            </PrimaryButton>
                        </div>
                    )}
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title={t('personnel.person.accessSection')}>
                    <div className="flex flex-col gap-3 p-3">
                        {canManage ? (
                            <>
                                <Labelled label={t('settings.roles.colRole')} hint={t('personnel.person.roleHint')}>
                                    <select
                                        value={roleId}
                                        onChange={(event) => setRoleId(event.target.value)}
                                        className={inputClass}
                                    >
                                        <option value="">{t('personnel.person.noRole')}</option>
                                        {access?.roles.map((role) => (
                                            <option key={role.id} value={role.id}>{role.roleName}</option>
                                        ))}
                                    </select>
                                </Labelled>

                                <Labelled label={t('personnel.field.email')}>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        className={inputClass}
                                    />
                                </Labelled>

                                <Labelled label={t('personnel.person.newPassword')} hint={t('personnel.person.passwordHint')}>
                                    <input
                                        type="password"
                                        value={password}
                                        autoComplete="new-password"
                                        onChange={(event) => setPassword(event.target.value)}
                                        className={inputClass}
                                    />
                                </Labelled>

                                <div>
                                    <span className="mb-1 block text-[12px] font-semibold text-slate-600 dark:text-white/70">
                                        {t('personnel.person.companies')}
                                    </span>
                                    <span className="mb-1.5 block text-[11px] text-slate-400 dark:text-white/45">
                                        {t('personnel.person.companiesHint')}
                                    </span>
                                    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-2.5 dark:border-white/15">
                                        {companies.map((tenant) => (
                                            <label key={tenant.id} className="flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-700 dark:text-white/80">
                                                <input
                                                    type="checkbox"
                                                    checked={allowedSet.has(tenant.id)}
                                                    onChange={() => toggleTenant(tenant.id)}
                                                    className="accent-[#272f67]"
                                                />
                                                <span className="truncate">{tenant.tenantName}</span>
                                                {/* Die Heimatfirma ist die, unter der die Person
                                                    angelegt wurde - ohne jeden Haken gilt genau
                                                    sie, deshalb steht sie hier angeschrieben. */}
                                                {tenant.id === homeTenantId && (
                                                    <Chip className="bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/15">
                                                        {t('personnel.person.companiesHome')}
                                                    </Chip>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                    {/* Der Klartext darunter: was diese Person nach dem
                                        Speichern im Kopf auswaehlen kann. */}
                                    <span className="mt-1.5 block text-[11.5px] text-slate-600 dark:text-white/60">
                                        {t('personnel.person.companiesSelectable', {
                                            list: effectiveNames.join(', ') || '-',
                                        })}
                                    </span>
                                    {roleOpensGroup && (
                                        <span className="mt-1 block text-[11.5px] text-emerald-700 dark:text-emerald-300">
                                            {t('personnel.person.companiesRoleOpensGroup', {
                                                role: selectedRole?.roleName ?? '',
                                            })}
                                        </span>
                                    )}
                                </div>

                                <div className="flex justify-end pt-1">
                                    <PrimaryButton icon={<Save size={13} />} disabled={saving} onClick={() => void save()}>
                                        {t('common.save')}
                                    </PrimaryButton>
                                </div>
                            </>
                        ) : (
                            <>
                                <Labelled label={t('settings.roles.colRole')} hint={t('personnel.person.roleReadOnlyHint')}>
                                    <span className="flex h-9 items-center">
                                        {person.roleName
                                            ? (
                                                <Chip className="bg-[#eef2fb] text-[#1f2654] ring-[#c9d5f0] dark:bg-white/10 dark:text-white/80 dark:ring-white/15">
                                                    {person.roleName}
                                                </Chip>
                                            )
                                            : <span className="text-[13px] text-slate-400 dark:text-white/40">{t('personnel.person.noRole')}</span>}
                                    </span>
                                </Labelled>
                                <Labelled label={t('personnel.field.email')}>
                                    <input value={person.email} disabled className={inputClass} />
                                </Labelled>
                            </>
                        )}
                    </div>
                </SectionCard>

                {/* Kennwort ändern — nur im eigenen Profil. Wer verwaltet, setzt
                    es links direkt; alle anderen stellen einen Antrag. */}
                {isSelf && (
                    <SectionCard title={t('personnel.person.changePassword')}>
                        <div className="flex flex-col gap-3 p-3">
                            <p className="text-[11.5px] text-slate-500 dark:text-white/55">
                                {canManage ? t('personnel.person.changePasswordDirect') : t('personnel.person.changePasswordApproval')}
                            </p>
                            <Labelled label={t('personnel.person.currentPassword')}>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    autoComplete="current-password"
                                    onChange={(event) => setCurrentPassword(event.target.value)}
                                    className={inputClass}
                                />
                            </Labelled>
                            <Labelled label={t('personnel.person.newPassword')}>
                                <input
                                    type="password"
                                    value={newPassword}
                                    autoComplete="new-password"
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    className={inputClass}
                                />
                            </Labelled>
                            {!canManage && (
                                <Labelled label={t('personnel.person.requestNote')}>
                                    <input
                                        value={requestNote}
                                        onChange={(event) => setRequestNote(event.target.value)}
                                        placeholder={t('personnel.person.requestNotePlaceholder')}
                                        className={inputClass}
                                    />
                                </Labelled>
                            )}
                            <div className="flex justify-end pt-1">
                                <PrimaryButton disabled={requesting} onClick={() => void submitPasswordRequest()}>
                                    {canManage ? t('personnel.person.setPassword') : t('personnel.person.requestPassword')}
                                </PrimaryButton>
                            </div>
                        </div>
                    </SectionCard>
                )}
            </div>

            {/* Zugeklappt (Vorgabe 17.08.2026): die Seitenrechte stehen als EINE
                Zeile da und öffnen sich erst auf Klick — beim Öffnen des Reiters
                soll nicht die ganze Rechtekarte über die Seite laufen. */}
            {previewLevels && (
                <SectionCard title={t('personnel.person.pagePermissions')} collapsible defaultOpen={false}>
                    <p className="px-3 pt-2 text-[11.5px] text-slate-500 dark:text-white/50">
                        {t('personnel.person.pagePermissionsHint')}
                    </p>
                    <PageLevelTable modules={catalog} levels={previewLevels} readOnly />
                </SectionCard>
            )}
        </div>
    );
};
