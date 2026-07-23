import React from 'react';
import { useTranslation } from 'react-i18next';
import { Columns02 } from '../icons/antIconCompat';
import { useSplitView } from './SplitViewContext';

type SplitViewToggleProps = {
    /** Called when the mode is armed — the host collapses the side menu. */
    onEnter?: () => void;
    onExit?: () => void;
    className?: string;
};

/**
 * Dual-screen toggle — lives in the header brand cluster, in the spot the
 * search icon used to occupy. Arming it keeps the current page as the primary
 * (left) pane; the next page picked from the side menu opens on the right.
 * Turning it off restores the single-page view (the left page remains).
 */
export const SplitViewToggle: React.FC<SplitViewToggleProps> = ({ onEnter, onExit, className = '' }) => {
    const { t } = useTranslation();
    const { splitMode, enterSplit, exitSplit } = useSplitView();

    return (
        <button
            type="button"
            aria-pressed={splitMode}
            aria-label={splitMode ? t('nav.closeSplitView') : t('nav.splitView')}
            title={splitMode ? t('nav.closeSplitView') : t('nav.splitView')}
            onClick={() => {
                if (splitMode) {
                    if (onExit) onExit();
                    else exitSplit();
                } else {
                    enterSplit();
                    onEnter?.();
                }
            }}
            className={`flex items-center justify-center rounded-full transition-colors ${splitMode
                ? 'bg-[#272f67] text-white shadow-sm'
                : 'text-slate-700 hover:bg-[#d3e3fd] dark:text-white/80 dark:hover:bg-white/12 dark:hover:text-white'
                } ${className}`}
        >
            <Columns02 size={17} />
        </button>
    );
};

export default SplitViewToggle;
