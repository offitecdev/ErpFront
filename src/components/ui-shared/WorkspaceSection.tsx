import type { ReactNode } from 'react';
import '@/styles/workspaceSection.css';

/** A normal page section: no portal, backdrop, focus trap or modal state. */
export const WorkspaceSection = ({ open = true, title, subtitle, icon, children, footer }: {
    open?: boolean;
    title: ReactNode;
    subtitle?: ReactNode;
    icon?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
}) => open ? (
    <section className="ofi-workspace-section">
        <header className="ofi-workspace-section__head">
            {icon && <span aria-hidden="true">{icon}</span>}
            <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        </header>
        <div className="ofi-workspace-section__body">{children}</div>
        {footer && <footer className="ofi-workspace-section__foot">{footer}</footer>}
    </section>
) : null;
