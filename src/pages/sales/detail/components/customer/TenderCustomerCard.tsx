import { useId, useState, type ReactNode } from 'react';

import { ChevronDown } from '@/components/icons/antIconCompat';
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
    <div className="ofi-quote-detail-field">
        <span className={`${QUOTE_LABEL_CLASS} ofi-quote-detail-label`}>{field.label}</span>
        <div className="min-w-0">
            {field.control ?? (
                <div className={QUOTE_READONLY_CLASS}>
                    <span className="min-w-0 py-1">{renderDetailLines(field.lines ?? [])}</span>
                </div>
            )}
        </div>
    </div>
);

// Section caption only — no glyph: the Apple-clean layout lets whitespace
// and the small uppercase caption separate the groups.
const TenderCardGroupBlock = ({ group }: { group: TenderCardGroup }) => {
    return (
        <section className="ofi-quote-detail-group" aria-label={group.title}>
            <h3 className="ofi-quote-detail-group-title">
                {group.title}
            </h3>
            <div className="ofi-quote-detail-fields">
                {group.fields.map((field) => (
                    <TenderCardFieldRow key={field.key} field={field} />
                ))}
            </div>
        </section>
    );
};

// Header block of the quote: one titled card holding every quote-level field,
// grouped into labelled bands (who / terms / where) instead of two undivided
// columns of label-value rows. Collapsing it hands the whole viewport to the
// line table; the choice is remembered.
export const TenderCustomerCard = ({ groups, summary }: TenderCustomerCardProps) => {
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const contentId = useId();

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
            className="ofi-tender-customer-card ofi-quote-card relative z-10 mb-2 overflow-hidden rounded-lg border border-[#e6e8eb] bg-white"
            data-collapsed={collapsed}
        >
            <button
                type="button"
                onClick={toggle}
                aria-expanded={!collapsed}
                aria-controls={contentId}
                className="ofi-tender-card-toggle ofi-quote-card__head flex w-full items-center gap-2.5 border-b border-[#eef0f2] bg-white px-4 py-2 text-left transition-colors hover:bg-[#f8f9fb]"
            >
                <span className="ofi-quote-detail-title">
                    {t('tenders.customer_details')}
                </span>
                {summary && (
                    <span className="ofi-quote-detail-caption">{summary}</span>
                )}
                <span
                    title={collapsed ? t('tenders.section_expand') : t('tenders.section_collapse')}
                    className="ofi-quote-detail-chevron ml-auto flex shrink-0 items-center justify-center"
                >
                    <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
                    />
                </span>
            </button>
            <div id={contentId} hidden={collapsed}>
                {!collapsed && <div className="ofi-quote-detail-groups">
                    {groups.map((group) => (
                        <TenderCardGroupBlock
                            key={group.key}
                            group={group}
                        />
                    ))}
                </div>}
            </div>
        </section>
    );
};
