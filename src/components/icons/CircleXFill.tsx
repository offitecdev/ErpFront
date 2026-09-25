/**
 * SF Symbol `xmark.circle.fill` — a filled disc with the cross knocked out.
 * The disc takes `currentColor`; the cross reads `--ofi-circle-x-glyph`
 * (white by default), so each surface can set both for light and dark.
 */
export const CircleXFill = ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="9" fill="currentColor" />
        <path
            d="M6.3 6.3l5.4 5.4M11.7 6.3l-5.4 5.4"
            stroke="var(--ofi-circle-x-glyph, #fff)"
            strokeWidth="1.7"
            strokeLinecap="round"
        />
    </svg>
);
