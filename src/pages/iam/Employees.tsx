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

import { t } from '@/i18n/translate';

type EmployeeRow = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    roleId?: string | null;
    roleName?: string | null;
    isActive: boolean;
};

type RoleRow = { id: string; roleName: string };

const emptyForm = { firstName: '', lastName: '', email: '', password: '', roleId: '' };

export const Employees: React.FC = () => {
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
            const [empRes, roleRes] = await Promise.all([
                apiClient.get('/employees'),
                apiClient.get('/roles'),
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
            const payload: Record<string, string> = {
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                email: form.email.trim(),
                roleId: form.roleId,
            };
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
                breadcrumb="Personel"
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
                                <th className="px-4 py-2.5 text-left font-semibold">{t('common.status')}</th>
                                <th className="px-4 py-2.5 text-right font-semibold">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && (
                                <tr><td colSpan={5} className="px-4 py-10"><div className="h-3 bg-slate-100 rounded animate-pulse" /></td></tr>
                            )}
                            {!loading && employees.length === 0 && (
                                <tr><td colSpan={5}><EmptyState title={t('iam.employees.noEmployees')} description={t('iam.employees.noEmployeesDesc')} /></td></tr>
                            )}
                            {!loading && employees.map((e) => (
                                <tr key={e.id} className="hover:bg-slate-50/60">
                                    <td className="px-4 py-2.5 font-semibold text-slate-900">{e.firstName} {e.lastName}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{e.email}</td>
                                    <td className="px-4 py-2.5 text-blue-700 font-medium">{e.roleName || '—'}</td>
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
                    <Field label={t('iam.employees.role')} className="col-span-2">
                        <Select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                            <option value="">{t('iam.employees.roleSelect')}</option>
                            {roles.map((r) => <option key={r.id} value={r.id}>{r.roleName}</option>)}
                        </Select>
                    </Field>
                </div>
            </Modal>
        </div>
    );
};
