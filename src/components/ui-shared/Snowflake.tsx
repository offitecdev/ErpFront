import type { CSSProperties } from 'react';

/**
 * Detailed six-fold snowflake that matches the Offitec logo mark.
 * Animation (slow spin) lives in login.css via the .ofi-login2__flake class,
 * so you can pass that className straight in:
 *
 *   <Snowflake className="ofi-login2__flake" />
 */
type Props = { className?: string; style?: CSSProperties };

export const Snowflake = ({ className, style }: Props) => (
    <svg
        viewBox="0 0 200 200"
        className={className}
        style={style}
        aria-hidden="true"
        fill="none"
    >
        <g
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {/* One arm, then rotate it five times for perfect 6-fold symmetry */}
            <g id="ofi-flake-arm">
                <line x1="100" y1="100" x2="100" y2="12" />
                <line x1="100" y1="34" x2="82" y2="20" />
                <line x1="100" y1="34" x2="118" y2="20" />
                <line x1="100" y1="58" x2="84" y2="46" />
                <line x1="100" y1="58" x2="116" y2="46" />
                <line x1="100" y1="80" x2="88" y2="71" />
                <line x1="100" y1="80" x2="112" y2="71" />
            </g>
            <use href="#ofi-flake-arm" transform="rotate(60 100 100)" />
            <use href="#ofi-flake-arm" transform="rotate(120 100 100)" />
            <use href="#ofi-flake-arm" transform="rotate(180 100 100)" />
            <use href="#ofi-flake-arm" transform="rotate(240 100 100)" />
            <use href="#ofi-flake-arm" transform="rotate(300 100 100)" />
        </g>
    </svg>
);