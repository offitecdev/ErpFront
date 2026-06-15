import React from 'react';
import { Checkbox as AntCheckbox } from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import { cx } from '../../lib/utils/cx';

import { t } from '@/i18n/translate';

interface CheckboxProps extends Omit<React.HTMLAttributes<HTMLLabelElement>, 'onChange'> {
    label?: React.ReactNode;
    hint?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg';
    isSelected?: boolean;
    isIndeterminate?: boolean;
    isDisabled?: boolean;
    onChange?: (checked: boolean) => void;
}

export const Checkbox: React.FC<CheckboxProps> = ({
    label,
    hint,
    size = 'md',
    isSelected,
    isIndeterminate,
    isDisabled,
    onChange,
    className,
    children,
    ...rest
}) => {
    const handleChange = (event: CheckboxChangeEvent) => {
        onChange?.(event.target.checked);
    };

    return (
        <label
            {...rest}
            className={cx(t('auto.inline_flex_items_start_gap_2_text_sm_text_secon'),
                isDisabled &&t('auto.cursor_not_allowed_opacity_60'),
                className,
            )}
        >
            <AntCheckbox
                checked={isSelected}
                indeterminate={isIndeterminate}
                disabled={isDisabled}
                onChange={handleChange}
                className={size === 'sm' ? 'mt-0.5' : 'mt-1'}
            />
            {(label || hint || children) && (
                <span className="min-w-0">
                    {(label || children) && <span className="block font-medium">{label || children}</span>}
                    {hint && <span className="mt-0.5 block text-xs text-tertiary">{hint}</span>}
                </span>
            )}
        </label>
    );
};
