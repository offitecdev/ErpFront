import type { SVGProps } from 'react';

type ToolbarSymbolProps = SVGProps<SVGSVGElement> & {
    name: 'apps' | 'company' | 'bell' | 'language';
};

/** Small optical-size symbols for the shell's toolbar controls. */
export const ToolbarSymbol = ({ name, className = '', ...props }: ToolbarSymbolProps) => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={`ofi-toolbar-symbol ${className}`}
        {...props}
    >
        {name === 'apps' && <>
            <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="2" fill="currentColor" stroke="none" />
            <rect x="14" y="3.5" width="6.5" height="6.5" rx="2" fill="currentColor" stroke="none" />
            <rect x="3.5" y="14" width="6.5" height="6.5" rx="2" fill="currentColor" stroke="none" />
            <rect x="14" y="14" width="6.5" height="6.5" rx="2" fill="currentColor" stroke="none" opacity=".5" />
        </>}
        {name === 'company' && <>
            <rect x="5.5" y="3.5" width="13" height="17" rx="2.5" />
            <path d="M9 7.5h.01M15 7.5h.01M9 11h.01M15 11h.01" strokeWidth="2.5" />
            <path d="M10 20v-4.5h4V20" />
        </>}
        {name === 'bell' && <>
            <path d="M12 3.5c-3.25 0-5.5 2.5-5.5 5.75v3.25c0 2-1 3.25-2 4.5h15c-1-1.25-2-2.5-2-4.5V9.25C17.5 6 15.25 3.5 12 3.5Z" fill="currentColor" stroke="none" />
            <path d="M10 20a2.3 2.3 0 0 0 4 0" />
        </>}
        {name === 'language' && <>
            <circle cx="12" cy="12" r="8.5" />
            <ellipse cx="12" cy="12" rx="3.5" ry="8.5" />
            <path d="M3.5 12h17" />
        </>}
    </svg>
);
