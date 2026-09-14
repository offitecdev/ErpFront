import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorCode, tasksErrorMessage } from '@/lib/api/tasksModule';
import { TaskButton } from '../shared/TaskButton';
import type { ReportData } from './useReportData';
import type { WorkReportDocument, WorkTable } from './workReportModel';

/**
 * Die Vorschau unter der Werkzeugzeile: GENAU das Dokument des PDFs — Kopf
 * mit Person und Zeitraum, darunter dieselben Tabellen. Laden, Fehler und ein
 * Neuladen im Hintergrund (alte Zahlen gedimmt) stehen hier.
 */

const K = 'tasksModule.reports.work';

const TableView = ({ table }: { table: WorkTable }) => {
    const numClass = (index: number) => (table.columns[index]?.align === 'right' ? 'is-num' : '');
    return (
        <div className="ofi-gv-rep-block">
            <h4 className="ofi-gv-rep-block__title">{table.title}</h4>
            <div className="ofi-gv-rep-scroll">
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            {table.columns.map((column, index) => (
                                <th key={index} scope="col" className={numClass(index)}>{column.header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {!table.rows.length && (
                            <tr><td colSpan={table.columns.length} className="ofi-gv-rep-empty">{table.emptyText}</td></tr>
                        )}
                        {table.rows.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                className={`${row.total ? 'ofi-gv-rep-total' : ''} ${row.groupStart && rowIndex > 0 ? 'is-group' : ''}`.trim() || undefined}
                            >
                                {row.cells.map((cell, index) => (
                                    <td key={index} data-label={table.columns[index]?.header} className={numClass(index)}>{cell}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const ReportBody = ({ data, doc }: { data: ReportData; doc: WorkReportDocument | null }) => {
    if (data.error && !doc && !data.loading) {
        const code = tasksErrorCode(data.error);
        return (
            <div className="ofi-gv-panel">
                <div className="ofi-gv-empty" role="status">
                    <div className="ofi-gv-empty__title">{t(`${K}.loadFailed`)}</div>
                    <div>{tasksErrorMessage(data.error)}</div>
                    {code !== 'REPORT_FORBIDDEN' && code !== 'PERSON_NOT_FOUND' && (
                        <div className="ofi-gv-rep-state__actions">
                            <TaskButton onClick={data.reload}>{t(`${K}.retry`)}</TaskButton>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    if (!doc) return <LoadingPanel rows={5} />;

    return (
        <section className="ofi-gv-panel ofi-gv-rep ofi-gv-rep-sheet" aria-busy={data.stale || undefined} aria-label={doc.title}>
            <h2 className="ofi-gv-rep-sheet__title">{doc.title}</h2>
            <dl className="ofi-gv-rep-pairs">
                {doc.meta.map((pair) => (
                    <div key={pair.label}><dt>{pair.label}</dt><dd>{pair.value}</dd></div>
                ))}
            </dl>
            {doc.tables.map((table) => <TableView key={table.title} table={table} />)}
        </section>
    );
};
