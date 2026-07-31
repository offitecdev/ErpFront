import type { ReactNode } from 'react';

export const valueOrBlank = (value?: string | number | null) => String(value ?? '').trim();

export const splitAddress = (value?: string | null) =>
    valueOrBlank(value).split(/\r?\n|,\s*/).map((line) => line.trim()).filter(Boolean);

/**
 * The inverse of splitAddress: normalises a stored address — however it was
 * line-broken on the way in — into one comma-separated postal line, e.g.
 * "Hofackerstrasse 75, 4132 Muttenz". Addresses are shown on a single line;
 * stacking them on their commas made a two-part address look like two
 * different addresses.
 */
export const joinAddress = (value?: string | null) => splitAddress(value).join(', ');

export const renderDetailLines = (lines: Array<string | null | undefined>): ReactNode => {
    const cleanLines = lines.map(valueOrBlank).filter(Boolean);
    if (cleanLines.length === 0) return <span className="block min-h-[18px]" aria-hidden="true" />;
    return cleanLines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">{line}</span>
    ));
};
