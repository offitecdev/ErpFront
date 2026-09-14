import type { ReactNode } from 'react';

/* Eine Tafel je Art der Freigabe; die Karten stehen darin durch Haarlinien getrennt. */
export const ApprovalSection = ({ title, count, children }: { title: string; count: number; children: ReactNode }) => (
    <section className="ofi-gv-panel ofi-gv-approvals-section" aria-label={title}>
        <header className="ofi-gv-panel__head">
            <span>{title}</span>
            <span className="ofi-gv-count">{count}</span>
        </header>
        <div className="ofi-gv-approvals-section__list">{children}</div>
    </section>
);
