import { useEffect, useMemo, useState } from 'react';

import { Pager, SearchBox, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { CenterModal } from './shells';

export type BrowseRow = {
    id: string;
    primary: string;
    secondary?: string | null;
    meta?: string | null;
};

const PAGE_SIZE = 15;

/* Central "view all" window for rows that are already in memory (a customer's
   projects, a project's orders): search + 15-per-page, click to pick. */
export const ListBrowseModal = ({ open, onClose, title, columns, rows, onPick }: {
    open: boolean;
    onClose: () => void;
    title: string;
    columns: [string, string, string];
    rows: BrowseRow[];
    onPick: (id: string) => void;
}) => {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);

    useEffect(() => { if (!open) { setQuery(''); setPage(1); } }, [open]);
    useEffect(() => { setPage(1); }, [query]);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return rows;
        return rows.filter((row) =>
            row.primary.toLowerCase().includes(needle)
            || (row.secondary || '').toLowerCase().includes(needle)
            || (row.meta || '').toLowerCase().includes(needle));
    }, [rows, query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <CenterModal open={open} onClose={onClose} title={title} width={920} z={150}>
            <div className="border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
                <SearchBox value={query} onChange={setQuery} placeholder={t('common.search')} autoFocus />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{columns[0]}</th>
                            <th className="w-48 text-left">{columns[1]}</th>
                            <th className="w-40 text-left">{columns[2]}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pageRows.length === 0 && (
                            <TableStateRow colSpan={3} loading={false} emptyText={t('common.noData')} />
                        )}
                        {pageRows.map((row) => (
                            <tr
                                key={row.id}
                                onClick={() => onPick(row.id)}
                                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                            >
                                <td className="text-slate-800 dark:text-white">{row.primary}</td>
                                <td className="text-slate-500 dark:text-white/60">{row.secondary || '—'}</td>
                                <td className="text-slate-500 dark:text-white/60">{row.meta || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="border-t border-slate-200 dark:border-white/10">
                <Pager page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
            </div>
        </CenterModal>
    );
};
