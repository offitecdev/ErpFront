import React, { useEffect } from 'react';
import AntModal from 'antd/es/modal';
import Drawer from 'antd/es/drawer';

import { BottomSheet } from './BottomSheet';

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
    /** 'sheet' fährt von unten herein und ist quadratisch — siehe BottomSheet. */
    placement?: 'center' | 'drawer' | 'sheet';
    drawerWidth?: 'md' | 'lg' | 'half' | 'wide';
    /** Kantenlänge in px, nur für placement="sheet". */
    sheetSize?: number;
}

const widthMap = {
    sm: 448,
    md: 576,
    lg: 672,
    xl: 896,
    full: 1180,
};

const drawerWidthMap = {
    md: 520,
    lg: 760,
    half: '50%' as string | number,
    wide: 1180,
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
    sheetSize,
}) => {
    useEffect(() => {
        if (!open || closeOnEscape) return;
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') event.stopPropagation();
        };
        document.addEventListener('keydown', handler, true);
        return () => document.removeEventListener('keydown', handler, true);
    }, [closeOnEscape, open]);

    if (placement === 'sheet') {
        return (
            <BottomSheet
                open={open}
                title={title}
                description={description}
                onClose={onClose}
                footer={footer}
                size={sheetSize}
                closeOnBackdrop={closeOnBackdrop}
                closeOnEscape={closeOnEscape}
            >
                {children}
            </BottomSheet>
        );
    }

    if (placement === 'drawer') {
        return (
            <Drawer
                open={open}
                onClose={onClose}
                title={
                    <div>
                        <div className="text-lg font-semibold">{title}</div>
                        {description && <p className="mt-1 text-sm text-tertiary font-normal">{description}</p>}
                    </div>
                }
                size={drawerWidthMap[drawerWidth]}
                mask={{ closable: closeOnBackdrop }}
                keyboard={closeOnEscape}
                footer={footer ? (
                    <div className="flex items-center justify-end gap-2">
                        {footer}
                    </div>
                ) : undefined}
                styles={{
                    body: { padding: '24px' },
                    header: { borderBottom: '1px solid #f1f5f9' },
                    footer: { borderTop: '1px solid #f1f5f9', padding: '12px 24px' },
                }}
            >
                {children}
            </Drawer>
        );
    }

    return (
        <AntModal
            open={open}
            title={
                <div>
                    <div className="text-lg font-semibold">{title}</div>
                    {description && <p className="mt-1 text-sm text-tertiary font-normal">{description}</p>}
                </div>
            }
            onCancel={onClose}
            footer={footer ? (
                <div className="flex items-center justify-end gap-2">
                    {footer}
                </div>
            ) : null}
            width={widthMap[width]}
            mask={{ closable: closeOnBackdrop }}
            keyboard={closeOnEscape}
            centered
            destroyOnHidden
        >
            {children}
        </AntModal>
    );
};
