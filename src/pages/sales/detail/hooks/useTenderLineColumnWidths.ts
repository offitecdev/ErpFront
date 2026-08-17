import { useColumnWidths } from '../../../../hooks/useColumnWidths';
import type { TenderLineColumnKey } from '../types/tenderDetail.types';
import { DEFAULT_TENDER_LINE_COLUMN_WIDTHS } from '../utils/tenderDetail.constants';

// v2: the money columns got much wider defaults. Stored widths win over the
// defaults, so anyone who had ever dragged a column would have kept the old
// narrow prices forever — a new key hands everyone the new starting layout
// once, after which their own drags are remembered again.
const STORAGE_KEY = 'offitec:tender-detail:line-col-widths:v2';

/** The numeric columns the user may drag; the description absorbs the rest. */
export const RESIZABLE_LINE_COLUMNS = ['quantity', 'unit', 'unitPrice', 'discount', 'taxRate', 'total', 'profit'] as const;
export type ResizableLineColumn = (typeof RESIZABLE_LINE_COLUMNS)[number];

/**
 * User-resizable widths for the offer-line table. The mechanics live in the
 * shared `useColumnWidths` (also used by the customer and quote LISTS); this
 * only pins the quote lines' own storage key and their tighter size limits —
 * the numeric cells are small and must be allowed to stay small.
 */
export const useTenderLineColumnWidths = () => useColumnWidths<TenderLineColumnKey>({
    storageKey: STORAGE_KEY,
    defaults: DEFAULT_TENDER_LINE_COLUMN_WIDTHS,
    minPx: 42,
    maxPx: 320,
});
