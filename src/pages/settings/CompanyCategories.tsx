import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Edit01 as Edit, Plus, Trash01 as Trash2 } from '@/components/icons/antIconCompat';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { useAuthStore } from '../../store/authStore';
import { moduleProfileApi, type ModuleProfileDto } from '../../lib/api/moduleProfiles';
import { MODULE_CATALOG } from '../../lib/moduleCatalog';

import { t } from '@/i18n/translate';

const emptyForm = { profileNumber: '', name: '', moduleKeys: [] as string[] };

/**
 * Company categories ("Numara" profiles): the admin defines numbered module
 * bundles (e.g. Numara 1 = CRM + Bakım) and maps each company to one. The
 * mapping drives which menus/modules that company's users see and which
 * permissions its roles may contain.
 */
export const CompanyCategories: React.FC = () => {
    const tenants = useAuthStore((s) => s.tenants);
    const fetchProfile = useAuthStore((s) => s.fetchProfile);
    const [profiles, setProfiles] = useState<ModuleProfileDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [assigningTenantId, setAssigningTenantId] = useState<string | null>(null);

    const fetchProfiles = async () => {
        try {
            setLoading(true);
            setProfiles(await moduleProfileApi.list());
        } catch {
            toast.error(t('settings.companyCategories.errorLoad', { defaultValue: 'Kategoriler yüklenemedi.' }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProfiles(); }, []);

    const openModal = (profile?: ModuleProfileDto) => {
        if (profile) {
            setEditingId(profile.id);
            setForm({ profileNumber: String(profile.profileNumber), name: profile.name, moduleKeys: [...profile.moduleKeys] });
        } else {
            setEditingId(null);
            setForm(emptyForm);
        }
        setModalOpen(true);
    };

    const toggleModule = (key: string) => {
        setForm((prev) => ({
            ...prev,
            moduleKeys: prev.moduleKeys.includes(key)
                ? prev.moduleKeys.filter((k) => k !== key)
                : [...prev.moduleKeys, key],
        }));
    };

    const submit = async () => {
        const profileNumber = Number(form.profileNumber);
        if (!Number.isInteger(profileNumber) || profileNumber < 1) {
            toast.error(t('settings.companyCategories.errorNumber', { defaultValue: 'Kategori numarası 1 veya daha büyük bir tam sayı olmalıdır.' }));
            return;
        }
        if (!form.name.trim()) {
            toast.error(t('settings.companyCategories.errorName', { defaultValue: 'Kategori adı gereklidir.' }));
            return;
        }
        setSaving(true);
        try {
            const payload = { profileNumber, name: form.name.trim(), moduleKeys: form.moduleKeys };
            if (editingId) {
                await moduleProfileApi.update(editingId, payload);
            } else {
                await moduleProfileApi.create(payload);
            }
            toast.success(t('common.saved', { defaultValue: 'Kaydedildi.' }));
            setModalOpen(false);
            await fetchProfiles();
            // Module sets may have changed for mapped companies — refresh the
            // store so the sidebar reflects it immediately.
            await fetchProfile();
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('iam.employees.errorSave'));
        } finally {
            setSaving(false);
        }
    };

    const deleteProfile = async (profile: ModuleProfileDto) => {
        if (!confirm(t('settings.companyCategories.deleteConfirm', { defaultValue: 'Bu kategori silinsin mi? Eşlenmiş şirketler kategorisiz kalır (tüm modüller açılır).' }))) return;
        try {
            await moduleProfileApi.remove(profile.id);
            toast.success(t('settings.companyCategories.deleted', { defaultValue: 'Kategori silindi.' }));
            await fetchProfiles();
            await fetchProfile();
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('dashboard.actionFailed'));
        }
    };

    const assignTenant = async (tenantId: string, profileId: string) => {
        setAssigningTenantId(tenantId);
        try {
            await moduleProfileApi.assignTenant(tenantId, profileId || null);
            toast.success(t('settings.companyCategories.assigned', { defaultValue: 'Şirket kategorisi güncellendi.' }));
            await fetchProfiles();
            await fetchProfile();
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('dashboard.actionFailed'));
        } finally {
            setAssigningTenantId(null);
        }
    };

    const moduleLabel = (key: string) => {
        const moduleDef = MODULE_CATALOG.find((m) => m.key === key);
        return moduleDef ? t(moduleDef.labelKey, { defaultValue: moduleDef.labelDefault }) : key;
    };

    const profileOfTenant = (tenantId: string): ModuleProfileDto | undefined =>
        profiles.find((profile) => profile.tenantIds.includes(tenantId));

    return (
        <div>
            <PageHeader
                breadcrumb={t('nav.settings')}
                title={t('nav.companyCategories', { defaultValue: 'Şirket Kategorileri' })}
                description={t('settings.companyCategories.description', { defaultValue: 'Numaralı kategoriler tanımlayın (örn. Numara 1 = CRM + Bakım), her şirketi bir kategoriye eşleyin. Kategori, o şirketin menülerini ve rollerde verilebilecek yetkileri belirler.' })}
                actions={<Button variant="primary" icon={<Plus size={13} />} onClick={() => openModal()}>{t('settings.companyCategories.newCategory', { defaultValue: 'Yeni Kategori' })}</Button>}
            />

            <div className="space-y-4">
                <Card title={t('settings.companyCategories.categoriesTitle', { defaultValue: 'Kategoriler' })} noPadding>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-2.5 text-left font-semibold">{t('settings.companyCategories.colNumber', { defaultValue: 'Numara' })}</th>
                                    <th className="px-4 py-2.5 text-left font-semibold">{t('settings.companyCategories.colName', { defaultValue: 'Ad' })}</th>
                                    <th className="px-4 py-2.5 text-left font-semibold">{t('settings.companyCategories.colModules', { defaultValue: 'Modüller' })}</th>
                                    <th className="px-4 py-2.5 text-left font-semibold">{t('settings.companyCategories.colCompanies', { defaultValue: 'Şirketler' })}</th>
                                    <th className="px-4 py-2.5 text-right font-semibold">{t('common.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading && <tr><td colSpan={5} className="px-4 py-10"><div className="h-3 bg-slate-100 rounded animate-pulse" /></td></tr>}
                                {!loading && profiles.length === 0 && (
                                    <tr><td colSpan={5}><EmptyState
                                        title={t('settings.companyCategories.noCategories', { defaultValue: 'Henüz kategori yok' })}
                                        description={t('settings.companyCategories.noCategoriesDesc', { defaultValue: 'İlk kategoriyi oluşturun ve modüllerini seçin.' })}
                                    /></td></tr>
                                )}
                                {!loading && profiles.map((profile) => (
                                    <tr key={profile.id} className="hover:bg-slate-50/60">
                                        <td className="px-4 py-2.5 font-bold text-slate-900">{profile.profileNumber}</td>
                                        <td className="px-4 py-2.5 font-semibold text-slate-900">{profile.name}</td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex flex-wrap gap-1">
                                                {profile.moduleKeys.length === 0 && <span className="text-slate-400">—</span>}
                                                {profile.moduleKeys.map((key) => (
                                                    <span key={key} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-700">
                                                        {moduleLabel(key)}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-600">{profile.tenantIds.length}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <div className="inline-flex gap-1">
                                                <Button variant="ghost" size="sm" icon={<Edit size={12} />} onClick={() => openModal(profile)} />
                                                <Button variant="ghost" size="sm" icon={<Trash2 size={12} />} onClick={() => deleteProfile(profile)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card title={t('settings.companyCategories.mappingTitle', { defaultValue: 'Şirket Eşleme' })} noPadding>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-2.5 text-left font-semibold">{t('settings.companyCategories.colCompany', { defaultValue: 'Şirket' })}</th>
                                    <th className="px-4 py-2.5 text-left font-semibold">{t('settings.companyCategories.colCategory', { defaultValue: 'Kategori' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {tenants.map((tenant) => {
                                    const assigned = profileOfTenant(tenant.id);
                                    return (
                                        <tr key={tenant.id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-2.5 font-semibold text-slate-900">
                                                {tenant.parentTenantId ? <span className="mr-1 text-slate-400">↳</span> : null}
                                                {tenant.tenantName}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <Select
                                                    value={assigned?.id || ''}
                                                    disabled={assigningTenantId === tenant.id}
                                                    onChange={(e) => assignTenant(tenant.id, e.target.value)}
                                                    className="max-w-[280px]"
                                                >
                                                    <option value="">{t('settings.companyCategories.noCategory', { defaultValue: 'Kategori yok (tüm modüller)' })}</option>
                                                    {profiles.map((profile) => (
                                                        <option key={profile.id} value={profile.id}>
                                                            {profile.profileNumber} · {profile.name}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            <Modal
                open={modalOpen}
                title={editingId
                    ? t('settings.companyCategories.modalEditTitle', { defaultValue: 'Kategoriyi Düzenle' })
                    : t('settings.companyCategories.modalCreateTitle', { defaultValue: 'Yeni Kategori' })}
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
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('settings.companyCategories.colNumber', { defaultValue: 'Numara' })} required>
                            <Input
                                type="number"
                                min={1}
                                value={form.profileNumber}
                                onChange={(e) => setForm({ ...form, profileNumber: e.target.value })}
                                placeholder="1"
                            />
                        </Field>
                        <Field label={t('settings.companyCategories.colName', { defaultValue: 'Ad' })} required>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder={t('settings.companyCategories.namePlaceholder', { defaultValue: 'örn. CRM + Bakım paketi' })}
                            />
                        </Field>
                    </div>
                    <Field label={t('settings.companyCategories.colModules', { defaultValue: 'Modüller' })}>
                        <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-2">
                            {MODULE_CATALOG.map((moduleDef) => (
                                <Checkbox
                                    key={moduleDef.key}
                                    label={t(moduleDef.labelKey, { defaultValue: moduleDef.labelDefault })}
                                    size="sm"
                                    isSelected={form.moduleKeys.includes(moduleDef.key)}
                                    onChange={() => toggleModule(moduleDef.key)}
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
