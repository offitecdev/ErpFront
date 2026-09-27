import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Package, Plus, ScanBarcode, ScanLine, SearchX, TriangleAlert, X } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { useBackDismiss } from '@/lib/backDismiss';
import { warehouseApi, warehouseErrorText } from '@/lib/api/warehouse';
import type { WarehouseLookupMatch, WarehouseProduct } from '@/types/warehouse';

import { fmtQuantity } from '../warehouseFormat';
import { deviceLabel, projectLabel } from '../warehouseText';
import { CameraView } from './CameraView';

/** Was diese Sitzung an einer Karte eingebucht hat. */
interface Entry {
    product: WarehouseProduct;
    /** «+2», «+3» — Stück aus diesem Fenster. */
    added: number;
    /** Nur bei Seriennummernpflicht: die hier gelesenen Nummern. */
    serials: Array<{ id: string; serialNumber: string }>;
    /** Zeitpunkt der letzten Buchung — lässt die Zeile kurz aufleuchten. */
    at: number;
}

type Notice =
    | { kind: 'looking'; code: string }
    | { kind: 'missing'; code: string }
    | { kind: 'choose'; code: string; matches: WarehouseLookupMatch[] }
    | { kind: 'known'; code: string; match: WarehouseLookupMatch }
    | { kind: 'error'; text: string };

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
 *  zorunludur … eklendiği an hangi proje için rezerve edildiği yazılacak, ama
 *  şimdilik veritabanına bağlı olmasın.»
 *
 * Trifft der Scan eine Karte mit Seriennummernpflicht, wechselt das Fenster
 * in den (orangen) Seriennummer-Modus: jeder weitere Scan ist die Nummer
 * eines Stücks und wird sofort eingebucht. Die Zeile «Rezerve edildiği proje»
 * steht schon da — noch ohne Verbindung zur Datenbank (—).
 *
 * Schnelle Handscanner: die Codes stehen in einer Schlange und werden der
 * Reihe nach gebucht — keiner geht verloren.
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
    const entriesRef = useRef<Entry[]>([]);
    const serialForRef = useRef<WarehouseProduct | null>(null);
    const queueRef = useRef<string[]>([]);
    const drainingRef = useRef(false);
    const onChangedRef = useRef(onChanged);

    useEffect(() => { entriesRef.current = entries; }, [entries]);
    useEffect(() => { serialForRef.current = serialFor; }, [serialFor]);
    useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);

    const focusScanner = () => window.setTimeout(() => inputRef.current?.focus(), 0);

    /** Eine Karte oben in die Liste — mit ihrem neuen Stand und dem Zähler. */
    const upsert = useCallback((product: WarehouseProduct, delta: number, serial?: { id: string; serialNumber: string }) => {
        setEntries((current) => {
            const existing = current.find((entry) => entry.product.id === product.id);
            const next: Entry = {
                product,
                added: Math.max(0, (existing?.added ?? 0) + delta),
                serials: serial ? [...(existing?.serials ?? []), serial] : existing?.serials ?? [],
                at: delta !== 0 ? Date.now() : existing?.at ?? Date.now(),
            };
            const updated = [next, ...current.filter((entry) => entry.product.id !== product.id)];
            entriesRef.current = updated;
            return updated;
        });
    }, []);

    const activateSerial = useCallback((product: WarehouseProduct) => {
        serialForRef.current = product;
        setSerialFor(product);
        upsert(product, 0);
    }, [upsert]);

    /** +1 für eine Karte ohne Seriennummern. */
    const receiveOne = useCallback(async (product: WarehouseProduct) => {
        const updated = await warehouseApi.receive(product.id, 1);
        upsert(updated, 1);
        onChangedRef.current();
    }, [upsert]);

    /** Eine Karte wurde erkannt: buchen oder in den Seriennummer-Modus. */
    const handleCard = useCallback(async (product: WarehouseProduct) => {
        setNotice(null);
        if (product.serialRequired) activateSerial(product);
        else {
            if (serialForRef.current) { serialForRef.current = null; setSerialFor(null); }
            await receiveOne(product);
        }
    }, [activateSerial, receiveOne]);

    const addSerial = useCallback(async (product: WarehouseProduct, serialNumber: string) => {
        const result = await warehouseApi.addSerial(product.id, { serialNumber });
        upsert(result.product, 1, { id: result.serial.id, serialNumber: result.serial.serialNumber });
        serialForRef.current = result.product;
        setSerialFor(result.product);
        setNotice(null);
        onChangedRef.current();
    }, [upsert]);

    /** Ein Code aus der Schlange. */
    const process = useCallback(async (code: string) => {
        const waiting = serialForRef.current;
        // Schneller Weg: eine Karte, die in diesem Fenster schon gebucht wurde.
        const known = entriesRef.current.find((entry) => isCardCode(entry.product, code));
        if (known) {
            await handleCard(known.product);
            return;
        }
        if (!waiting) setNotice({ kind: 'looking', code });
        const { matches } = await warehouseApi.lookup(code);
        const cardHits = matches.filter((match) => match.matchedBy !== 'serial');
        const serialHits = matches.filter((match) => match.matchedBy === 'serial');

        if (waiting) {
            const own = serialHits.find((match) => match.product.id === waiting.id);
            if (own) { setNotice({ kind: 'known', code, match: own }); return; }
            if (cardHits.length === 1 && cardHits[0]) { await handleCard(cardHits[0].product); return; }
            if (cardHits.length > 1) { setNotice({ kind: 'choose', code, matches: cardHits }); return; }
            // Sonst ist der Code die Seriennummer des Stücks.
            await addSerial(waiting, code);
            return;
        }
        if (!matches.length) setNotice({ kind: 'missing', code });
        else if (cardHits.length === 1 && !serialHits.length && cardHits[0]) await handleCard(cardHits[0].product);
        else if (!cardHits.length && serialHits.length === 1 && serialHits[0]) setNotice({ kind: 'known', code, match: serialHits[0] });
        else setNotice({ kind: 'choose', code, matches });
    }, [addSerial, handleCard]);

    const drain = useCallback(async () => {
        if (drainingRef.current) return;
        drainingRef.current = true;
        setBusy(true);
        try {
            while (queueRef.current.length) {
                const code = queueRef.current.shift()!;
                try {
                    await process(code);
                } catch (error) {
                    setNotice({ kind: 'error', text: warehouseErrorText(error) });
                }
            }
        } finally {
            drainingRef.current = false;
            setBusy(false);
            focusScanner();
        }
    }, [process]);

    const enqueue = useCallback((raw: string) => {
        const code = raw.trim();
        if (!code) return;
        queueRef.current.push(code);
        void drain();
    }, [drain]);

    /* Der Handscanner tippt schnell und schliesst mit Enter ab: gelesen wird,
       was im Feld STEHT (nicht der letzte gezeichnete Stand) — so fehlt nie
       ein Zeichen am Ende. */
    const submitTyped = (event: FormEvent) => {
        event.preventDefault();
        enqueue(inputRef.current?.value ?? typed);
        setTyped('');
    };

    /** Einen Scan zurücknehmen: −1 (ohne Seriennummern) … */
    const undoOne = async (entry: Entry) => {
        if (entry.added <= 0) return;
        try {
            const updated = await warehouseApi.receive(entry.product.id, -1);
            upsert(updated, -1);
            onChangedRef.current();
        } catch (error) {
            setNotice({ kind: 'error', text: warehouseErrorText(error) });
        } finally {
            focusScanner();
        }
    };

    /** … oder eine hier gelesene Seriennummer wieder löschen. */
    const undoSerial = async (entry: Entry, serial: { id: string; serialNumber: string }) => {
        try {
            const result = await warehouseApi.removeSerial(serial.id);
            setEntries((current) => current.map((item) => (item.product.id === entry.product.id
                ? {
                    ...item,
                    product: result.product ?? item.product,
                    added: Math.max(0, item.added - 1),
                    serials: item.serials.filter((entrySerial) => entrySerial.id !== serial.id),
                }
                : item)));
            onChangedRef.current();
        } catch (error) {
            setNotice({ kind: 'error', text: warehouseErrorText(error) });
        } finally {
            focusScanner();
        }
    };

    const stopSerial = () => {
        serialForRef.current = null;
        setSerialFor(null);
        focusScanner();
    };

    const pickMatch = (match: WarehouseLookupMatch) => {
        if (match.matchedBy === 'serial') {
            setNotice({ kind: 'known', code: match.serial?.serialNumber ?? '', match });
            return;
        }
        void handleCard(match.product).catch((error) => setNotice({ kind: 'error', text: warehouseErrorText(error) }));
        focusScanner();
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
    const totalAdded = entries.reduce((sum, entry) => sum + entry.added, 0);

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

                    {notice && (
                        <div className={`ofi-wh-notice is-${notice.kind}`}>
                            {notice.kind === 'looking' && (
                                <>
                                    <span className="ofi-wh-spinner" />
                                    <span><code>{notice.code}</code> · {t('warehouse.add.looking')}</span>
                                </>
                            )}
                            {notice.kind === 'missing' && (
                                <>
                                    <SearchX />
                                    <span className="ofi-wh-notice__text">
                                        <b>{t('warehouse.add.notFound')}</b>
                                        <code>{notice.code}</code>
                                    </span>
                                    <button type="button" className="ofi-wh-btn is-small ofi-nosize" onClick={() => createCard(notice.code)}>
                                        <Plus />
                                        {t('warehouse.add.createCard')}
                                    </button>
                                </>
                            )}
                            {notice.kind === 'error' && (
                                <>
                                    <TriangleAlert />
                                    <span className="ofi-wh-notice__text"><b>{notice.text}</b></span>
                                </>
                            )}
                            {notice.kind === 'known' && (
                                <>
                                    <Package />
                                    <span className="ofi-wh-notice__text">
                                        <b>{t('warehouse.add.serialKnown', { serial: notice.match.serial?.serialNumber ?? notice.code, name: notice.match.product.name })}</b>
                                        <span>
                                            {notice.match.serial?.project
                                                ? [projectLabel(notice.match.serial.project), notice.match.serial.device ? deviceLabel(notice.match.serial.device) : null].filter(Boolean).join(' · ')
                                                : t('warehouse.add.notAssigned')}
                                        </span>
                                    </span>
                                    <button type="button" className="ofi-wh-btn is-small ofi-nosize" onClick={() => openCard(notice.match.product)}>
                                        {t('warehouse.add.openCard')}
                                    </button>
                                </>
                            )}
                            {notice.kind === 'choose' && (
                                <div className="ofi-wh-notice__choose">
                                    <span className="ofi-wh-row__hint">{t('warehouse.add.chooseOne')}</span>
                                    <div className="ofi-wh-choices">
                                        {notice.matches.map((match) => (
                                            <button
                                                key={`${match.product.id}:${match.serial?.id ?? match.matchedBy}`}
                                                type="button"
                                                className="ofi-wh-choice ofi-nosize"
                                                onClick={() => pickMatch(match)}
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
                            {notice.kind !== 'looking' && notice.kind !== 'choose' && (
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

                    {!entries.length && !notice && !serialFor && (
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
                                                    onClick={() => void undoOne(entry)}
                                                >
                                                    <Minus />
                                                </button>
                                            )}
                                            <span className={`ofi-wh-plus ${entry.added ? '' : 'is-zero'}`} aria-label={t('warehouse.add.addedCount', { count: entry.added })}>
                                                +{entry.added}
                                            </span>
                                        </div>
                                        {entry.product.serialRequired && (
                                            <div className="ofi-wh-sessionrow__serials">
                                                {!entry.serials.length && (
                                                    <span className="ofi-wh-row__hint">{t('warehouse.add.serialWaiting')}</span>
                                                )}
                                                {entry.serials.map((serial) => (
                                                    <span key={serial.id} className="ofi-wh-snchip">
                                                        <span className="ofi-wh-snchip__text">
                                                            <b>{serial.serialNumber}</b>
                                                            <small>{t('warehouse.add.reservedFor')}: <em>{t('warehouse.add.reservedNone')}</em></small>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="ofi-nosize"
                                                            title={t('warehouse.add.undoSerial')}
                                                            aria-label={t('warehouse.add.undoSerial')}
                                                            onClick={() => void undoSerial(entry, serial)}
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
