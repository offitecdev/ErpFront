import React, { useEffect, useRef, useState } from 'react';

import { hrefFor } from '../../lib/navLink';
import { useAuthStore } from '../../store/authStore';
import { SPLIT_PANE_WINDOW_NAME } from './SplitViewContext';

type PrimaryPaneProps = {
    path: string;
    onLocationChange: (path: string) => void;
};

/**
 * The primary (left) side of split view.
 *
 * Like the secondary pane, this page runs in its own same-origin iframe. That
 * gives it a viewport equal to the pane width, so viewport-based Tailwind and
 * Ant Design breakpoints react to a half-laptop screen instead of the full
 * browser window.
 */
export const PrimaryPane: React.FC<PrimaryPaneProps> = ({ path, onLocationChange }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
    const [loadedPaneKey, setLoadedPaneKey] = useState<string | null>(null);

    const paneKey = `${path}|${selectedTenantId || ''}`;
    const paneReady = loadedPaneKey === paneKey;

    // Keep the parent aware of navigation performed inside the left pane. This
    // lets swapping or closing split view retain the page currently on screen.
    useEffect(() => {
        const id = window.setInterval(() => {
            const win = iframeRef.current?.contentWindow;
            if (!win) return;
            try {
                const location = win.location;
                const current = location.protocol === 'file:'
                    ? (location.hash ? location.hash.slice(1) : '/')
                    : `${location.pathname}${location.search}`;
                if (current) onLocationChange(current);
            } catch {
                // Ignore location reads while the pane is outside this origin.
            }
        }, 700);

        return () => window.clearInterval(id);
    }, [onLocationChange]);

    return (
        <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#f6f8fb]">
            {!paneReady && (
                <div className="absolute inset-0 z-10 animate-pulse space-y-4 bg-[#f6f8fb] p-4">
                    <div className="h-7 w-52 rounded bg-slate-200 dark:bg-white/10" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="h-24 rounded-md border border-slate-100 bg-white dark:border-white/8 dark:bg-white/5" />
                        <div className="h-24 rounded-md border border-slate-100 bg-white dark:border-white/8 dark:bg-white/5" />
                    </div>
                    <div className="h-64 rounded-md border border-slate-100 bg-white dark:border-white/8 dark:bg-white/5" />
                </div>
            )}

            <iframe
                key={paneKey}
                ref={iframeRef}
                name={SPLIT_PANE_WINDOW_NAME}
                src={hrefFor(path)}
                title="Primary split pane"
                onLoad={() => setLoadedPaneKey(paneKey)}
                className="block h-full w-full border-0 bg-[#f6f8fb]"
            />
        </div>
    );
};
