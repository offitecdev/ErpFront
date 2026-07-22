import React from 'react';
import { t } from '@/i18n/translate';

interface PaneErrorBoundaryProps {
    /** When this changes (new page picked, route change), a shown error resets. */
    resetKey?: string | number;
    children: React.ReactNode;
}

interface PaneErrorBoundaryState {
    error: Error | null;
}

/**
 * Contains a render crash to its own pane. Without this, a page that throws
 * while mounted in the split view (pages were written assuming a single,
 * full-width instance) unmounts the entire React tree — a blank app.
 */
export class PaneErrorBoundary extends React.Component<PaneErrorBoundaryProps, PaneErrorBoundaryState> {
    state: PaneErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): PaneErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error) {
        // eslint-disable-next-line no-console
        console.error('[PaneErrorBoundary]', error);
    }

    componentDidUpdate(prevProps: PaneErrorBoundaryProps) {
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                        {t('nav.paneError', { defaultValue: 'Bu sayfa yüklenirken bir sorun oluştu.' })}
                    </p>
                    <p className="max-w-[420px] break-words text-[12px] text-slate-500 dark:text-white/60">
                        {this.state.error.message}
                    </p>
                    <button
                        type="button"
                        onClick={() => this.setState({ error: null })}
                        className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[13px] font-semibold text-slate-700 shadow-xs transition-colors hover:bg-[#d3e3fd] hover:text-[#1f2654] dark:border-white/15 dark:bg-white/8 dark:text-white/85 dark:hover:bg-white/14"
                    >
                        {t('nav.paneErrorRetry', { defaultValue: 'Tekrar dene' })}
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default PaneErrorBoundary;
