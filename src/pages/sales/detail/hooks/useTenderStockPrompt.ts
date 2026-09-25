import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import {
    articleCreateUrl,
    newArticleCreateRequestId,
    subscribeArticleCreate,
} from '@/lib/articleCreateBridge';
import { useAuthStore } from '@/store/authStore';
import type { ArticleDetail } from '@/types/inventory';
import type { PositionDto } from '../../../../types/tender';
import { getLineKind } from '../utils/tenderCalculation.utils';

/** Back on the quote: how long to wait before asking again. A form tab that
    saved and closed itself posts `created` first — this lets it land. */
const REASK_DELAY_MS = 600;

type StockPrompt = {
    /** The row's STABLE key (the temp id it was born with): Save swaps its id. */
    rowKey: string;
    name: string;
    requestId: string;
    /** ask = bubble visible; waiting = the product form is open in another tab. */
    phase: 'ask' | 'waiting';
};

/**
 * "Add to stock?" for a quote line whose product name matched nothing in the
 * catalogue (Samet, 23.09.2026).
 *
 * The bubble asks. "Add" opens the product form in a NEW TAB, name filled in,
 * and waits for its answer on the article-create channel: `created` links the
 * line to the new article; `cancelled` (the form was closed or its X pressed)
 * brings the question back. Coming back to the quote while the product is
 * still unsaved asks again too. The X keeps the line as a plain free line.
 */
export const useTenderStockPrompt = ({
    enabled,
    localPositionsRef,
    stableRowKeys,
    onCreated,
}: {
    /** Draft quote, the user manages it and may create articles. */
    enabled: boolean;
    localPositionsRef: MutableRefObject<PositionDto[]>;
    stableRowKeys: MutableRefObject<Map<string, string>>;
    onCreated: (rowId: string, article: ArticleDetail) => void;
}) => {
    const [prompt, setPrompt] = useState<StockPrompt | null>(null);
    const promptRef = useRef<StockPrompt | null>(null);
    useEffect(() => { promptRef.current = prompt; }, [prompt]);
    const onCreatedRef = useRef(onCreated);
    useEffect(() => { onCreatedRef.current = onCreated; }, [onCreated]);

    /**
     * The row the question is about, by its CURRENT id — or null once the
     * question no longer stands: the row was deleted, emptied, or got an
     * article some other way (picked from the list).
     */
    const resolveRowId = useCallback((rowKey: string): string | null => {
        const positions = localPositionsRef.current;
        let rowId: string | null = positions.some((position) => position.id === rowKey) ? rowKey : null;
        if (!rowId) {
            for (const [id, key] of stableRowKeys.current) {
                if (key === rowKey && positions.some((position) => position.id === id)) {
                    rowId = id;
                    break;
                }
            }
        }
        const row = rowId ? positions.find((position) => position.id === rowId) : undefined;
        if (!row || row.sourceArticleId || !row.shortDescription?.trim() || getLineKind(row) !== 'PRODUCT') return null;
        return rowId;
    }, [localPositionsRef, stableRowKeys]);

    /** Ask about this row — replaces any earlier question (one at a time). */
    const ask = useCallback((rowId: string, name: string) => {
        if (!enabled || !name.trim()) return;
        setPrompt({
            rowKey: stableRowKeys.current.get(rowId) ?? rowId,
            name: name.trim(),
            requestId: newArticleCreateRequestId(),
            phase: 'ask',
        });
    }, [enabled, stableRowKeys]);

    const dismiss = useCallback(() => setPrompt(null), []);

    const add = useCallback(() => {
        const current = promptRef.current;
        if (!current) return;
        window.open(articleCreateUrl(current.name, current.requestId), '_blank', 'noopener');
        setPrompt({ ...current, phase: 'waiting' });
    }, []);

    // Answers from the product form tab.
    useEffect(() => subscribeArticleCreate((message) => {
        const current = promptRef.current;
        if (!current || current.requestId !== message.requestId) return;
        if (message.type === 'cancelled') {
            setPrompt((state) => (state?.requestId === message.requestId ? { ...state, phase: 'ask' } : state));
            return;
        }
        // An article saved under another company cannot back this quote's line.
        if (message.tenantId && message.tenantId !== useAuthStore.getState().selectedTenantId) return;
        const rowId = resolveRowId(current.rowKey);
        setPrompt(null);
        if (rowId) onCreatedRef.current(rowId, message.article);
    }), [resolveRowId]);

    // Back on the quote without a saved product → ask again.
    const waiting = prompt?.phase === 'waiting';
    useEffect(() => {
        if (!waiting) return undefined;
        let timer = 0;
        const check = () => {
            if (document.visibilityState !== 'visible') return;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                setPrompt((state) => (state?.phase === 'waiting' ? { ...state, phase: 'ask' } : state));
            }, REASK_DELAY_MS);
        };
        document.addEventListener('visibilitychange', check);
        window.addEventListener('focus', check);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('focus', check);
        };
    }, [waiting]);

    return {
        /** Key of the asked row while the bubble is up; null otherwise. */
        askingRowKey: enabled && prompt?.phase === 'ask' ? prompt.rowKey : null,
        resolveRowId,
        ask,
        add,
        dismiss,
    };
};
