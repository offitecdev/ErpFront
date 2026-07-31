import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Edit01 as Edit, Plus, Trash01 as Trash2 } from '@/components/icons/antIconCompat';
import { apiClient } from '../../lib/axios';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { useAuthStore } from '../../store/authStore';
import { MODULE_ACTION_LABELS, MODULE_CATALOG, blockedPermissionNames, isModuleAvailable, type EnabledModules, type ModuleAction } from '../../lib/moduleCatalog';

import { t } from '@/i18n/translate';

type RoleRow = {
    id: string;
    roleName: string;
    userCount?: number;
    permissions?: string[];
    /** Module package of the role; null/empty = every module the company category allows. */
    moduleKeys?: string[] | null;
};

type PermissionRow = { id: string; permissionName: string };

const ACTION_ORDER: ModuleAction[] = ['read', 'write', 'delete'];

export const Roles: React.FC = () => {
    const tenants = useAuthStore((s) => s.tenants);
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [permissions, setPermissions] = useState<PermissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
    const [roleName, setRoleName] = useState('');
    const [permissionIds, setPermissionIds] = useState<string[]>([]);
    const [moduleKeys, setModuleKeys] = useState<string[]>([]);
    const [expandedModule, setExpandedModule] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) || null;
    const companyProfile = selectedTenant?.moduleProfile || null;

    // Only the modules the active company's category enables can be granted —
    // no category on the company means every module is available. The
    // administration module is always available (admins must never lock
    // themselves out of role/user management).
    const enabledModules = useMemo<EnabledModules>(
        () => (Array.isArray(companyProfile?.moduleKeys) ? new Set(companyProfile!.moduleKeys) : null),
        [companyProfile],
    );
    const visibleModules = useMemo(
        () => MODULE_CATALOG.filter((moduleDef) => isModuleAvailable(moduleDef, enabledModules)),
        [enabledModules],
    );

    const permissionIdByName = useMemo(
        () => new Map(permissions.map((perm) => [perm.permissionName, perm.id])),
        [permissions],
    );

    /** Permission ids behind one module action (only ones that exist server-side). */
    const actionPermissionIds = (moduleKey: string, action: ModuleAction): string[] => {
        const moduleDef = MODULE_CATALOG.find((m) => m.key === moduleKey);
        return (moduleDef?.actions[action] || [])
            .map((name) => permissionIdByName.get(name))
            .filter((id): id is string => Boolean(id));
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [rolesRes, permsRes] = await Promise.all([
                apiClient.get('/roles'),
                apiClient.get('/roles/permissions'),
            ]);
            setRoles(rolesRes.data || []);
            setPermissions(permsRes.data || []);
        } catch {
            toast.error(t('iam.employees.errorLoad'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [selectedTenantId]);

    const openModal = (role?: RoleRow) => {
        if (role) {
            setEditingRoleId(role.id);
            setRoleName(role.roleName);
            setPermissionIds(
                permissions
                    .filter((p) => role.permissions?.includes(p.permissionName))
                    .map((p) => p.id)
            );
            setModuleKeys(Array.isArray(role.moduleKeys) ? [...role.moduleKeys] : []);
        } else {
            setEditingRoleId(null);
            setRoleName('');
            setPermissionIds([]);
            setModuleKeys([]);
        }
        setExpandedModule(null);
        setModalOpen(true);
    };

    const submit = async () => {
        if (!roleName.trim()) {
            toast.error(t('iam.roles.errorNameRequired'));
            return;
        }
        setSaving(true);
        try {
            // A pre-existing role may still carry permissions of modules the
            // company's category has since disabled — drop them, the backend
            // rejects the whole save otherwise.
            const blockedNames = blockedPermissionNames(enabledModules);
            const blockedIds = new Set(
                permissions.filter((perm) => blockedNames.has(perm.permissionName)).map((perm) => perm.id),
            );
            const payload = {
                roleName: roleName.trim(),
                permissionIds: permissionIds.filter((id) => !blockedIds.has(id)),
                // Empty selection = no restriction (backend stores null). Keys of
                // modules the category has since disabled are dropped too.
                moduleKeys: moduleKeys.filter((key) =>
                    visibleModules.some((moduleDef) => moduleDef.key === key)),
            };
            if (editingRoleId) {
                await apiClient.patch(`/roles/${editingRoleId}`, payload);
                toast.success(t('iam.roles.successUpdate'));
            } else {
                await apiClient.post('/roles', payload);
                toast.success(t('iam.roles.successCreate'));
            }
            setModalOpen(false);
            await fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('iam.employees.errorSave'));
        } finally {
            setSaving(false);
        }
    };

    const deleteRole = async (id: string) => {
        if (!confirm(t('iam.roles.deleteConfirm'))) return;
        try {
            await apiClient.delete(`/roles/${id}`);
            setRoles((prev) => prev.filter((r) => r.id !== id));
            toast.success(t('iam.roles.successDelete'));
        } catch {
            toast.error(t('iam.roles.errorDelete'));
        }
    };

    const isActionChecked = (moduleKey: string, action: ModuleAction): boolean => {
        const ids = actionPermissionIds(moduleKey, action);
        return ids.length > 0 && ids.every((id) => permissionIds.includes(id));
    };

    const toggleAction = (moduleKey: string, action: ModuleAction) => {
        const ids = actionPermissionIds(moduleKey, action);
        if (!ids.length) return;
        setPermissionIds((prev) => {
            const checked = ids.every((id) => prev.includes(id));
            if (checked) return prev.filter((id) => !ids.includes(id));
            return [...new Set([...prev, ...ids])];
        });
    };

    const moduleGrantCount = (moduleKey: string): number =>
        ACTION_ORDER.filter((action) => isActionChecked(moduleKey, action)).length;

    return (
        <div>
            <PageHeader
                breadcrumb="Personel"
                title={t('nav.roleManagement')}
                description={companyProfile
                    ? `${t('iam.roles.companyCategory', { defaultValue: 'Şirket kategorisi' })}: ${companyProfile.profileNumber} · ${companyProfile.name}`
                    : t('iam.roles.description')}
                actions={<Button variant="primary" icon={<Plus size={13} />} onClick={() => openModal()}>{t('iam.roles.newRole')}</Button>}
            />

            <Card title={t('iam.roles.tableTitle')} noPadding>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('iam.roles.colRoleName')}</th>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('iam.roles.colUsers')}</th>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('iam.roles.colPermissions')}</th>
                                <th className="px-4 py-2.5 text-right font-semibold">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && <tr><td colSpan={4} className="px-4 py-10"><div className="h-3 bg-slate-100 rounded animate-pulse" /></td></tr>}
                            {!loading && roles.length === 0 && <tr><td colSpan={4}><EmptyState title={t('iam.roles.noRoles')} description={t('iam.roles.noRolesDesc')} /></td></tr>}
                            {!loading && roles.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50/60">
                                    <td className="px-4 py-2.5 font-semibold text-slate-900">{r.roleName}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.userCount ?? 0}{t('auto.kullanici')}</td>
                                    <td className="px-4 py-2.5 text-slate-500">{r.permissions?.length ? `${r.permissions.length} yetki` : '—'}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex gap-1">
                                            <Button variant="ghost" size="sm" icon={<Edit size={12} />} onClick={() => openModal(r)} />
                                            <Button variant="ghost" size="sm" icon={<Trash2 size={12} />} onClick={() => deleteRole(r.id)} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal
                open={modalOpen}
                title={editingRoleId ?t('iam.roles.modalEditTitle') :t('iam.roles.modalCreateTitle')}
                onClose={() => setModalOpen(false)}
                width="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
                        <Button variant="primary" loading={saving} onClick={submit}>{t('common.save')}</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Field label={t('iam.roles.colRoleName')} required>
                        <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder={t('iam.roles.roleNamePlaceholder')} />
                    </Field>
                    <Field label={t('iam.roles.modulePackage', { defaultValue: 'Modül paketi (erişilebilen sayfalar)' })}>
                        {/* Accessible pages live here — on the ROLE, not on the
                            individual employee. For THE SELECTED ENTITY: roles are
                            shared across the company tree, but each company
                            configures which pages the role opens for itself. Nothing
                            selected = every module the company's category allows. */}
                        <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-2">
                            {visibleModules.map((moduleDef) => (
                                <Checkbox
                                    key={moduleDef.key}
                                    label={t(moduleDef.labelKey, { defaultValue: moduleDef.labelDefault })}
                                    size="sm"
                                    isSelected={moduleKeys.includes(moduleDef.key)}
                                    onChange={() => setModuleKeys((prev) => prev.includes(moduleDef.key)
                                        ? prev.filter((key) => key !== moduleDef.key)
                                        : [...prev, moduleDef.key])}
                                    className="rounded-lg px-2 py-1.5 hover:bg-brand-primary_alt"
                                />
                            ))}
                        </div>
                        <p className="mt-1.5 text-[11.5px] text-slate-500">
                            {t('iam.roles.modulePackageScope', {
                                defaultValue: 'Bu paket yalnızca seçili şirket için geçerlidir: {{company}}. Diğer şirketlerdeki paketi, üstteki şirket seçiciyi değiştirip aynı rolü düzenleyerek ayarlayın.',
                                company: selectedTenant?.tenantName ?? '—',
                            })}{' '}
                            {t('iam.roles.modulePackageHint', { defaultValue: 'Hiçbiri seçilmezse bu roldeki personel, şirket kategorisinin izin verdiği tüm modülleri görür. Personel formunda tanımlanan kişisel paket bu paketi geçersiz kılar.' })}
                        </p>
                    </Field>
                    <Field label={t('iam.roles.permissions')}>
                        {/* Module accordion: pick a module, then grant plain
                            read / write / delete instead of raw permission codes. */}
                        <div className="max-h-[360px] space-y-1.5 overflow-y-auto rounded-md border border-slate-200 p-2">
                            {visibleModules.map((moduleDef) => {
                                const availableActions = ACTION_ORDER.filter(
                                    (action) => actionPermissionIds(moduleDef.key, action).length > 0,
                                );
                                if (!availableActions.length) return null;
                                const expanded = expandedModule === moduleDef.key;
                                const grantedCount = moduleGrantCount(moduleDef.key);
                                return (
                                    <div key={moduleDef.key} className="rounded-lg border border-slate-200/80">
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-brand-primary_alt"
                                            onClick={() => setExpandedModule(expanded ? null : moduleDef.key)}
                                        >
                                            <span className="text-[13px] font-semibold text-slate-900">
                                                {t(moduleDef.labelKey, { defaultValue: moduleDef.labelDefault })}
                                            </span>
                                            <span className="flex items-center gap-2">
                                                {grantedCount > 0 && (
                                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-bold text-emerald-800">
                                                        {grantedCount}/{availableActions.length}
                                                    </span>
                                                )}
                                                <ChevronDown size={14} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                            </span>
                                        </button>
                                        {expanded && (
                                            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2.5">
                                                {availableActions.map((action) => (
                                                    <Checkbox
                                                        key={action}
                                                        label={t(MODULE_ACTION_LABELS[action].labelKey, { defaultValue: MODULE_ACTION_LABELS[action].labelDefault })}
                                                        size="sm"
                                                        isSelected={isActionChecked(moduleDef.key, action)}
                                                        onChange={() => toggleAction(moduleDef.key, action)}
                                                        className="rounded-lg px-2 py-1.5 hover:bg-brand-primary_alt"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <p className="mt-1.5 text-[11.5px] text-slate-500">
                            {t('iam.roles.moduleHint', { defaultValue: 'Yetkiler modül bazında verilir: bir modülü açın ve okuma / yazma / silme seçin. Sadece şirketin kategorisine dahil modüller listelenir.' })}
                        </p>
                    </Field>
                </div>
            </Modal>
        </div>
    );
};
