import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { AlertTriangle, Check, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { OrderCalcMode, SupplierCalcConfig } from '@/types/inventory';
import { CALC_REQUIRED_LABELS, missingCalcLabels, templateColumns, templateLabelName } from '../import/importTemplate';

/* ═══════════════════════════════════════════════════════════════════════════
   DIE RECHENART (Vorgabe Samet, 14.09.2026)

   «Die Berechnungsarten müssen in Bestellung und Wareneingang zurück: neben
   den Bearbeiten-Stift ein Knopf ‹Berechnung›; was dort gewählt wird, danach
   wird gerechnet. Fehlen die Schlüssel, soll es einen Fehler geben — welcher
   Schlüssel fehlt.»

   Eine Karte in derselben Apple-Kiste wie die Bestelldetails. Ein Klick auf
   eine Art WENDET SIE AN (keine zweite Bestätigung): die Seite rechnet sofort
   um. Verlangt die Art Schlüssel, die die Vorlage nicht zugeordnet hat, bleibt
   die bisherige Art stehen und die Karte nennt die fehlenden.
   ═════════════════════════════════════════════════════════════════════════ */

const MODES: OrderCalcMode[] = ['DIRECT', 'AUTO', 'SUPPLIER'];

const MODE_LABEL: Record<OrderCalcMode, string> = {
    DIRECT: 'inv.orders.calcMode.direct',
    AUTO: 'inv.orders.calcMode.auto',
    SUPPLIER: 'inv.orders.calcMode.supplier',
};

const MODE_HINT: Record<OrderCalcMode, string> = {
    DIRECT: 'inv.orders.calcMode.directHint',
    AUTO: 'inv.orders.calcMode.autoHint',
    SUPPLIER: 'inv.orders.calcMode.supplierHint',
};

export const CalcModeCard = ({
    open,
    onClose,
    mode,
    config,
    onApply,
    error,
}: {
    open: boolean;
    onClose: () => void;
    mode: OrderCalcMode;
    config: SupplierCalcConfig;
    /** Die Seite prüft und rechnet um; die Karte zeigt nur. */
    onApply: (mode: OrderCalcMode) => void;
    /** Die fehlenden Schlüssel des letzten Versuchs (null = kein Fehler). */
    error: string | null;
}) => {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const present = new Set(templateColumns(config).map((column) => column.label).filter(Boolean));

    return createPortal(
        <div
            className="ofi-ord-scrim"
            role="dialog"
            aria-modal="true"
            aria-label={t('inv.orders.calcMode.title')}
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className="ofi-ord ofi-calc">
                <div className="ofi-ord-head">
                    <span className="ofi-ord-ghost" />
                    <b>{t('inv.orders.calcMode.title')}</b>
                    <button type="button" className="ofi-ord-x" onClick={onClose} aria-label={t('common.close')}>
                        <X size={16} />
                    </button>
                </div>

                <div className="ofi-ord-body">
                    <div className="ofi-ord-group">
                        {MODES.map((entry) => {
                            const missing = missingCalcLabels(config, entry);
                            const active = entry === mode;
                            return (
                                <button
                                    key={entry}
                                    type="button"
                                    className={`ofi-calc-option${active ? ' is-on' : ''}${missing.length ? ' is-blocked' : ''}`}
                                    aria-pressed={active}
                                    onClick={() => onApply(entry)}
                                >
                                    <span className="ofi-calc-radio">{active && <Check size={13} />}</span>
                                    <span className="ofi-calc-text">
                                        <b>{t(MODE_LABEL[entry])}</b>
                                        <small>{t(MODE_HINT[entry])}</small>
                                    </span>
                                    {missing.length > 0 && (
                                        <span className="ofi-calc-badge">{t('inv.orders.calcMode.keysMissingShort', { count: missing.length })}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Die Schlüssel, die Automatik und Lieferantenberechnung
                        verlangen — grün zugeordnet, rot fehlend. */}
                    <span className="ofi-ord-cap">{t('inv.orders.calcMode.requiredKeys')}</span>
                    <div className="ofi-ord-group ofi-calc-keys">
                        {CALC_REQUIRED_LABELS.map((label) => {
                            const ok = present.has(label);
                            return (
                                <span key={label} className={`ofi-calc-key${ok ? ' is-ok' : ' is-missing'}`}>
                                    <i>{ok ? <Check size={12} /> : <X size={12} />}</i>
                                    {templateLabelName(label)}
                                </span>
                            );
                        })}
                    </div>
                </div>

                <div className="ofi-ord-footbar">
                    {error
                        ? (
                            <span className="ofi-ord-err ofi-calc-err">
                                <AlertTriangle size={14} />
                                {error}
                            </span>
                        )
                        : <span className="ofi-calc-current">{t(MODE_LABEL[mode])}</span>}
                    <button type="button" className="ofi-ord-done" onClick={onClose}>
                        {t('common.done')}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
