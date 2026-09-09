import { createPortal } from 'react-dom';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Menu02, RefreshCcw01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { dropOrderColumn, moveOrderColumn, type OrderColumnId } from '../utils/orderColumns';

/**
 * ── DIE SPALTENLISTE (Vorgabe Samet, 09.09.2026) ─────────────────────────────
 *
 * «…oder es gibt seitlich einen Listenknopf, über den man die Reihenfolge
 *  verwaltet, indem man sie untereinander stapelt.»
 *
 * Also genau das: eine Liste, in der die Spalten UNTEREINANDER stehen. Die
 * Umrechnung ist die einzige Regel, die man kennen muss und die deshalb auch
 * oben in der Karte steht: **oben in der Liste = links in der Tabelle**.
 *
 * Feste Felder und eigene Angaben liegen in DERSELBEN Liste und sehen gleich
 * aus; nur ein kleines Zeichen sagt, welche aus der Vorlage stammt — sonst
 * wären es wieder zwei Gruppen, die sich nicht mischen lassen, und das war ja
 * die Klage.
 *
 * Bewegt wird auf zwei Wegen, weil beide gebraucht werden: ZIEHEN am Griff
 * (schnell, wenn man weit springt) und die zwei PFEILE (genau, und der einzige
 * Weg mit der Tastatur). Die Karte steht MITTIG über der Seite wie die
 * Bestelldetails daneben — sie schiebt die Tabelle nicht weg.
 */
export const ColumnOrderPopup = ({
    open,
    order,
    labelOf,
    isExtra,
    onChange,
    onReset,
    onClose,
}: {
    open: boolean;
    order: OrderColumnId[];
    /** Die Beschriftung, die die Spalte auch in der Tabelle trägt. */
    labelOf: (id: OrderColumnId) => string;
    /** Stammt die Spalte aus der Vorlage (eigene Angabe)? */
    isExtra: (id: OrderColumnId) => boolean;
    onChange: (next: OrderColumnId[]) => void;
    onReset: () => void;
    onClose: () => void;
}) => {
    const [dragging, setDragging] = useState<OrderColumnId | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);

    if (!open) return null;

    const finishDrop = (targetIndex: number) => {
        if (dragging) onChange(dropOrderColumn(order, dragging, targetIndex));
        setDragging(null);
        setOverIndex(null);
    };

    return createPortal(
        <div
            className="ofi-ord-scrim"
            role="dialog"
            aria-modal="true"
            aria-label={t('inv.orders.columnOrder.title')}
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className="ofi-ord">
                <div className="ofi-ord-head">
                    <span className="ofi-ord-ghost" />
                    <b>{t('inv.orders.columnOrder.title')}</b>
                    <button type="button" className="ofi-ord-x" onClick={onClose} aria-label={t('common.close')}>
                        <X size={16} />
                    </button>
                </div>

                <div className="ofi-ord-body">
                    <span className="ofi-ord-cap">{t('inv.orders.columnOrder.hint')}</span>
                    <div className="ofi-ord-group">
                        {order.map((id, index) => (
                            <div
                                key={id}
                                draggable
                                onDragStart={() => setDragging(id)}
                                onDragEnd={() => { setDragging(null); setOverIndex(null); }}
                                onDragOver={(event) => { event.preventDefault(); setOverIndex(index); }}
                                onDrop={(event) => { event.preventDefault(); finishDrop(index); }}
                                className={`ofi-ord-row ofi-colrow${dragging === id ? ' is-dragging' : ''}${overIndex === index && dragging !== id ? ' is-over' : ''}`}
                            >
                                <span className="ofi-colrow__grip" aria-hidden>
                                    <Menu02 size={14} />
                                </span>
                                <span className="ofi-colrow__pos">{index + 1}</span>
                                <span className="ofi-colrow__name">
                                    {labelOf(id)}
                                    {isExtra(id) && (
                                        <em className="ofi-colrow__tag">{t('inv.orders.columnOrder.fromTemplate')}</em>
                                    )}
                                </span>
                                <span className="ofi-colrow__moves">
                                    <button
                                        type="button"
                                        disabled={index === 0}
                                        onClick={() => onChange(moveOrderColumn(order, id, -1))}
                                        title={t('inv.orders.columnOrder.moveUp')}
                                        aria-label={t('inv.orders.columnOrder.moveUp')}
                                    >
                                        <ArrowUp size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={index === order.length - 1}
                                        onClick={() => onChange(moveOrderColumn(order, id, 1))}
                                        title={t('inv.orders.columnOrder.moveDown')}
                                        aria-label={t('inv.orders.columnOrder.moveDown')}
                                    >
                                        <ArrowDown size={13} />
                                    </button>
                                </span>
                            </div>
                        ))}
                        {/* Die letzte Ablegestelle: ganz nach unten (= ganz nach rechts). */}
                        <div
                            onDragOver={(event) => { event.preventDefault(); setOverIndex(order.length); }}
                            onDrop={(event) => { event.preventDefault(); finishDrop(order.length); }}
                            className={`ofi-colrow__end${overIndex === order.length ? ' is-over' : ''}`}
                            aria-hidden
                        />
                    </div>

                    <button type="button" className="ofi-ord-action" onClick={onReset}>
                        <RefreshCcw01 size={15} />
                        {t('inv.orders.columnOrder.reset')}
                    </button>
                </div>

                <div className="ofi-ord-footbar">
                    <button type="button" className="ofi-ord-done" onClick={onClose}>
                        {t('common.done')}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
