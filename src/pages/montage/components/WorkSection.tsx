import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { MontageImageUpload } from './MontageImageUpload';

/**
 * "Work performed" — a large table of work items with a permanent empty feel:
 * every row is a big text input, "+" appends, photos (10 MB max each) below.
 */
export const WorkSection = ({
    operations,
    setOperations,
    technicalNotes,
    setTechnicalNotes,
    images,
    setImages,
    disabled,
}: {
    operations: string[];
    setOperations: (rows: string[]) => void;
    technicalNotes: string;
    setTechnicalNotes: (value: string) => void;
    images: string[];
    setImages: (images: string[]) => void;
    disabled: boolean;
}) => (
    <div className="space-y-4">
        <div className="overflow-hidden rounded-[3px] border border-slate-300 bg-white dark:border-white/10 dark:bg-[#17191c]">
            <table data-montage-table data-unstyled-table className="text-left">
                <thead className="dark:[&_th]:border-white/10 dark:[&_th]:bg-white/5 dark:[&_th]:text-slate-300">
                    <tr>
                        <th className="w-10">#</th>
                        <th>{t('projects.yapilan_isler')}</th>
                        <th className="w-10" />
                    </tr>
                </thead>
                <tbody className="dark:[&_td]:border-white/10">
                    {operations.map((item, index) => (
                        <tr key={index}>
                            <td className="text-[12px] font-semibold text-slate-400">{index + 1}</td>
                            <td>
                                <input
                                    value={item}
                                    disabled={disabled}
                                    onChange={(e) => setOperations(operations.map((row, i) => (i === index ? e.target.value : row)))}
                                    placeholder={t('montage.work.placeholder')}
                                    className="h-9 w-full rounded-[3px] border border-transparent bg-transparent px-2.5 text-[13px] font-medium text-slate-900 outline-none focus:border-brand-400 focus:bg-white disabled:opacity-60 dark:text-slate-50 dark:focus:bg-white/5"
                                />
                            </td>
                            <td className="text-right">
                                {!disabled && operations.length > 1 && (
                                    <button
                                        type="button"
                                        aria-label={t('common.delete')}
                                        onClick={() => setOperations(operations.filter((_, i) => i !== index))}
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
                    onClick={() => setOperations([...operations, ''])}
                    className="flex min-h-9 w-full items-center gap-1.5 border-t border-slate-100 px-3 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-50 dark:border-white/5 dark:text-brand-300 dark:hover:bg-white/5"
                >
                    <Plus size={15} />
                    {t('montage.addRow')}
                </button>
            )}
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#17191c]">
            <div className="text-[14px] font-bold text-slate-700 dark:text-slate-200">{t('projects.teknik_notlar')}</div>
            <textarea
                rows={3}
                value={technicalNotes}
                disabled={disabled}
                onChange={(e) => setTechnicalNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[15.5px] text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-50"
            />
            <div className="pt-1 text-[14px] font-bold text-slate-700 dark:text-slate-200">{t('montage.work.photos')}</div>
            <MontageImageUpload value={images} onChange={setImages} disabled={disabled} />
        </div>
    </div>
);
