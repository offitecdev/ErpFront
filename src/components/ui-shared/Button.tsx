import React from 'react';
import AntButton from 'antd/es/button';
import type { ButtonProps as AntButtonProps } from 'antd/es/button';
import { cx } from '../../lib/utils/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'type'> {
    variant?: Variant;
    color?: string;
    size?: Size;
    icon?: React.ReactNode;
    iconLeading?: React.ReactNode;
    iconTrailing?: React.ReactNode;
    loading?: boolean;
    isLoading?: boolean;
    isDisabled?: boolean;
    showTextWhileLoading?: boolean;
    type?: 'button' | 'submit' | 'reset';
    htmlType?: 'button' | 'submit' | 'reset';
}

// AntD v6 dropped the old `type="primary" + danger` = solid-red behaviour; a solid
// red button now comes from the color/variant API. Map `danger` to that so it renders
// red instead of falling back to the navy `colorPrimary`.
const typeMap: Record<Variant, Pick<AntButtonProps, 'type' | 'danger' | 'color' | 'variant'>> = {
    primary: { type: 'primary' },
    secondary: { type: 'default' },
    ghost: { type: 'text' },
    danger: { color: 'danger', variant: 'solid' },
    subtle: { type: 'default' },
};

const sizeMap: Record<Size, 'small' | 'middle' | 'large'> = {
    sm: 'small',
    md: 'middle',
    lg: 'large',
    xl: 'large',
    '2xl': 'large',
};

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    icon,
    iconLeading,
    iconTrailing,
    loading,
    isLoading,
    showTextWhileLoading: _showTextWhileLoading,
    children,
    disabled,
    isDisabled,
    type: legacyType,
    htmlType,
    color: _color,
    className,
    style,
    ...rest
}) => {
    const { type, danger, color, variant: antVariant } = typeMap[variant];
    const antSize = sizeMap[size] || 'middle';
    const leadingIcon = iconLeading ?? icon;

    return (
        <AntButton
            {...rest}
            type={type}
            danger={danger}
            color={color}
            variant={antVariant}
            size={antSize}
            icon={leadingIcon}
            loading={isLoading ?? loading}
            disabled={isDisabled ?? disabled}
            htmlType={htmlType ?? legacyType ?? 'button'}
            className={cx('transition-all duration-150 active:translate-y-px', variant === 'danger' && 'ofi-btn-danger', className)}
            style={style}
        >
            {children}
            {iconTrailing && <span className="ant-btn-icon" style={{ marginInlineStart: children ? 8 : 0 }}>{iconTrailing}</span>}
        </AntButton>
    );
};
