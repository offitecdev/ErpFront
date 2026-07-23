import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    ChevronSelectorVertical,
    Columns02,
    SwitchHorizontal01 as SwapIcon,
    XClose as CloseIcon,
} from '@/components/icons/antIconCompat';
import {
    useSplitView,
    SPLITABLE_ROUTES,
    SPLIT_PANE_WINDOW_NAME,
    normalizeSplitPath,
} from './SplitViewContext';
import { hrefFor } from '../../lib/navLink';
import { useAuthStore } from '../../store/authStore';

type SecondaryPaneProps = {
    onClose?: () => void;
    onOpenFullPage?: (path: string) => void;
};

/**
 * The secondary (right) screen of dual-screen mode, rendered as a same-origin
 * iframe running the app in a bare "pane" shell (MainLayout detects the iframe
 * by its window.name and drops the header/sidebar).
 *
 * Why an iframe: the pages are built on viewport breakpoints (Tailwind `lg:`,
 * antd responsive checks). Inside an iframe the viewport IS the pane, so every
 * page's own responsive layout kicks in naturally — no forced minimum widths,
 * no pane-level horizontal scrolling, and navigation that starts in the pane
 * stays in the pane because it is a real, independent browsing context.
 */
export const SecondaryPane: React.FC<SecondaryPaneProps> = ({ onClose, onOpenFullPage }) => {
    const { t } = useTranslation();
    const { secondaryPath, secondaryCurrentPath, secondaryNonce, reportSecondaryLocation, exitSplit } = useSplitView();
    // SecondaryPane lives in the main window — this is the MAIN router's
    // navigate, exactly what "open full page" needs.
    const navigate = useNavigate();
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [loadedPaneKey, setLoadedPaneKey] = useState<string | null>(null);

    const paneKey = `${secondaryNonce}|${secondaryPath || ''}|${selectedTenantId || ''}`;
    const paneReady = loadedPaneKey === paneKey;

    // Follow the pane's internal navigation (same-origin read) so swap and
    // "open full page" track the page actually on screen, not just the one the
    // pane was opened with.
    useEffect(() => {
        if (!secondaryPath) return;
        const id = window.setInterval(() => {
            const win = iframeRef.current?.contentWindow;
            if (!win) return;
            try {
                const loc = win.location;
                const current = loc.protocol === 'file:'
                    ? (loc.hash ? loc.hash.slice(1) : '/')
                    : `${loc.pathname}${loc.search}`;
                if (current) reportSecondaryLocation(current);
            } catch {
                // Only reachable if the pane somehow left the origin — ignore.
            }
        }, 700);
        return () => window.clearInterval(id);
    }, [secondaryPath, reportSecondaryLocation]);

    // Mode is armed but no page picked yet — guide the user: how to fill the
    // right side, how to swap the two screens, and how to resize them.
    if (!secondaryPath) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-white px-8 text-center dark:bg-[#151616]">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-white/70">
                    <Columns02 size={22} />
                </div>
                <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    {t('nav.splitEmptyTitle')}
                </p>
                <p className="max-w-[280px] text-[12.5px] text-slate-500 dark:text-white/60">
                    {t('nav.splitEmptyHint')}
                </p>

                <div className="mt-2 flex max-w-[320px] flex-col gap-2.5 rounded-xl bg-slate-50 p-3.5 text-left dark:bg-white/5">
                    <div className="flex items-start gap-2.5">
                        <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 dark:border-white/15 dark:bg-white/8 dark:text-white/70">
                            <SwapIcon size={12} />
                        </span>
                        <p className="text-[12px] leading-5 text-slate-600 dark:text-white/65">
                            {t('nav.splitSwapHint')}
                        </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                        <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 dark:border-white/15 dark:bg-white/8 dark:text-white/70">
                            <ChevronSelectorVertical size={12} className="rotate-90" />
                        </span>
                        <p className="text-[12px] leading-5 text-slate-600 dark:text-white/65">
                            {t('nav.splitResizeHint')}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const shownPath = secondaryCurrentPath || secondaryPath;
    const route = SPLITABLE_ROUTES.find((r) => r.path === normalizeSplitPath(shownPath))
        || SPLITABLE_ROUTES.find((r) => r.path === normalizeSplitPath(secondaryPath));
    const paneTitle = route ? t(route.label) : shownPath;

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#151616]">
            {/* Header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-slate-200/70 bg-slate-50/60 flex-shrink-0 dark:border-white/10 dark:bg-white/4">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                    <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-white/90">
                        {paneTitle}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const target = shownPath;
                            if (onOpenFullPage) onOpenFullPage(target);
                            else {
                                exitSplit();
                                navigate(target);
                            }
                        }}
                        className="text-[11px] font-medium text-slate-400 hover:text-sky-600 transition-colors dark:text-white/50 dark:hover:text-white"
                    >
                        {t('nav.openFullPage')}
                    </button>
                    <button
                        onClick={onClose || exitSplit}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-200/60 text-slate-500 hover:text-slate-700 transition-colors dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                        title={t('nav.closeSplitView')}
                        aria-label={t('nav.closeSplitView')}
                    >
                        <CloseIcon size={14} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="relative min-h-0 flex-1">
                {!paneReady && (
                    <div className="absolute inset-0 z-10 animate-pulse space-y-4 bg-white p-5 dark:bg-[#151616]">
                        <div className="h-5 w-48 rounded bg-slate-200 dark:bg-white/10" />
                        <div className="grid grid-cols-2 gap-3">
                            <div className="h-20 rounded-md border border-slate-100 bg-slate-50 dark:border-white/8 dark:bg-white/5" />
                            <div className="h-20 rounded-md border border-slate-100 bg-slate-50 dark:border-white/8 dark:bg-white/5" />
                        </div>
                        <div className="h-60 rounded-md border border-slate-100 bg-slate-50 dark:border-white/8 dark:bg-white/5" />
                    </div>
                )}
                <iframe
                    key={paneKey}
                    ref={iframeRef}
                    name={SPLIT_PANE_WINDOW_NAME}
                    src={hrefFor(secondaryPath)}
                    title={paneTitle}
                    onLoad={() => {
                        setLoadedPaneKey(paneKey);
                        // Hand keyboard focus to the pane so arrow keys and other
                        // shortcuts work in it right away, without a click first.
                        try { iframeRef.current?.contentWindow?.focus(); } catch { /* noop */ }
                    }}
                    className="block h-full w-full border-0 bg-white dark:bg-[#151616]"
                />
            </div>
        </div>
    );
};
