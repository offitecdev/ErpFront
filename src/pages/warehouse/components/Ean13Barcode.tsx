import { useMemo } from 'react';

import { ean13Bars, ean13Pattern } from '../warehouseCodes';

/* Masse in Modulen (ein Modul = schmalster Strich): Ruhezonen nach GS1
   (links 11, rechts 7), Striche 60 hoch, Randzeichen 5 länger, Klarschrift
   darunter. Gezeichnet als Vektor — scharf in jeder Vergrösserung. */
const QUIET_LEFT = 11;
const QUIET_RIGHT = 7;
const WIDTH = QUIET_LEFT + 95 + QUIET_RIGHT;
const BAR_TOP = 3;
const BAR_HEIGHT = 58;
const GUARD_EXTRA = 5;

/**
 * Der GS1-Barcode (EAN-13) einer Karte — schwarz auf weiss, auch im dunklen
 * Kleid (ein Barcode muss vom Bildschirm lesbar bleiben). Ein Code, der kein
 * gültiger EAN-13 ist (Altbestand), steht als Text da.
 */
export const Ean13Barcode = ({
    code,
    caption,
    className,
    title,
}: {
    code: string;
    /** Zeile unter der Klarschrift — der ERP-Code («erp numarası yazsın altında»). */
    caption?: string | null;
    className?: string;
    title?: string;
}) => {
    const pattern = useMemo(() => ean13Pattern(code), [code]);
    if (!pattern) return <span className={`ofi-wh-barcode is-text ${className ?? ''}`}>{code}</span>;

    const height = BAR_TOP + BAR_HEIGHT + GUARD_EXTRA + 9 + (caption ? 13 : 2);
    const digitX = (start: number, index: number) => QUIET_LEFT + start + 7 * index + 3.5;
    return (
        <svg
            className={`ofi-wh-barcode ${className ?? ''}`}
            viewBox={`0 0 ${WIDTH} ${height}`}
            role="img"
            aria-label={title ?? `${code}${caption ? ` · ${caption}` : ''}`}
            shapeRendering="crispEdges"
        >
            <rect x={0} y={0} width={WIDTH} height={height} rx={3} fill="#fff" />
            {ean13Bars(pattern).map((bar) => (
                <rect
                    key={bar.x}
                    x={QUIET_LEFT + bar.x}
                    y={BAR_TOP}
                    width={bar.width}
                    height={BAR_HEIGHT + (bar.guard ? GUARD_EXTRA : 0)}
                    fill="#000"
                />
            ))}
            <g fill="#1d1d1f" fontFamily="'Inter Variable', -apple-system, 'Segoe UI', sans-serif" fontSize={8.5} textAnchor="middle" shapeRendering="auto">
                <text x={QUIET_LEFT - 5} y={BAR_TOP + BAR_HEIGHT + 8}>{pattern.text.first}</text>
                {pattern.text.left.split('').map((digit, index) => (
                    <text key={`l${index}`} x={digitX(3, index)} y={BAR_TOP + BAR_HEIGHT + 8}>{digit}</text>
                ))}
                {pattern.text.right.split('').map((digit, index) => (
                    <text key={`r${index}`} x={digitX(50, index)} y={BAR_TOP + BAR_HEIGHT + 8}>{digit}</text>
                ))}
                {caption && (
                    <text x={WIDTH / 2} y={height - 3} fontSize={10} fontWeight={600} letterSpacing={0.2}>{caption}</text>
                )}
            </g>
        </svg>
    );
};
