import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AntSelect from 'antd/es/select';
import { Building03, Check, SearchLg, User01 } from '@/components/icons/antIconCompat';
import { Modal } from '../../../../components/ui-shared/Modal';
import { Button } from '../../../../components/ui-shared/Button';
import { apiClient } from '../../../../lib/axios';
import type { MeetingParticipantType } from '../../../../lib/api/meetings';
import { employeeName, type EmployeeLite } from '../overviewShared';

/** A participant chosen in the picker, carrying its display data. */
export interface PickedParticipant {
    participantType: MeetingParticipantType;
    id: string;
    name: string;
    subtitle?: string;
}

interface CustomerRow {
    id: string;
    companyName: string;
    customerType?: string | null;
    mainEmail?: string | null;
    city?: string | null;
    isActive?: boolean;
}

interface ParticipantPickerModalProps {
    open: boolean;
    onClose: () => void;
    initial: PickedParticipant[];
    onConfirm: (selected: PickedParticipant[]) => void;
}

const asRows = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    const obj = value as { items?: unknown; customers?: unknown } | null;
    if (Array.isArray(obj?.items)) return obj.items as T[];
    if (Array.isArray(obj?.customers)) return obj.customers as T[];
    return [];
};

const keyOf = (p: { participantType: MeetingParticipantType; id: string }) => `${p.participantType}:${p.id}`;

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
    PRIVATE: 'crm.customers.customerTypePrivate',
    COMPANY: 'crm.customers.customerTypeCompany',
    PUBLIC_ADMIN: 'crm.customers.customerTypePublicAdministration',
};

/**
 * Large two-column participant picker: staff on the left, customers on the
 * right — each column with its OWN search box and filter dropdown. Rows toggle
 * in and out of the selection; the footer confirms the whole set at once.
 */
export const ParticipantPickerModal: React.FC<ParticipantPickerModalProps> = ({ open, onClose, initial, onConfirm }) => {
    const { t } = useTranslation();

    const [employees, setEmployees] = useState<EmployeeLite[]>([]);
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [loadingCustomers, setLoadingCustomers] = useState(false);

    const [staffSearch, setStaffSearch] = useState('');
    const [staffRole, setStaffRole] = useState<string>('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerType, setCustomerType] = useState<string>('');

    const [selected, setSelected] = useState<Map<string, PickedParticipant>>(new Map());

    // Re-seed the selection from the composer every time the picker opens
    // (render-phase derived state — adjusting on the open/close transition).
    const [wasOpen, setWasOpen] = useState(false);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setSelected(new Map(initial.map((p) => [keyOf(p), p])));
    }

    useEffect(() => {
        if (!open || employees.length) return;
        apiClient
            .get('/employees', { params: { isActive: true, light: 1 } })
            .then((res) => setEmployees(asRows<EmployeeLite>(res.data)))
            .catch(() => setEmployees([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Customers are searched server-side (debounced) — tenants can hold far more
    // than one page, so the search box narrows on the backend, not just locally.
    const searchTimer = useRef<number | null>(null);
    useEffect(() => {
        if (!open) return;
        if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
        searchTimer.current = window.setTimeout(() => {
            setLoadingCustomers(true);
            apiClient
                .get('/customers', {
                    params: { isActive: true, pageSize: 100, page: 1, ...(customerSearch.trim() ? { search: customerSearch.trim() } : {}) },
                })
                .then((res) => setCustomers(asRows<CustomerRow>(res.data)))
                .catch(() => setCustomers([]))
                .finally(() => setLoadingCustomers(false));
        }, 250);
        return () => {
            if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
        };
    }, [open, customerSearch]);

    const roles = useMemo(
        () => [...new Set(employees.map((e) => e.roleName).filter(Boolean) as string[])].sort(),
        [employees],
    );

    const staffRows = useMemo(() => {
        const q = staffSearch.trim().toLowerCase();
        return employees
            .filter((e) => !staffRole || e.roleName === staffRole)
            .filter((e) => !q || `${employeeName(e)} ${e.email || ''} ${e.roleName || ''}`.toLowerCase().includes(q));
    }, [employees, staffSearch, staffRole]);

    const customerRows = useMemo(
        () => customers.filter((c) => !customerType || c.customerType === customerType),
        [customers, customerType],
    );

    const toggle = (p: PickedParticipant) => {
        setSelected((cur) => {
            const next = new Map(cur);
            const key = keyOf(p);
            if (next.has(key)) next.delete(key);
            else next.set(key, p);
            return next;
        });
    };

    const searchInputCls =
        'w-full rounded-xl border border-black/10 bg-white py-2 pl-8 pr-3 text-[13px] outline-none transition-colors focus:border-[#07145c]/50 dark:border-white/15 dark:bg-white/5 dark:text-white';

    const Row: React.FC<{ picked: PickedParticipant; icon: React.ReactNode }> = ({ picked, icon }) => {
        const isSelected = selected.has(keyOf(picked));
        return (
            <button
                type="button"
                onClick={() => toggle(picked)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                    isSelected
                        ? 'border-[#07145c]/30 bg-[#07145c]/5 dark:border-[#e6cf9e]/30 dark:bg-[#e6cf9e]/8'
                        : 'border-transparent hover:bg-black/4 dark:hover:bg-white/6'
                }`}
            >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black/5 text-[#3F4350] dark:bg-white/8 dark:text-white/80">
                    {icon}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[#1A1A1A] dark:text-white">{picked.name}</span>
                    {picked.subtitle && <span className="block truncate text-[11.5px] text-[#6B7280] dark:text-[#aab0bb]">{picked.subtitle}</span>}
                </span>
                <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        isSelected
                            ? 'border-[#07145c] bg-[#07145c] text-white dark:border-[#e6cf9e] dark:bg-[#e6cf9e] dark:text-[#151616]'
                            : 'border-black/20 dark:border-white/25'
                    }`}
                >
                    {isSelected && <Check size={13} />}
                </span>
            </button>
        );
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={t('crmOverview.picker.title', { defaultValue: 'Katılımcı seç' })}
            description={t('crmOverview.picker.desc', { defaultValue: 'Personel ve müşteriler arasından katılımcıları işaretleyin.' })}
            width="xl"
            footer={
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-[#6B7280] dark:text-[#aab0bb]">
                        {t('crmOverview.picker.selectedCount', { count: selected.size, defaultValue: '{{count}} katılımcı seçildi' })}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>
                            {t('common.cancel', { defaultValue: 'İptal' })}
                        </Button>
                        <Button variant="primary" onClick={() => { onConfirm([...selected.values()]); onClose(); }}>
                            {t('crmOverview.picker.confirm', { defaultValue: 'Ekle' })}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* ── Staff column ── */}
                <section className="flex min-w-0 flex-col gap-2.5">
                    <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-[#98A0AE] dark:text-[#8f95a1]">
                        <User01 size={14} />
                        {t('crmOverview.picker.staff', { defaultValue: 'Personel' })}
                        <span className="rounded-full bg-black/6 px-1.5 text-[10.5px] tabular-nums text-[#6B7280] dark:bg-white/10 dark:text-white/60">
                            {staffRows.length}
                        </span>
                    </h4>
                    <div className="relative">
                        <SearchLg size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#98A0AE]" />
                        <input
                            value={staffSearch}
                            onChange={(e) => setStaffSearch(e.target.value)}
                            placeholder={t('crmOverview.picker.searchStaff', { defaultValue: 'Personel ara…' })}
                            className={searchInputCls}
                        />
                    </div>
                    <AntSelect
                        className="w-full [&_.ant-select-selector]:!rounded-xl"
                        allowClear
                        placeholder={t('crmOverview.picker.allRoles', { defaultValue: 'Tüm roller' })}
                        value={staffRole || undefined}
                        options={roles.map((r) => ({ value: r, label: r }))}
                        onChange={(v) => setStaffRole(v || '')}
                    />
                    <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto pr-0.5">
                        {staffRows.length === 0 && (
                            <p className="rounded-xl border border-dashed border-black/10 px-3 py-6 text-center text-[12.5px] text-[#98A0AE] dark:border-white/15">
                                {t('crmOverview.picker.empty', { defaultValue: 'Sonuç bulunamadı.' })}
                            </p>
                        )}
                        {staffRows.map((e) => (
                            <Row
                                key={e.id}
                                icon={<User01 size={15} />}
                                picked={{
                                    participantType: 'EMPLOYEE',
                                    id: e.id,
                                    name: employeeName(e),
                                    subtitle: e.roleName || e.title || e.email || undefined,
                                }}
                            />
                        ))}
                    </div>
                </section>

                {/* ── Customers column ── */}
                <section className="flex min-w-0 flex-col gap-2.5 border-t border-black/6 pt-4 dark:border-white/8 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                    <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-[#98A0AE] dark:text-[#8f95a1]">
                        <Building03 size={14} />
                        {t('crmOverview.picker.customers', { defaultValue: 'Müşteriler' })}
                        <span className="rounded-full bg-black/6 px-1.5 text-[10.5px] tabular-nums text-[#6B7280] dark:bg-white/10 dark:text-white/60">
                            {customerRows.length}
                        </span>
                    </h4>
                    <div className="relative">
                        <SearchLg size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#98A0AE]" />
                        <input
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder={t('crmOverview.picker.searchCustomers', { defaultValue: 'Müşteri ara…' })}
                            className={searchInputCls}
                        />
                    </div>
                    <AntSelect
                        className="w-full [&_.ant-select-selector]:!rounded-xl"
                        allowClear
                        placeholder={t('crmOverview.picker.allTypes', { defaultValue: 'Tüm müşteri türleri' })}
                        value={customerType || undefined}
                        options={Object.entries(CUSTOMER_TYPE_LABELS).map(([value, labelKey]) => ({
                            value,
                            label: t(labelKey, { defaultValue: value }),
                        }))}
                        onChange={(v) => setCustomerType(v || '')}
                    />
                    <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto pr-0.5">
                        {loadingCustomers && (
                            <p className="px-3 py-2 text-center text-[12px] text-[#98A0AE]">
                                {t('common.loading', { defaultValue: 'Yükleniyor…' })}
                            </p>
                        )}
                        {!loadingCustomers && customerRows.length === 0 && (
                            <p className="rounded-xl border border-dashed border-black/10 px-3 py-6 text-center text-[12.5px] text-[#98A0AE] dark:border-white/15">
                                {t('crmOverview.picker.empty', { defaultValue: 'Sonuç bulunamadı.' })}
                            </p>
                        )}
                        {customerRows.map((c) => (
                            <Row
                                key={c.id}
                                icon={<Building03 size={15} />}
                                picked={{
                                    participantType: 'CUSTOMER',
                                    id: c.id,
                                    name: c.companyName,
                                    subtitle: [c.customerType ? t(CUSTOMER_TYPE_LABELS[c.customerType] || '', { defaultValue: c.customerType }) : null, c.city]
                                        .filter(Boolean)
                                        .join(' · ') || c.mainEmail || undefined,
                                }}
                            />
                        ))}
                    </div>
                </section>
            </div>
        </Modal>
    );
};
