import type { TenderLineColumnKey } from '../types/tenderDetail.types';

export const DEFAULT_VAT = 8.1;
export const SECTION_SCHEMA_STORAGE_KEY = 'offitec:tender-detail:section-schema-open';
// Every column except the description is fixed-width; the description takes
// whatever is left over (no <col width>, so it absorbs the remainder) and the
// table scrolls horizontally below TENDER_LINE_TABLE_MIN_WIDTH.
// Widths follow what each column actually has to hold: quantities are two
// digits, percentages three, while prices and totals get the room to stay
// readable. Profit / loss is a single icon.
//
// The two MONEY columns start deliberately generous — a six-figure amount with
// a currency symbol has to fit at full size, because the figures never shrink
// to fit (see AutoFitAmount `shrink={false}`). Every numeric column can then be
// dragged to taste from its left border and the choice is remembered, so these
// are only the starting points.
export const DEFAULT_TENDER_LINE_COLUMN_WIDTHS: Record<TenderLineColumnKey, number> = {
    // Reorder arrows (16px) plus the position number, which doubles as the
    // selection checkbox — sized so neither ever clips at the cell padding.
    pos: 70,
    description: 240,
    quantity: 58,
    unit: 66,
    unitPrice: 152,
    // Holds the percentage AND the stacked-discount square next to it.
    discount: 86,
    taxRate: 64,
    total: 168,
    profit: 46,
};

// Smallest width the table may shrink to before the wrapper starts scrolling
// horizontally. It is the sum of the FIXED columns plus a modest floor for the
// description — using the description's full preferred width here demanded ~80px
// more than the table actually needs and put a horizontal scrollbar on screens
// that could display every column comfortably.
const DESCRIPTION_MIN_WIDTH = 160;
export const TENDER_LINE_TABLE_MIN_WIDTH = Object.entries(DEFAULT_TENDER_LINE_COLUMN_WIDTHS)
    .reduce((total, [key, width]) => total + (key === 'description' ? DESCRIPTION_MIN_WIDTH : width), 0);

export const LINE_PAGE_SIZE = 10;
export const PRODUCT_PICKER_PAGE_SIZE = 15;
export const lineActionButtonClass = '!border-slate-200 !bg-white !text-slate-700 transition-colors hover:!border-[#1f2654] hover:!bg-slate-50 hover:!text-[#1f2654]';


// Native <input> classes (the inline cells no longer use Ant Design): the font
// size is fixed — long values scroll inside the input instead of rescaling.
// Number cells read as real inputs (white field, visible border, 12px digits)
// so the prices stand out from the surrounding text.
// `tabular-nums` is what makes a column of figures readable: every digit takes
// the same width, so decimal points line up down the column even while a cell
// is being typed into.
// Transparent by default so the field sits on the row's own white background;
// it takes a visible border only while hovered or focused, which is what marks
// it as editable.
export const INLINE_NUMBER_INPUT_CLASS =
    'h-6 w-full min-w-0 rounded-[3px] border border-solid border-transparent bg-transparent px-1.5 text-right text-[13px] font-medium tabular-nums leading-none text-slate-900 outline-none transition-[border-color,background-color,box-shadow] duration-150 hover:border-slate-300 hover:bg-white focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/15';
// NOTE: no `truncate` here. It expands to `overflow: hidden`, and on a text
// <input> that suppresses the browser's own auto-scroll while a selection is
// being dragged — drag past the right edge and the content cannot follow, so
// the caret sticks at the boundary while the pointer carries on out of the
// field. An input already clips its content and never wraps; letting it scroll
// natively is what makes selecting a long name work.
export const INLINE_TEXT_INPUT_BASE =
    'w-full rounded-[3px] border border-transparent bg-transparent px-2 py-1 outline-none transition-[border-color,background-color,box-shadow] duration-150 hover:border-slate-300 hover:bg-slate-50 focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/15';
export const INLINE_TITLE_INPUT_CLASS = `${INLINE_TEXT_INPUT_BASE} text-[14.5px] font-semibold text-[#1f2654]`;
export const INLINE_NAME_INPUT_CLASS = `${INLINE_TEXT_INPUT_BASE} text-[13.5px] font-medium text-slate-900`;
