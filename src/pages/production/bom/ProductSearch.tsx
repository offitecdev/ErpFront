import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { PackagePlus, Plus, Search, X } from 'lucide-react';

import { t } from '@/i18n/translate';
import { productionBomApi } from '@/lib/api/productionBom';
import type { BomProduct } from '@/types/productionBom';
import type { BuiltInArea } from '@/types/productionTasks';

import { fmtQty } from './bomFormat';
import { BomSpinner } from './bomUi';
import { QuickProductCard } from './QuickProductCard';

/**
 * Die Trefferliste: oben wie unten GLEICH gross (Samet: «modal boyutu diğeri
 * kadar olması gerekmektedir, yani üstteki kadar») — breit genug für eine
 * Depo-Zeile, nie so breit wie die ganze leere Tabellenzeile.
 */
const PANEL_WIDTH = 660;
const PANEL_MAX_HEIGHT = 360;
const EDGE = 8;

/**
 * Die Liste hängt am Feld, liegt aber ÜBER der Seite (Portal): in der Tabelle
 * würde sie abgeschnitten oder schöbe eine Bildlaufleiste in die Tabelle —
 * und die würde schmaler («tablo küçülmesin»). Gemessen wird bei jedem
 * Bild, das die Seite rollt oder die Grösse ändert, und direkt ins Element
 * geschrieben (kein Zustand, kein zweites Rendern).
 */
const placePanel = (field: HTMLElement, panel: HTMLElement, alignRight: boolean) => {
    const rect = field.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - EDGE * 2);
    // Oben rechts steht das Feld am rechten Rand — die Liste hängt an seiner rechten Kante.
    const preferred = alignRight ? rect.right - width : rect.left;
    const left = Math.min(Math.max(EDGE, preferred), window.innerWidth - width - EDGE);
    const below = window.innerHeight - rect.bottom - EDGE - 6;
    const above = rect.top - EDGE - 6;
    const up = below < 220 && above > below;
    panel.style.left = `${left}px`;
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(120, Math.min(PANEL_MAX_HEIGHT, up ? above : below))}px`;
    panel.style.top = up ? 'auto' : `${rect.bottom + 6}px`;
    panel.style.bottom = up ? `${window.innerHeight - rect.top + 6}px` : 'auto';
    panel.style.visibility = 'visible';
};

/**
 * ── SUCHE NACH DEPO-KARTEN (27.09.2026, Vorgabe Samet) ──────────────────────
 *
 * «ERP kodu, model numarası, ürün adına göre aratma olabilir; bu aratma
 *  olduğunda direkt ürünün tüm satırı eklenir — depodaki satırın aynısı …
 *  eğer yoksa hemen küçük modal yanında ürün kartı oluştur olmalıdır.»
 *
 * Zwei Formen (Hierarchie, gleicher Tag: «en üst arama çubuğu dar olsun …
 * tablonun en altında boş satır olsun, oradan da ekleyebileyim»):
 *   bar  schmales Feld oben über der Tabelle
 *   row  die leere Zeile am Ende der Tabelle — randlos, mit «+»
 * ↑/↓ wählt, ↵ fügt die ganze Zeile hinzu. Findet sich nichts, steht dort
 * «Ürün kartı oluştur» — das kleine Fenster legt die Karte im Depo an und
 * fügt sie gleich hinzu.
 *
 * `area` (01.10.2026, Samet: «bomda mekanik olan sadece kendi MAK kodlarını
 * görebilecek»): der Server zeigt nur Karten der Kod türleri, die die Depo-
 * Einstellungen diesem Bereich (oder beiden) zuordnen; das kleine Fenster
 * bietet nur deren Gruppen an.
 */
export const ProductSearch = ({
    onPick,
    disabled,
    autoFocus,
    variant = 'bar',
    placeholder,
    inputRef,
    trailing,
    area,
}: {
    onPick: (product: BomProduct) => void;
    disabled?: boolean;
    autoFocus?: boolean;
    variant?: 'bar' | 'row';
    placeholder?: string;
    /** Von aussen fokussierbar («+» oben springt in die leere Zeile). */
    inputRef?: RefObject<HTMLInputElement | null>;
    /** Am Ende des Feldes (die leere Zeile: «Şablondan ekle»). */
    trailing?: ReactNode;
    /** Bereich der BOM — nur seine Kod türleri (ohne: alle Karten). */
    area?: BuiltInArea;
}) => {
    const listId = useId();
    const ownInputRef = useRef<HTMLInputElement>(null);
    const fieldRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const spacerRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<{ query: string; area?: BuiltInArea; items: BomProduct[] } | null>(null);
    const [active, setActive] = useState(0);
    const [open, setOpen] = useState(false);
    /* «+» ohne Suchtext: die Liste öffnet mit dem Hinweis, was einzugeben ist —
       sonst sähe der Klick aus, als täte er nichts. */
    const [hint, setHint] = useState(false);
    const [creating, setCreating] = useState<string | null>(null);

    const setInput = (element: HTMLInputElement | null) => {
        ownInputRef.current = element;
        if (inputRef) inputRef.current = element;
    };

    const trimmed = query.trim();
    useEffect(() => {
        if (!trimmed) return undefined;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            productionBomApi.searchProducts(trimmed, controller.signal, area)
                .then((items) => { setResults({ query: trimmed, area, items }); setActive(0); })
                .catch(() => { if (!controller.signal.aborted) setResults({ query: trimmed, area, items: [] }); });
        }, 180);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [trimmed, area]);

    const current = results && results.query === trimmed && results.area === area ? results.items : null;
    const searching = Boolean(trimmed) && !current;
    const showPanel = open && (Boolean(trimmed) || hint);

    useLayoutEffect(() => {
        if (!showPanel) return undefined;
        const field = fieldRef.current;
        const panel = panelRef.current;
        if (!field || !panel) return undefined;
        let frame = 0;
        const place = () => { frame = 0; placePanel(field, panel, variant === 'bar'); };
        const schedule = () => { if (!frame) frame = window.requestAnimationFrame(place); };
        /* Die leere Zeile steht am Ende der Tabelle — oft am unteren Rand. Samet:
           «altta arama çıkmıyor … birkaç kere oluyor, sonra olmuyor»: sobald die
           Tabelle länger wurde, fehlte unten der Platz. Ein Platzhalter unter dem
           Feld (so hoch wie die Liste, von ihr verdeckt) macht die Seite lang genug,
           und sie rollt so weit, dass die Liste darunter ganz zu sehen ist. */
        spacerRef.current?.scrollIntoView({ block: 'nearest' });
        place();
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
        };
    }, [showPanel, variant]);

    const pick = (product: BomProduct) => {
        onPick(product);
        setQuery('');
        setResults(null);
        setOpen(false);
        setHint(false);
        ownInputRef.current?.focus();
    };

    /** «+»: die gewählte Zeile hinzufügen (wie ↵) — ohne Treffer die Karte anlegen, ohne Text ins Feld. */
    const addActive = () => {
        const product = current?.[active];
        if (product) { pick(product); return; }
        if (trimmed && current && !current.length) { setCreating(trimmed); return; }
        setHint(true);
        setOpen(true);
        ownInputRef.current?.focus();
    };

    const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            if (query) setQuery('');
            else setOpen(false);
            return;
        }
        if (!current) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(current.length, index + 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(0, index - 1));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const product = current[active];
            if (product) pick(product);
            else if (trimmed) setCreating(trimmed);
        }
    };

    const label = placeholder ?? t('productionBom.search.placeholder');

    return (
        <div className={`ofi-bom-search is-${variant}${showPanel ? ' is-open' : ''}`}>
            <div ref={fieldRef} className="ofi-bom-search__field">
                {variant === 'row' ? (
                    <button
                        type="button"
                        className="ofi-bom-search__plus ofi-nosize"
                        title={t('productionBom.search.addActive')}
                        aria-label={t('productionBom.search.addActive')}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={addActive}
                    >
                        <Plus aria-hidden />
                    </button>
                ) : <Search className="ofi-bom-search__glass" aria-hidden />}
                <input
                    ref={setInput}
                    value={query}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={label}
                    aria-label={label}
                    aria-expanded={showPanel}
                    aria-controls={listId}
                    role="combobox"
                    onChange={(event) => { setQuery(event.target.value); setOpen(true); setHint(false); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => window.setTimeout(() => { setOpen(false); setHint(false); }, 140)}
                    onKeyDown={onKey}
                />
                {searching && <BomSpinner small />}
                {query && (
                    <button
                        type="button"
                        className="ofi-bom-search__clear ofi-nosize"
                        aria-label={t('productionBom.common.clear')}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => { setQuery(''); ownInputRef.current?.focus(); }}
                    >
                        <X />
                    </button>
                )}
                {trailing}
            </div>
            {variant === 'row' && showPanel && <div ref={spacerRef} className="ofi-bom-search__spacer" aria-hidden />}
            {variant === 'bar' && (
                <button
                    type="button"
                    className="ofi-bom-btn is-icon ofi-nosize ofi-bom-search__add"
                    title={t('productionBom.search.addActive')}
                    aria-label={t('productionBom.search.addActive')}
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={addActive}
                >
                    <Plus />
                </button>
            )}

            {showPanel && createPortal(
                <div
                    ref={panelRef}
                    className="ofi-bom-pop ofi-bom-results is-portal"
                    style={{ position: 'fixed', top: -9999, left: -9999, visibility: 'hidden' }}
                    id={listId}
                    role="listbox"
                    onMouseDown={(event) => event.preventDefault()}
                >
                    {!trimmed && hint && <div className="ofi-bom-results__state">{t('productionBom.search.typeToSearch')}</div>}
                    {searching && !current && <div className="ofi-bom-results__state">{t('productionBom.search.searching')}</div>}
                    {current?.map((product, index) => (
                        <button
                            key={product.id}
                            type="button"
                            role="option"
                            aria-selected={index === active}
                            className={`ofi-bom-results__row ofi-nosize${index === active ? ' is-active' : ''}`}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => pick(product)}
                        >
                            <span className="ofi-bom-code">{product.erpCode ?? '—'}</span>
                            <span className="ofi-bom-results__name">
                                <b>{product.name}</b>
                                <small>{[product.brand, product.modelNumber].filter(Boolean).join(' · ') || '—'}</small>
                            </span>
                            <span className="ofi-bom-results__supplier">{product.supplierName ?? '—'}</span>
                            <span className="ofi-bom-results__stock">
                                {fmtQty(product.quantity)}
                                {product.free < product.quantity && <small>{t('productionBom.columns.free')} {fmtQty(product.free)}</small>}
                            </span>
                        </button>
                    ))}
                    {current && !current.length && (
                        <div className="ofi-bom-results__state">
                            {t('productionBom.search.noResults', { query: trimmed })}
                            {area && <small>{t(`productionBom.search.areaScope.${area}`)}</small>}
                        </div>
                    )}
                    {current && (
                        <button
                            type="button"
                            className={`ofi-bom-results__create ofi-nosize${active === current.length ? ' is-active' : ''}`}
                            onMouseEnter={() => setActive(current.length)}
                            onClick={() => setCreating(trimmed)}
                        >
                            <PackagePlus aria-hidden />
                            <span>{t('productionBom.search.createCard')}</span>
                            <small>«{trimmed}»</small>
                        </button>
                    )}
                </div>,
                document.body,
            )}

            {creating !== null && (
                <QuickProductCard
                    seed={creating}
                    area={area}
                    onClose={() => setCreating(null)}
                    onCreated={(product) => { setCreating(null); pick(product); }}
                />
            )}
        </div>
    );
};
