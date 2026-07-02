import type { ReactNode, RefObject } from 'react';
import dayjs from 'dayjs';
import {
    ClockRewind as History,
    Send01 as Send,
    UploadCloud02 as Upload,
    X as CloseIcon,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { Button } from '../../../components/ui-shared/Button';
import type { TenderDocumentDto } from '../../../types/tender';

export type TenderTimelineItem = {
    id: string;
    date: string;
    actor: string;
    tone: string;
    title: string;
    body: string;
    document?: TenderDocumentDto;
};

const initialsFromName = (value?: string | null) => {
    const cleaned = value?.trim();
    if (!cleaned) return '?';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const source = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [cleaned];
    return source.map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
};

const timelineToneClass = (tone: string) => {
    if (tone === 'emerald') return 'bg-emerald-600 text-white';
    if (tone === 'blue') return 'bg-blue-700 text-white';
    if (tone === 'amber') return 'bg-amber-500 text-white';
    if (tone === 'violet') return 'bg-violet-600 text-white';
    return 'bg-cyan-600 text-white';
};

interface TenderLogsPanelProps {
    open: boolean;
    onClose: () => void;
    timelineItems: TenderTimelineItem[];
    logsLoading: boolean;
    canManage: boolean;
    noteText: string;
    onNoteTextChange: (value: string) => void;
    noteSaving: boolean;
    onSubmitNote: () => void;
    documentInputRef: RefObject<HTMLInputElement | null>;
    documentSaving: boolean;
    onSubmitDocument: (file?: File) => void;
    documentsLoading: boolean;
    tenderDocuments: TenderDocumentDto[];
    renderDocumentTile: (document: TenderDocumentDto, compact?: boolean) => ReactNode;
}

/**
 * Right-side "Loglar / Notlar / Ekler" pop-up. Presentational: all data and
 * side-effecting handlers are provided by the parent (TenderDetail), which owns
 * the lazy log fetch and the note/document mutations.
 */
export const TenderLogsPanel = ({
    open,
    onClose,
    timelineItems,
    logsLoading,
    canManage,
    noteText,
    onNoteTextChange,
    noteSaving,
    onSubmitNote,
    documentInputRef,
    documentSaving,
    onSubmitDocument,
    documentsLoading,
    tenderDocuments,
    renderDocumentTile,
}: TenderLogsPanelProps) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70]">
            <div className="absolute inset-0 bg-slate-900/25" onClick={onClose} />
            <aside
                role="dialog"
                aria-modal="true"
                aria-label={t('tenders.loglar_notlar_ekler')}
                className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl animate-in slide-in-from-right"
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[#1f2654]">
                            <History size={14} />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-slate-900">{t('tenders.loglar_notlar_ekler')}</span>
                            <span className="block truncate text-[11.5px] text-slate-500">{t('tenders.price_degisiklikleri_approval_olusturma_ve_tender_no')}</span>
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                    >
                        <CloseIcon size={15} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                    {logsLoading && timelineItems.length === 0 ? (
                        <div className="py-8 text-center text-[12px] text-slate-400">{t('tenders.loglar_loading')}</div>
                    ) : timelineItems.length === 0 ? (
                        <div className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-[12px] text-slate-400">{t('tenders.price_approval_record_not_found')}</div>
                    ) : (
                        <div className="space-y-5">
                            {timelineItems.map((item) => (
                                <div key={item.id} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                                    <div className={`flex h-9 w-9 items-center justify-center rounded-md text-[11px] font-bold ${timelineToneClass(item.tone)}`}>
                                        {initialsFromName(item.actor)}
                                    </div>
                                    <div className="min-w-0 border-b border-slate-100 pb-4">
                                        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                                            <span className="font-semibold text-slate-900">{item.actor}</span>
                                            <span className="text-slate-300">·</span>
                                            <span className="font-mono text-[11px] text-slate-400">{dayjs(item.date).format("DD.MM.YYYY HH:mm")}</span>
                                        </div>
                                        <div className="mt-1 text-[12.5px] font-semibold text-slate-800">{item.title}</div>
                                        {item.body && !item.document && (
                                            <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-slate-600">{item.body}</div>
                                        )}
                                        {item.document && renderDocumentTile(item.document)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {(canManage || documentsLoading || tenderDocuments.length > 0) && (
                    <div className="max-h-[45%] space-y-4 overflow-y-auto border-t border-slate-200 bg-slate-50/70 p-4">
                        {canManage && (
                            <div className="rounded-xl border border-slate-200 bg-white p-3.5 transition-colors focus-within:border-slate-300">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{t('tenders.note_birak')}</div>
                                <textarea
                                    value={noteText}
                                    onChange={(event) => onNoteTextChange(event.target.value)}
                                    rows={3}
                                    className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-900 outline-none transition-colors hover:border-slate-300 hover:bg-white focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10"
                                />
                                <Button size="sm" variant="primary" icon={<Send size={12} />} loading={noteSaving} onClick={onSubmitNote} className="mt-2.5">{t('common.send')}</Button>
                            </div>
                        )}

                        {canManage && (
                            <div className="rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-slate-300">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />{t('tenders.pdf_gorsel_add')}</div>
                                <input
                                    ref={documentInputRef}
                                    type="file"
                                    accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                                    className="sr-only"
                                    disabled={documentSaving}
                                    onChange={(event) => {
                                        const input = event.currentTarget;
                                        const file = input.files?.[0];
                                        input.value = '';
                                        void onSubmitDocument(file);
                                    }}
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    icon={<Upload size={13} />}
                                    loading={documentSaving}
                                    disabled={documentSaving}
                                    onClick={() => documentInputRef.current?.click()}
                                    className="mt-2.5 w-full"
                                >{t('tenders.file_select')}</Button>
                            </div>
                        )}

                        {(documentsLoading || tenderDocuments.length > 0) && (
                            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />{t('tenders.ekler')}</div>
                                {documentsLoading ? (
                                    <div className="mt-2 text-[12px] text-slate-500">{t('common.loading')}</div>
                                ) : (
                                    <div>
                                        {tenderDocuments.map((doc) => (
                                            <div key={doc.id}>
                                                {renderDocumentTile(doc, true)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </aside>
        </div>
    );
};

export default TenderLogsPanel;
