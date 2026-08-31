import React from 'react';
import Modal from 'antd/es/modal';
import Spin from 'antd/es/spin';

interface BlockingDialogProps {
    open: boolean;
    title: string;
    description?: string;
}

export const BlockingDialog: React.FC<BlockingDialogProps> = ({ open, title, description }) => {
    return (
        <Modal open={open} centered footer={null} closable={false} mask={{ closable: false }} keyboard={false} width={448} rootClassName="ofi-compact-modal">
            <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary_alt">
                    <Spin size="small" />
                </div>
                <div className="min-w-0 flex-1">
                    {/* Grundschrift: ein Fenstertitel der Anwendung ist klein
                        und halbfett, wie im Kalender — keine zweite Schrift. */}
                    <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
                    {description && <p className="mt-1.5 text-sm leading-relaxed text-tertiary">{description}</p>}
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-solid" />
                    </div>
                </div>
            </div>
        </Modal>
    );
};
