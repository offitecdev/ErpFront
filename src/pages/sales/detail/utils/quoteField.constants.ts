// Shared field chrome for the quote detail page. One definition for every
// control on the page (customer picker, dates, currency, commission, address
// selects) so they line up on a single baseline and share one focus treatment
// instead of each control inventing its own height and border.

/** Label sitting beside a control — sentence case, as the translation writes it. */
export const QUOTE_LABEL_CLASS =
    'block text-[12px] font-medium leading-[1.35] text-slate-600';

/**
 * Base chrome shared by inputs and selects — height, focus treatment. The
 * colours (soft grey field at rest, white with a navy edge on focus — the
 * calendar's field language) are painted by `.ofi-quote-control` in index.css
 * ("QUOTE PAGE — FRESH LOOK") from the shared tokens, so dark mode is a
 * variable swap instead of a second utility list.
 *
 * Text is left-aligned, which is how a form field is expected to behave: the
 * caret starts at the left edge and the value grows rightward. (Figures inside
 * the quote LINE TABLE are the exception and stay right-aligned — a column of
 * prices only lines up on its decimal point when it is flushed right.)
 */
export const QUOTE_CONTROL_CLASS =
    'ofi-quote-control h-8 w-full min-w-0 rounded-[6px] border border-transparent px-3 text-left text-[13px] font-medium outline-none transition-[border-color,background-color] duration-150 placeholder:font-normal disabled:cursor-not-allowed';

/** Read-only counterpart of a control, so read-only rows keep the same rhythm. */
export const QUOTE_READONLY_CLASS =
    'ofi-quote-readonly flex min-h-8 w-full items-center rounded-[6px] px-3 text-left text-[13px] font-medium leading-[1.35]';
