import type React from 'react';

/**
 * One contact line inside the customer card: icon, then the value as a link
 * when it can be acted on. Painted from the popup tokens (`--ofi-cal-*`) — it
 * only ever renders inside {@link CustomerContactModal}.
 *
 * An empty value renders nothing: a card with two lines beats a card with a
 * dash standing in for the third.
 */
export const ContactRow = ({ icon, value, href }: { icon: React.ReactNode; value?: string | null; href?: string }) => {
    if (!value) return null;

    const content = (
        <>
            <span className="mt-0.5 shrink-0" style={{ color: 'var(--ofi-cal-muted)' }}>{icon}</span>
            <span className="min-w-0 whitespace-pre-line break-words">{value}</span>
        </>
    );

    return href ? (
        <a href={href} className="flex items-start gap-2.5 text-[13px] hover:underline" style={{ color: 'var(--ofi-cal-text)' }}>
            {content}
        </a>
    ) : (
        <div className="flex items-start gap-2.5 text-[13px]" style={{ color: 'var(--ofi-cal-text)' }}>{content}</div>
    );
};
