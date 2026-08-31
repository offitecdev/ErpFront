import type React from 'react';

/**
 * The chrome of every box on the project overview — Google-clean since
 * 19.08.2026: a white surface, ONE grey hairline, a quiet 13px title and no
 * filled header strip. It paints from the `--ofi-cal-*` tokens (see the
 * `.ofi-prj-*` block in index.css), so dark mode is a variable swap.
 *
 * It replaces the shared `TableKit` card on this screen only: that one draws a
 * tinted header band and a ruled table, which is right for a working list and
 * too loud for a summary read at a glance.
 */
export const OverviewCard = ({ title, action, children }: {
    title?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
}) => (
    <section className="ofi-prj-card">
        {(title || action) && (
            <header className="ofi-prj-card__head">
                {title ? <span className="ofi-prj-card__title">{title}</span> : <span />}
                {action}
            </header>
        )}
        <div className="ofi-prj-card__body">
            <div className="ofi-prj-card__scroll">{children}</div>
        </div>
    </section>
);
