import { useCallback, useState } from 'react';

import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

// Persisted once the user dismisses the hint (or creates their first bullet), so
// the tip is only ever shown to a first-time user and never nags again.
const STORAGE_KEY = 'offitec:bullet-hint-dismissed';

const readDismissed = () => {
    if (typeof window === 'undefined') return true;
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

// One-time flag backing the bullet hint. Shared across every description editor
// so dismissing it in one place hides it everywhere.
export const useBulletHint = () => {
    const [dismissed, setDismissed] = useState(readDismissed);
    const dismiss = useCallback(() => {
        setDismissed(true);
        try {
            window.localStorage.setItem(STORAGE_KEY, '1');
        } catch {
            /* ignore quota / privacy-mode errors */
        }
    }, []);
    return { dismissed, dismiss };
};

// Small floating tip teaching the "type a hyphen and a space → bullet" shortcut.
// The dismiss button uses onMouseDown+preventDefault so clicking it never blurs
// the editor it floats over.
export const BulletHint = ({ onDismiss, className = '' }: { onDismiss: () => void; className?: string }) => (
    <div
        role="status"
        className={`pointer-events-auto inline-flex max-w-[240px] items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] leading-4 text-slate-600 shadow-md ${className}`}
    >
        <span>{t('common.bulletHint')}</span>
        <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onDismiss}
            aria-label={t('common.close')}
            className="flex size-4 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
            <X size={11} />
        </button>
    </div>
);
