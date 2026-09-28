import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Package, PackageCheck, Plus, ScanBarcode, ScanLine, SearchX, TriangleAlert, X } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { useBackDismiss } from '@/lib/backDismiss';
import { warehouseApi, warehouseErrorText } from '@/lib/api/warehouse';
import type { WarehouseGoodsIn, WarehouseLookupMatch, WarehouseProduct, WarehouseSerial } from '@/types/warehouse';

import { fmtQuantity } from '../warehouseFormat';
import { deviceLabel, projectLabel } from '../warehouseText';
import { CameraView } from './CameraView';

/**
 * Eine Buchung aus diesem Fenster (Karte ohne Seriennummern). Seit dem
 * 28.09.2026 ist sie Wareneingang: `credits` sagt, welchen Bestellungen sie
 * gutgeschrieben wurde — «Geri al» nimmt genau diese zurück.
 */
interface Booking {
    id: number;
    /** Stück dieser Buchung, die noch stehen. */
    quantity: number;
    /** Davon an Bestellungen, in der Reihenfolge der Buchung. */
    credits: Array<{ receiptId: string; referenceNumber: string; quantity: number }>;
}

/** Eine hier gelesene Seriennummer — mit Bestellung und Reservierung, wenn es sie gibt. */
interface SessionSerial {
    id: string;
    serialNumber: string;
    receiptId: string | null;
    referenceNumber: string | null;
    /** «Projekt · Gerät», dem die Nummer reserviert wurde. */
    reservedFor: string | null;
}

/** Was diese Sitzung an einer Karte eingebucht hat. */
interface Entry {
    product: WarehouseProduct;
    /** «+2», «+3» — Stück aus diesem Fenster. */
    added: number;
    /** Nur bei Seriennummernpflicht: die hier gelesenen Nummern. */
    serials: SessionSerial[];
    /** Zeitpunkt der letzten Buchung — lässt die Zeile kurz aufleuchten. */
    at: number;
    bookings: Booking[];
    /** Der Code, der die Karte zuletzt nannte — eine getippte Menge gilt für denselben Lieferanten. */
    code: string | null;
}

type Notice =
    | { kind: 'looking'; code: string }
    | { kind: 'missing'; code: string }
    | { kind: 'choose'; code: string; matches: WarehouseLookupMatch[] }
    | { kind: 'known'; code: string; match: WarehouseLookupMatch }
    | { kind: 'error'; text: string }
    /** Die letzte Buchung war Wareneingang einer Bestellung — mit «Geri al». */
    | { kind: 'receipt'; productId: string; goodsIn: WarehouseGoodsIn; bookingId: number | null; serialId: string | null };

type ReceiptNotice = Extract<Notice, { kind: 'receipt' }>;

/** Höchstens so viele Stück auf einmal (wie der Server: MAX_ADJUST). */
const MAX_STEP = 100_000;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** Ein UPC-A (12 Stellen) ist derselbe Code wie der EAN-13 mit führender 0. */
const codeVariants = (code: string): string[] => {
    const clean = code.trim().toLocaleLowerCase();
    const out = [clean];
    if (/^\d{12}$/.test(clean)) out.push(`0${clean}`);
    if (/^0\d{12}$/.test(clean)) out.push(clean.slice(1));
    return out;
};

const isCardCode = (product: WarehouseProduct, code: string): boolean => {
    const variants = codeVariants(code);
    // Auch der Barcode jedes Lieferanten (vierter Durchgang) nennt die Karte.
    return [product.barcode, product.manufacturerBarcode, product.erpCode, ...product.suppliers.map((entry) => entry.barcode)]
        .some((value) => Boolean(value) && variants.includes(value!.trim().toLocaleLowerCase()));
};

/**
 * «Geri al» von hinten: zuerst, was frei einging, dann die zuletzt
 * gutgeschriebene Bestellung — so nennt die Rücknahme dem Server genau die
 * Buchungen, die sie trifft.
 */
const takeBack = (bookings: Booking[], quantity: number): { bookings: Booking[]; undo: Array<{ receiptId: string; quantity: number }> } => {
    const next = bookings.map((booking) => ({ ...booking, credits: booking.credits.map((credit) => ({ ...credit })) }));
    const undo = new Map<string, number>();
    let rest = round3(quantity);
    for (let index = next.length - 1; index >= 0 && rest > 0; index -= 1) {
        const booking = next[index]!;
        const credited = booking.credits.reduce((sum, credit) => sum + credit.quantity, 0);
        const fromFree = Math.min(rest, round3(booking.quantity - credited));
        if (fromFree > 0) {
            booking.quantity = round3(booking.quantity - fromFree);
            rest = round3(rest - fromFree);
        }
        for (let at = booking.credits.length - 1; at >= 0 && rest > 0; at -= 1) {
            const credit = booking.credits[at]!;
            const take = Math.min(rest, credit.quantity);
            if (take <= 0) continue;
            credit.quantity = round3(credit.quantity - take);
            booking.quantity = round3(booking.quantity - take);
            rest = round3(rest - take);
            undo.set(credit.receiptId, round3((undo.get(credit.receiptId) ?? 0) + take));
        }
    }
    return {
        bookings: next
            .filter((booking) => booking.quantity > 0)
            .map((booking) => ({ ...booking, credits: booking.credits.filter((credit) => credit.quantity > 0) })),
        undo: [...undo].map(([receiptId, amount]) => ({ receiptId, quantity: amount })),
    };
};

/** Was dieses Fenster je Bestellung eingebucht hat — die kleinen Marken an der Zeile der Karte. */
const ordersOf = (entry: Entry): Array<{ referenceNumber: string; quantity: number }> => {
    const byOrder = new Map<string, number>();
    for (const booking of entry.bookings) {
        for (const credit of booking.credits) byOrder.set(credit.referenceNumber, round3((byOrder.get(credit.referenceNumber) ?? 0) + credit.quantity));
    }
    for (const serial of entry.serials) {
        if (serial.referenceNumber) byOrder.set(serial.referenceNumber, round3((byOrder.get(serial.referenceNumber) ?? 0) + 1));
    }
    return [...byOrder].filter(([, quantity]) => quantity > 0).map(([referenceNumber, quantity]) => ({ referenceNumber, quantity }));
};

/** «P-2026-104 · Hauptverteilung · Schaltschrank HV1» aus der Meldung des Servers. */
const reservationLabel = (entry: { projectNumber: string | null; projectName: string | null; deviceName: string | null }): string | null =>
    [entry.projectNumber, entry.projectName, entry.deviceName].filter(Boolean).join(' · ') || null;

const serialReservation = (serial: WarehouseSerial): string | null =>
    (serial.project
        ? [projectLabel(serial.project), serial.device ? deviceLabel(serial.device) : null].filter(Boolean).join(' · ')
        : null);

/** Die Antwort von `receive` ohne die Meldung des Wareneingangs — die Karte, wie sie jetzt steht. */
const cardOf = (result: WarehouseProduct & { goodsIn?: WarehouseGoodsIn | null }): WarehouseProduct => {
    const card = { ...result };
    delete card.goodsIn;
    return card;
};

/** Eine getippte Menge: Komma oder Punkt, nie negativ, höchstens drei Nachkommastellen. */
const parseAmount = (text: string): number | null => {
    const value = Number(text.trim().replace(',', '.'));
    return text.trim() && Number.isFinite(value) && value >= 0 ? round3(value) : null;
};

/**
 * Das «+N» der Zeile zum Tippen (28.09.2026: «500 kablo yüksüğü tek tek
 * okutulmaz»): eine andere Zahl bucht den Unterschied ein — oder nimmt ihn
 * zurück. Enter oder Verlassen des Feldes übernimmt, Esc verwirft.
 */
const AddedQuantity = ({ value, onCommit, onDone }: { value: number; onCommit: (target: number) => void; onDone: () => void }) => {
    const [draft, setDraft] = useState<string | null>(null);
    // Der Entwurf auch im Ref: Enter übernimmt und gibt den Fokus ab — das
    // folgende Verlassen des Feldes darf nicht ein zweites Mal buchen.
    const draftRef = useRef<string | null>(null);
    const shown = draft ?? String(value);
    const setBoth = (next: string | null) => {
        draftRef.current = next;
        setDraft(next);
    };
    const commit = () => {
        const text = draftRef.current;
        if (text === null) return;
        setBoth(null);
        const target = parseAmount(text);
        if (target !== null && target !== value) onCommit(target);
    };
    return (
        <label className={`ofi-wh-addqty ${value ? '' : 'is-zero'}`} title={t('warehouse.add.qtyLabel')}>
            <span aria-hidden>+</span>
            <input
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                value={shown}
                size={Math.max(2, shown.length)}
                aria-label={t('warehouse.add.qtyLabel')}
                onFocus={(event) => {
                    setBoth(String(value));
                    event.currentTarget.select();
                }}
                onChange={(event) => setBoth(event.target.value.replace(/[^\d.,]/g, '').slice(0, 9))}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commit();
                        onDone();
                    } else if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        setBoth(null);
                        onDone();
                    }
                }}
                onBlur={commit}
            />
        </label>
    );
};

/**
 * ── «ÜRÜN EKLE» — EINBUCHEN PER BARCODE (26.09.2026, zweiter Durchgang) ─────
 *
 * «Ürün eklede depoya ekle kartı olmayacak, direkt otomatik eklenecek ve yanda
 *  görünecek, ve altında çıkmasın eklenen şey — orada +2 +3 şeklinde sadece
 *  yanda belirsin.»
 *
 * Links nur das Kamerabild und das Feld für den Handscanner. JEDER gelesene
 * Code bucht sofort: eine Karte ohne Seriennummern bekommt +1, und rechts
 * steht sie mit ihrem Zähler «+3». Kein Bestätigen, keine Liste unter der
 * Kamera. Ein Verschreiber lässt sich an der Zeile zurücknehmen (−).
 *
 * «Eğer seri kod gerekliyse … farklı bir renkte: seri kod bu üründe
 *  zorunludur … eklendiği an hangi proje için rezerve edildiği yazılacak.»
 *
 * Trifft der Scan eine Karte mit Seriennummernpflicht, wechselt das Fenster
 * in den (orangen) Seriennummer-Modus: jeder weitere Scan ist die Nummer
 * eines Stücks und wird sofort eingebucht.
 *
 * WARENEINGANG (28.09.2026, «hiç sormadan, proje teslim tarihi en önce olan
 * ürünün siparişine otomatik çeksin»): jede Buchung hier ist der Eingang der
 * bestätigten Bestellungen (MAL KABULDE), die auf die Karte warten — der
 * früheste Liefertermin zuerst; ein Lieferanten-Barcode nennt die Bestellung
 * seines Lieferanten. Das Fenster zeigt, wohin es ging («SP-2026-010 · 10 adet
 * mal kabul edildi · Geri al»), die Zeile trägt die Bestellungen als Marken,
 * das «+N» lässt sich für grosse Mengen tippen. Die Karte selbst (Menge von
 * Hand, Excel) ist eine Berichtigung und berührt keine Bestellung.
 *
 * Schnelle Handscanner: Codes, Mengen und Rücknahmen stehen in EINER
 * Schlange und werden der Reihe nach gebucht — keiner geht verloren, keiner
 * überholt den anderen.
 */
export const AddProductDialog = ({
    onClose,
    onChanged,
}: {
    onClose: () => void;
    /** Etwas wurde eingebucht — die Liste soll neu lesen. */
    onChanged: () => void;
}) => {
    const navigate = useNavigate();
    useBackDismiss(true, onClose);
    const [entries, setEntries] = useState<Entry[]>([]);
    const [serialFor, setSerialFor] = useState<WarehouseProduct | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    // Die Zeilen im Ref sind die Wahrheit (synchron für die Schlange), der State zeichnet sie.
    const entriesRef = useRef<Entry[]>([]);
    const serialForRef = useRef<WarehouseProduct | null>(null);
    /** Der Code, der die Karte im Seriennummer-Modus nannte (Lieferant). */
    const serialCodeRef = useRef<string | null>(null);
    const jobsRef = useRef<Array<() => Promise<void>>>([]);
    const drainingRef = useRef(false);
    const bookingSeq = useRef(0);
    const onChangedRef = useRef(onChanged);

    useEffect(() => { serialForRef.current = serialFor; }, [serialFor]);
    useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);

    const focusScanner = () => window.setTimeout(() => inputRef.current?.focus(), 0);

    const applyEntries = useCallback((update: (current: Entry[]) => Entry[]) => {
        const next = update(entriesRef.current);
        entriesRef.current = next;
        setEntries(next);
    }, []);

    /** Eine Karte oben in die Liste — mit ihrem neuen Stand und dem Zähler. */
    const upsert = useCallback((
        product: WarehouseProduct,
        delta: number,
        change: { serial?: SessionSerial; booking?: Booking; bookings?: Booking[]; code?: string | null } = {},
    ) => {
        applyEntries((current) => {
            const existing = current.find((entry) => entry.product.id === product.id);
            const next: Entry = {
                product,
                added: Math.max(0, round3((existing?.added ?? 0) + delta)),
                serials: change.serial ? [...(existing?.serials ?? []), change.serial] : existing?.serials ?? [],
                at: delta !== 0 ? Date.now() : existing?.at ?? Date.now(),
                bookings: change.bookings ?? (change.booking ? [...(existing?.bookings ?? []), change.booking] : existing?.bookings ?? []),
                code: change.code !== undefined ? change.code : existing?.code ?? null,
            };
            return [next, ...current.filter((entry) => entry.product.id !== product.id)];
        });
    }, [applyEntries]);

    const activateSerial = useCallback((product: WarehouseProduct, code: string | null) => {
        serialForRef.current = product;
        serialCodeRef.current = code;
        setSerialFor(product);
        upsert(product, 0, code ? { code } : {});
    }, [upsert]);

    /** + n für eine Karte ohne Seriennummern — als Wareneingang wartender Bestellungen. */
    const receiveQuantity = useCallback(async (product: WarehouseProduct, quantity: number, code: string | null) => {
        const result = await warehouseApi.receive(product.id, quantity, { goodsIn: true, code });
        const goodsIn = result.goodsIn ?? null;
        const updated = cardOf(result);
        const booking: Booking = {
            id: ++bookingSeq.current,
            quantity,
            credits: (goodsIn?.credits ?? []).map((credit) => ({
                receiptId: credit.receiptId,
                referenceNumber: credit.referenceNumber,
                quantity: credit.quantity,
            })),
        };
        upsert(updated, quantity, { booking, ...(code ? { code } : {}) });
        if (goodsIn?.credits.length) {
            setNotice({ kind: 'receipt', productId: product.id, goodsIn, bookingId: booking.id, serialId: null });
        }
        onChangedRef.current();
    }, [upsert]);

    /** Eine Karte wurde erkannt: buchen oder in den Seriennummer-Modus. */
    const handleCard = useCallback(async (product: WarehouseProduct, code: string | null) => {
        setNotice(null);
        if (product.serialRequired) activateSerial(product, code);
        else {
            if (serialForRef.current) { serialForRef.current = null; setSerialFor(null); }
            await receiveQuantity(product, 1, code);
        }
    }, [activateSerial, receiveQuantity]);

    const addSerial = useCallback(async (product: WarehouseProduct, serialNumber: string) => {
        const result = await warehouseApi.addSerial(product.id, { serialNumber, goodsIn: true, code: serialCodeRef.current });
        const credit = result.goodsIn?.credits.find((entry) => entry.serials.includes(result.serial.serialNumber)) ?? null;
        const reservation = result.goodsIn?.reservations.find((entry) => entry.serialNumber === result.serial.serialNumber);
        upsert(result.product, 1, {
            serial: {
                id: result.serial.id,
                serialNumber: result.serial.serialNumber,
                receiptId: credit?.receiptId ?? null,
                referenceNumber: credit?.referenceNumber ?? null,
                reservedFor: (reservation ? reservationLabel(reservation) : null) ?? serialReservation(result.serial),
            },
        });
        serialForRef.current = result.product;
        setSerialFor(result.product);
        setNotice(credit && result.goodsIn
            ? { kind: 'receipt', productId: product.id, goodsIn: result.goodsIn, bookingId: null, serialId: result.serial.id }
            : null);
        onChangedRef.current();
    }, [upsert]);

    /** Ein Code aus der Schlange. */
    const process = useCallback(async (code: string) => {
        const waiting = serialForRef.current;
        // Schneller Weg: eine Karte, die in diesem Fenster schon gebucht wurde.
        const known = entriesRef.current.find((entry) => isCardCode(entry.product, code));
        if (known) {
            await handleCard(known.product, code);
            return;
        }
        if (!waiting) setNotice({ kind: 'looking', code });
        const { matches } = await warehouseApi.lookup(code);
        const cardHits = matches.filter((match) => match.matchedBy !== 'serial');
        const serialHits = matches.filter((match) => match.matchedBy === 'serial');

        if (waiting) {
            const own = serialHits.find((match) => match.product.id === waiting.id);
            if (own) { setNotice({ kind: 'known', code, match: own }); return; }
            if (cardHits.length === 1 && cardHits[0]) { await handleCard(cardHits[0].product, code); return; }
            if (cardHits.length > 1) { setNotice({ kind: 'choose', code, matches: cardHits }); return; }
            // Sonst ist der Code die Seriennummer des Stücks.
            await addSerial(waiting, code);
            return;
        }
        if (!matches.length) setNotice({ kind: 'missing', code });
        else if (cardHits.length === 1 && !serialHits.length && cardHits[0]) await handleCard(cardHits[0].product, code);
        else if (!cardHits.length && serialHits.length === 1 && serialHits[0]) setNotice({ kind: 'known', code, match: serialHits[0] });
        else setNotice({ kind: 'choose', code, matches });
    }, [addSerial, handleCard]);

    const drain = useCallback(async () => {
        if (drainingRef.current) return;
        drainingRef.current = true;
        setBusy(true);
        try {
            while (jobsRef.current.length) {
                const job = jobsRef.current.shift()!;
                try {
                    await job();
                } catch (error) {
                    setNotice({ kind: 'error', text: warehouseErrorText(error) });
                }
            }
        } finally {
            drainingRef.current = false;
            setBusy(false);
            focusScanner();
        }
    }, []);

    /** Scans, getippte Mengen und Rücknahmen: eine Schlange, der Reihe nach. */
    const schedule = useCallback((job: () => Promise<void>) => {
        jobsRef.current.push(job);
        void drain();
    }, [drain]);

    const enqueue = useCallback((raw: string) => {
        const code = raw.trim();
        if (!code) return;
        schedule(() => process(code));
    }, [process, schedule]);

    /* Der Handscanner tippt schnell und schliesst mit Enter ab: gelesen wird,
       was im Feld STEHT (nicht der letzte gezeichnete Stand) — so fehlt nie
       ein Zeichen am Ende. */
    const submitTyped = (event: FormEvent) => {
        event.preventDefault();
        enqueue(inputRef.current?.value ?? typed);
        setTyped('');
    };

    const entryOf = (productId: string): Entry | undefined => entriesRef.current.find((entry) => entry.product.id === productId);

    /** n Stück zurück — von hinten, samt dem Wareneingang, den sie brachten. */
    const undoQuantity = async (productId: string, quantity: number) => {
        const entry = entryOf(productId);
        if (!entry || quantity <= 0) return;
        const amount = Math.min(quantity, entry.added);
        if (amount <= 0) return;
        const { bookings, undo } = takeBack(entry.bookings, amount);
        const updated = cardOf(await warehouseApi.receive(productId, -amount, { goodsIn: true, undo }));
        upsert(updated, -amount, { bookings });
        onChangedRef.current();
    };

    /** Genau eine Buchung zurück («Geri al» der Meldung) — mit allem, was von ihr noch steht. */
    const undoBooking = async (productId: string, bookingId: number) => {
        const entry = entryOf(productId);
        const booking = entry?.bookings.find((item) => item.id === bookingId);
        if (!entry || !booking) return;
        const undo = booking.credits.filter((credit) => credit.quantity > 0).map((credit) => ({ receiptId: credit.receiptId, quantity: credit.quantity }));
        const updated = cardOf(await warehouseApi.receive(productId, -booking.quantity, { goodsIn: true, undo }));
        upsert(updated, -booking.quantity, { bookings: entry.bookings.filter((item) => item.id !== bookingId) });
        onChangedRef.current();
    };

    /** … oder eine hier gelesene Seriennummer wieder löschen (samt ihrem Wareneingang). */
    const undoSerial = async (productId: string, serialId: string) => {
        const entry = entryOf(productId);
        const serial = entry?.serials.find((item) => item.id === serialId);
        if (!entry || !serial) return;
        const result = await warehouseApi.removeSerial(serial.id, { receiptId: serial.receiptId });
        applyEntries((current) => current.map((item) => (item.product.id === productId
            ? {
                ...item,
                product: result.product ?? item.product,
                added: Math.max(0, item.added - 1),
                serials: item.serials.filter((entrySerial) => entrySerial.id !== serialId),
            }
            : item)));
        onChangedRef.current();
    };

    /** Eine getippte Menge: der Unterschied zum Zähler wird gebucht oder zurückgenommen. */
    const setAddedTo = (productId: string, target: number) => {
        schedule(async () => {
            const entry = entryOf(productId);
            if (!entry) return;
            const delta = round3(target - entry.added);
            if (!delta) return;
            if (delta > MAX_STEP) {
                setNotice({ kind: 'error', text: t('warehouse.err.RECEIVE_INVALID') });
                return;
            }
            if (delta > 0) await receiveQuantity(entry.product, delta, entry.code);
            else await undoQuantity(productId, -delta);
        });
    };

    const clearReceiptNotice = (productId: string) =>
        setNotice((current) => (current?.kind === 'receipt' && current.productId === productId ? null : current));

    const undoNotice = (receipt: ReceiptNotice) => {
        setNotice(null);
        if (receipt.serialId) schedule(() => undoSerial(receipt.productId, receipt.serialId!));
        else if (receipt.bookingId !== null) schedule(() => undoBooking(receipt.productId, receipt.bookingId!));
    };

    const stopSerial = () => {
        serialForRef.current = null;
        serialCodeRef.current = null;
        setSerialFor(null);
        focusScanner();
    };

    const pickMatch = (match: WarehouseLookupMatch, code: string) => {
        if (match.matchedBy === 'serial') {
            setNotice({ kind: 'known', code: match.serial?.serialNumber ?? '', match });
            return;
        }
        schedule(() => handleCard(match.product, code));
    };

    const openCard = (product: WarehouseProduct) => {
        onClose();
        navigate(`/warehouse/products/${product.id}`);
    };

    const createCard = (code: string) => {
        onClose();
        navigate(`/warehouse/products/new?barcode=${encodeURIComponent(code)}`);
    };

    const placeholder = serialFor ? t('warehouse.serials.inputPlaceholder') : t('warehouse.scan.manual');
    const totalAdded = round3(entries.reduce((sum, entry) => sum + entry.added, 0));
    // Die Meldung gilt, solange ihre Buchung (oder Nummer) noch steht.
    const receiptAlive = (receipt: ReceiptNotice): boolean => {
        const entry = entries.find((item) => item.product.id === receipt.productId);
        if (!entry) return false;
        return receipt.serialId
            ? entry.serials.some((serial) => serial.id === receipt.serialId)
            : entry.bookings.some((booking) => booking.id === receipt.bookingId);
    };
    const shownNotice = notice?.kind === 'receipt' && !receiptAlive(notice) ? null : notice;

    return (
        <PopupDialog
            open
            onClose={onClose}
            title={t('warehouse.add.title')}
            subtitle={t('warehouse.add.subtitle')}
            width={940}
            footer={(
                <PopupActions start={totalAdded > 0 ? <span className="ofi-wh-add__total">{t('warehouse.add.total', { count: totalAdded })}</span> : undefined}>
                    <PopupButton variant="primary" onClick={onClose}>{t('warehouse.actions.done')}</PopupButton>
                </PopupActions>
            )}
        >
            <div className={`ofi-wh-pop ofi-wh-add ${serialFor ? 'is-serial-mode' : ''}`}>
                {/* ── links: lesen — nichts darunter ── */}
                <div className="ofi-wh-add__scanner">
                    {/* Gleiche Kartons nacheinander: ein Etikett zählt wieder, sobald es gut
                        eine Sekunde aus dem Bild war — ruhig gehalten zählt es einmal. */}
                    <CameraView active onCode={enqueue} repeatMs={1200} prefer={serialFor ? 'serial' : 'product'} />
                    <form onSubmit={submitTyped}>
                        <div className={`ofi-wh-field is-large ${serialFor ? 'is-serial' : ''}`}>
                            <ScanLine className="ofi-wh-field__lead" />
                            <input
                                ref={inputRef}
                                value={typed}
                                autoFocus
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                enterKeyHint="send"
                                placeholder={placeholder}
                                aria-label={placeholder}
                                onChange={(event) => setTyped(event.target.value)}
                            />
                            {busy && <span className="ofi-wh-spinner" aria-hidden />}
                        </div>
                    </form>
                </div>

                {/* ── rechts: was eingebucht wurde ── */}
                <div className="ofi-wh-add__side" aria-live="polite">
                    {serialFor && (
                        <div className="ofi-wh-serialmode" role="status">
                            <span className="ofi-wh-serialmode__badge">{t('warehouse.products.serialBadge')}</span>
                            <span className="ofi-wh-serialmode__text">
                                <b>{t('warehouse.add.serialRequired')}</b>
                                <span>{t('warehouse.add.serialRequiredHint', { name: serialFor.name })}</span>
                            </span>
                            <button type="button" className="ofi-wh-btn is-small is-quiet ofi-nosize" onClick={stopSerial}>
                                {t('warehouse.add.stopSerial')}
                            </button>
                        </div>
                    )}

                    {shownNotice && (
                        <div className={`ofi-wh-notice is-${shownNotice.kind}`}>
                            {shownNotice.kind === 'looking' && (
                                <>
                                    <span className="ofi-wh-spinner" />
                                    <span><code>{shownNotice.code}</code> · {t('warehouse.add.looking')}</span>
                                </>
                            )}
                            {shownNotice.kind === 'missing' && (
                                <>
                                    <SearchX />
                                    <span className="ofi-wh-notice__text">
                                        <b>{t('warehouse.add.notFound')}</b>
                                        <code>{shownNotice.code}</code>
                                    </span>
                                    <button type="button" className="ofi-wh-btn is-small ofi-nosize" onClick={() => createCard(shownNotice.code)}>
                                        <Plus />
                                        {t('warehouse.add.createCard')}
                                    </button>
                                </>
                            )}
                            {shownNotice.kind === 'error' && (
                                <>
                                    <TriangleAlert />
                                    <span className="ofi-wh-notice__text"><b>{shownNotice.text}</b></span>
                                </>
                            )}
                            {shownNotice.kind === 'receipt' && (
                                <>
                                    <PackageCheck />
                                    <span className="ofi-wh-notice__text">
                                        {shownNotice.goodsIn.credits.map((credit) => (
                                            <span key={credit.receiptId} className="ofi-wh-receipt">
                                                <b>
                                                    <span className="ofi-wh-receipt__code"><PurchaseCode value={credit.referenceNumber} /></span>
                                                    {t('warehouse.add.receipt.line', { quantity: fmtQuantity(credit.quantity) })}
                                                </b>
                                                <span>
                                                    {[
                                                        reservationLabel(credit),
                                                        credit.completed
                                                            ? t('warehouse.add.receipt.completed')
                                                            : t('warehouse.add.receipt.progress', { received: fmtQuantity(credit.received), ordered: fmtQuantity(credit.ordered) }),
                                                    ].filter(Boolean).join(' · ')}
                                                </span>
                                            </span>
                                        ))}
                                        {shownNotice.goodsIn.free > 0 && (
                                            <span>{t('warehouse.add.receipt.free', { quantity: fmtQuantity(shownNotice.goodsIn.free) })}</span>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        className="ofi-wh-btn is-small ofi-nosize"
                                        title={t('warehouse.add.receipt.undoTitle')}
                                        onClick={() => undoNotice(shownNotice)}
                                    >
                                        {t('warehouse.add.receipt.undo')}
                                    </button>
                                </>
                            )}
                            {shownNotice.kind === 'known' && (
                                <>
                                    <Package />
                                    <span className="ofi-wh-notice__text">
                                        <b>{t('warehouse.add.serialKnown', { serial: shownNotice.match.serial?.serialNumber ?? shownNotice.code, name: shownNotice.match.product.name })}</b>
                                        <span>
                                            {shownNotice.match.serial?.project
                                                ? [projectLabel(shownNotice.match.serial.project), shownNotice.match.serial.device ? deviceLabel(shownNotice.match.serial.device) : null].filter(Boolean).join(' · ')
                                                : t('warehouse.add.notAssigned')}
                                        </span>
                                    </span>
                                    <button type="button" className="ofi-wh-btn is-small ofi-nosize" onClick={() => openCard(shownNotice.match.product)}>
                                        {t('warehouse.add.openCard')}
                                    </button>
                                </>
                            )}
                            {shownNotice.kind === 'choose' && (
                                <div className="ofi-wh-notice__choose">
                                    <span className="ofi-wh-row__hint">{t('warehouse.add.chooseOne')}</span>
                                    <div className="ofi-wh-choices">
                                        {shownNotice.matches.map((match) => (
                                            <button
                                                key={`${match.product.id}:${match.serial?.id ?? match.matchedBy}`}
                                                type="button"
                                                className="ofi-wh-choice ofi-nosize"
                                                onClick={() => pickMatch(match, shownNotice.code)}
                                            >
                                                <span>
                                                    <b>{match.product.name}</b>
                                                    <small>
                                                        {[match.product.erpCode ?? t('warehouse.add.noErpCode'), match.product.supplier?.name, match.serial?.serialNumber]
                                                            .filter(Boolean).join(' · ')}
                                                    </small>
                                                </span>
                                                <em>{t(`warehouse.add.matchedBy.${match.matchedBy}`, { supplier: match.supplier?.name ?? '' })}</em>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {shownNotice.kind !== 'looking' && shownNotice.kind !== 'choose' && (
                                <button
                                    type="button"
                                    className="ofi-wh-notice__close ofi-nosize"
                                    aria-label={t('warehouse.actions.close')}
                                    onClick={() => { setNotice(null); focusScanner(); }}
                                >
                                    <X />
                                </button>
                            )}
                        </div>
                    )}

                    {!entries.length && !shownNotice && !serialFor && (
                        <div className="ofi-wh-wait">
                            <ScanBarcode />
                            <b>{t('warehouse.add.waiting')}</b>
                            <span>{t('warehouse.add.waitingHint')}</span>
                        </div>
                    )}

                    {entries.length > 0 && (
                        <ul className="ofi-wh-session" aria-label={t('warehouse.add.session')}>
                            {entries.map((entry) => {
                                const active = serialFor?.id === entry.product.id;
                                const orders = ordersOf(entry);
                                return (
                                    <li
                                        key={`${entry.product.id}:${entry.at}`}
                                        className={`ofi-wh-sessionrow ${entry.product.serialRequired ? 'is-serial' : ''} ${active ? 'is-active' : ''}`}
                                    >
                                        <div className="ofi-wh-sessionrow__head">
                                            <button type="button" className="ofi-wh-sessionrow__main ofi-nosize" title={t('warehouse.add.openCard')} onClick={() => openCard(entry.product)}>
                                                <b>{entry.product.name}</b>
                                                <span>
                                                    <span className={`ofi-wh-code ${entry.product.erpCode ? '' : 'is-dim'}`}>
                                                        {entry.product.erpCode ?? t('warehouse.add.noErpCode')}
                                                    </span>
                                                    <span className="ofi-wh-dot">·</span>
                                                    {t('warehouse.add.inStock', { quantity: fmtQuantity(entry.product.quantity) })}
                                                </span>
                                            </button>
                                            {!entry.product.serialRequired && entry.added > 0 && (
                                                <button
                                                    type="button"
                                                    className="ofi-wh-sessionrow__undo ofi-nosize"
                                                    title={t('warehouse.add.undo')}
                                                    aria-label={t('warehouse.add.undo')}
                                                    onClick={() => {
                                                        clearReceiptNotice(entry.product.id);
                                                        schedule(() => undoQuantity(entry.product.id, 1));
                                                    }}
                                                >
                                                    <Minus />
                                                </button>
                                            )}
                                            {entry.product.serialRequired ? (
                                                <span className={`ofi-wh-plus ${entry.added ? '' : 'is-zero'}`} aria-label={t('warehouse.add.addedCount', { count: entry.added })}>
                                                    +{entry.added}
                                                </span>
                                            ) : (
                                                <AddedQuantity
                                                    value={entry.added}
                                                    onCommit={(target) => {
                                                        clearReceiptNotice(entry.product.id);
                                                        setAddedTo(entry.product.id, target);
                                                    }}
                                                    onDone={focusScanner}
                                                />
                                            )}
                                        </div>
                                        {orders.length > 0 && (
                                            <div className="ofi-wh-sessionrow__orders">
                                                {orders.map((order) => (
                                                    <span key={order.referenceNumber} className="ofi-wh-orderchip" title={t('warehouse.add.orderChipTitle')}>
                                                        <PackageCheck aria-hidden />
                                                        <b><PurchaseCode value={order.referenceNumber} /></b>
                                                        <span>{t('warehouse.add.orderChip', { quantity: fmtQuantity(order.quantity) })}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {entry.product.serialRequired && (
                                            <div className="ofi-wh-sessionrow__serials">
                                                {!entry.serials.length && (
                                                    <span className="ofi-wh-row__hint">{t('warehouse.add.serialWaiting')}</span>
                                                )}
                                                {entry.serials.map((serial) => (
                                                    <span key={serial.id} className="ofi-wh-snchip">
                                                        <span className="ofi-wh-snchip__text">
                                                            <b>{serial.serialNumber}</b>
                                                            <small>{t('warehouse.add.reservedFor')}: <em>{serial.reservedFor ?? t('warehouse.add.reservedNone')}</em></small>
                                                            {serial.referenceNumber && (
                                                                <small className="ofi-wh-snchip__order"><PurchaseCode value={serial.referenceNumber} /></small>
                                                            )}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="ofi-nosize"
                                                            title={t('warehouse.add.undoSerial')}
                                                            aria-label={t('warehouse.add.undoSerial')}
                                                            onClick={() => {
                                                                clearReceiptNotice(entry.product.id);
                                                                schedule(() => undoSerial(entry.product.id, serial.id));
                                                            }}
                                                        >
                                                            <X />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </PopupDialog>
    );
};
