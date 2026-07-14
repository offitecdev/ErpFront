import type { NumberField, SimpleTenderLine } from '../../types/tenderDetail.types';
import { INLINE_NUMBER_INPUT_CLASS } from '../../utils/tenderDetail.constants';
import { AutoFitAmount } from '../common/AutoFitAmount';
import { BufferedNumberInput } from '../TenderLineInputs';

type TenderLinePriceInputProps = {
    row: SimpleTenderLine;
    field: NumberField;
    value: number | null | undefined;
    rowIndex: number;
    isDraft: boolean;
    commit: (positionId: string, field: NumberField, value: number) => void;
    registerCell: (key: string, handle: { focus: () => void } | null) => void;
    onArrowNav: (col: string, rowIndex: number, dir: 1 | -1) => boolean;
    max?: number;
    suffix?: string;
};

export const TenderLinePriceInput = ({
    row,
    field,
    value,
    rowIndex,
    isDraft,
    commit,
    registerCell,
    onArrowNav,
    max,
    suffix,
}: TenderLinePriceInputProps) => {
    if (row.kind !== 'PRODUCT') return <span className="text-slate-300" />;
    return isDraft ? (
        <BufferedNumberInput
            ariaLabel={field}
            value={value}
            max={max}
            field={field}
            commit={commit}
            positionId={row.id}
            rowIndex={rowIndex}
            navCol={field}
            registerCell={registerCell}
            onArrowNav={onArrowNav}
            className={INLINE_NUMBER_INPUT_CLASS}
            autoFit={field === 'unitPrice'}
        />
    ) : (
        <AutoFitAmount
            value={value != null && Number(value) > 0 ? `${value}${suffix ?? ''}` : ''}
            basePx={12}
            scrollbar="thin"
            className="font-mono text-slate-700"
        />
    );
};
