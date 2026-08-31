import { useRef } from 'react';

import { Plus, Settings01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { anchorFromRect, calLabelDisplayName, type CalLabel, type FloatAnchor } from '../calendarShared';

/**
 * DIE ETIKETTEN IN DER LEISTE (25.08.2026, Vorgabe Samet).
 *
 * EINE flache Reihe — ausdrücklich KEINE Unterpunkte mehr unter einem
 * Sammelbegriff «Termine»: ein Etikett ist ein Etikett, und der Pfeil, der
 * die drei Stände eines Termins auf- und zuklappte, ist damit weg.
 *
 * Es ist EINE Zeile je ROLLE, mehr nicht — insbesondere KEINE Zeile «ohne
 * Etikett» (Vorgabe 25.08.2026): jeder Eintrag trägt eines, es gäbe dort also
 * nichts zu sammeln. Gepflegt wird die Liste hinter dem ZAHNRAD neben der
 * Überschrift — dort wird umbenannt, umgefärbt, ausgeblendet und gelöscht.
 * Die Zeile selbst bleibt darum eines: ein Haken, der ihr Etikett im Raster
 * zeigt oder wegnimmt.
 *
 * Die Leiste ist 172px breit. Ein Name, der nicht hineinpasst, wird
 * abgeschnitten und endet mit «…» (Vorgabe) — vollständig steht er im
 * Tooltip.
 */

const LabelRow = ({ color, name, count, checked, title, onToggle }: {
    color: string;
    name: string;
    count: number;
    checked: boolean;
    title: string;
    onToggle: () => void;
}) => (
    <button type="button" onClick={onToggle} title={title} className="ofi-cal-railrow">
        <span className={`ofi-cal-check ${checked ? 'is-on' : ''}`}>
            {checked && <span className="ofi-cal-check__mark" />}
        </span>
        <span className="ofi-ucal-dot" style={{ background: color }} />
        <span className="ofi-cal-labelrow__name">{name}</span>
        <span className="ofi-cal-railcount">{count}</span>
    </button>
);

export const LabelRail = ({ labels, counts, hidden, canManage, onToggle, onOpenSettings, onAdd }: {
    labels: CalLabel[];
    /** Wie viele Einträge im gezeigten Zeitraum je Etikett — Kennung → Anzahl. */
    counts: Map<string, number>;
    hidden: Set<string>;
    canManage: boolean;
    onToggle: (id: string) => void;
    onOpenSettings: (anchor: FloatAnchor) => void;
    onAdd: (anchor: FloatAnchor) => void;
}) => {
    const gearRef = useRef<HTMLButtonElement>(null);
    const addRef = useRef<HTMLButtonElement>(null);

    const anchorOf = (element: HTMLElement | null): FloatAnchor => {
        const rect = element?.getBoundingClientRect();
        return rect ? anchorFromRect(rect) : { left: 0, top: 0, right: 0, bottom: 0 };
    };

    return (
        <>
            <div className="ofi-cal-labelhead">
                <span className="ofi-cal-rail-title">{t('calendar.labels.title')}</span>
                {canManage && (
                    <button
                        ref={gearRef}
                        type="button"
                        onClick={() => onOpenSettings(anchorOf(gearRef.current))}
                        aria-label={t('calendar.labels.settingsTitle')}
                        title={t('calendar.labels.settingsTitle')}
                        className="ofi-cal-labelgear"
                    >
                        <Settings01 size={13} />
                    </button>
                )}
            </div>

            {labels.map((label) => {
                /* Der VORGEGEBENE Name steht in der Sprache des Benutzers, ein
                   selbst getippter, wie er getippt wurde — siehe
                   calLabelDisplayName. */
                const name = calLabelDisplayName(label);
                return (
                    <LabelRow
                        key={label.id}
                        color={label.color}
                        name={name}
                        count={counts.get(label.id) ?? 0}
                        checked={!hidden.has(label.id)}
                        title={name}
                        onToggle={() => onToggle(label.id)}
                    />
                );
            })}

            {canManage && (
                <button
                    ref={addRef}
                    type="button"
                    onClick={() => onAdd(anchorOf(addRef.current))}
                    className="ofi-cal-labeladd"
                >
                    <Plus size={13} />
                    <span className="truncate">{t('calendar.labels.add')}</span>
                </button>
            )}
        </>
    );
};
