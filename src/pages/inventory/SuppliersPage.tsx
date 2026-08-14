import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Edit01, Plus } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import type { SupplierRow } from '@/types/inventory';
import { AddressFields, AddressLines } from '@/components/ui-shared/AddressFields';
import { EMPTY_ADDRESS, toAddressForm, toAddressPayload } from '@/components/ui-shared/addressForm';
import type { AddressFormValue } from '@/components/ui-shared/addressForm';
import { BottomSheet } from './components/BottomSheet';
import { CELL_INPUT_CLASS, ColResizeHandle, Pager, ResizableCols, SearchBox, SectionCard, TableStateRow } from './components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { useLanguageTick } from './hooks/useLanguageTick';
import { SUPPLIERS_PAGE_SIZE, useSuppliersList } from './hooks/useSuppliersList';

/**
 * Tedarikçi formu. Adres AYRI BİLEŞENLERLE girilir (`AddressFormValue`) —
 * birleşik bir "Adres" alanı yoktur; listede ve PDF'te aynı bileşenler en fazla
 * iki satıra indirilerek gösterilir.
 */
interface SupplierFormState extends AddressFormValue {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
}

const emptyForm: SupplierFormState = {
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    ...EMPTY_ADDRESS,
};

/**
 * Tedarikçiler — "+" ile alttan yükselen pencerede yeni kayıt/düzenleme
 * (modüldeki diğer popup'larla aynı kabuk); tablo tedarikçi adı, iletişim,
 * işlem sayısı ve aksiyonları gösterir.
 */
// Sürüklenebilir sütun genişlikleri. Ad sütunu burada YOKTUR: genişliği olmayan
// tek sütun odur ve artan yeri o emer.
const SUPPLIER_COLUMN_WIDTHS = {
    contact: 288,
    address: 256,
    txCount: 128,
    actions: 112,
};
type SupplierColumn = keyof typeof SUPPLIER_COLUMN_WIDTHS;

export const SuppliersPage = () => {
    useLanguageTick();
    const list = useSuppliersList();
    // Sütunlar başlıklarının sol kenarından sürüklenerek genişletilir.
    const grid = useColumnWidths<SupplierColumn>({
        storageKey: 'offitec:inv-suppliers:col-widths:v1',
        defaults: SUPPLIER_COLUMN_WIDTHS,
        minPx: 72,
    });
    const permissions = useAuthStore((state) => state.permissions);
    const canCreate = permissions.includes('inventory.articles.create');
    const canUpdate = permissions.includes('inventory.articles.update');

    const [panelOpen, setPanelOpen] = useState(false);
    const [editing, setEditing] = useState<SupplierRow | null>(null);
    const [form, setForm] = useState<SupplierFormState>(emptyForm);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!panelOpen) return;
        setForm(editing
            ? {
                companyName: editing.companyName,
                contactName: editing.contactName || '',
                email: editing.email || '',
                phone: editing.phone || '',
                ...toAddressForm(editing),
            }
            : emptyForm);
    }, [panelOpen, editing]);

    const openCreate = () => { setEditing(null); setPanelOpen(true); };
    const openEdit = (supplier: SupplierRow) => { setEditing(supplier); setPanelOpen(true); };

    const save = async () => {
        const companyName = form.companyName.trim();
        if (!companyName) {
            toast.error(t('inv.suppliers.nameRequired'));
            return;
        }
        setSaving(true);
        try {
            const payload = {
                companyName,
                contactName: form.contactName.trim() || null,
                email: form.email.trim() || null,
                phone: form.phone.trim() || null,
                ...toAddressPayload(form),
            };
            if (editing) {
                await inventoryApi.updateSupplier(editing.id, payload);
                toast.success(t('inv.suppliers.updated'));
            } else {
                await inventoryApi.createSupplier(payload);
                toast.success(t('inv.suppliers.created'));
            }
            setPanelOpen(false);
            list.reload();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('inv.suppliers.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const formField = (labelKey: string, key: 'companyName' | 'contactName' | 'email' | 'phone', required = false) => (
        <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-slate-600 dark:text-white/70">
                {t(labelKey)}
                {required && <span className="ml-0.5 text-red-500">*</span>}
            </span>
            <input
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                className={CELL_INPUT_CLASS}
            />
        </label>
    );

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('inv.suppliers.title')}
                action={canCreate && (
                    <button
                        type="button"
                        aria-label={t('inv.suppliers.add')}
                        title={t('inv.suppliers.add')}
                        onClick={openCreate}
                        className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                    >
                        <Plus size={14} />
                        {t('inv.suppliers.add')}
                    </button>
                )}
            />

            <SearchBox
                value={list.search}
                onChange={list.setSearch}
                placeholder={t('inv.suppliers.searchPlaceholder')}
                className="w-64"
            />

            <SectionCard title={t('inv.suppliers.sectionTitle', { count: list.totalCount })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        {/* Ad sütunu: genişliği yok, kalan yeri emer. */}
                        <col />
                        <ResizableCols keys={['contact', 'address', 'txCount', 'actions'] as const} grid={grid} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('inv.suppliers.name')}</th>
                            <th className="relative text-left">
                                {t('inv.suppliers.contact')}
                                <ColResizeHandle {...grid.resizeProps('contact')} />
                            </th>
                            <th className="relative text-left">
                                {t('address.sectionTitle')}
                                <ColResizeHandle {...grid.resizeProps('address')} />
                            </th>
                            <th className="relative text-right">
                                {t('inv.suppliers.txCount')}
                                <ColResizeHandle {...grid.resizeProps('txCount')} />
                            </th>
                            <th className="relative text-right">
                                {t('common.actions')}
                                <ColResizeHandle {...grid.resizeProps('actions')} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {(list.loading || list.pageItems.length === 0) && (
                            <TableStateRow colSpan={5} loading={list.loading} emptyText={list.error || t('inv.suppliers.empty')} />
                        )}
                        {!list.loading && list.pageItems.map((supplier) => (
                            <tr key={supplier.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                <td>
                                    <span className="block truncate font-medium text-slate-800 dark:text-white">{supplier.companyName}</span>
                                    {!supplier.isActive && (
                                        <span className="text-[10.5px] font-semibold text-slate-400">{t('inv.status.inactive')}</span>
                                    )}
                                </td>
                                <td className="text-[13px] text-slate-500 dark:text-white/60">
                                    <span className="block truncate">
                                        {[supplier.contactName, supplier.phone].filter(Boolean).join(' · ') || '—'}
                                    </span>
                                    {supplier.email && <span className="block truncate">{supplier.email}</span>}
                                </td>
                                {/* Bileşenler iki satıra indirilerek gösterilir. */}
                                <td className="max-w-0 text-[13px] text-slate-500 dark:text-white/60">
                                    <AddressLines value={supplier} maxChars={34} emptyText="—" />
                                </td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                    {supplier.purchaseCount ?? 0}
                                </td>
                                <td className="text-right">
                                    {canUpdate && (
                                        <button
                                            type="button"
                                            aria-label={t('common.edit')}
                                            onClick={() => openEdit(supplier)}
                                            className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1f2654] dark:hover:bg-white/10 dark:hover:text-white"
                                        >
                                            <Edit01 size={13} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={list.page}
                        totalPages={list.totalPages}
                        total={list.totalCount}
                        pageSize={SUPPLIERS_PAGE_SIZE}
                        onPage={list.setPage}
                    />
                </div>
            </SectionCard>

            <BottomSheet
                open={panelOpen}
                onClose={() => setPanelOpen(false)}
                title={editing ? t('inv.suppliers.editTitle') : t('inv.suppliers.createTitle')}
                subtitle={editing ? editing.companyName : undefined}
                width={720}
                height={620}
                footer={(
                    <>
                        <span className="text-[11.5px] text-slate-400 dark:text-white/50">
                            {t('inv.suppliers.nameRequired')}
                        </span>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void save()}
                            className="rounded-md bg-[#272f67] px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {saving ? t('common.loading') : t('common.save')}
                        </button>
                    </>
                )}
            >
                <div className="grid gap-3.5 p-4 sm:grid-cols-2">
                    {formField('inv.suppliers.name', 'companyName', true)}
                    {formField('inv.suppliers.contactName', 'contactName')}
                    {formField('common.email', 'email')}
                    {formField('common.phone', 'phone')}
                    {/* Adres: ayrı bileşenler — "Adres" diye tek bir alan yok.
                        TEDARİKÇİDE YALNIZCA ÜÇ ALAN (kullanıcı isteği 2026-08-02):
                        sokak, posta kodu, şehir — "Hofackerstrasse 75 / 4132 /
                        Muttenz". Adres eki, eyalet ve ülke SUNULMAZ; eski
                        kayıtlarda değer varsa form onu taşımaya ve kaydetmede geri
                        göndermeye devam eder (gizlemek silmez). */}
                    <div className="sm:col-span-2">
                        <AddressFields
                            value={form}
                            onChange={(next) => setForm((current) => ({ ...current, ...next }))}
                            inputClassName={CELL_INPUT_CLASS}
                            fields={['address', 'postalCode', 'city']}
                            // Etiket "Strasse / Nr." DEĞİL düpedüz "Adresse"
                            // (kullanıcı isteği 2026-08-02) — üç alan:
                            // Adresse / PLZ / Stadt.
                            labels={{ address: t('address.sectionTitle') }}
                        />
                    </div>
                </div>
            </BottomSheet>
        </div>
    );
};
