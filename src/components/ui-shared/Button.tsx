import React, { cloneElement, isValidElement } from 'react';
import { Button as UntitledButton } from '../base/buttons/button';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = React.ComponentProps<typeof UntitledButton>['size'];
type Color = React.ComponentProps<typeof UntitledButton>['color'];
type IconProp = React.ComponentProps<typeof UntitledButton>['iconLeading'];

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
    variant?: Variant;
    color?: Color;
    size?: Size;
    icon?: React.ReactNode;
    iconLeading?: IconProp;
    iconTrailing?: IconProp;
    loading?: boolean;
    isLoading?: boolean;
    isDisabled?: boolean;
}

const colorMap: Record<Variant, Color> = {
    primary: 'primary',
    secondary: 'secondary',
    ghost: 'tertiary',
    danger: 'primary-destructive',
    subtle: 'secondary',
};

const withDataIcon = (icon: IconProp | React.ReactNode, position: 'leading' | 'trailing'): IconProp | React.ReactNode => {
    if (!isValidElement(icon)) return icon;

    return cloneElement(icon as React.ReactElement<{ 'data-icon'?: string }>, {
        'data-icon': position,
    });
};

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    color,
    size = 'md',
    icon,
    iconLeading,
    iconTrailing,
    loading,
    isLoading,
    children,
    disabled,
    isDisabled,
    ...rest
}) => (
    <UntitledButton
        {...rest}
        color={color ?? colorMap[variant]}
        size={size}
        iconLeading={withDataIcon(iconLeading ?? icon, 'leading') as IconProp}
        iconTrailing={withDataIcon(iconTrailing, 'trailing') as IconProp}
        isDisabled={isDisabled ?? disabled}
        isLoading={isLoading ?? loading}
    >
        {children}
    </UntitledButton>
);
