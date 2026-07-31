import type { NumberField, SimpleTenderLine } from '../../types/tenderDetail.types';
import { INLINE_NUMBER_INPUT_CLASS } from '../../utils/tenderDetail.constants';
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
    if (isDraft) {
        return (
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
            />
        );
    }
    // Read-only cell: same figure treatment as the editable one, minus the box.
    const text = value != null && Number(value) > 0 ? `${value}${suffix ?? ''}` : '';
    return (
        <span title={text} className="block truncate py-0.5 text-right text-[13px] font-medium tabular-nums text-slate-800">
            {text}
        </span>
    );
};
