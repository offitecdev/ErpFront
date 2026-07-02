import type { PositionDto } from '../../../../types/tender';
import type { SimpleTenderLine } from '../types/tenderDetail.types';
import { DEFAULT_VAT } from './tenderDetail.constants';

export const normalizeRowType = (value?: string | null) => String(value || '').toUpperCase();

export const getLineKind = (position: PositionDto): SimpleTenderLine['kind'] => {
    const normalized = normalizeRowType(position.rowType);
    if (normalized === 'DESCRIPTION') return 'DESCRIPTION';
    if (normalized === 'TITLE' || normalized === 'SECTION') return 'TITLE';
    if (normalized === 'PRODUCT' || normalized === 'CUSTOM') return 'PRODUCT';

    const hasProductData = Boolean(position.sourceArticleId)
        || position.unitPrice != null
        || Number(position.quantity || 0) > 0
        || Boolean(position.unit);
    return hasProductData ? 'PRODUCT' : 'TITLE';
};

export const lineNetTotal = (position: PositionDto) => {
    if (getLineKind(position) !== 'PRODUCT') return 0;

    const quantity = Number(position.quantity || 0);
    const unitPrice = position.unitPrice == null ? null : Number(position.unitPrice);
    const discount = Number(position.discount || 0);
    const calculationTotal = Math.max(0, Number(position.calculation?.totalCalculatedPrice || 0));
    return unitPrice != null && quantity > 0
        ? quantity * unitPrice * (1 - discount / 100)
        : calculationTotal;
};

export const lineTotal = (position: PositionDto, fallbackTaxRate: number) => {
    if (getLineKind(position) !== 'PRODUCT') return 0;

    const net = lineNetTotal(position);
    const taxRate = Number(position.taxRate || fallbackTaxRate || DEFAULT_VAT);
    return net * (1 + taxRate / 100);
};
