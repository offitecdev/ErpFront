import React from 'react';

// Tüm "Stok" alt modüllerinde ortak, küçük ve sade başlık: marka renginde,
// altı çizili değil, tıklanamaz. Aynı biçim ve konumlandırma her sayfada kullanılır.
export const StockModuleHeader: React.FC<{ label: React.ReactNode; actions?: React.ReactNode }> = ({ label, actions }) => (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200/60 pb-2.5">
        <span className="text-[14px] font-semibold tracking-tight" style={{ color: '#272f67' }}>
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
        // `flex-wrap` + shrinkable actions: in a narrow column (split view, small
        // laptops) the action buttons wrap onto their own line instead of
        // overflowing the column and becoming unreachable.
        // `ofi-rise`: der Kopf steigt beim Öffnen kurz auf — dieselbe Bewegung
        // wie das Anmeldeformular (styles/refine.css).
        <div className="ofi-rise mb-5 flex flex-col sm:flex-row sm:flex-wrap sm:items-end sm:justify-between gap-3 pb-4 border-b border-slate-200/60">
            <div className="min-w-0 flex-1 basis-[220px]">
                {breadcrumb && (
                    <p className="text-[14px] font-medium text-slate-500 uppercase tracking-wider mb-1">
                        {breadcrumb}
                    </p>
                )}
                {/* Seitentitel in der Titelschrift des Programms
                    (`.ofi-serif` aus styles/refine.css — Open Sans). */}
                <h1 className="ofi-serif text-[21px] font-semibold text-slate-900 tracking-tight truncate">
                    {title}
                </h1>
                {description && (
                    <div className="text-[14px] text-slate-500 mt-1">{description}</div>
                )}
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {actions}
                </div>
            )}
        </div>
    );
};
