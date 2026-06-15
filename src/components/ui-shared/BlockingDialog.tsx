import React from 'react';
import { Modal, Spin } from 'antd';

interface BlockingDialogProps {
    open: boolean;
    title: string;
    description?: string;
}

export const BlockingDialog: React.FC<BlockingDialogProps> = ({ open, title, description }) => {
    return (
        <Modal open={open} centered footer={null} closable={false} maskClosable={false} keyboard={false} width={448}>
            <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary_alt">
                    <Spin size="small" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-primary">{title}</h2>
                    {description && <p className="mt-1.5 text-sm leading-relaxed text-tertiary">{description}</p>}
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-solid" />
                    </div>
                </div>
            </div>
        </Modal>
    );
};
