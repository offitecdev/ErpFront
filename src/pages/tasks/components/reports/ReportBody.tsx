import { LuClock3, LuFileText, LuImage, LuPaperclip } from 'react-icons/lu';

import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorCode, tasksErrorMessage } from '@/lib/api/tasksModule';
import { TaskButton } from '../shared/TaskButton';
import { MarkdownView } from './MarkdownView';
import { REPORT_MARK_DATA_URI } from './reportMark';
import type { ReportData } from './useReportData';
import type { WorkReportDay, WorkReportDocument, WorkReportFile } from './workReportModel';

/**
 * Die Vorschau: GENAU das Blatt des PDFs (16.09.2026, Samet: «gün gün yazsın,
 * grafik falan kaldır; dalga yerine sağ üstte köşeyi kaplayan desen — onu sen
 * oluştur»). Kopf mit dem gerechneten Muster in der Ecke (reportMark.ts),
 * danach Tag für Tag das freie Blatt der Person, ihre Dateien als anklickbare
 * Adressen und zuletzt die Zeiten des Tages in einer dünn umrandeten Tabelle.
 */

const K = 'tasksModule.reports.work';

/** Anhänge des Tages: Name und darunter die volle, anklickbare Adresse. */
const Files = ({ files, label }: { files: WorkReportFile[]; label: string }) => (
    <div className="ofi-gv-rep-files">
        <div className="ofi-gv-rep-files__title"><LuPaperclip size={13} aria-hidden />{label}</div>
        <ul>
            {files.map((file) => (
                <li key={file.id}>
                    {file.isImage ? <LuImage size={14} aria-hidden /> : <LuFileText size={14} aria-hidden />}
                    <a href={file.url} target="_blank" rel="noreferrer">
                        <span className="ofi-gv-rep-files__name">{file.name}</span>
                        <span className="ofi-gv-rep-files__url">{file.url}</span>
                    </a>
                </li>
            ))}
        </ul>
    </div>
);

/** Zeit des Tages je Aufgabe — «ince gri kenarları olan tablo» (16.09.2026). */
const Times = ({ day, labels }: { day: WorkReportDay; labels: WorkReportDocument['labels'] }) => (
    <div className="ofi-gv-rep-times">
        <div className="ofi-gv-rep-times__title"><LuClock3 size={13} aria-hidden />{labels.worked}</div>
        <table data-unstyled-table>
            <thead>
                <tr>
                    <th scope="col">{labels.task}</th>
                    <th scope="col" className="is-num">{labels.duration}</th>
                </tr>
            </thead>
            <tbody>
                {day.times.map((entry) => (
                    <tr key={entry.taskId}>
                        <td>{entry.title}</td>
                        <td className="is-num">{entry.duration}</td>
                    </tr>
                ))}
            </tbody>
            <tfoot>
                <tr>
                    <th scope="row">{labels.total}</th>
                    <td className="is-num">{day.total}</td>
                </tr>
            </tfoot>
        </table>
    </div>
);

const Day = ({ day, labels }: { day: WorkReportDay; labels: WorkReportDocument['labels'] }) => (
    <section className="ofi-gv-rep-day">
        <h3 className="ofi-gv-rep-day__head">
            <span className="ofi-gv-rep-day__weekday">{day.weekday}</span>
            <span className="ofi-gv-rep-day__date">{day.dateText}</span>
        </h3>
        {day.blocks.length > 0
            ? <MarkdownView blocks={day.blocks} />
            : <p className="ofi-gv-rep-muted">{day.written ? labels.empty : labels.missing}</p>}
        {day.files.length > 0 && <Files files={day.files} label={labels.files} />}
        {day.times.length > 0 && <Times day={day} labels={labels} />}
    </section>
);

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
        <section className="ofi-gv-rep" aria-busy={data.stale || undefined} aria-label={doc.title}>
            <header className="ofi-gv-rep-head">
                <div className="ofi-gv-rep-head__text">
                    <h2 className="ofi-gv-rep-head__title">{doc.title}</h2>
                    <div className="ofi-gv-rep-head__person">{doc.person}</div>
                    <div className="ofi-gv-rep-head__sub">{doc.subtitle}</div>
                    <div className="ofi-gv-rep-head__meta">{doc.meta}</div>
                </div>
                <img className="ofi-gv-rep-mark" src={REPORT_MARK_DATA_URI} alt="" aria-hidden draggable={false} />
            </header>

            <div className="ofi-gv-rep-days">
                {doc.days.map((day) => <Day key={day.key} day={day} labels={doc.labels} />)}
            </div>
        </section>
    );
};
