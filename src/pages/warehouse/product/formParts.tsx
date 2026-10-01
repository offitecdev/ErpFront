import type { ReactNode } from 'react';

import { t } from '@/i18n/translate';

/* ── Bausteine der gruppierten Tafeln (Systemeinstellungen) ─────────────── */

export const Group = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="ofi-wh-group">
        <h2 className="ofi-wh-group__title">{title}</h2>
        <div className="ofi-wh-group__box">{children}</div>
    </section>
);

export const Row = ({
    label,
    htmlFor,
    required,
    hint,
    error,
    top,
    children,
}: {
    label?: string;
    htmlFor?: string;
    required?: boolean;
    hint?: string;
    error?: string | null;
    top?: boolean;
    children: ReactNode;
}) => (
    <div className={`ofi-wh-row ${top ? 'is-top' : ''} ${label ? '' : 'is-block'}`}>
        {label && (
            <label className="ofi-wh-row__label" htmlFor={htmlFor}>
                {label}
                {required && <b aria-label={t('warehouse.fields.required')}>*</b>}
            </label>
        )}
        <div className="ofi-wh-row__control">
            {children}
            {error ? <span className="ofi-wh-row__hint is-error" role="alert">{error}</span> : hint ? <span className="ofi-wh-row__hint">{hint}</span> : null}
        </div>
    </div>
);
