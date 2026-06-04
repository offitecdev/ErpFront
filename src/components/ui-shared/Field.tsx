import React from 'react';
import { parseDate } from '@internationalized/date';
import type { DateValue } from 'react-aria-components';
import { DatePicker } from '../application/date-picker/date-picker';
import { InputBase } from '../base/input/input';
import { Select as BaseSelect, type SelectItemType } from '../base/select/select';
import { TextAreaBase } from '../base/textarea/textarea';
import { cx } from '../../lib/utils/cx';

interface FieldProps {
    label: string;
    error?: string | null;
    hint?: string;
    required?: boolean;
    className?: string;
    children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, error, hint, required, children, className = '' }) => (
    <label className={cx('flex flex-col gap-1.5', className)}>
        <span className="text-sm font-medium text-secondary">
            {label}
            {required && <span className="ml-0.5 text-error-primary">*</span>}
        </span>
        {children}
        {hint && !error && <span className="text-xs text-tertiary">{hint}</span>}
        {error && (
            <span className="rounded-md border border-error_subtle bg-error-primary px-2 py-1 text-xs font-medium text-error-primary">
                {error}
            </span>
        )}
    </label>
);

export const inputClass =
    'w-full rounded-lg bg-primary text-primary shadow-xs ring-1 ring-primary transition duration-100 ease-linear ring-inset placeholder:text-placeholder focus:outline-hidden focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

type SharedInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    size?: React.ComponentProps<typeof InputBase>['size'];
};

type SharedTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> & {
    size?: React.ComponentProps<typeof TextAreaBase>['size'];
};

const toDateValue = (value: SharedInputProps['value']): DateValue | null => {
    if (typeof value !== 'string' || !value) return null;

    try {
        return parseDate(value);
    } catch {
        return null;
    }
};

const emitDateChange = (
    onChange: SharedInputProps['onChange'],
    value: string,
    name?: string,
) => {
    onChange?.({
        target: { value, name },
        currentTarget: { value, name },
    } as React.ChangeEvent<HTMLInputElement>);
};

export const Input: React.FC<SharedInputProps> = ({
    className = '',
    disabled,
    required,
    size = 'md',
    type = 'text',
    value,
    defaultValue,
    onChange,
    placeholder,
    name,
    id,
    ...rest
}) => {
    if (type === 'date') {
        return (
            <DatePicker
                id={id}
                aria-label={rest['aria-label'] ?? placeholder ?? name ?? 'Date picker'}
                value={toDateValue(value ?? defaultValue)}
                onChange={(date) => emitDateChange(onChange, date?.toString() ?? '', name)}
                placeholder={placeholder ?? 'Select date'}
                isDisabled={disabled}
                isRequired={required}
                size={size}
                className={cx('w-full [&_button]:w-full [&_button]:justify-start', className)}
            />
        );
    }

    return (
        <InputBase
            {...rest}
            id={id}
            name={name}
            type={type}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            isDisabled={disabled}
            isRequired={required}
            size={size}
            inputClassName={className}
        />
    );
};

export const Textarea: React.FC<SharedTextareaProps> = ({ className = '', disabled, required, size = 'md', ...rest }) => (
    <TextAreaBase
        {...rest}
        disabled={disabled}
        required={required}
        size={size}
        className={className}
    />
);

type SharedSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'defaultValue' | 'onChange'> & {
    value?: string | number | null;
    defaultValue?: string | number | null;
    onChange?: React.ChangeEventHandler<HTMLSelectElement>;
    size?: React.ComponentProps<typeof BaseSelect>['size'];
};

const optionText = (children: React.ReactNode): string => {
    if (typeof children === 'string' || typeof children === 'number') return String(children);
    return React.Children.toArray(children).map((child) => optionText(child)).join('');
};

const optionChildrenToItems = (children: React.ReactNode): SelectItemType[] =>
    React.Children.toArray(children)
        .filter(React.isValidElement)
        .filter((child) => child.type === 'option')
        .map((child) => {
            const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
            const label = optionText(props.children);
            return {
                id: String(props.value ?? label),
                label,
                isDisabled: Boolean(props.disabled),
            };
        });

const emitSelectChange = (
    onChange: SharedSelectProps['onChange'],
    value: string,
    name?: string,
) => {
    onChange?.({
        target: { value, name },
        currentTarget: { value, name },
    } as React.ChangeEvent<HTMLSelectElement>);
};

export const Select: React.FC<SharedSelectProps> = ({
    className = '',
    children,
    disabled,
    required,
    value,
    defaultValue,
    onChange,
    name,
    size = 'md',
    id,
    title,
    'aria-label': ariaLabel,
}) => {
    const items = optionChildrenToItems(children);
    const placeholder = items.find((item) => item.id === '')?.label || 'Seçiniz';
    const selectedKey = value === undefined || value === null ? undefined : String(value);
    const defaultSelectedKey = defaultValue === undefined || defaultValue === null ? undefined : String(defaultValue);

    return (
        <BaseSelect
            id={id}
            aria-label={ariaLabel ?? title ?? name ?? placeholder}
            name={name}
            size={size}
            className={cx(className || 'w-full')}
            items={items}
            placeholder={placeholder}
            selectedKey={selectedKey}
            defaultSelectedKey={defaultSelectedKey}
            isDisabled={disabled}
            isRequired={required}
            onSelectionChange={(key) => emitSelectChange(onChange, String(key ?? ''), name)}
        >
            {(item) => (
                <BaseSelect.Item id={item.id} isDisabled={item.isDisabled}>
                    {item.label}
                </BaseSelect.Item>
            )}
        </BaseSelect>
    );
};
