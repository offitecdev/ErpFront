import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Check, ChevronSelectorVertical } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { apiClient } from '@/lib/axios';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';

/**
 * ── DAS EMPFÄNGERFELD DER DIREKTRECHNUNG ─────────────────────────────────────
 *
 * Es ist dasselbe Feld wie im Angebot: man tippt HINEIN, darunter klappt eine
 * kurze Trefferliste auf. Wird nichts gewählt, bleibt das Getippte stehen — ein
 * Empfänger, der (noch) kein Kunde ist, ist auf einer Direktrechnung erlaubt.
 *
 * KLEID (Vorgabe Samet 25.09.2026: «seçimler üretimdeki seçim tasarımında
 * olacak»): das Feld ist ein Formularfeld der Pano-Seiten
 * (`.ofi-panel-page-control`) mit dem ⌃⌄-Zeichen eines Pop-up-Knopfes, und die
 * Liste ist das macOS-Menü von `PanelMacSelect` (`.ofi-panel-mac-select__menu`):
 * helle Tafel, der gebundene Kunde trägt LINKS den Haken, die angesteuerte
 * Zeile ist systemblau. Vorher hing hier die Tabellenliste des Lagers
 * (`ComboCell`) — ein anderes Kleid als jede andere Auswahl der Seite.
 *
 * Die PRODUKTZELLE der Positionen stand früher auch hier; sie ist nach
 * `components/sales-document/DocumentProductCell.tsx` gezogen und benutzt
 * seither dieselbe Liste wie die Offertdetails (Vorgabe Samet 05.09.2026).
 */

const LOOKUP_SIZE = 7;

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
 *
 * Tastatur wie im Menü: ↓/↑ steuern die Zeilen an, Enter übernimmt die
 * angesteuerte, Escape und Tab schliessen. Enter OHNE angesteuerte Zeile
 * schliesst nur — ein frei getippter Empfänger darf nicht vom ersten Treffer
 * überschrieben werden.
 */
export const CustomerPickField = ({
    value,
    selectedId,
    onChange,
    onPick,
}: {
    value: string;
    /** Der gebundene Kunde — er trägt in der Liste den Haken. */
    selectedId: string | null;
    onChange: (next: string) => void;
    onPick: (customer: CustomerPick) => void;
}) => {
    const [open, setOpen] = useState(false);
    // Die Treffer tragen die Suche, zu der sie gehören: «lädt» heisst, die
    // Antwort zur aktuellen Suche ist noch nicht da.
    const [result, setResult] = useState<{ search: string; items: CustomerPick[] } | null>(null);
    const [active, setActive] = useState(-1);
    const rootRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const search = useDebouncedValue(value, 250).trim();
    const items = result?.items ?? [];
    const loading = open && result?.search !== search;

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const params = new URLSearchParams({ page: '1', pageSize: String(LOOKUP_SIZE) });
        if (search) params.set('search', search);
        apiClient
            .get(`/customers?${params.toString()}`)
            .then((response) => {
                if (cancelled) return;
                const data = response.data;
                setResult({ search, items: Array.isArray(data) ? data : (data?.items || []) });
                setActive(-1);
            })
            .catch(() => { if (!cancelled) setResult({ search, items: [] }); });
        return () => { cancelled = true; };
    }, [open, search]);

    // Ein Klick ausserhalb schliesst das Menü — wie beim Pop-up-Knopf.
    useEffect(() => {
        if (!open) return undefined;
        const close = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [open]);

    const pick = (customer: CustomerPick) => {
        onPick(customer);
        setOpen(false);
        setActive(-1);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) { setOpen(true); return; }
            if (!items.length) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((current) => Math.min(items.length - 1, Math.max(0, current + step)));
            return;
        }
        if (event.key === 'Enter') {
            if (!open) return;
            event.preventDefault();
            if (active >= 0 && items[active]) pick(items[active]);
            else setOpen(false);
            return;
        }
        if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(false);
            return;
        }
        if (event.key === 'Tab') setOpen(false);
    };

    return (
        <div className={`ofi-panel-mac-select direct-combo ${open ? 'is-open' : ''}`} ref={rootRef}>
            <input
                className="ofi-panel-page-control"
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                autoComplete="off"
                value={value}
                placeholder={t('invoices.recipientName')}
                onChange={(event) => { onChange(event.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                // Auch ein Klick in das schon fokussierte Feld öffnet die Liste.
                onMouseDown={() => setOpen(true)}
                onKeyDown={onKeyDown}
            />
            <ChevronSelectorVertical size={12} aria-hidden className="direct-combo__chevron" />
            {open && (
                <div className="ofi-panel-mac-select__menu" role="listbox" id={listId} aria-label={t('invoices.recipientPick')} onMouseLeave={() => setActive(-1)}>
                    {items.map((customer, index) => {
                        const place = [customer.postalCode, customer.city].filter(Boolean).join(' ');
                        return (
                            <button
                                key={customer.id}
                                type="button"
                                role="option"
                                aria-selected={customer.id === selectedId}
                                className={`${customer.id === selectedId ? 'is-selected' : ''} ${index === active ? 'is-active' : ''}`.trim()}
                                // pointerdown statt click: läuft vor dem Blur des Feldes.
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    pick(customer);
                                }}
                                onMouseEnter={() => setActive(index)}
                            >
                                <span className="ofi-panel-mac-select__check">
                                    {customer.id === selectedId && <Check size={13} strokeWidth={2.4} />}
                                </span>
                                <span className="direct-combo__name">{customer.companyName}</span>
                                {place && <span className="direct-combo__meta">{place}</span>}
                            </button>
                        );
                    })}
                    {!items.length && (
                        <div className="direct-combo__state">
                            {loading ? t('common.loading') : t('directInvoice.noCustomer')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
