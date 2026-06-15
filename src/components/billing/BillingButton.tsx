import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui-shared/Button';
import { BillingDialog, type BillingTarget } from './BillingDialog';

interface BillingButtonProps {
    target: BillingTarget;
    onBilled?: () => void;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'primary' | 'secondary' | 'ghost';
    label?: string;
    icon?: React.ReactNode;
}

export const BillingButton: React.FC<BillingButtonProps> = ({
    target,
    onBilled,
    size = 'sm',
    variant = 'secondary',
    label,
    icon,
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                variant={variant}
                size={size}
                icon={icon}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(true);
                }}
            >
                {label ?? t('billing.buttonLabel')}
            </Button>
            <BillingDialog
                open={open}
                target={open ? target : null}
                onClose={() => setOpen(false)}
                onSuccess={onBilled}
            />
        </>
    );
};
