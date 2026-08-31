import { useEffect, useState } from 'react';

import { t } from '@/i18n/translate';
import { apiClient } from '@/lib/axios';
import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleQuickPick } from '@/types/inventory';
import { ComboCell } from '@/pages/inventory/components/ComboCell';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';

import { articlePrice } from '../invoiceShared';

/**
 * ── ZWEI SUCHFELDER DER DIREKTRECHNUNG ───────────────────────────────────────
 *
 * Beide sind dasselbe Feld wie im Angebot: man tippt HINEIN, darunter klappt
 * eine kurze Trefferliste auf. Wird nichts gewählt, bleibt das Getippte stehen
 * — genau das ist der Weg „von Hand erfassen": eine Position ohne Katalogeintrag
 * und ein Empfänger, der (noch) kein Kunde ist, sind beide erlaubt.
 */

const LOOKUP_SIZE = 7;

const fmtPrice = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);

/** Produktsuche der Positionszeile — der schlanke Angebots-Feed (id, Name, Einheit, Preis). */
export const ArticleLineCell = ({
    value,
    onChange,
    onPick,
    autoFocus,
}: {
    value: string;
    onChange: (next: string) => void;
    onPick: (article: ArticleQuickPick) => void;
    autoFocus?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<ArticleQuickPick[]>([]);
    const [loading, setLoading] = useState(false);
    const query = useDebouncedValue(value, 250);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        inventoryApi
            .articlesQuickPick({ page: 1, pageSize: LOOKUP_SIZE, search: query.trim() || undefined })
            .then((result) => { if (!cancelled) setItems(result.items); })
            .catch(() => { if (!cancelled) setItems([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, query]);

    return (
        <ComboCell
            open={open}
            onOpenChange={setOpen}
            value={value}
            onChange={onChange}
            loading={loading}
            options={items.map((article) => ({
                id: article.id,
                label: article.name,
                meta: `${fmtPrice(articlePrice(article))} / ${article.unit}`,
            }))}
            onSelect={(option) => {
                const article = items.find((item) => item.id === option.id);
                if (article) onPick(article);
            }}
            autoFocus={autoFocus}
            placeholder={t('invoices.descriptionPlaceholder')}
            emptyText={t('invoices.productEmpty')}
            // KEINE gestrichelte Kante: eine handgetippte Position ist auf einer
            // Direktrechnung der Normalfall, kein unfertiger Datensatz — die
            // Markierung des Lagereditors wäre hier eine falsche Warnung.
            invalid={false}
            listWidth={340}
        />
    );
};

/** Ein Kunde, so weit ihn der Empfängerblock braucht. */
export interface CustomerPick {
    id: string;
    companyName: string;
    address?: string | null;
    addressSupplement?: string | null;
    postalCode?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
}

/**
 * Empfängersuche — derselbe Feed, aus dem die Angebots- und Sendungsmasken
 * ihre Kunden holen (`GET /customers` OHNE `fields=list`, weil der Block die
 * Adressbestandteile braucht).
 */
export const CustomerPickCell = ({
    value,
    onChange,
    onPick,
}: {
    value: string;
    onChange: (next: string) => void;
    onPick: (customer: CustomerPick) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<CustomerPick[]>([]);
    const [loading, setLoading] = useState(false);
    const query = useDebouncedValue(value, 250);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        const params = new URLSearchParams({ page: '1', pageSize: String(LOOKUP_SIZE) });
        if (query.trim()) params.set('search', query.trim());
        apiClient
            .get(`/customers?${params.toString()}`)
            .then((response) => {
                if (cancelled) return;
                const data = response.data;
                setItems(Array.isArray(data) ? data : (data?.items || []));
            })
            .catch(() => { if (!cancelled) setItems([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, query]);

    return (
        <ComboCell
            open={open}
            onOpenChange={setOpen}
            value={value}
            onChange={onChange}
            loading={loading}
            options={items.map((customer) => ({
                id: customer.id,
                label: customer.companyName,
                meta: [customer.postalCode, customer.city].filter(Boolean).join(' '),
            }))}
            onSelect={(option) => {
                const customer = items.find((item) => item.id === option.id);
                if (customer) onPick(customer);
            }}
            placeholder={t('invoices.recipientName')}
            emptyText={t('invoices.recipientPickNone')}
            invalid={false}
            listWidth={340}
        />
    );
};
