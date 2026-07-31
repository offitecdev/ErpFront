import type { SignatureSnapshot, SignatureSnapshotRow } from '../../lib/api/project';
import { t } from '@/i18n/translate';

const statusText = (s?: SignatureSnapshotRow['status']) =>
    s === 'YES' ? t('projects.delivery.yes') : s === 'NO' ? t('projects.delivery.no') : s === 'NA' ? t('projects.delivery.na') : null;
const statusTone = (s?: SignatureSnapshotRow['status']) =>
    s === 'YES' ? 'bg-emerald-50 text-emerald-700' : s === 'NO' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600';

/** Read-only renderer for a signature snapshot (used by admin, technician and the public page). */
export const SnapshotView = ({ snapshot }: { snapshot: SignatureSnapshot }) => (
    <div className="space-y-3">
        {(snapshot.title || snapshot.customerName || snapshot.projectName) && (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                {snapshot.title && <div className="text-[13px] font-semibold text-slate-900">{snapshot.title}</div>}
                {[snapshot.customerName, snapshot.projectName].filter(Boolean).length > 0 && (
                    <div className="mt-0.5 text-[12px] text-slate-500">{[snapshot.customerName, snapshot.projectName].filter(Boolean).join(' - ')}</div>
                )}
            </div>
        )}
        {snapshot.meta && snapshot.meta.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {snapshot.meta.map((m, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 px-3 py-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{m.label}</div>
                        <div className="text-[12.5px] text-slate-800">{m.value}</div>
                    </div>
                ))}
            </div>
        )}
        {(snapshot.sections || []).map((section, si) => (
            <div key={si} className="overflow-hidden rounded-lg border border-slate-200">
                {section.heading && <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">{section.heading}</div>}
                <table data-unstyled-table className="w-full table-fixed text-[12px]">
                    <tbody className="divide-y divide-slate-100">
                        {section.rows.map((row, ri) => (
                            <tr key={ri}>
                                <td className="whitespace-pre-wrap break-words px-3 py-1.5 align-top text-slate-700">{row.label}</td>
                                {row.status !== undefined && (
                                    <td className="w-24 px-3 py-1.5 text-right align-top">{statusText(row.status) && <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${statusTone(row.status)}`}>{statusText(row.status)}</span>}</td>
                                )}
                                {row.value !== undefined && <td className="w-40 whitespace-pre-wrap break-words px-3 py-1.5 text-right align-top text-slate-500">{row.value}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ))}
        {snapshot.notes && <div className="rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{snapshot.notes}</div>}
        {snapshot.images && snapshot.images.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {snapshot.images.map((img, i) => (
                    <a key={i} href={img} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200"><img src={img} alt="" className="h-full w-full object-cover" /></a>
                ))}
            </div>
        )}
    </div>
);

export default SnapshotView;
