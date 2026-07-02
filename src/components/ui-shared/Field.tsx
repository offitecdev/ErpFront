import React from 'react';
import AntDatePicker from 'antd/es/date-picker';
import AntInput from 'antd/es/input';
import AntSelect from 'antd/es/select';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

import { t } from '@/i18n/translate';

interface FieldProps {
    label: string;
    error?: string | null;
    hint?: string;
    required?: boolean;
    className?: string;
    children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, error, hint, required, children, className = '' }) => (
    <label className={`flex flex-col gap-1.5 ${className}`}>
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

export const inputClass = "w-full rounded-lg bg-primary text-primary shadow-xs ring-1 ring-primary transition duration-100 ease-linear ring-inset placeholder:text-placeholder focus:outline-hidden focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

type SharedInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
};

type SharedTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> & {
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
};

const antSizeMap: Record<string, 'small' | 'middle' | 'large'> = {
    sm: 'small',
    md: 'middle',
    lg: 'large',
    xl: 'large',
    '2xl': 'large',
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
    min,
    max,
    ...rest
}) => {
    if (type === 'date') {
        const dateValue = value && typeof value === 'string' ? dayjs(value) : undefined;
        const dateDefaultValue = defaultValue && typeof defaultValue === 'string' ? dayjs(defaultValue as string) : undefined;

        return (
            <AntDatePicker
                id={id}
                value={dateValue}
                defaultValue={dateDefaultValue}
                onChange={(_date: Dayjs | null, dateString: string | null) => {
                    const strVal = dateString ?? '';
                    onChange?.({
                        target: { value: strVal, name },
                        currentTarget: { value: strVal, name },
                    } as React.ChangeEvent<HTMLInputElement>);
                }}
                placeholder={placeholder ??t('auto.tarih_secin')}
                disabled={disabled}
                size={antSizeMap[size] || 'middle'}
                className={className}
                style={{ width: '100%' }}
                minDate={min ? dayjs(min as string) : undefined}
                maxDate={max ? dayjs(max as string) : undefined}
                format="YYYY-MM-DD"
            />
        );
    }

    if (type === 'password') {
        return (
            <AntInput.Password
                {...(rest as any)}
                id={id}
                name={name}
                value={value as string}
                defaultValue={defaultValue as string}
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                required={required}
                size={antSizeMap[size] || 'middle'}
                className={className}
            />
        );
    }

    return (
        <AntInput
            {...(rest as any)}
            id={id}
            name={name}
            type={type}
            value={value as string}
            defaultValue={defaultValue as string}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            size={antSizeMap[size] || 'middle'}
            className={className}
            min={min}
            max={max}
        />
    );
};

export const Textarea: React.FC<SharedTextareaProps> = ({
    className = '',
    disabled,
    required,
    size = 'md',
    rows,
    value,
    defaultValue,
    onChange,
    placeholder,
    name,
    id,
    ...rest
}) => (
    <AntInput.TextArea
        {...(rest as any)}
        id={id}
        name={name}
        value={value as string}
        defaultValue={defaultValue as string}
        onChange={onChange as any}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        rows={rows ?? 4}
        size={antSizeMap[size] || 'middle'}
        className={className}
    />
);

type SharedSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'defaultValue' | 'onChange'> & {
    value?: string | number | null;
    defaultValue?: string | number | null;
    onChange?: React.ChangeEventHandler<HTMLSelectElement>;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
};

const optionText = (children: React.ReactNode): string => {
    if (typeof children === 'string' || typeof children === 'number') return String(children);
    return React.Children.toArray(children).map((child) => optionText(child)).join('');
};

const optionChildrenToItems = (children: React.ReactNode) =>
    React.Children.toArray(children)
        .filter(React.isValidElement)
        .filter((child) => child.type === 'option')
        .map((child) => {
            const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
            const label = optionText(props.children);
            return {
                value: String(props.value ?? label),
                label,
                disabled: Boolean(props.disabled),
            };
        });

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
    const placeholder = items.find((item) => item.value === '')?.label ||t('common.select');
    const selectedValue = value === undefined || value === null || value === '' ? undefined : String(value);
    const defaultSelectedValue = defaultValue === undefined || defaultValue === null || defaultValue === '' ? undefined : String(defaultValue);

    return (
        <AntSelect
            id={id}
            aria-label={ariaLabel ?? title ?? name ?? placeholder}
            value={selectedValue}
            defaultValue={defaultSelectedValue}
            onChange={(val: string) => {
                onChange?.({
                    target: { value: val ?? '', name },
                    currentTarget: { value: val ?? '', name },
                } as React.ChangeEvent<HTMLSelectElement>);
            }}
            placeholder={placeholder}
            disabled={disabled}
            aria-required={required}
            size={antSizeMap[size] || 'middle'}
            className={className || 'w-full'}
            style={{ width: '100%' }}
            options={items.filter((item) => item.value !== '')}
            allowClear
        />
    );
};
