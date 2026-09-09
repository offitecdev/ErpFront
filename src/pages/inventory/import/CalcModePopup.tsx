import { Calculator, Check, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { OrderCalcMode, SupplierCalcConfig } from '@/types/inventory';
import '@/styles/purchaseImport.css';
/* Die Kiste im Apple-Stil, in der die Vorlage jetzt steht. */
import '@/styles/orderDetails.css';

import { fmtPercent } from '../utils/orderPricing';
import { CALC_MODES, calcModeHint, calcModeLabel, templateSummary } from './importTemplate';

/**
 * ── DAS RECHENFENSTER ───────────────────────────────────────────────────────
 *
 * Vorgabe Samet (07.09.2026): «Und da ist der Rechenmodus; schaltet man ihn ein
 * — oder klickt darauf —, soll sich der Bildschirm ändern. Es soll ein Fenster
 * für die Berechnung erscheinen, in dem man eine der drei Möglichkeiten wählt,
 * und der in der Vorlage gewählte Teil wird dann aktiv und rechnet danach.»
 *
 * Drei Möglichkeiten, drei Sätze — und darunter, was die aktive Vorlage dazu
 * beisteuert (Rabatte, Staffel, Steuersatz). Wer hier wählt, ändert nicht eine
 * Einstellung irgendwo, sondern die BESTELLUNG auf dem Bildschirm: die Tabelle
 * rechnet ab dem Klick nach dieser Art, und die Fläche färbt sich, damit man
 * sieht, dass gerechnet wird.
 *
 * Manuelle Eingabe ist die eine Möglichkeit, die nichts rechnet — sie ist der
 * Weg zurück.
 */

export const CalcModePopup = ({ open, onClose, mode, onPick, config, templateTitle }: {
    open: boolean;
    onClose: () => void;
    mode: OrderCalcMode;
    onPick: (mode: OrderCalcMode) => void;
    /** Die aktive Vorlage — sie liefert, womit gerechnet wird. */
    config: SupplierCalcConfig;
    templateTitle: string;
}) => {
    if (!open) return null;

    const stack = (config.discounts ?? []).filter((value) => value > 0);

    return (
        <div
            className="ofi-poi-scrim"
            style={{ zIndex: 900 }}
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className="ofi-poi is-calc" style={{ width: 'min(560px, 100%)', height: 'auto', maxHeight: '86vh' }}>
                <div className="ofi-poi-head">
                    <div className="ofi-poi-title">
                        <b>{t('inv.aiImport.calcTitle')}</b>
                        <span>{templateTitle}</span>
                    </div>
                    <button type="button" className="ofi-poi-x" onClick={onClose} aria-label={t('common.close')}>
                        <X size={17} />
                    </button>
                </div>

                <div className="ofi-poi-body">
                    {CALC_MODES.map((entry) => (
                        <button
                            key={entry}
                            type="button"
                            className={`ofi-poi-modeopt${mode === entry ? ' is-on' : ''}`}
                            onClick={() => { onPick(entry); onClose(); }}
                        >
                            <i>{mode === entry ? <Check size={14} /> : <Calculator size={14} />}</i>
                            <div>
                                <b>{calcModeLabel(entry)}</b>
                                <span>{calcModeHint(entry)}</span>
                            </div>
                        </button>
                    ))}

                    {/* Was die Vorlage beisteuert. Es steht hier, weil die Wahl
                        oben sonst im Leeren stünde: «automatisch» heisst genau
                        das, was hier aufgezählt ist. */}
                    <div className="ofi-poi-card" style={{ marginTop: 14 }}>
                        <h4>{t('inv.aiImport.calcFromTemplate')}</h4>
                        <p style={{ margin: 0 }}>{templateSummary(config)}</p>
                        <div className="ofi-poi-usage" style={{ marginTop: 10 }}>
                            {stack.length > 0 && (
                                <span className="ofi-poi-badge">
                                    {t('inv.orders.columns.discount')}
                                    <b>{stack.map((value) => fmtPercent(value)).join(' + ')}</b>
                                </span>
                            )}
                            {config.qtyTiers?.length > 0 && (
                                <span className="ofi-poi-badge">
                                    {t('inv.aiImport.tiersTitle')}
                                    <b>{config.qtyTiers.length}</b>
                                </span>
                            )}
                            {config.vatRate > 0 && (
                                <span className="ofi-poi-badge">
                                    {t('inv.orders.columns.vat')}
                                    <b>{fmtPercent(config.vatRate)}</b>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="ofi-poi-foot">
                    <span className="ofi-poi-spacer" />
                    <button type="button" className="ofi-poi-btn" onClick={onClose}>{t('common.close')}</button>
                </div>
            </div>
        </div>
    );
};
