import type { ReactNode } from 'react';

export const valueOrBlank = (value?: string | number | null) => String(value ?? '').trim();

export const splitAddress = (value?: string | null) =>
    valueOrBlank(value).split(/\r?\n|,\s*/).map((line) => line.trim()).filter(Boolean);

export const renderDetailLines = (lines: Array<string | null | undefined>): ReactNode => {
    const cleanLines = lines.map(valueOrBlank).filter(Boolean);
    if (cleanLines.length === 0) return <span className="block min-h-[18px]" aria-hidden="true" />;
    return cleanLines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">{line}</span>
    ));
};
