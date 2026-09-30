import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, MailWarning, Plus, Search, Send, X } from 'lucide-react';

import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import type { SupplierSearchItem } from '@/types/inventory';
import '@/styles/modules/purchasingGlass.css';

import { ARROW_HEIGHT, bubblePath, useAnchoredPlacement, useBoxHeight } from './glassPopover';

const P = 'productionBom.purchasing.picker';

export interface PickedSupplier {
    id: string | null;
    name: string;
}

const fold = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');

/**
 * ── «EKLE»: DIE LIEFERANTEN ALS GLASFENSTER (30.09.2026, Vorgabe Samet) ────
 *
 * «Ekle bastık ya, tedarikçi orada glass olması lazım — çoklu seçim, modal çok
 *  büyük değil, orta boyutta; hafif yeşil bir gradyan, glassmorphism.» Nur für
 * die Preisanfragen der Produktion (das Lieferantenfenster des Stok bleibt,
 * wie es ist). Suchen, mehrere anhaken (die schon gefragten sind gesperrt),
 * einen neuen Namen übernehmen; «Ekle ve gönder» legt je Lieferant eine
 * Anfrage an — sie geht gleich hinaus.
 * Kein Fenster in der Mitte, sondern eine Sprechblase wie bei Apple, deren
 * Pfeil auf das «+» zeigt (30.09.2026, Skizze Samet).
 */
export const SupplierGlassPicker = ({ open, anchor, askedIds, askedNames, onClose, onPick }: {
    open: boolean;
    /** Der Knopf, auf den der Pfeil zeigt. */
    anchor: HTMLElement | null;
    /** Schon gefragte Lieferanten (Kennung) — gesperrt. */
    askedIds: string[];
    /** Schon gefragte Lieferanten nur mit Namen — gesperrt. */
    askedNames: string[];
    onClose: () => void;
    onPick: (suppliers: PickedSupplier[]) => void;
}) => {
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [items, setItems] = useState<SupplierSearchItem[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [picked, setPicked] = useState<PickedSupplier[]>([]);
    const boxRef = useRef<HTMLElement>(null);
    const place = useAnchoredPlacement(open, anchor);
    const boxHeight = useBoxHeight(boxRef, Boolean(place));

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
        return () => window.clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        inventoryApi.searchSuppliers(debounced, 40)
            .then((rows) => { if (alive) { setItems(rows); setFailed(false); } })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [open, debounced]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, onClose]);

    const asked = useMemo(() => ({ ids: new Set(askedIds), names: new Set(askedNames.map(fold)) }), [askedIds, askedNames]);
    const isAsked = (item: SupplierSearchItem) => asked.ids.has(item.id) || asked.names.has(fold(item.companyName));
    const isPicked = (item: SupplierSearchItem) => picked.some((entry) => entry.id === item.id);
    const toggle = (item: SupplierSearchItem) => setPicked((current) => (current.some((entry) => entry.id === item.id)
        ? current.filter((entry) => entry.id !== item.id)
        : [...current, { id: item.id, name: item.companyName }]));
    const typed = query.trim();
    const canAddTyped = typed.length > 1
        && !(items ?? []).some((item) => fold(item.companyName) === fold(typed))
        && !picked.some((entry) => fold(entry.name) === fold(typed))
        && !asked.names.has(fold(typed));

    if (!open || !place) return null;
    const outline = boxHeight ? bubblePath(place.width, boxHeight, place.side, place.arrowX) : '';
    return createPortal(
        <div className="ofi-gpick-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <section
                ref={boxRef}
                className={`ofi-gpick ofi-compact-modal is-${place.side}`}
                role="dialog"
                aria-modal="true"
                aria-label={t(`${P}.title`)}
                style={{
                    left: place.left,
                    width: place.width,
                    top: place.top ?? undefined,
                    bottom: place.bottom ?? undefined,
                    maxHeight: place.maxHeight,
                    transformOrigin: `${place.arrowX}px ${place.side === 'above' ? `calc(100% + ${ARROW_HEIGHT}px)` : `-${ARROW_HEIGHT}px`}`,
                    ['--g-arrow' as string]: `${ARROW_HEIGHT}px`,
                } as CSSProperties}
            >
                {/* Glas und Rand als EIN Umriss mit Pfeil — keine Naht an der Spitze. */}
                {outline && (
                    <>
                        <svg className="ofi-gpick__shade" aria-hidden width={place.width} height={boxHeight + ARROW_HEIGHT}>
                            <path d={outline} />
                        </svg>
                        <span className="ofi-gpick__glass" aria-hidden style={{ height: boxHeight + ARROW_HEIGHT, clipPath: `path('${outline}')` }} />
                        <svg className="ofi-gpick__rim" aria-hidden width={place.width} height={boxHeight + ARROW_HEIGHT}>
                            <path d={outline} />
                        </svg>
                    </>
                )}
                <header className="ofi-gpick__head">
                    <span>
                        <b>{t(`${P}.title`)}</b>
                        <small>{t(`${P}.subtitle`)}</small>
                    </span>
                    <button type="button" className="ofi-gpick__close ofi-nosize" aria-label={t('common.close')} onClick={onClose}><X /></button>
                </header>
                <label className="ofi-gpick__search">
                    <Search aria-hidden />
                    <input
                        autoFocus
                        value={query}
                        placeholder={t(`${P}.search`)}
                        aria-label={t(`${P}.search`)}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && canAddTyped) {
                                event.preventDefault();
                                setPicked((current) => [...current, { id: null, name: typed }]);
                                setQuery('');
                            }
                        }}
                    />
                </label>
                <ul className="ofi-gpick__list" role="listbox" aria-multiselectable="true">
                    {canAddTyped && (
                        <li>
                            <button type="button" className="ofi-gpick__row is-new ofi-nosize" onClick={() => { setPicked((current) => [...current, { id: null, name: typed }]); setQuery(''); }}>
                                <span className="ofi-gpick__tick"><Plus /></span>
                                <span className="ofi-gpick__text"><b>{t(`${P}.addTyped`, { name: typed })}</b><small>{t(`${P}.addTypedHint`)}</small></span>
                            </button>
                        </li>
                    )}
                    {(items ?? []).map((item) => {
                        const locked = isAsked(item);
                        const on = isPicked(item);
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={on}
                                    disabled={locked}
                                    className={`ofi-gpick__row ofi-nosize${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
                                    onClick={() => toggle(item)}
                                >
                                    <span className="ofi-gpick__tick">{(on || locked) && <Check />}</span>
                                    <span className="ofi-gpick__text">
                                        <b>{item.companyName}</b>
                                        <small>
                                            {locked
                                                ? t(`${P}.asked`)
                                                : item.email
                                                    ? item.email
                                                    : <span className="is-warn"><MailWarning aria-hidden />{t(`${P}.noEmail`)}</span>}
                                        </small>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                    {items && !items.length && !canAddTyped && <li className="ofi-gpick__empty">{t(`${P}.empty`)}</li>}
                    {failed && <li className="ofi-gpick__empty">{t(`${P}.failed`)}</li>}
                    {!items && !failed && <li className="ofi-gpick__empty"><span className="ofi-gpick__spin" /></li>}
                </ul>
                <footer className="ofi-gpick__foot">
                    <span className="ofi-gpick__chips">
                        {picked.map((entry) => (
                            <button
                                key={`${entry.id ?? 'name'}:${entry.name}`}
                                type="button"
                                className="ofi-gpick__chip ofi-nosize"
                                title={t(`${P}.remove`)}
                                onClick={() => setPicked((current) => current.filter((other) => other !== entry))}
                            >
                                {entry.name}
                                <X aria-hidden />
                            </button>
                        ))}
                        {!picked.length && <small>{t(`${P}.nothing`)}</small>}
                    </span>
                    <button type="button" className="ofi-gpick__go ofi-nosize" disabled={!picked.length} onClick={() => onPick(picked)}>
                        <Send aria-hidden />
                        {t(`${P}.confirm`, { count: picked.length })}
                    </button>
                </footer>
            </section>
        </div>,
        document.body,
    );
};
