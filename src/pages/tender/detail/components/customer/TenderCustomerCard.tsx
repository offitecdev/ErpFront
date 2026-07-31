import { useState, type ReactNode } from 'react';

import { ChevronDown, User01 as User } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { QUOTE_LABEL_CLASS, QUOTE_READONLY_CLASS } from '../../utils/quoteField.constants';
import { renderDetailLines } from '../info/TenderDetailInfoRows';

export type TenderCardField = {
    /** Stable key — labels change with the address-type toggle. */
    key: string;
    label: ReactNode;
    /** The editable control; `lines` is the read-only fallback when absent. */
    control?: ReactNode;
    lines?: Array<string | null | undefined>;
};

export type TenderCardGroup = {
    key: string;
    /** Group caption, e.g. "Customer" / "Addresses". */
    title: string;
    fields: TenderCardField[];
};

type TenderCustomerCardProps = {
    groups: TenderCardGroup[];
    /** Shown next to the title as a quick read of who the quote is for. */
    summary?: string;
};

const COLLAPSE_KEY = 'offitec:tender-detail:customer-card-collapsed';

const readCollapsed = (): boolean => {
    try {
        return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
        return false;
    }
};

// One key/value row: the label sits in a fixed left column and the control in
// the right one, so every field in a group lines up on the same two edges.
const TenderCardFieldRow = ({ field }: { field: TenderCardField }) => (
    <div className="grid min-w-0 grid-cols-[104px_minmax(0,1fr)] items-start gap-2.5 border-b border-slate-100 py-1.5 last:border-b-0">
        <span className={`${QUOTE_LABEL_CLASS} pt-2`}>{field.label}</span>
        <div className="min-w-0">
            {field.control ?? (
                <div className={QUOTE_READONLY_CLASS}>
                    <span className="min-w-0 py-1">{renderDetailLines(field.lines ?? [])}</span>
                </div>
            )}
        </div>
    </div>
);

const TenderCardGroupBlock = ({ group, className }: { group: TenderCardGroup; className: string }) => (
    <div className={`min-w-0 px-3 py-2 ${className}`}>
        <span className="mb-1.5 block text-[12px] font-semibold text-[#1f2654]">
            {group.title}
        </span>
        {group.fields.map((field) => (
            <TenderCardFieldRow key={field.key} field={field} />
        ))}
    </div>
);

// Header block of the quote: one titled card holding every quote-level field,
// grouped into labelled bands (who / terms / where) instead of two undivided
// columns of label-value rows. Collapsing it hands the whole viewport to the
// line table; the choice is remembered.
export const TenderCustomerCard = ({ groups, summary }: TenderCustomerCardProps) => {
    const [collapsed, setCollapsed] = useState(readCollapsed);

    const toggle = () => {
        setCollapsed((current) => {
            const next = !current;
            try {
                localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
            } catch {
                /* persistence is best-effort */
            }
            return next;
        });
    };

    return (
        <section
            data-ui-card
            className="relative z-10 mb-2 overflow-hidden rounded-[2px] border border-slate-300 bg-white"
        >
            <button
                type="button"
                onClick={toggle}
                aria-expanded={!collapsed}
                className="flex w-full items-center gap-2.5 border-b border-slate-200 bg-[#f1f5fd] px-3 py-1.5 text-left transition-colors hover:bg-[#e9effb]"
            >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-[2px] bg-[#1f2654] text-white">
                    <User size={12} />
                </span>
                <span className="text-[13px] font-semibold tracking-[0.01em] text-[#1f2654]">
                    {t('tenders.customer_details')}
                </span>
                {/* Collapsed, the card still has to answer "whose quote is this?" */}
                {collapsed && summary && (
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600">{summary}</span>
                )}
                <span
                    title={collapsed ? t('tenders.section_expand') : t('tenders.section_collapse')}
                    className={`flex h-5 w-5 items-center justify-center rounded-[2px] text-slate-400 transition-colors hover:bg-slate-200 hover:text-[#1f2654] ${collapsed && summary ? '' : 'ml-auto'}`}
                >
                    <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
                    />
                </span>
            </button>
            {/* Three columns side by side — customer, terms, addresses — each a
                stack of key/value rows. Two columns at `lg`, one continuous list
                below that. */}
            {!collapsed && (
                <div className="grid md:grid-cols-2 lg:grid-cols-3">
                    {groups.map((group, index) => (
                        <TenderCardGroupBlock
                            key={group.key}
                            group={group}
                            className={index > 0 ? 'border-t border-slate-200 md:border-l lg:border-t-0' : ''}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};
