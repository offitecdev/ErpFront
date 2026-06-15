import React from 'react';
import { Drawer } from 'antd';

interface SlidePanelProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    children: React.ReactNode;
    width?: string | number;
}

export const SlidePanel: React.FC<SlidePanelProps> = ({
    open,
    onClose,
    title,
    subtitle,
    children,
    width = 520,
}) => {
    const numericWidth = typeof width === 'string'
        ? (width.match(/\d+/)?.[0] ? parseInt(width.match(/\d+/)![0], 10) : 520)
        : width;

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={
                <div>
                    {title && <div className="text-lg font-semibold text-primary">{title}</div>}
                    {subtitle && <p className="mt-1 text-sm text-tertiary font-normal">{subtitle}</p>}
                </div>
            }
            width={numericWidth}
            maskClosable
            keyboard
            styles={{
                header: { borderBottom: '1px solid #f1f5f9', padding: '20px 24px' },
                body: { padding: '20px 24px' },
            }}
        >
            {children}
        </Drawer>
    );
};
