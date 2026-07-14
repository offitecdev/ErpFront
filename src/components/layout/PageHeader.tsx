import React from 'react';

// Tüm "Stok" alt modüllerinde ortak, küçük ve sade başlık: marka renginde,
// altı çizili değil, tıklanamaz. Aynı biçim ve konumlandırma her sayfada kullanılır.
export const StockModuleHeader: React.FC<{ label: React.ReactNode; actions?: React.ReactNode }> = ({ label, actions }) => (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200/60 pb-2.5">
        <span className="text-[12px] font-semibold tracking-tight" style={{ color: '#272f67' }}>
            {label}
        </span>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
);

interface PageHeaderProps {
    title: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    breadcrumb?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    description,
    actions,
    breadcrumb,
}) => {
    return (
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-4 border-b border-slate-200/60">
            <div className="min-w-0">
                {breadcrumb && (
                    <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                        {breadcrumb}
                    </p>
                )}
                <h1 className="text-[20px] font-semibold text-slate-900 tracking-tight truncate">
                    {title}
                </h1>
                {description && (
                    <div className="text-[13px] text-slate-500 mt-1">{description}</div>
                )}
            </div>
            {actions && (
                <div className="flex items-center gap-2 flex-shrink-0">
                    {actions}
                </div>
            )}
        </div>
    );
};
