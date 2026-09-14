import { useEffect, useState, type ReactNode } from 'react';

import { PopupActions, PopupButton, PopupCard, PopupField } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { DateTimeField } from '../shared/DateTimeField';

/**
 * Kleines Fenster für EINEN Zeitpunkt (Anfang, Ende, Erinnerung, Termin eines
 * Checklistenpunkts). Eine schwebende Karte statt eines Aufklappers: die
 * Datumsauswahl öffnet selbst eine Liste, und ein Aufklapper im Aufklapper
 * schlösse sich beim ersten Klick in den Kalender.
 */
export const DateEditCard = ({
    open,
    title,
    label,
    value,
    defaultTime = '18:00',
    busy = false,
    quick,
    onClose,
    onSave,
}: {
    open: boolean;
    title: string;
    label: string;
    value: string | null;
    defaultTime?: string;
    busy?: boolean;
    /** Schnellwahl unter dem Feld (z. B. «Bugün» / «Yarın»). */
    quick?: (set: (next: string | null) => void) => ReactNode;
    onClose: () => void;
    onSave: (next: string | null) => void;
}) => {
    const [draft, setDraft] = useState<string | null>(value);

    useEffect(() => { if (open) setDraft(value); }, [open, value]);

    return (
        <PopupCard
            open={open}
            onClose={onClose}
            title={title}
            width={380}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={busy} onClick={() => onSave(draft)}>
                        {t('common.save')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <PopupField label={label}>
                <DateTimeField value={draft} onChange={setDraft} label={label} defaultTime={defaultTime} />
            </PopupField>
            {quick ? <div className="ofi-gv-detail-quick">{quick(setDraft)}</div> : null}
        </PopupCard>
    );
};
