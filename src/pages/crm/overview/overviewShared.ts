import dayjs from 'dayjs';
import type { TenderListItem } from '../../../types/tender';
import type { SalesOrderDto } from '../../../lib/api/project';
import type { CurrencyCode } from '../../../utils/currency';

/* ── Filter state shared by every overview widget ──
   The reporting period is always the current month (the month/year picker was
   deliberately removed); only user, role and currency remain filterable. */
export interface OverviewFilters {
    /** Empty string = every user. */
    userId: string;
    /** Empty string = every role. */
    role: string;
    /** Display currency every monetary figure is converted into. */
    currency: CurrencyCode;
}

export interface EmployeeLite {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    roleName?: string | null;
    title?: string | null;
}

export const employeeName = (e?: { firstName?: string | null; lastName?: string | null } | null) =>
    e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() : '';

export const periodRange = () => {
    const start = dayjs().startOf('month');
    return { start, end: start.endOf('month') };
};

/* ── Offer pipeline helpers ──
   The business model knows only two terminal shapes: an offer is a DRAFT until
   an order is created from it. "sent" refines draft by whether the offer mail
   went out; "ordered" means a sales order exists for the tender (or the legacy
   accepted/exported markers are set). There is no separate "accepted" status. */
export type OfferStage = 'draft' | 'sent' | 'ordered';

/** Tender ids that already have a sales order — derive once from the order list. */
export const orderedTenderIds = (orders: SalesOrderDto[]): Set<string> =>
    new Set(orders.map((o) => o.tenderId).filter(Boolean) as string[]);

export const offerStage = (t: TenderListItem, ordered: Set<string>): OfferStage => {
    if (ordered.has(t.id) || t.offerAcceptedAt || t.status === 'Exported') return 'ordered';
    if (t.offerMailSentAt) return 'sent';
    return 'draft';
};

export const isOfferOpen = (t: TenderListItem, ordered: Set<string>) =>
    offerStage(t, ordered) !== 'ordered';

/* Estimated-sales weights per stage — surfaced verbatim in the KPI's "i"
   explanation, so keep the tooltip copy in sync when changing them. */
export const STAGE_WEIGHTS: Record<Exclude<OfferStage, 'ordered'>, number> = {
    draft: 0.25,
    sent: 0.5,
};

export const estimatedValueOf = (t: TenderListItem, ordered: Set<string>): number => {
    const stage = offerStage(t, ordered);
    if (stage === 'ordered') return 0;
    return (t.grandTotal || 0) * STAGE_WEIGHTS[stage];
};

/** Days until the offer's validity runs out; negative = already expired. */
export const daysUntilExpiry = (t: TenderListItem): number | null =>
    t.validUntil ? dayjs(t.validUntil).startOf('day').diff(dayjs().startOf('day'), 'day') : null;

export const APPROACHING_DEADLINE_DAYS = 7;
export const STALE_DRAFT_MAIL_DAYS = 10;

export type CriticalReason = 'expiring' | 'notConverted' | 'staleDraftMail';

export interface CriticalOffer {
    tender: TenderListItem;
    reason: CriticalReason;
    /** Sortable urgency; lower = more urgent. */
    rank: number;
}

/** The three "critical label" rules of the priority panel. */
export const criticalOffers = (tenders: TenderListItem[], orders: SalesOrderDto[]): CriticalOffer[] => {
    const ordered = orderedTenderIds(orders);
    const out: CriticalOffer[] = [];
    for (const tender of tenders) {
        const days = daysUntilExpiry(tender);
        const open = isOfferOpen(tender, ordered);
        if (open && days !== null && days <= APPROACHING_DEADLINE_DAYS) {
            out.push({ tender, reason: 'expiring', rank: days });
            continue;
        }
        // Internally approved but never turned into an order.
        if (tender.status === 'Approved' && open) {
            out.push({ tender, reason: 'notConverted', rank: 50 - dayjs().diff(dayjs(tender.createdAt), 'day') });
            continue;
        }
        if (
            open &&
            tender.status === 'Draft' &&
            tender.offerMailSentAt &&
            dayjs().diff(dayjs(tender.offerMailSentAt), 'day') >= STALE_DRAFT_MAIL_DAYS
        ) {
            out.push({ tender, reason: 'staleDraftMail', rank: 100 - dayjs().diff(dayjs(tender.offerMailSentAt), 'day') });
        }
    }
    return out.sort((a, b) => a.rank - b.rank);
};

/* ── Locally pinned "important" offers ──
   Pinning is a personal view preference, so it lives in localStorage, scoped
   per browser profile. (Meetings/tasks are backend MeetingActivity rows.) */
const IMPORTANT_KEY = 'crmOverview.importantOffers.v1';

export const loadImportantOfferIds = (): string[] => {
    try {
        const raw = localStorage.getItem(IMPORTANT_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
        return [];
    }
};

export const saveImportantOfferIds = (ids: string[]) => {
    try {
        localStorage.setItem(IMPORTANT_KEY, JSON.stringify(ids));
    } catch {
        /* storage full / unavailable — pinning is best-effort */
    }
};

