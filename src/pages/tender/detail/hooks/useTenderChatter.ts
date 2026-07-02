import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';

import { tenderApi } from '../../../../lib/api/tender';
import { useTenderStore } from '../../../../store/tenderStore';
import type { TenderChatterSummary, TenderDocumentDto } from '../../../../types/tender';
import { EMPTY_CHATTER_SUMMARY } from '../utils/tenderDetail.constants';
import { mergeTenderLogs } from '../utils/tenderLog.utils';

type UseTenderChatterParams = {
    activeTenderId?: string;
    isCreatingTender: boolean;
};

// Owns the tender's chatter/documents panel state and its lazy loading logic:
// the open flag, the log/document/summary lists and their loading flags, the
// note composer buffer, and the document-upload saving state. Loads are lazy
// and de-duplicated by the caller via `logsLoaded`; the summary is fetched
// separately so the collapsed preview counts can render before the panel opens.
export const useTenderChatter = ({ activeTenderId, isCreatingTender }: UseTenderChatterParams) => {
    const [chatterOpen, setChatterOpen] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsLoaded, setLogsLoaded] = useState(false);
    const [chatterSummary, setChatterSummary] = useState<TenderChatterSummary>(EMPTY_CHATTER_SUMMARY);
    const [chatterSummaryLoading, setChatterSummaryLoading] = useState(false);
    const [tenderDocuments, setTenderDocuments] = useState<TenderDocumentDto[]>([]);
    const [documentPreview, setDocumentPreview] = useState<TenderDocumentDto | null>(null);
    const [documentsLoading, setDocumentsLoading] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);
    const [documentSaving, setDocumentSaving] = useState(false);
    const documentInputRef = useRef<HTMLInputElement>(null);

    const loadTenderChatterSummary = useCallback(async () => {
        if (!activeTenderId || isCreatingTender) return;
        setChatterSummaryLoading(true);
        try {
            const summary = await tenderApi.getChatterSummary(activeTenderId);
            setChatterSummary({
                noteCount: Number(summary.noteCount || 0),
                documentCount: Number(summary.documentCount || 0),
                logCount: Number(summary.logCount || 0),
            });
        } catch {
            setChatterSummary(EMPTY_CHATTER_SUMMARY);
        } finally {
            setChatterSummaryLoading(false);
        }
    }, [activeTenderId, isCreatingTender]);

    const loadTenderChatter = useCallback(async (options?: { silent?: boolean }) => {
        if (!activeTenderId) return;
        const silent = Boolean(options?.silent);
        if (!silent) {
            setLogsLoading(true);
            setDocumentsLoading(true);
        }
        try {
            const [documentsResult, logsResult] = await Promise.allSettled([
                tenderApi.getDocuments(activeTenderId),
                tenderApi.getLogs(activeTenderId),
            ]);

            if (documentsResult.status === 'fulfilled') {
                setTenderDocuments(documentsResult.value);
            } else {
                if (!silent) setTenderDocuments([]);
            }

            if (logsResult.status === 'fulfilled') {
                useTenderStore.setState((state) => ({
                    logs: mergeTenderLogs(logsResult.value, state.logs, silent),
                }));
                setLogsLoaded(true);
            } else {
                const error = logsResult.reason as any;
                if (!silent) toast.error(error?.response?.data?.error ||t('tenders.loglar_yuklenemedi'));
            }
            await loadTenderChatterSummary();
        } finally {
            if (!silent) {
                setLogsLoading(false);
                setDocumentsLoading(false);
            }
        }
    }, [activeTenderId, loadTenderChatterSummary]);

    // Open the logs pop-up. Fetch the logs/documents lazily and only once per
    // tender (guarded by `logsLoaded`) so repeated opens don't re-hit the backend.
    const handleOpenLogs = () => {
        setChatterOpen(true);
        if (!logsLoaded) void loadTenderChatter();
    };
    const handleCloseLogs = () => setChatterOpen(false);

    return {
        chatterOpen,
        setChatterOpen,
        logsLoading,
        logsLoaded,
        setLogsLoaded,
        chatterSummary,
        setChatterSummary,
        chatterSummaryLoading,
        tenderDocuments,
        setTenderDocuments,
        documentPreview,
        setDocumentPreview,
        documentsLoading,
        noteText,
        setNoteText,
        noteSaving,
        setNoteSaving,
        documentSaving,
        setDocumentSaving,
        documentInputRef,
        loadTenderChatterSummary,
        loadTenderChatter,
        handleOpenLogs,
        handleCloseLogs,
    };
};
