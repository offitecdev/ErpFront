// Shared field chrome for the quote detail page. One definition for every
// control on the page (customer picker, dates, currency, commission, address
// selects) so they line up on a single baseline and share one focus treatment
// instead of each control inventing its own height and border.

/** Label sitting beside a control — sentence case, as the translation writes it. */
export const QUOTE_LABEL_CLASS =
    'block text-[12px] font-medium leading-[1.35] text-slate-500';

/**
 * Base chrome shared by inputs and selects — height, border, focus ring.
 * Corners are deliberately tight (3px) and every border is a solid hairline:
 * translucent borders and blur read as soft on a dense data screen.
 *
 * Text is left-aligned, which is how a form field is expected to behave: the
 * caret starts at the left edge and the value grows rightward. (Figures inside
 * the quote LINE TABLE are the exception and stay right-aligned — a column of
 * prices only lines up on its decimal point when it is flushed right.)
 */
export const QUOTE_CONTROL_CLASS =
    'ofi-quote-control h-8 w-full min-w-0 rounded-[3px] border border-slate-300 bg-white px-2.5 text-left text-[13px] font-medium text-slate-900 outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-normal placeholder:text-slate-400 hover:border-slate-400 focus:border-[#1f2654] focus:ring-2 focus:ring-[#1f2654]/15 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400';

/** Read-only counterpart of a control, so read-only rows keep the same rhythm. */
export const QUOTE_READONLY_CLASS =
    'flex min-h-8 w-full items-center rounded-[3px] border border-slate-200 bg-slate-50 px-2.5 text-left text-[13px] font-medium leading-[1.35] text-slate-800';
