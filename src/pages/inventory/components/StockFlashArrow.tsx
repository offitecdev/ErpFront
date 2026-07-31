/**
 * Daire içinde yalın yukarı ok — YALNIZCA iş sürerken görünür:
 *  • 'import' — Excel aktarımı sürerken, lacivert.
 *  • 'save'   — stoka kayıt sürerken, #d30f15.
 * Beklerken (boş tablo) gösterilmez. Kart/çerçeve yok: sadece ok, tablonun önünde.
 */
export type ArrowMode = 'import' | 'save';

const MODE_COLOR: Record<ArrowMode, string> = {
    import: '#272f67',
    save: '#d30f15',
};

export const StockFlashArrow = ({ mode, size = 72 }: { mode: ArrowMode; size?: number }) => {
    const color = MODE_COLOR[mode];

    return (
        <span
            aria-hidden
            style={{ width: size, height: size, borderColor: color, color }}
            className="ofi-arrow-flash flex items-center justify-center rounded-full border-2"
        >
            {/* Yalın çizgi ok — ikon setine bağlı değil. */}
            <svg viewBox="0 0 24 24" className="size-1/2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
            </svg>
        </span>
    );
};
