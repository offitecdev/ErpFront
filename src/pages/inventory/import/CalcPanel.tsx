import { useState } from 'react';

import { Check, Eye, EyeOff, Minus, Plus } from '@/components/icons/antIconCompat';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { t } from '@/i18n/translate';
import type { SupplierCalcConfig } from '@/types/inventory';
import { ORDER_MAX_EXTRA_COLUMNS, TEMPLATE_MAX_EXTRA_COLUMNS } from '@/types/inventory';

import { allVatCountries, clampPercent, fmtPercent } from '../utils/orderPricing';
import { CALC_MODES, calcModeHint, calcModeLabel, nextExtraKey, templateColumnOptions } from './importTemplate';

/**
 * ── DIE RECHENVORLAGE ───────────────────────────────────────────────────────
 *
 * Vorgabe Samet (07.09.2026): «Die Rechenvorlagen sind ein einziges
 * Durcheinander — mach das einfacher, modularer, schneller. Nichts davon ist
 * einheitlich. Und wenn Text und Zahlen eingegeben werden, bitte im Apple-Stil.»
 *
 * Daraus wird EINE Sprache statt vier. Vorher standen hier nebeneinander: ein
 * aufklappbarer Schalter mit Optionsliste, ein zweispaltiges Feldraster, eine
 * Reihe Chips mit einem X darin, eine Ziehliste mit eigenem Kopf und ein
 * Geisterknopf — fünf Bauweisen für fünf Einstellungen.
 *
 * Jetzt ist alles dieselbe KISTE wie in den Bestelldetails (`.ofi-ord-*`,
 * styles/orderDetails.css): weisse Gruppen auf grauem Grund, eine Zeile je
 * Sache, Beschriftung links, Wert rechts, eingerückte Haarlinien dazwischen.
 * Wegnehmen ist überall dasselbe rote Minus, Hinzufügen dasselbe grüne Plus.
 *
 * ── ZWEI DOKUMENTE, ZWEI GESICHTER (Vorgabe Samet, 08.09.2026) ──────────────
 * «Die Preisanfrage muss genau drei feste Felder enthalten: Produktcode,
 * Produktname und Menge — diese drei stehen fest, und nur diese.»
 *
 *   PREISANFRAGE   Drei feste Felder, sonst nichts. KEINE Rechenart, KEIN
 *                  Steuersatz, KEIN Rabatt — es gibt keinen Betrag, auf den
 *                  sie fallen könnten. Dazu bis zu fünf eigene Angaben.
 *   BESTELLUNG     Dieselben drei plus beide Preise, die Rabatte und den
 *                  Zeilenbetrag; dazu Rechenart, Steuersatz und bis zu drei
 *                  eigene Angaben.
 *
 * Welches von beiden gilt, sagt `priceless` — es kommt von der Bestellseite
 * durch das Vorlagenfenster hierher.
 */

export const CalcPanel = ({ config, onChange, priceless = false, goodsReceipt = false }: {
    config: SupplierCalcConfig;
    onChange: (next: SupplierCalcConfig) => void;
    /**
     * FÜR WELCHES DOKUMENT eingestellt wird. Eine PREISANFRAGE trägt genau drei
     * feste Felder — Produktcode, Produktbezeichnung, Menge — und rechnet
     * nichts: Rechenart und Steuersatz fehlen dort, weil es keinen Betrag gibt,
     * auf den sie fallen könnten.
     */
    priceless?: boolean;
    /** Goods receipt already owns article identity and supplier context. */
    goodsReceipt?: boolean;
}) => {
    /* Eine Angabe wegzuwerfen ist nicht rückgängig zu machen, solange die
       Vorlage nicht gespeichert ist — deshalb fragt das Minus nach. */
    const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
    /** Welche Angabe gerade gezogen wird — null, wenn niemand zieht. */
    const [dragKey, setDragKey] = useState<string | null>(null);

    /* Sobald irgendetwas an der Vorlage geaendert wird, ist die Platz-Warnung
       hinfaellig: entweder ist wieder Platz, oder man sieht es gleich neu. */
    const [budgetWarning, setBudgetWarning] = useState(false);
    const patch = (next: Partial<SupplierCalcConfig>) => { setBudgetWarning(false); onChange({ ...config, ...next }); };
    const extras = config.extraColumns ?? [];
    /* ⚠ MIT DEM ZIEL FRAGEN. Ohne das zweite Argument lieferte die Liste immer
       die acht Felder der BESTELLUNG — auch auf einer Preisanfrage, wo es genau
       drei sind. Das war der sichtbare Fehler: die Einstellung versprach Preise
       und Rabatte, die das Dokument gar nicht kennt. */
    const columns = templateColumnOptions(config, priceless);
    const hidden = new Set(config.hiddenColumnKeys ?? []);
    /* ── DER PLATZ FUER EIGENE SPALTEN WAECHST MIT JEDEM AUGE (Vorgabe Samet,
       09.09.2026) ──────────────────────────────────────────────────────────
       «Blenden wir den Einzelpreis aus, verschwindet er — und die Zahl der
        eigenen Spalten, die man anlegen kann, steigt.» Die Grenze war ein
       Blatt-Mass, kein Prinzip: drei eigene Spalten passen neben die festen.
       Faellt eine feste weg, ist ihr Platz frei — und genau um so viel
       waechst die Grenze. Gezaehlt werden nur die FESTEN ausgeblendeten
       (nicht `x…`): eine ausgeblendete eigene Spalte belegt ihren Platz ja
       weiterhin. */
    const hiddenFixedCount = columns.filter((column) => !column.key.startsWith('x') && hidden.has(column.key)).length;
    const maxExtras = (priceless ? TEMPLATE_MAX_EXTRA_COLUMNS : ORDER_MAX_EXTRA_COLUMNS) + hiddenFixedCount;
    const calcMode = config.calcMode ?? 'DIRECT';
    const vatCountries = allVatCountries();
    const selectedVat = vatCountries.find((entry) => entry.label === config.vatCountry);

    /* Ist kein Platz mehr, SAGT es der Knopf, statt nur grau zu werden
       (Vorgabe Samet: «will man eine weitere anlegen, muss eine Warnung
       kommen: eine der eigenen Spalten loeschen»). Ein grauer Knopf erklaert
       nichts; der Satz darunter sagt, was zu tun ist — und dass auch ein Auge
       an einer festen Spalte den Platz schafft. */
    const addExtra = () => {
        const key = nextExtraKey(extras);
        if (!key || extras.length >= maxExtras) {
            setBudgetWarning(true);
            return;
        }
        patch({ extraColumns: [...extras, { key, name: '', type: 'text', width: 120 }] });
    };

    const toggleColumn = (key: string) => {
        const next = new Set(config.hiddenColumnKeys ?? []);
        if (next.has(key)) next.delete(key); else next.add(key);
        patch({ hiddenColumnKeys: [...next] });
    };

    return (
        <>
            {/* ── 1) DIE RECHENART, 2) DIE STEUER ───────────────────────────
                Beide NUR in einer Bestellung: in einer Preisanfrage gibt es
                keine Beträge, und eine Rechenart hätte nichts zu rechnen
                (Vorgabe Samet: «dort findet keine Berechnung statt»).

                Die Rechenart steht als Auswahlliste da — drei Zeilen, jede mit
                ihrem Satz darunter, die geltende trägt den Haken rechts. Das
                ist die Liste aus den iOS-Einstellungen: man SIEHT die
                Möglichkeiten, statt sie hinter einem Schalter zu vermuten. */}
            {!priceless && (
                <>
                    <span className="ofi-ord-cap">{t('inv.aiImport.calcTitle')}</span>
                    <div className="ofi-ord-group">
                        {CALC_MODES.map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                className={`ofi-ord-pick${calcMode === mode ? ' is-on' : ''}`}
                                onClick={() => patch({ calcMode: mode })}
                            >
                                <span>
                                    <b>{calcModeLabel(mode)}</b>
                                    <small>{calcModeHint(mode)}</small>
                                </span>
                                {calcMode === mode && <Check size={16} />}
                            </button>
                        ))}
                    </div>

                    <span className="ofi-ord-cap">{t('inv.orders.columns.vat')}</span>
                    <div className="ofi-ord-group">
                        <div className="ofi-ord-row">
                            <span className="ofi-ord-label">{t('inv.orders.vatColumn.country')}</span>
                            <SelectMenu
                                className="ofi-ord-menu"
                                buttonClassName="ofi-ord-select"
                                ariaLabel={t('inv.orders.vatColumn.country')}
                                value={config.vatCountry}
                                listWidth={260}
                                options={[
                                    ...(!selectedVat && config.vatCountry
                                        ? [{ value: config.vatCountry, label: config.vatCountry }]
                                        : []),
                                    ...vatCountries.map((entry) => ({ value: entry.label, label: entry.label })),
                                ]}
                                onChange={(next) => {
                                    const country = vatCountries.find((entry) => entry.label === next);
                                    patch({ vatCountry: next, vatRate: country?.rates[0] ?? config.vatRate });
                                }}
                            />
                        </div>
                        <div className="ofi-ord-row">
                            <span className="ofi-ord-label">{t('inv.orders.vatColumn.rates')}</span>
                            <span className="ofi-ord-pills">
                                {(selectedVat?.rates ?? []).map((rate) => (
                                    <button
                                        key={rate}
                                        type="button"
                                        className={config.vatRate === rate ? 'is-on' : undefined}
                                        onClick={() => patch({ vatRate: rate })}
                                    >
                                        {fmtPercent(rate)}
                                    </button>
                                ))}
                                <input
                                    className="is-num"
                                    value={config.vatRate}
                                    inputMode="decimal"
                                    aria-label={t('inv.orders.columns.vat')}
                                    onChange={(event) => patch({ vatRate: clampPercent(event.target.value) })}
                                />
                                <em>%</em>
                            </span>
                        </div>
                    </div>
                </>
            )}

            {/* ── 3) WAS GELESEN WIRD ───────────────────────────────────────
                Die festen Felder — eine Liste, keine Auswahl. Der einzige Knopf
                darin ist das Minus an Rabatt 2, denn nur der ist freiwillig;
                ist er fort, holt ihn das Plus darunter zurück. In einer
                Preisanfrage stehen hier genau drei Zeilen und kein Knopf. */}
            <span className="ofi-ord-cap">{t('inv.aiImport.columnsTitle')}</span>
            <div className="ofi-ord-group">
                {columns.filter((column) => !column.key.startsWith('x')).map((column) => (
                    <div className={`ofi-ord-row${hidden.has(column.key) ? ' is-muted' : ''}`} key={column.key}>
                        {column.key === 'discount2' ? (
                            <button
                                type="button"
                                className="ofi-ord-dot is-remove"
                                aria-label={t('inv.aiImport.discount2Off')}
                                title={t('inv.aiImport.discount2Off')}
                                onClick={() => setPendingRemoval('discount2')}
                            >
                                <Minus size={13} />
                            </button>
                        ) : (
                            <span className="ofi-ord-bullet" aria-hidden="true" />
                        )}
                        <span className="ofi-ord-label is-grow">{column.name}</span>
                        <span className="ofi-ord-kind">
                            {column.type === 'number' ? t('inv.aiImport.columnNumber') : t('inv.aiImport.columnText')}
                        </span>
                        <button
                            type="button"
                            className={`ofi-ord-visibility${hidden.has(column.key) ? ' is-off' : ''}`}
                            onClick={() => toggleColumn(column.key)}
                            title={hidden.has(column.key) ? t('common.show') : t('common.hide')}
                            aria-label={hidden.has(column.key) ? t('common.show') : t('common.hide')}
                            aria-pressed={!hidden.has(column.key)}
                        >
                            {hidden.has(column.key) ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    </div>
                ))}
                {/* Rabatt 2 zurückholen — nur dort, wo es ihn überhaupt gibt.
                    Eine Preisanfrage kennt keine Rabatte. */}
                {!priceless && !config.discount2Enabled && (
                    <button type="button" className="ofi-ord-action" onClick={() => patch({ discount2Enabled: true })}>
                        <span className="ofi-ord-dot is-add"><Plus size={13} /></span>
                        {t('inv.orders.columns.discount2')}
                    </button>
                )}
            </div>
            <p className="ofi-ord-foot-note">
                {priceless ? `${t('inv.aiImport.columnsFixedThree')} ` : ''}
                {!goodsReceipt && t('inv.aiImport.codeAutoHint')}
            </p>

            {/* ── 4) DIE EIGENEN ANGABEN ────────────────────────────────────
                «Ihre Reihenfolge muss sich ändern lassen, die Spaltenüber-
                schriften wandern mit.» Ein Zug am Griff genügt: die Liste hier
                IST die Reihenfolge der Spalten in der Bestelltabelle und im PDF.
                Bei fünf Zeilen braucht das kein Bibliotheksgeschütz —
                `draggable` reicht, und der Griff sagt, wo man anfasst. */}
            <span className="ofi-ord-cap">{t('inv.aiImport.extrasTitle')}</span>
            <div className="ofi-ord-group">
                {extras.map((column, position) => (
                    <div
                        className={`ofi-ord-row${dragKey === column.key ? ' is-dragging' : ''}${hidden.has(column.key) ? ' is-muted' : ''}`}
                        key={column.key}
                        onDragOver={(event) => {
                            event.preventDefault();
                            if (!dragKey || dragKey === column.key) return;
                            const from = extras.findIndex((entry) => entry.key === dragKey);
                            if (from < 0 || from === position) return;
                            const next = [...extras];
                            const [moved] = next.splice(from, 1);
                            next.splice(position, 0, moved);
                            patch({ extraColumns: next });
                        }}
                    >
                        <button
                            type="button"
                            className="ofi-ord-dot is-remove"
                            onClick={() => setPendingRemoval(column.key)}
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                        >
                            <Minus size={13} />
                        </button>
                        <input
                            value={column.name}
                            placeholder={t('inv.aiImport.columnPlaceholder')}
                            maxLength={60}
                            onChange={(event) => patch({
                                extraColumns: extras.map((entry) => (entry.key === column.key
                                    ? { ...entry, name: event.target.value }
                                    : entry)),
                            })}
                        />
                        <SelectMenu
                            className="ofi-ord-menu is-narrow"
                            buttonClassName="ofi-ord-select"
                            ariaLabel={t('inv.aiImport.columnType')}
                            value={column.type}
                            listWidth={170}
                            options={[
                                { value: 'text', label: t('inv.aiImport.columnText') },
                                { value: 'number', label: t('inv.aiImport.columnNumber') },
                            ]}
                            onChange={(next) => patch({
                                extraColumns: extras.map((entry) => (entry.key === column.key
                                    ? { ...entry, type: next === 'number' ? 'number' : 'text' }
                                    : entry)),
                            })}
                        />
                        <button
                            type="button"
                            className={`ofi-ord-visibility${hidden.has(column.key) ? ' is-off' : ''}`}
                            onClick={() => toggleColumn(column.key)}
                            title={hidden.has(column.key) ? t('common.show') : t('common.hide')}
                            aria-label={hidden.has(column.key) ? t('common.show') : t('common.hide')}
                            aria-pressed={!hidden.has(column.key)}
                        >
                            {hidden.has(column.key) ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <label className="ofi-template-width">
                            <input
                                type="range"
                                min="80"
                                max="240"
                                step="10"
                                value={column.width ?? 120}
                                aria-label={`${column.name || t('inv.aiImport.columnPlaceholder')} width`}
                                onChange={(event) => patch({
                                    extraColumns: extras.map((entry) => (entry.key === column.key
                                        ? { ...entry, width: Number(event.target.value) }
                                        : entry)),
                                })}
                            />
                            <small>{column.width ?? 120}px</small>
                        </label>
                        {/* NUR der Griff ist ziehbar, nicht die ganze Zeile: sonst
                            liesse sich der Text im Feld nicht mehr markieren. */}
                        <span
                            className="ofi-ord-grip"
                            aria-hidden="true"
                            draggable
                            onDragStart={() => setDragKey(column.key)}
                            onDragEnd={() => setDragKey(null)}
                        >
                            ⠿
                        </span>
                    </div>
                ))}
                <button
                    type="button"
                    className="ofi-ord-action"
                    aria-disabled={extras.length >= maxExtras}
                    onClick={addExtra}
                >
                    <span className="ofi-ord-dot is-add"><Plus size={13} /></span>
                    {t('inv.aiImport.columnAdd')}
                </button>
            </div>
            {budgetWarning && (
                <p className="ofi-ord-foot-note is-warn" role="alert">
                    {t('inv.aiImport.extrasFull')}
                </p>
            )}
            {/* Zwei Grenzen, ein Satz (Vorgabe Samet, 07.09.2026): die Vorlage
                trägt bis zu fünf, eine Bestellung liest die ersten drei, eine
                Preisanfrage alle fünf. */}
            <p className="ofi-ord-foot-note">
                {t('inv.aiImport.extrasHint', { max: maxExtras })}{' '}
                {t('inv.aiImport.extrasFreeSlot')}
            </p>

            <ConfirmDialog
                open={pendingRemoval !== null}
                title={pendingRemoval === 'discount2'
                    ? t('inv.aiImport.discount2Off')
                    : t('inv.aiImport.extraRemoveTitle')}
                message={pendingRemoval === 'discount2'
                    ? t('inv.aiImport.discount2OffConfirm')
                    : t('inv.aiImport.extraRemoveConfirm')}
                onConfirm={() => {
                    if (pendingRemoval === 'discount2') {
                        patch({
                            discount2Enabled: false,
                            hiddenColumnKeys: (config.hiddenColumnKeys ?? []).filter((key) => key !== 'discount2'),
                        });
                    } else if (pendingRemoval) {
                        patch({
                            extraColumns: extras.filter((entry) => entry.key !== pendingRemoval),
                            hiddenColumnKeys: (config.hiddenColumnKeys ?? []).filter((key) => key !== pendingRemoval),
                        });
                    }
                    setPendingRemoval(null);
                }}
                onCancel={() => setPendingRemoval(null)}
                /* Über dem Vorlagenfenster (900), sonst läge die Rückfrage
                   dahinter und niemand könnte sie beantworten. */
                zIndex={960}
            />
        </>
    );
};
