import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from '../icons/antIconCompat';
import { Button } from '../ui-shared/Button';
import { BillingDialog, type BillingTarget } from './BillingDialog';

interface BillingButtonProps {
    target: BillingTarget;
    onBilled?: () => void;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'primary' | 'secondary' | 'ghost';
    label?: string;
    icon?: React.ReactNode;
    /**
     * When the caller already knows the billing state, pass the remaining percent:
     * at <= 0 the button is replaced by a static "100% billed" chip so the
     * billing pop-up can never open on a fully invoiced record.
     */
    remainingPercent?: number | null;
}

export const BillingButton: React.FC<BillingButtonProps> = ({
    target,
    onBilled,
    size = 'sm',
    variant = 'secondary',
    label,
    icon,
    remainingPercent,
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    if (typeof remainingPercent === 'number' && remainingPercent <= 0) {
        return (
            /* Google-clean (19.08.2026): weiche Pille statt Kasten, dieselbe
               Marke wie der Zahlungseingang in der Rechnungsliste. */
            <span className="ofi-inv-state is-paid">
                <Check size={12} strokeWidth={3} />
                {t('billing.fullyBilledChip')}
            </span>
        );
    }

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
