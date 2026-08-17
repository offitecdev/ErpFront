// A money/number readout that stays inside its slot instead of blowing out the
// layout when the figure gets large: it steps the font size down a notch as the
// formatted value gets longer and, past that, scrolls horizontally on its own.
// Applied per-cell so a few oversized amounts never force the whole column (or
// table) to a smaller font. In a flex row the `min-w-0` lets it shrink below the
// text width so a neighbouring label keeps its place; the horizontal scrollbar is
// hidden to keep compact cells tidy (shift/trackpad scroll still works).
type AutoFitAmountProps = {
    /** Already-formatted text, e.g. `fmtMoney(x)` (may include a +/− prefix). */
    value: string;
    /** Font size in px used when the value is short; shrinks a notch when long. */
    basePx: number;
    /** Colour / weight / font-family classes for the readout. */
    className?: string;
    title?: string;
    /**
     * `hidden` (default) keeps compact cells tidy — scroll still works via
     * shift/trackpad. `thin` shows a slim horizontal scrollbar when the value
     * overflows so a figure that doesn't fit can be scrolled into view.
     */
    scrollbar?: 'hidden' | 'thin';
    /**
     * `true` (default) steps the font down a notch as the value gets longer.
     * Set `false` to keep the font at `basePx` and rely on the scrollbar alone —
     * e.g. the grand total, where the amount should stay full size.
     */
    shrink?: boolean;
};

const SCROLLBAR_CLASS: Record<NonNullable<AutoFitAmountProps['scrollbar']>, string> = {
    hidden: '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
    thin: '[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent',
};

// Drop roughly one notch once an amount passes a normal money width
// (`CHF 1'234.50` ≈ 12 chars) and a second notch for millions-plus, with a floor
// so tiny cells never collapse to an unreadable size.
const fitFontPx = (length: number, basePx: number) => {
    const reduced = length <= 12 ? basePx : length <= 15 ? basePx - 1 : length <= 18 ? basePx - 2 : basePx - 3;
    return Math.max(reduced, Math.min(basePx, 9));
};

export const AutoFitAmount = ({ value, basePx, className = '', title, scrollbar = 'hidden', shrink = true }: AutoFitAmountProps) => (
    <span
        title={title ?? value}
        style={{ fontSize: `${shrink ? fitFontPx(value.length, basePx) : basePx}px` }}
        className={`block min-w-0 max-w-full overflow-x-auto whitespace-nowrap ${SCROLLBAR_CLASS[scrollbar]} ${className}`}
    >
        {value}
    </span>
);
