import { useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n/translate';
import { tenderApi } from '@/lib/api/tender';
import { ComboCell } from '@/pages/inventory/components/ComboCell';

/**
 * OFFERTE AN EINER AUFGABE (11.09.2026, Vorgabe Samet: «wir sollten auf Kunden
 * und Offerten verweisen können — aber freiwillig»).
 *
 * Dasselbe Tippfeld wie die Kundenwahl daneben (ComboCell): das Feld IST die
 * Suche, darunter klappen die Treffer auf. Gesucht wird beim SERVER — die
 * Offertenliste ist zu lang, um sie für ein Feld zu laden — und nur, solange
 * die Liste offen ist.
 *
 * IST EIN KUNDE GEWÄHLT, zeigt das Feld NUR SEINE Offerten. Das ist der
 * häufige Fall («Nachfassen bei Müller») und erspart das Tippen der Nummer;
 * ohne Kunden steht die ganze Kartei offen.
 */

export interface TaskTenderPick {
    id: string;
    tenderNumber: string;
    customerName?: string | null;
}

/** Breite der Vorschlagsliste im Formular — so breit wie das Feld selbst. */
const FIELD_LIST_WIDTH = 300;

/** So lange wartet das Feld nach dem letzten Tastendruck (ms). */
const DEBOUNCE_MS = 220;
const SUGGESTIONS = 7;

export const TaskTenderCombo = ({ value, onChange, customerId, z }: {
    value: TaskTenderPick | null;
    onChange: (next: TaskTenderPick | null) => void;
    /** Ist ein Kunde gewählt, zeigt die Liste nur seine Offerten. */
    customerId?: string | null;
    z?: number;
}) => {
    const [query, setQuery] = useState(value?.tenderNumber ?? '');
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<TaskTenderPick[]>([]);
    const [loading, setLoading] = useState(false);
    const timerRef = useRef<number | null>(null);

    /* Gefragt wird NUR, solange die Liste offen ist, und entprellt: ein Feld,
       das bei jedem Tastendruck fragt, schickt für «AN-2026» sieben Anfragen. */
    useEffect(() => {
        if (!open) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        let cancelled = false;
        /* Der Ladezustand wird ERST in der Uhr gesetzt, nicht im Körper des
           Effekts: ein setState direkt im Effektkörper stösst eine zweite
           Zeichnung an, bevor die erste fertig ist. Zwischen Tastendruck und
           Ablauf der Entprellung ist ohnehin nichts unterwegs. */
        timerRef.current = window.setTimeout(() => {
            if (cancelled) return;
            setLoading(true);
            const search = query.trim();
            tenderApi
                .list({
                    ...(customerId ? { customerId } : {}),
                    ...(search ? { search } : {}),
                    fields: 'list',
                    page: 1,
                    pageSize: SUGGESTIONS,
                })
                .then((rows) => {
                    if (cancelled) return;
                    setItems(rows.map((row) => ({
                        id: row.id,
                        tenderNumber: row.tenderNumber,
                        customerName: row.customerName ?? null,
                    })));
                })
                .catch(() => { if (!cancelled) setItems([]); })
                .finally(() => { if (!cancelled) setLoading(false); });
        }, DEBOUNCE_MS);
        return () => {
            cancelled = true;
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
    }, [open, query, customerId]);

    const options = useMemo(() => items.map((row) => ({
        id: row.id,
        label: row.tenderNumber,
        meta: row.customerName || undefined,
    })), [items]);

    return (
        <div style={z ? { zIndex: z } : undefined}>
            <ComboCell
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    // Halb Getipptes ohne Wahl verschwindet beim Schliessen —
                    // sonst stünde eine Nummer im Feld, die nichts verknüpft.
                    if (!next) setQuery(value?.tenderNumber ?? '');
                }}
                value={query}
                onChange={(next) => {
                    setQuery(next);
                    if (value && next !== value.tenderNumber) onChange(null);
                }}
                options={options}
                loading={loading}
                onSelect={(option) => {
                    const row = items.find((item) => item.id === option.id);
                    if (!row) return;
                    onChange(row);
                    setQuery(row.tenderNumber);
                }}
                placeholder={t('crm.tasks.quotePlaceholder')}
                emptyText={t('crm.tasks.quoteEmpty')}
                listWidth={FIELD_LIST_WIDTH}
                panelClassName="ofi-quick-pop"
            />
        </div>
    );
};

