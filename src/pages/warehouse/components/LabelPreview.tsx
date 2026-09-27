import { useMemo } from 'react';

import { ean13Bars, ean13Pattern, labelLayout, PT_MM } from '../warehouseCodes';

/**
 * Die Vorschau eines Etiketts — dieselben Masse wie die PDF (`labelLayout`),
 * in Millimetern gezeichnet und auf die Breite der Tafel skaliert. Weiss,
 * auch im dunklen Kleid: so sieht das Papier aus.
 */
export const LabelPreview = ({
    widthMm,
    heightMm,
    showName,
    name,
    erpCode,
    barcode,
}: {
    widthMm: number;
    heightMm: number;
    showName: boolean;
    name: string;
    erpCode: string;
    barcode: string | null;
}) => {
    const layout = useMemo(() => labelLayout(widthMm, heightMm, showName, Boolean(barcode)), [widthMm, heightMm, showName, barcode]);
    const pattern = useMemo(() => (barcode ? ean13Pattern(barcode) : null), [barcode]);
    const module = layout.barcodeWidth / 113;
    const left = layout.barcodeX + 11 * module;
    const digitsSize = layout.digitsPt * PT_MM;
    const guardExtra = Math.min(digitsSize * 0.55, layout.barHeight * 0.12);
    const digitsBaseline = layout.barTop + layout.barHeight + digitsSize * 0.95;
    const font = "'Liberation Sans', Arial, Helvetica, sans-serif";

    return (
        <svg
            className="ofi-wh-labelpreview"
            viewBox={`0 0 ${widthMm} ${heightMm}`}
            style={{ aspectRatio: `${widthMm} / ${heightMm}` }}
            role="img"
            aria-label={`${erpCode} · ${widthMm} × ${heightMm} mm`}
        >
            <rect x={0} y={0} width={widthMm} height={heightMm} rx={1.2} fill="#fff" stroke="rgba(0,0,0,0.18)" strokeWidth={0.2} />
            {layout.nameBaseline !== null && (
                <text
                    x={widthMm / 2}
                    y={layout.nameBaseline}
                    fontSize={layout.namePt * PT_MM}
                    fontFamily={font}
                    textAnchor="middle"
                    fill="#1d1d1f"
                >
                    {name.length > 60 ? `${name.slice(0, 58)}…` : name}
                </text>
            )}
            {pattern && (
                <g shapeRendering="crispEdges">
                    {ean13Bars(pattern).map((bar) => (
                        <rect
                            key={bar.x}
                            x={left + bar.x * module}
                            y={layout.barTop}
                            width={bar.width * module}
                            height={layout.barHeight + (bar.guard ? guardExtra : 0)}
                            fill="#000"
                        />
                    ))}
                </g>
            )}
            {pattern && (
                <g fontSize={digitsSize} fontFamily={font} textAnchor="middle" fill="#1d1d1f">
                    <text x={left - 4 * module} y={digitsBaseline}>{pattern.text.first}</text>
                    {pattern.text.left.split('').map((digit, index) => (
                        <text key={`l${index}`} x={left + (3 + 7 * index + 3.5) * module} y={digitsBaseline}>{digit}</text>
                    ))}
                    {pattern.text.right.split('').map((digit, index) => (
                        <text key={`r${index}`} x={left + (50 + 7 * index + 3.5) * module} y={digitsBaseline}>{digit}</text>
                    ))}
                </g>
            )}
            <text
                x={widthMm / 2}
                y={layout.codeBaseline}
                fontSize={layout.codePt * PT_MM}
                fontFamily={font}
                fontWeight={700}
                textAnchor="middle"
                fill="#1d1d1f"
            >
                {erpCode}
            </text>
        </svg>
    );
};
