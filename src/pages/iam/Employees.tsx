import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Edit01 as Edit, Plus, UserX01 as UserX } from '@/components/icons/antIconCompat';
import { apiClient } from '../../lib/axios';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusBadge } from '../../components/ui-shared/StatusBadge';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { useAuthStore } from '../../store/authStore';

import { t } from '@/i18n/translate';

type EmployeeRow = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    roleId?: string | null;
    roleName?: string | null;
    isActive: boolean;
    /** Assigned companies; null/empty = every company of the tree. */
    allowedTenantIds?: string[] | null;
};

type RoleRow = { id: string; roleName: string };

const emptyForm = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    roleId: '',
    allowedTenantIds: [] as string[],
};

export const Employees: React.FC = () => {
    const permissions = useAuthStore((s) => s.permissions);
    const tenants = useAuthStore((s) => s.tenants);
    // Role & company assignment is an admin act (backend enforces the same rule).
    // Which pages a person may open is NOT set here: it is the module package of
    // the ROLE (Rol Yönetimi), so one change covers everyone holding that role.
    const canAssignRoles = permissions.includes('roles.manage');
    // Company assignment only makes sense once the tree has more than one
    // company; single-company installs keep the form as it was.
    const showTenantAssignment = tenants.length > 1;
    const tenantNameById = new Map(tenants.map((tenant) => [tenant.id, tenant.tenantName]));
    const columnCount = showTenantAssignment ? 6 : 5;
    const [employees, setEmployees] = useState<EmployeeRow[]>([]);
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);

    const fetchData = async () => {
        try {
            setLoading(true);
            // GET /roles is admin-only; non-admins must not have the whole
            // page fail on its 403.
            const [empRes, roleRes] = await Promise.all([
                apiClient.get('/employees'),
                canAssignRoles ? apiClient.get('/roles') : Promise.resolve({ data: [] }),
            ]);
            setEmployees(empRes.data || []);
            setRoles(roleRes.data || []);
        } catch {
            toast.error(t('iam.employees.errorLoad'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const openModal = (record?: EmployeeRow) => {
        if (record) {
            setEditId(record.id);
            setForm({
                firstName: record.firstName,
                lastName: record.lastName,
                email: record.email,
                password: '',
                roleId: record.roleId || roles.find((r) => r.roleName === record.roleName)?.id || '',
                allowedTenantIds: Array.isArray(record.allowedTenantIds) ? [...record.allowedTenantIds] : [],
            });
        } else {
            setEditId(null);
            setForm(emptyForm);
        }
        setModalOpen(true);
    };

    const submit = async () => {
        if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || (!editId && !form.password.trim())) {
            toast.error(t('iam.employees.errorRequired'));
            return;
        }
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                email: form.email.trim(),
            };
            if (canAssignRoles) {
                payload.roleId = form.roleId;
                // Empty selection = no restriction (backend stores null).
                if (showTenantAssignment) payload.allowedTenantIds = form.allowedTenantIds;
            }
            if (form.password.trim()) payload.password = form.password.trim();
            if (editId) {
                await apiClient.patch(`/employees/${editId}`, payload);
                toast.success(t('iam.employees.successUpdate'));
            } else {
                await apiClient.post('/employees', payload);
                toast.success(t('iam.employees.successCreate'));
            }
            setModalOpen(false);
            await fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('iam.employees.errorSave'));
        } finally {
            setSaving(false);
        }
    };

    const deactivate = async (id: string) => {
        if (!confirm(t('iam.employees.deactivateConfirm'))) return;
        try {
            await apiClient.patch(`/employees/${id}/deactivate`);
            setEmployees((prev) => prev.map((e) => e.id === id ? { ...e, isActive: false } : e));
            toast.success(t('iam.employees.successDeactivate'));
        } catch {
            toast.error(t('dashboard.actionFailed'));
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('iam.breadcrumb')}
                title={t('nav.employeeList')}
                description={t('iam.employees.description')}
                actions={<Button variant="primary" icon={<Plus size={13} />} onClick={() => openModal()}>{t('iam.employees.newEmployee')}</Button>}
            />

            <Card title={t('iam.employees.tableTitle')} noPadding>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('nav.personnel')}</th>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('common.email')}</th>
                                <th className="px-4 py-2.5 text-left font-semibold">{t('iam.employees.colRole')}</th>
                                {showTenantAssignment && <th className="px-4 py-2.5 text-left font-semibold">{t('iam.employees.colCompanies')}</th>}
                                <th className="px-4 py-2.5 text-left font-semibold">{t('common.status')}</th>
                                <th className="px-4 py-2.5 text-right font-semibold">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && (
                                <tr><td colSpan={columnCount} className="px-4 py-10"><div className="h-3 bg-slate-100 rounded animate-pulse" /></td></tr>
                            )}
                            {!loading && employees.length === 0 && (
                                <tr><td colSpan={columnCount}><EmptyState title={t('iam.employees.noEmployees')} description={t('iam.employees.noEmployeesDesc')} /></td></tr>
                            )}
                            {!loading && employees.map((e) => (
                                <tr key={e.id} className="hover:bg-slate-50/60">
                                    <td className="px-4 py-2.5 font-semibold text-slate-900">{e.firstName} {e.lastName}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{e.email}</td>
                                    <td className="px-4 py-2.5 text-blue-700 font-medium">{e.roleName || '—'}</td>
                                    {showTenantAssignment && (
                                        <td className="px-4 py-2.5 text-slate-600">
                                            {e.allowedTenantIds?.length
                                                ? e.allowedTenantIds.map((tenantId) => tenantNameById.get(tenantId) || tenantId).join(', ')
                                                : t('iam.employees.allCompanies')}
                                        </td>
                                    )}
                                    <td className="px-4 py-2.5"><StatusBadge variant={e.isActive ? 'active' : 'passive'}>{e.isActive ?t('common.active') :t('common.inactive')}</StatusBadge></td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex gap-1">
                                            <Button variant="ghost" size="sm" icon={<Edit size={12} />} onClick={() => openModal(e)} />
                                            {e.isActive && <Button variant="ghost" size="sm" icon={<UserX size={12} />} onClick={() => deactivate(e.id)} />}
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
                title={editId ?t('iam.employees.modalEditTitle') :t('iam.employees.modalCreateTitle')}
                onClose={() => setModalOpen(false)}
                width="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
                        <Button variant="primary" loading={saving} onClick={submit}>{editId ?t('common.save') :t('common.create')}</Button>
                    </>
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    <Field label={t('iam.employees.firstName')} required><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
                    <Field label={t('iam.employees.lastName')} required><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
                    <Field label={t('common.email')} required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                    <Field label={editId ?t('iam.employees.newPassword') :t('iam.employees.tempPassword')} required={!editId}>
                        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editId ?t('iam.employees.passwordHint') : ''} />
                    </Field>
                    {canAssignRoles && (
                        <Field label={t('iam.employees.role')} className="col-span-2">
                            <Select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                                <option value="">{t('iam.employees.roleSelect')}</option>
                                {roles.map((r) => <option key={r.id} value={r.id}>{r.roleName}</option>)}
                            </Select>
                        </Field>
                    )}
                    {canAssignRoles && showTenantAssignment && (
                        <Field label={t('iam.employees.companies')} className="col-span-2">
                            {/* Company assignment: which companies of the tree the
                                staff member may work in and switch between.
                                Nothing selected = every company of the tree. */}
                            <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-2">
                                {tenants.map((tenant) => (
                                    <Checkbox
                                        key={tenant.id}
                                        label={tenant.tenantName}
                                        size="sm"
                                        isSelected={form.allowedTenantIds.includes(tenant.id)}
                                        onChange={() => setForm((prev) => ({
                                            ...prev,
                                            allowedTenantIds: prev.allowedTenantIds.includes(tenant.id)
                                                ? prev.allowedTenantIds.filter((id) => id !== tenant.id)
                                                : [...prev.allowedTenantIds, tenant.id],
                                        }))}
                                        className="rounded-lg px-2 py-1.5 hover:bg-brand-primary_alt"
                                    />
                                ))}
                            </div>
                            <p className="mt-1.5 text-[11.5px] text-slate-500">{t('iam.employees.companiesHint')}</p>
                        </Field>
                    )}
                    {canAssignRoles && (
                        <p className="col-span-2 text-[11.5px] text-slate-500">
                            {t('iam.employees.modulePackageMovedHint')}
                        </p>
                    )}
                </div>
            </Modal>
        </div>
    );
};
