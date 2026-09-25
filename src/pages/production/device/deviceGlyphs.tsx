import type { ReactNode, SVGProps } from 'react';

/**
 * Die Zeichen der Prozessleiste — gezeichnet wie die übrigen Linienzeichen
 * der Anwendung (24er Raster, runde Enden): die Fahne des Zielpunkts, der
 * Schild der Leitung und die Spitze zwischen zwei Stufen.
 */

type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

const Svg = ({ size = 16, strokeWidth = 1.8, children, ...props }: GlyphProps & { children: ReactNode }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
    >
        {children}
    </svg>
);

/** Die Fahne — «final bayrak olsun, bir tane bayrak noktası şeklinde». */
export const FlagGlyph = (props: GlyphProps) => (
    <Svg {...props}>
        <path d="M5 21V4" />
        <path d="M5 4.5s1.2-1 4-1 4.6 1.8 7.4 1.8S20 4.5 20 4.5v9s-1.2 1-4 1-4.6-1.8-7.4-1.8S5 13.5 5 13.5" fill="currentColor" />
    </Svg>
);

/** Der Schild der Administratorrolle — «nur für die Leitung sichtbar». */
export const AdminGlyph = (props: GlyphProps) => (
    <Svg {...props}>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
    </Svg>
);

/** Die feine Spitze zwischen zwei Stufen — der Weg geht nach rechts. */
export const StepChevron = (props: GlyphProps) => (
    <Svg strokeWidth={2} {...props}>
        <path d="m9 6 6 6-6 6" />
    </Svg>
);
