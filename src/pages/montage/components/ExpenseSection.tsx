import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

type ExpenseRow = { expenseType: string; amount: number; description: string };

// Hard-coded backend values with i18n labels — mirrors the old installation screen.
const EXPENSE_TYPES: { value: string; labelKey: string }[] = [
    { value: 'Nakliye', labelKey: 'projects.expenseTypes.transport' },
    { value: 'Ekipman Kiralama', labelKey: 'projects.expenseTypes.equipmentRental' },
    { value: 'Dış hizmetler', labelKey: 'projects.expenseTypes.externalServices' },
    { value: 'Taşeron', labelKey: 'projects.expenseTypes.subcontractor' },
    { value: 'Diğer', labelKey: 'projects.expenseTypes.other' },
];

/** "External expenses" — big table rows: type, amount (CHF), note, "+" at the bottom. */
export const ExpenseSection = ({
    rows,
    setRows,
    disabled,
}: {
    rows: ExpenseRow[];
    setRows: (rows: ExpenseRow[]) => void;
    disabled: boolean;
}) => {
    const update = (index: number, patch: Partial<ExpenseRow>) =>
        setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    return (
        <div className="overflow-x-auto rounded-[3px] border border-slate-300 bg-white dark:border-white/10 dark:bg-[#17191c]">
            <table data-montage-table data-unstyled-table className="min-w-[560px] text-left">
                <thead className="dark:[&_th]:border-white/10 dark:[&_th]:bg-white/5 dark:[&_th]:text-slate-300">
                    <tr>
                        <th>{t('montage.expenses.type')}</th>
                        <th className="w-36">{t('montage.expenses.amount')}</th>
                        <th>{t('common.description')}</th>
                        <th className="w-10" />
                    </tr>
                </thead>
                <tbody className="dark:[&_td]:border-white/10">
                    {rows.map((row, index) => (
                        <tr key={index}>
                            <td>
                                <select
                                    value={row.expenseType}
                                    disabled={disabled}
                                    onChange={(e) => update(index, { expenseType: e.target.value })}
                                    className="h-9 w-full rounded-[3px] border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-50"
                                >
                                    {EXPENSE_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>{t(type.labelKey)}</option>
                                    ))}
                                </select>
                            </td>
                            <td>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    value={row.amount || ''}
                                    disabled={disabled}
                                    onChange={(e) => update(index, { amount: Number(e.target.value || 0) })}
                                    placeholder="0.00"
                                    className="h-9 w-full rounded-[3px] border border-slate-200 bg-white px-2.5 text-right text-[13px] font-semibold text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-50"
                                />
                            </td>
                            <td>
                                <input
                                    value={row.description}
                                    disabled={disabled}
                                    onChange={(e) => update(index, { description: e.target.value })}
                                    placeholder={t('montage.expenses.notePlaceholder')}
                                    className="h-9 w-full rounded-[3px] border border-slate-200 bg-white px-2.5 text-[13px] text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-50"
                                />
                            </td>
                            <td className="text-right">
                                {!disabled && rows.length > 1 && (
                                    <button
                                        type="button"
                                        aria-label={t('common.delete')}
                                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                                        className="grid size-7 place-items-center rounded-[3px] text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                                    >
                                        <Trash01 size={14} />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {!disabled && (
                <button
                    type="button"
                    onClick={() => setRows([...rows, { expenseType: 'Diğer', amount: 0, description: '' }])}
                    className="flex min-h-9 w-full items-center gap-1.5 border-t border-slate-100 px-3 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-50 dark:border-white/5 dark:text-brand-300 dark:hover:bg-white/5"
                >
                    <Plus size={15} />
                    {t('montage.addRow')}
                </button>
            )}
        </div>
    );
};
