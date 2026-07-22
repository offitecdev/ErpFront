import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AntSelect from 'antd/es/select';
import { FilterLines, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { CURRENCY_SYMBOLS, type CurrencyCode } from '../../../../utils/currency';
import { employeeName, type EmployeeLite, type OverviewFilters } from '../overviewShared';
import { CLS_LIGHT_GLASS } from '../../../../lib/utils/surfaces';

const DISPLAY_CURRENCIES: CurrencyCode[] = ['CHF', 'EUR', 'TRY'];

interface OverviewFiltersBarProps {
    filters: OverviewFilters;
    onChange: (patch: Partial<OverviewFilters>) => void;
    employees: EmployeeLite[];
    roles: string[];
    /** Employees are fetched lazily — first dropdown open triggers this. */
    onLoadEmployees: () => void;
    fxLive: boolean;
    onRefresh: () => void;
    loading: boolean;
}

/** User + role and display-currency controls. (The month/year period picker was
    removed on purpose — the overview always reports the current month.) */
export const OverviewFiltersBar: React.FC<OverviewFiltersBarProps> = ({
    filters,
    onChange,
    employees,
    roles,
    onLoadEmployees,
    fxLive,
    onRefresh,
    loading,
}) => {
    const { t } = useTranslation();

    const userOptions = useMemo(
        () =>
            employees
                .filter((e) => !filters.role || e.roleName === filters.role)
                .map((e) => ({
                    value: e.id,
                    label: employeeName(e),
                    // Searched by name, role and email (antd filters on this string).
                    search: `${employeeName(e)} ${e.roleName || ''} ${e.email || ''}`.toLowerCase(),
                    role: e.roleName || e.title || '',
                })),
        [employees, filters.role],
    );

    return (
        <div className={`${CLS_LIGHT_GLASS} flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-2xl px-4 py-3`}>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-[#98A0AE] dark:text-[#8f95a1]">
                <FilterLines size={14} />
                {t('crmOverview.filters.title', { defaultValue: 'Filtreler' })}
            </span>

            <div className="hidden h-5 w-px bg-black/10 dark:bg-white/10 sm:block" />

            {/* Role */}
            <AntSelect
                className="min-w-[150px] [&_.ant-select-selector]:!rounded-xl"
                size="middle"
                allowClear
                placeholder={t('crmOverview.filters.role', { defaultValue: 'Rol (tümü)' })}
                value={filters.role || undefined}
                options={roles.map((r) => ({ value: r, label: r }))}
                onOpenChange={(open) => open && onLoadEmployees()}
                onChange={(role) => onChange({ role: role || '', userId: '' })}
                notFoundContent={
                    <span className="text-[12px] text-[#98A0AE]">{t('common.loading', { defaultValue: 'Yükleniyor…' })}</span>
                }
            />

            {/* User (searchable) */}
            <AntSelect
                className="min-w-[210px] flex-1 sm:flex-none [&_.ant-select-selector]:!rounded-xl"
                size="middle"
                showSearch
                allowClear
                placeholder={t('crmOverview.filters.user', { defaultValue: 'Sorumlu kullanıcı (tümü)' })}
                value={filters.userId || undefined}
                onOpenChange={(open) => open && onLoadEmployees()}
                onChange={(userId) => onChange({ userId: userId || '' })}
                filterOption={(input, option) =>
                    ((option as { search?: string } | undefined)?.search || '').includes(input.toLowerCase())
                }
                notFoundContent={
                    <span className="text-[12px] text-[#98A0AE]">{t('common.loading', { defaultValue: 'Yükleniyor…' })}</span>
                }
                options={userOptions.map((o) => ({
                    value: o.value,
                    search: o.search,
                    label: (
                        <span className="flex items-baseline gap-2">
                            <span>{o.label}</span>
                            {o.role && <span className="text-[11px] text-[#98A0AE]">{o.role}</span>}
                        </span>
                    ),
                }))}
            />

            <div className="ml-auto flex items-center gap-2">
                {/* Currency segmented switch */}
                <div className="flex items-center rounded-xl bg-black/5 p-0.5 dark:bg-white/8">
                    {DISPLAY_CURRENCIES.map((code) => (
                        <button
                            key={code}
                            type="button"
                            onClick={() => onChange({ currency: code })}
                            className={`rounded-[10px] px-2.5 py-1 text-[12.5px] font-semibold transition-colors ${
                                filters.currency === code
                                    ? 'bg-white text-[#07145c] shadow-sm dark:bg-white/15 dark:text-[#e6cf9e]'
                                    : 'text-[#6B7280] hover:text-[#1A1A1A] dark:text-white/60 dark:hover:text-white'
                            }`}
                        >
                            {CURRENCY_SYMBOLS[code]}
                        </button>
                    ))}
                </div>
                {!fxLive && (
                    <span
                        className="text-[10.5px] text-[#98A0AE]"
                        title={t('crmOverview.filters.fxFallbackHint', {
                            defaultValue: 'Canlı kur alınamadı; yaklaşık sabit kurlar kullanılıyor.',
                        })}
                    >
                        ≈
                    </span>
                )}

                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    title={t('common.refresh', { defaultValue: 'Yenile' })}
                    className="flex size-8 items-center justify-center rounded-xl text-[#6B7280] transition-colors hover:bg-black/5 hover:text-[#1A1A1A] disabled:opacity-40 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                >
                    <RefreshCcw01 size={15} className={loading ? 'animate-spin' : undefined} />
                </button>
            </div>
        </div>
    );
};
