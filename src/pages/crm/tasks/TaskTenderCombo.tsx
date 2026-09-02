import { useEffect, useMemo, useRef, useState } from 'react';

import { Check, X } from '@/components/icons/antIconCompat';
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
 *
 * ══ MAN SIEHT JETZT, DASS SIE HÄNGT (13.09.2026, Vorgabe Samet) ══════════
 *
 * «Man wählt die Offertennummer — 10106 etwa — und sie verschwindet; man sieht
 * nicht, dass das Gewählte gewählt ist.»
 *
 * Vorher war der einzige Hinweis auf eine gebundene Offerte der TEXT IM FELD.
 * Der aber sieht aus wie blosses Getipptes: er steht auch dann da, wenn man
 * eine Nummer nur halb eingetippt und nichts angeklickt hat — und er
 * verschwindet beim Schliessen wieder, weil ungebundener Text nichts
 * verknüpft. Zwischen «gewählt» und «getippt» war also kein Unterschied zu
 * sehen.
 *
 * Darum trägt eine WIRKLICH gebundene Offerte jetzt ein eigenes kleines Feld
 * unter dem Suchfeld (`.ofi-boundpick`): Haken, Nummer, Kunde — und rechts das
 * Kreuz, das die Bindung wieder löst. Steht dieses Feld da, hängt die Offerte
 * an der Aufgabe und geht mit ihr zum Server; steht es nicht da, hängt keine
 * dran. Zusätzlich trägt die gewählte Zeile IN der Liste einen Haken
 * (`selectedId`), damit man sie beim erneuten Aufklappen wiederfindet.
 */

export interface TaskTenderPick {
    id: string;
    tenderNumber: string;
    /**
     * DER KUNDE DER OFFERTE (13.09.2026). Vorher stand hier nur sein Name —
     * zum Anzeigen genug, zum Entscheiden nicht: das Formular musste beim
     * Kundenwechsel raten, ob die Offerte noch passt, und warf sie darum
     * sicherheitshalber IMMER weg. Mit der Kennung kann es beides richtig:
     * den Kunden aus der Offerte übernehmen und sie nur dann lösen, wenn
     * wirklich ein ANDERER Kunde gewählt wurde.
     */
    customerId?: string | null;
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
    /* Die zuletzt WIRKLICH gebundene Offerte — gesetzt SOFORT beim Klick,
       nicht erst mit der nächsten Zeichnung. Die Liste schliesst nämlich
       mitten in der Wahl (`pick()` ruft erst onSelect, dann onOpenChange
       (false)); läse das Schliessen `value` aus den Props, stünde dort noch
       der Stand VOR dem Klick — der Elternteil hat noch nicht neu
       gezeichnet — und die eben angeklickte Nummer würde im selben
       Wimpernschlag wieder aus dem Feld gewischt. */
    const boundRef = useRef<TaskTenderPick | null>(value);

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
                        customerId: row.customerId ?? null,
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

    /* Wird die Offerte von aussen gesetzt oder gelöscht (Kundenwechsel im
       Feld darüber), zieht der Text nach. Was dieses Feld selbst gebunden
       hat, bleibt unberührt — sonst räumte der Abgleich das gerade Getippte
       weg, denn Tippen löst die Bindung absichtlich. */
    useEffect(() => {
        if (value?.id === boundRef.current?.id) return;
        boundRef.current = value;
        setQuery(value?.tenderNumber ?? '');
    }, [value]);

    const options = useMemo(() => items.map((row) => ({
        id: row.id,
        label: row.tenderNumber,
        meta: row.customerName || undefined,
    })), [items]);

    /** Bindung lösen — das Kreuz am gebundenen Feld. Das Suchfeld wird leer. */
    const unbind = () => {
        boundRef.current = null;
        setQuery('');
        onChange(null);
    };

    return (
        <div style={z ? { zIndex: z } : undefined}>
            <ComboCell
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    // Halb Getipptes ohne Wahl verschwindet beim Schliessen —
                    // sonst stünde eine Nummer im Feld, die nichts verknüpft.
                    if (!next) setQuery(boundRef.current?.tenderNumber ?? '');
                }}
                value={query}
                onChange={(next) => {
                    setQuery(next);
                    // Tippen löst die Bindung: blosser Text ist keine Offerte.
                    if (value && next !== value.tenderNumber) {
                        boundRef.current = null;
                        onChange(null);
                    }
                }}
                options={options}
                loading={loading}
                onSelect={(option) => {
                    const row = items.find((item) => item.id === option.id);
                    if (!row) return;
                    boundRef.current = row;
                    onChange(row);
                    setQuery(row.tenderNumber);
                }}
                /* Die gewählte Zeile trägt in der Liste einen Haken. */
                selectedId={value?.id ?? null}
                /* … und unter dem Feld steht, WAS gebunden ist. Das ist der
                   eigentliche Beweis: es erscheint nur nach einer Wahl. */
                subtitle={value ? (
                    <div className="ofi-boundpick">
                        <Check size={13} aria-hidden />
                        <span className="ofi-boundpick__num">{value.tenderNumber}</span>
                        {value.customerName && <span className="ofi-boundpick__who">{value.customerName}</span>}
                        <button
                            type="button"
                            onClick={unbind}
                            aria-label={t('crm.tasks.quoteUnbind')}
                            title={t('crm.tasks.quoteUnbind')}
                            className="ofi-boundpick__drop"
                        >
                            <X size={13} />
                        </button>
                    </div>
                ) : undefined}
                placeholder={t('crm.tasks.quotePlaceholder')}
                emptyText={t('crm.tasks.quoteEmpty')}
                listWidth={FIELD_LIST_WIDTH}
                panelClassName="ofi-quick-pop"
            />
        </div>
    );
};
