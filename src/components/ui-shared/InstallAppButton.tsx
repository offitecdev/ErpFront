import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadCloud02 } from '../icons/antIconCompat';
import { useInstallPrompt } from '@/lib/pwa/installPrompt';

/**
 * Opens the browser's own "install app" dialog, which adds Offitec to the
 * computer (Start menu / dock) and launches it in its own window.
 *
 * Renders nothing unless the browser reported the app as installable, so it is
 * automatically absent in the installed app, in Safari/Firefox and in the
 * Electron desktop build.
 */
export const InstallAppButton: React.FC<{ variant?: 'pill' | 'menu'; className?: string }> = ({
    variant = 'pill',
    className = '',
}) => {
    const { t } = useTranslation();
    const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
    const [isPrompting, setIsPrompting] = useState(false);

    if (!canInstall || isInstalled) return null;

    const handleClick = async () => {
        setIsPrompting(true);
        try {
            const outcome = await promptInstall();
            if (outcome === 'accepted') {
                const { toast } = await import('sonner');
                toast.success(t('pwa.installed'));
            }
        } finally {
            setIsPrompting(false);
        }
    };

    const label = t('pwa.install');
    const styles =
        variant === 'menu'
            ? 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-brand-primary_alt hover:text-brand-secondary disabled:opacity-60'
            : 'inline-flex h-9 items-center gap-2 rounded-full border border-black/10 bg-black/[0.02] px-3 text-[13px] font-semibold text-[#0f172a] transition-colors hover:bg-black/[0.05] disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10';

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={isPrompting}
            title={t('pwa.installHint')}
            aria-label={label}
            className={`${styles} ${className}`}
        >
            <DownloadCloud02
                size={variant === 'menu' ? 13 : 16}
                className={variant === 'menu' ? 'text-slate-400' : undefined}
            />
            {variant === 'menu' ? label : <span className="hidden sm:inline">{label}</span>}
        </button>
    );
};
