import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * Alttan yükselen büyük sayfa (sheet) — Raporlar popup kabuğuyla aynı global
 * `ofi-sheet` / `ofi-sheet-up` animasyon sınıflarını kullanır. Boyut görünümler
 * arasında değişmez; içerik içeride kayar (`ofi-slide-in-right/left`).
 */
export const BottomSheet = ({
    open,
    title,
    subtitle,
    onBack,
    onClose,
    headerActions,
    footer,
    width = 900,
    height = 720,
    zIndex = 80,
    children,
}: {
    open: boolean;
    title: ReactNode;
    subtitle?: ReactNode;
    onBack?: () => void;
    onClose: () => void;
    headerActions?: ReactNode;
    footer?: ReactNode;
    width?: number;
    height?: number;
    zIndex?: number;
    children: ReactNode;
}) => {
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 flex items-end justify-center px-3" style={{ zIndex }}>
            {/* Arka plan tıklamayla kapanmaz — kazara veri kaybını önler. */}
            <div className="ofi-sheet-backdrop absolute inset-0" aria-hidden />
            <section
                role="dialog"
                aria-modal="true"
                className="ofi-sheet ofi-sheet-up relative flex w-full flex-col overflow-hidden rounded-t-2xl"
                style={{ maxWidth: width, height: `min(${height}px, 92vh)` }}
            >
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                    <div className="flex min-w-0 items-center gap-2">
                        {onBack && (
                            <button
                                type="button"
                                aria-label={t('common.back')}
                                title={t('common.back')}
                                onClick={onBack}
                                className="ofi-rs-nav flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
                            >
                                <ArrowLeft size={15} />
                            </button>
                        )}
                        <div className="min-w-0">
                            <h2 className="truncate text-[14px] font-bold text-slate-900 dark:text-white">{title}</h2>
                            {subtitle && <div className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-white/60">{subtitle}</div>}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {headerActions}
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={onClose}
                            className="ofi-rs-nav flex size-8 items-center justify-center rounded-md transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </header>

                <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
                    {children}
                </div>

                {footer && (
                    <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-2.5 dark:border-white/10">
                        {footer}
                    </footer>
                )}
            </section>
        </div>,
        document.body,
    );
};
