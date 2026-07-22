import { memo } from 'react';

// Initials avatar in the app-wide style (same chrome as the MainLayout profile
// avatar). There are no stored profile photos, so initials are the identity.
export const InitialsAvatar = memo(({
    name,
    size = 28,
    className = '',
}: {
    name?: string | null;
    size?: number;
    className?: string;
}) => {
    const initials = (name || '')
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0))
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
    return (
        <span
            title={name || undefined}
            style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
            className={`flex shrink-0 select-none items-center justify-center rounded-full bg-[#272f67] font-semibold text-white ring-2 ring-[#d3e3fd] dark:ring-white/20 ${className}`}
        >
            {initials || '?'}
        </span>
    );
});
