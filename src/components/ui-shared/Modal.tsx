import React, { useEffect } from 'react';
import { CloseButton } from '../base/buttons/close-button';
import { Dialog, Modal as UntitledModal, ModalOverlay } from '../application/modals/modal';
import { cx } from '../../lib/utils/cx';

interface ModalProps {
    open: boolean;
    title: string;
    description?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    width?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    placement?: 'center' | 'drawer';
    drawerWidth?: 'md' | 'lg' | 'half' | 'wide';
}

const widthClass = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[min(1180px,calc(100vw-2rem))]',
};

const drawerWidthClass = {
    md: 'max-w-[min(520px,100vw)]',
    lg: 'max-w-[min(760px,100vw)]',
    half: 'max-w-[min(960px,100vw)] lg:w-1/2',
    wide: 'w-[min(1180px,100vw)] max-w-none',
};

export const Modal: React.FC<ModalProps> = ({
    open,
    title,
    description,
    onClose,
    children,
    footer,
    width = 'md',
    closeOnBackdrop = true,
    closeOnEscape = true,
    placement = 'center',
    drawerWidth = 'md',
}) => {
    useEffect(() => {
        if (!open || closeOnEscape) return;
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') event.stopPropagation();
        };
        document.addEventListener('keydown', handler, true);
        return () => document.removeEventListener('keydown', handler, true);
    }, [closeOnEscape, open]);

    const isDrawer = placement === 'drawer';

    return (
        <ModalOverlay
            isOpen={open}
            isDismissable={closeOnBackdrop}
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose();
            }}
            className={isDrawer ? 'items-stretch justify-end !bg-transparent p-0 sm:items-stretch sm:justify-end sm:p-0' : undefined}
        >
            <UntitledModal
                className={cx(
                    isDrawer
                        ? `h-dvh ${drawerWidthClass[drawerWidth]} max-sm:rounded-none`
                        : `${widthClass[width]} max-sm:rounded-xl`,
                )}
            >
                <Dialog>
                    <div className="flex max-h-full w-full flex-col overflow-hidden rounded-xl bg-primary shadow-xl ring-1 ring-secondary_alt">
                        <div className="flex items-start justify-between gap-4 border-b border-secondary px-6 py-5">
                            <div className="min-w-0">
                                <h2 className="text-lg font-semibold text-primary">{title}</h2>
                                {description && <p className="mt-1 text-sm text-tertiary">{description}</p>}
                            </div>
                            <CloseButton size="sm" label="Kapat" onPress={onClose} />
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

                        {footer && (
                            <div className="flex items-center justify-end gap-2 border-t border-secondary bg-primary px-6 py-4">
                                {footer}
                            </div>
                        )}
                    </div>
                </Dialog>
            </UntitledModal>
        </ModalOverlay>
    );
};
