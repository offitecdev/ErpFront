import type React from 'react';

export const ContactRow = ({ icon, value, href }: { icon: React.ReactNode; value?: string | null; href?: string }) => {
    if (!value) {
        return (
            <div className="flex items-center gap-2 text-slate-300">
                <span className="shrink-0">{icon}</span>
                <span>-</span>
            </div>
        );
    }
    const content = (
        <>
            <span className="shrink-0 text-slate-400">{icon}</span>
            <span className="truncate">{value}</span>
        </>
    );
    return href ? (
        <a href={href} className="flex items-center gap-2 text-slate-700 transition-colors hover:text-[#272f67]">{content}</a>
    ) : (
        <div className="flex items-center gap-2 text-slate-700">{content}</div>
    );
};
