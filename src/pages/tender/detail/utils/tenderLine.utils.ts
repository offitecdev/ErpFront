import type { PositionDto } from '../../../../types/tender';
import type { SimpleTenderLine } from '../types/tenderDetail.types';
import { getLineKind, lineTotal } from './tenderCalculation.utils';

export const parseInlineNumber = (value: string, max?: number) => {
    const normalized = value.replace(/'/g, '').replace(',', '.');
    const parsed = Number(normalized);
    const safe = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    return max == null ? safe : Math.min(safe, max);
};

export const plainTextPreview = (value?: string | null) =>
    String(value || '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*-\s+/gm, '')
        .replace(/[*_`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const importedMetaLinePattern = /^(Auftragspositionen:|Auftragspositionen\/|Nettobetrag:|Steuern:|Marge:|Mitteilungen\/|Auftragsreferenz:|Kunde:)/i;

export const cleanImportedProductDescription = (value?: string | null) => {
    const lines = String(value || '').split(/\r?\n/);
    const firstMetaIndex = lines.findIndex((line) => importedMetaLinePattern.test(line.trim()));
    const kept = firstMetaIndex >= 0 ? lines.slice(0, firstMetaIndex) : lines;
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

export const sortPositions = (positions: PositionDto[]) =>
    [...positions].sort((a, b) => {
        const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return String(a.positionNumber || '').localeCompare(String(b.positionNumber || ''), undefined, { numeric: true });
    });

export const buildSimpleTenderLines = (positions: PositionDto[], fallbackTaxRate: number): SimpleTenderLine[] => {
    let rootIndex = 0;
    let activeTitleIndex: number | null = null;
    let childIndex = 0;

    return sortPositions(positions).map((position) => {
        const kind = getLineKind(position);

        let label = '';
        if (kind === 'TITLE') {
            rootIndex += 1;
            activeTitleIndex = rootIndex;
            childIndex = 0;
            label = String(rootIndex);
        } else if (kind === 'PRODUCT') {
            if (activeTitleIndex == null) {
                rootIndex += 1;
                label = String(rootIndex);
            } else {
                childIndex += 1;
                label = `${activeTitleIndex}.${childIndex}`;
            }
        }

        return {
            id: position.id,
            label,
            kind,
            position,
            total: lineTotal(position, fallbackTaxRate),
        };
    });
};
