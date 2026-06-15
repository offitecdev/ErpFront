import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Edit01 as Edit, Plus, Trash01 as Trash2 } from '@/components/icons/antIconCompat';
import { apiClient } from '../../lib/axios';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Checkbox } from '../../components/ui-shared/Checkbox';

import { t } from '@/i18n/translate';

type RoleRow = {
    id: string;
    roleName: string;
    userCount?: number;
    permissions?: string[];
};

type PermissionRow = { id: string; permissionName: string };

export const Roles: React.FC = () => {
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [permissions, setPermissions] = useState<PermissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
    const [roleName, setRoleName] = useState('');
    const [permissionIds, setPermissionIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

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

    useEffect(() => { fetchData(); }, []);

    const openModal = (role?: RoleRow) => {
        if (role) {
            setEditingRoleId(role.id);
            setRoleName(role.roleName);
            setPermissionIds(
                permissions
                    .filter((p) => role.permissions?.includes(p.permissionName))
                    .map((p) => p.id)
            );
        } else {
            setEditingRoleId(null);
            setRoleName('');
            setPermissionIds([]);
        }
        setModalOpen(true);
    };

    const submit = async () => {
        if (!roleName.trim()) {
            toast.error(t('iam.roles.errorNameRequired'));
            return;
        }
        setSaving(true);
        try {
            const payload = { roleName: roleName.trim(), permissionIds };
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

    const togglePermission = (id: string) => {
        setPermissionIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Personel"
                title={t('nav.roleManagement')}
                description={t('iam.roles.description')}
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
                    <Field label={t('iam.roles.permissions')}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto border border-slate-200 rounded-md p-2">
                            {permissions.map((perm) => (
                                <Checkbox
                                    key={perm.id}
                                    label={perm.permissionName}
                                    size="sm"
                                    isSelected={permissionIds.includes(perm.id)}
                                    onChange={() => togglePermission(perm.id)}
                                    className="rounded-lg px-2 py-1.5 hover:bg-brand-primary_alt"
                                />
                            ))}
                        </div>
                    </Field>
                </div>
            </Modal>
        </div>
    );
};
