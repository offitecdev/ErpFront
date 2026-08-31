import { useEffect, useMemo, useState } from 'react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import type { DeliveryResponseItem, DeliveryStatus } from '@/lib/api/project';
import { t } from '@/i18n/translate';

import { answeredCount, STATUS_ORDER, statusLabelKey, type ReportChecklist } from './checklistModel';

/**
 * "Checkliste ausfüllen" — das saubere Ausfüll-Popup (Benutzerwunsch).
 *
 * Ein Punkt pro Zeile: links der Kontrollpunkt, rechts die drei grossen
 * Schalter Ja / Nein / N/A. Die BESCHREIBUNG liegt DIREKT DARUNTER, über die
 * ganze Breite — kein zusammengequetschtes Feld in derselben Zeile und nichts
 * am Kopf der Liste.
 *
 * Die Antworten werden lokal gehalten und erst mit "Übernehmen" in den Rapport
 * geschrieben; gespeichert wird der Rapport wie immer über sein "Speichern".
 */
export const ChecklistFillDialog = ({
    open,
    checklist,
    onClose,
    onApply,
}: {
    open: boolean;
    checklist: ReportChecklist | null;
    onClose: () => void;
    onApply: (items: DeliveryResponseItem[]) => void;
}) => {
    const [items, setItems] = useState<DeliveryResponseItem[]>([]);

    useEffect(() => {
        if (!open || !checklist) return;
        setItems(checklist.items.map((item) => ({ ...item })));
    }, [open, checklist]);

    const done = useMemo(() => answeredCount(items), [items]);

    const setStatus = (id: string, status: DeliveryStatus) =>
        setItems((rows) => rows.map((row) => (row.id === id ? { ...row, status: row.status === status ? null : status } : row)));
    const setMeasurement = (id: string, measurement: string) =>
        setItems((rows) => rows.map((row) => (row.id === id ? { ...row, measurement } : row)));

    /** "Alles in Ordnung" — der häufigste Fall in einem Zug. */
    const markAllYes = () => setItems((rows) => rows.map((row) => (row.status ? row : { ...row, status: 'YES' })));

    if (!checklist) return null;

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={checklist.name}
            subtitle={t('projects.delivery.answered', { done, total: items.length })}
            width={680}
            footer={(
                <PopupActions start={(
                    <PopupButton onClick={markAllYes}>{t('projects.delivery.markAllYes')}</PopupButton>
                )}>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" onClick={() => { onApply(items); onClose(); }}>
                        {t('projects.delivery.apply')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-dlv-filllist">
                {items.map((item) => (
                    <div key={item.id} className="ofi-dlv-fillrow">
                        <div className="ofi-dlv-fillrow__head">
                            <span className="ofi-dlv-fillrow__label">{item.label}</span>
                            <div className="ofi-dlv-seg" role="group" aria-label={item.label}>
                                {STATUS_ORDER.map((status) => (
                                    <button
                                        key={status}
                                        type="button"
                                        aria-pressed={item.status === status}
                                        className={`ofi-dlv-seg__btn is-${status.toLowerCase()} ${item.status === status ? 'is-on' : ''}`}
                                        onClick={() => setStatus(item.id, status)}
                                    >
                                        {t(statusLabelKey[status])}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {item.measurementEnabled !== false && (
                            <input
                                className="ofi-cal-input ofi-dlv-fillrow__desc"
                                value={item.measurement || ''}
                                placeholder={t('projects.delivery.measurementPlaceholder')}
                                onChange={(event) => setMeasurement(item.id, event.target.value)}
                            />
                        )}
                    </div>
                ))}
            </div>
        </PopupDialog>
    );
};

export default ChecklistFillDialog;
