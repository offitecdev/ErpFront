import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';

import { tenderApi } from '../../../../lib/api/tender';
import { useTenderStore } from '../../../../store/tenderStore';
import type { TenderDocumentDto } from '../../../../types/tender';
import { mergeTenderLogs } from '../utils/tenderLog.utils';

type UseTenderChatterParams = {
    activeTenderId?: string;
    isCreatingTender: boolean;
};

// Owns the tender's chatter/documents panel state and its lazy loading logic:
// the open flag, the log/document/summary lists and their loading flags, the
// note composer buffer, and the document-upload saving state. Chatter is loaded
// only after the user opens the log/note tab.
export const useTenderChatter = ({ activeTenderId, isCreatingTender }: UseTenderChatterParams) => {
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsLoaded, setLogsLoaded] = useState(false);
    const [tenderDocuments, setTenderDocuments] = useState<TenderDocumentDto[]>([]);
    const [documentPreview, setDocumentPreview] = useState<TenderDocumentDto | null>(null);
    const [documentsLoading, setDocumentsLoading] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);
    const [documentSaving, setDocumentSaving] = useState(false);
    const documentInputRef = useRef<HTMLInputElement>(null);
    const chatterLoadingRef = useRef(false);

    const loadTenderChatter = useCallback(async (options?: { silent?: boolean }) => {
        if (!activeTenderId || isCreatingTender || chatterLoadingRef.current) return;
        chatterLoadingRef.current = true;
        const silent = Boolean(options?.silent);
        if (!silent) {
            setLogsLoading(true);
            setDocumentsLoading(true);
        }
        try {
            const chatter = await tenderApi.getChatter(activeTenderId);
            setTenderDocuments(chatter.documents);
            useTenderStore.setState((state) => ({
                logs: mergeTenderLogs(chatter.logs, state.logs, silent),
            }));
            setLogsLoaded(true);
        } catch (error: any) {
            if (!silent) {
                setTenderDocuments([]);
                toast.error(error?.response?.data?.error || t('tenders.loglar_yuklenemedi'));
            }
        } finally {
            chatterLoadingRef.current = false;
            if (!silent) {
                setLogsLoading(false);
                setDocumentsLoading(false);
            }
        }
    }, [activeTenderId, isCreatingTender]);

    return {
        logsLoading,
        logsLoaded,
        setLogsLoaded,
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
        loadTenderChatter,
    };
};
