import { memo } from 'react';

import { ChevronRight } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * Der Weg von einer Übersichtskarte in den Bereich, den sie zusammenfasst —
 * „Öffnen ›" ganz rechts in der Kopfzeile, in der ruhigsten Form, die noch als
 * Verweis lesbar ist: Markenfarbe, kein Rahmen, keine Fläche. Beim Überfahren
 * legt sich der Markenton darunter und der Pfeil rückt ein Stück mit.
 *
 * Die Karte selbst bleibt UNANGETASTET: eine ganze Karte anklickbar zu machen
 * verschluckt die Zeilen darin, die je für sich woanders hinführen.
 */
export const CardLink = memo(({ label, onOpen }: {
    /** Wohin es geht — steht nur in der Vorlesehilfe, sichtbar bleibt „Öffnen". */
    label: string;
    onOpen: () => void;
}) => (
    <button
        type="button"
        onClick={onOpen}
        className="ofi-prj-card__link"
        aria-label={t('projects.detail.overview.openHint', { name: label })}
    >
        {t('projects.detail.overview.open')}
        <ChevronRight size={14} />
    </button>
));
