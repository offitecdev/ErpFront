import type { ReactNode, RefObject } from 'react';
import dayjs from 'dayjs';
import {
    ClockRewind as History,
    File02 as FileIcon,
    Plus,
    Send01 as Send,
    User01 as UserIcon,
    X as CloseIcon,
    XClose,
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
    kind?: 'note' | 'change' | 'attachment' | 'event';
};

const timelineToneClass = (tone: string) => {
    if (tone === 'emerald') return 'bg-emerald-600 text-white';
    if (tone === 'blue') return 'bg-blue-700 text-white';
    if (tone === 'amber') return 'bg-amber-500 text-white';
    if (tone === 'violet') return 'bg-violet-600 text-white';
    return 'bg-cyan-600 text-white';
};

const personToneClass = (actor: string) => {
    const palette = [
        'bg-sky-600 text-white',
        'bg-teal-600 text-white',
        'bg-fuchsia-600 text-white',
        'bg-orange-500 text-white',
        'bg-indigo-600 text-white',
        'bg-rose-600 text-white',
    ];
    const hash = Array.from(actor).reduce((total, char) => total + char.charCodeAt(0), 0);
    return palette[hash % palette.length];
};

const markerClass = (item: TenderTimelineItem) =>
    item.kind === 'note' ? personToneClass(item.actor) : timelineToneClass(item.tone);

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
    /** Noch nicht hochgeladene Auswahl — beliebig viele Bilder/Dokumente. */
    pendingDocuments: File[];
    onAddDocuments: (files: File[]) => void;
    onRemoveDocument: (index: number) => void;
    documentsLoading: boolean;
    tenderDocuments: TenderDocumentDto[];
    renderDocumentTile: (document: TenderDocumentDto, compact?: boolean) => ReactNode;
    embedded?: boolean;
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
    pendingDocuments,
    onAddDocuments,
    onRemoveDocument,
    documentsLoading,
    tenderDocuments,
    renderDocumentTile,
    embedded = false,
}: TenderLogsPanelProps) => {
    if (!open) return null;

    // Ein einziges Dateifeld für beide Darstellungen: es nimmt MEHRERE Dateien
    // an und leert sich danach, damit dieselbe Datei erneut gewählt werden kann.
    const fileInput = (
        <input
            ref={documentInputRef}
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            className="sr-only"
            disabled={documentSaving}
            onChange={(event) => {
                const input = event.currentTarget;
                const files = Array.from(input.files ?? []);
                input.value = '';
                onAddDocuments(files);
            }}
        />
    );

    /**
     * Die Anhang-Zeile UNTER dem Notizfeld: links das "+", rechts daneben die
     * Namen der gewählten Dateien als Chips — jeder mit einem × zum Entfernen,
     * solange noch nichts hochgeladen ist.
     */
    const attachmentRow = (
        <div className="flex flex-wrap items-center gap-1.5">
            <button
                type="button"
                onClick={() => documentInputRef.current?.click()}
                disabled={documentSaving}
                title={t('tenders.attachments_hint')}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-50"
            >
                <Plus size={13} />
                {t('tenders.attachments_add')}
            </button>
            {pendingDocuments.length === 0 ? (
                <span className="text-[11.5px] text-slate-400">{t('tenders.attachments_hint')}</span>
            ) : (
                pendingDocuments.map((file, index) => (
                    <span
                        key={`${file.name}:${file.size}:${index}`}
                        title={file.name}
                        className="flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2 pr-1.5 text-[11.5px] font-medium text-slate-600"
                    >
                        <FileIcon size={11} className="shrink-0 text-slate-400" />
                        <span className="max-w-[190px] truncate">{file.name}</span>
                        <button
                            type="button"
                            aria-label={t('common.delete')}
                            disabled={documentSaving}
                            onClick={() => onRemoveDocument(index)}
                            className="flex size-4 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
                        >
                            <XClose size={10} />
                        </button>
                    </span>
                ))
            )}
        </div>
    );

    if (embedded) {
        return (
            <section data-ui-card className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 md:px-7">
                    <span className="flex items-center gap-2 text-[14px] font-semibold text-slate-900">
                        <History size={16} className="text-[#1f2654]" />
                        {t('tenders.loglar_notlar_ekler')}
                    </span>
                    <span className="text-[12px] tabular-nums text-slate-500">{timelineItems.length}</span>
                </header>

                {canManage && (
                    <div className="border-b border-slate-200 bg-slate-50/60 p-4 md:px-7">
                        <label className="block min-w-0">
                            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">{t('tenders.note_birak')}</span>
                            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                                <textarea
                                    value={noteText}
                                    onChange={(event) => onNoteTextChange(event.target.value)}
                                    rows={1}
                                    placeholder={t('tenders.note_birak')}
                                    className="h-9 min-w-0 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] leading-[18px] text-slate-900 shadow-sm outline-none focus:border-[#1f2654] focus:ring-2 focus:ring-[#1f2654]/10"
                                />
                                <Button
                                    size="sm"
                                    variant="primary"
                                    icon={<Send size={13} />}
                                    loading={noteSaving || documentSaving}
                                    disabled={(!noteText.trim() && pendingDocuments.length === 0) || noteSaving || documentSaving}
                                    onClick={onSubmitNote}
                                    className="h-9 w-full shrink-0 sm:w-52"
                                >
                                    {t('common.send')}
                                </Button>
                            </div>
                        </label>
                        {/* Dateien hängen UNTER der Notiz (Benutzerwunsch): das
                            "+" öffnet die Auswahl, daneben stehen die Namen. */}
                        <div className="mt-2">{attachmentRow}</div>
                        {fileInput}
                    </div>
                )}

                <div className="min-w-0 p-5 md:p-7">
                    {logsLoading && timelineItems.length === 0 ? (
                        <div className="py-10 text-center text-[13px] text-slate-400">{t('tenders.loglar_loading')}</div>
                    ) : timelineItems.length === 0 ? (
                        <div className="rounded border border-dashed border-slate-300 px-4 py-10 text-center text-[13px] text-slate-400">
                            {t('tenders.price_approval_record_not_found')}
                        </div>
                    ) : (
                        <div className="mr-auto w-full max-w-5xl">
                            {timelineItems.map((item, index) => {
                                const day = dayjs(item.date);
                                const previous = index > 0 ? dayjs(timelineItems[index - 1].date) : null;
                                const startsDay = !previous || !previous.isSame(day, 'day');
                                return (
                                    <div key={item.id}>
                                        {startsDay && (
                                            <div className="my-5 flex items-center gap-3 first:mt-0">
                                                <span className="h-px flex-1 bg-slate-200" />
                                                <time className="text-[11px] font-semibold text-slate-400">{day.format('DD MMMM YYYY')}</time>
                                                <span className="h-px flex-1 bg-slate-200" />
                                            </div>
                                        )}
                                        <article className={`group relative grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-xl border px-3 py-3 transition-colors ${item.kind === 'change' ? 'border-slate-200 bg-slate-100/70 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]' : 'border-transparent bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5'}`}>
                                            {index < timelineItems.length - 1 && (
                                                <span className="absolute bottom-[-13px] left-[29px] top-[50px] w-px bg-slate-200" aria-hidden />
                                            )}
                                            <span className={`relative z-[1] flex size-11 items-center justify-center rounded-xl shadow-sm ring-2 ring-white dark:ring-[#151616] ${markerClass(item)}`}>
                                                <UserIcon size={17} />
                                            </span>
                                            <div className="min-w-0 pt-1">
                                                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                    <span className="text-[13px] font-bold text-slate-900">{item.actor}</span>
                                                    <time className="text-[11px] text-slate-400">{day.format('HH:mm')}</time>
                                                </div>
                                                <div className="mt-0.5 text-[13px] font-semibold text-slate-700">{item.title}</div>
                                                {item.body && !item.document && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">{item.body}</p>}
                                                {item.document && renderDocumentTile(item.document, true)}
                                            </div>
                                        </article>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {documentsLoading && <div className="pt-3 text-[12px] text-slate-400">{t('common.loading')}</div>}
                </div>
            </section>
        );
    }

    return (
        <div className="fixed inset-0 z-[70]">
            <div className="absolute inset-0 bg-slate-900/25" onClick={onClose} />
            <aside
                role="dialog"
                aria-modal="true"
                aria-label={t('tenders.loglar_notlar_ekler')}
                /* `.ofi-pop.is-drawer` = die gemeinsame Fensteroberfläche
                   (index.css, "FENSTER-OBERFLÄCHE") als Seitenfenster: die zwei
                   LINKEN Ecken gerundet, rechts sitzt es am Bildrand. Vorher
                   war das Fenster rundum scharfkantig. */
                className="ofi-pop is-drawer absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col animate-in slide-in-from-right"
            >
                <div className="ofi-pop__rule flex items-center justify-between gap-3 border-b px-4 py-3">
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
                                    <div className={`flex h-9 w-9 items-center justify-center rounded-md ${markerClass(item)}`}>
                                        <UserIcon size={15} />
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
                                {/* Auch hier hängen die Dateien UNTER der Notiz:
                                    "+" plus die Namen des Gewählten. */}
                                <div className="mt-2.5">{attachmentRow}</div>
                                {fileInput}
                                <Button
                                    size="sm"
                                    variant="primary"
                                    icon={<Send size={12} />}
                                    loading={noteSaving || documentSaving}
                                    disabled={(!noteText.trim() && pendingDocuments.length === 0) || noteSaving || documentSaving}
                                    onClick={onSubmitNote}
                                    className="mt-2.5"
                                >
                                    {t('common.send')}
                                </Button>
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
