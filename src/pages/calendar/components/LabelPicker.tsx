import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ChevronDown } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { calLabelDisplayName, labelSurface, type CalLabel } from '../calendarShared';

/**
 * DAS ETIKETT EINES EINTRAGS WÄHLEN (25.08.2026).
 *
 * Ein Knopf, der die Pille zeigt, wie sie nachher im Raster steht, und eine
 * kurze Liste derselben Pillen darunter. Kein Auswahlfeld mit Text: die Farbe
 * IST die Aussage, und ein `<select>` kann sie nicht zeigen.
 *
 * «Ohne Etikett» steht NICHT zur Wahl: jeder Eintrag trägt eines. Leer bleibt
 * der Knopf nur, solange die Liste noch nicht geladen ist oder das Etikett
 * eines alten Eintrags gelöscht wurde.
 *
 * Die Liste hängt am Körper (Portal), nicht am Fenster: die Anlegekarte hat
 * ihre eigene Rollleiste und eine feste Höhe — eine Liste, die im Fenster
 * aufklappt, wäre nach zwei Zeilen abgeschnitten.
 */

const MENU_WIDTH = 232;

export const LabelPicker = ({ labels, value, onChange, disabled = false }: {
    labels: CalLabel[];
    value: string | null;
    onChange: (labelId: string | null) => void;
    disabled?: boolean;
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [box, setBox] = useState<{ left: number; top: number } | null>(null);

    const picked = labels.find((label) => label.id === value) ?? null;

    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-label-menu]') || target?.closest('[data-label-trigger]')) return;
            setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('pointerdown', close);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [open]);

    const toggle = () => {
        if (disabled) return;
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
            /* Nach unten, solange darunter Platz ist — sonst nach oben. Beides
               am Bildrand festgehalten, damit die Liste nie halb draussen steht. */
            const below = window.innerHeight - rect.bottom;
            const height = Math.min(288, labels.length * 32 + 12);
            setBox({
                left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)),
                top: below > height + 12 ? rect.bottom + 4 : Math.max(8, rect.top - height - 4),
            });
        }
        setOpen((current) => !current);
    };

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                data-label-trigger
                disabled={disabled}
                onClick={toggle}
                className={`ofi-cal-labelpick ${disabled ? 'is-disabled' : ''}`}
            >
                {picked ? (
                    <span className="ofi-cal-labelpill" style={labelSurface(picked.color)}>{calLabelDisplayName(picked)}</span>
                ) : (
                    <span className="ofi-cal-labelpick__empty">{t('calendar.labels.pick')}</span>
                )}
                <ChevronDown size={13} className="shrink-0 opacity-60" />
            </button>

            {open && box && createPortal(
                <div data-label-menu className="ofi-cal-labelmenu" style={{ left: box.left, top: box.top, width: MENU_WIDTH }}>
                    {/* KEIN «ohne Etikett» (Vorgabe 25.08.2026): jeder Eintrag
                        trägt eines, sonst hätte seine Karte keine Farbe. */}
                    {labels.map((label) => (
                        <button
                            key={label.id}
                            type="button"
                            title={calLabelDisplayName(label)}
                            onClick={() => { onChange(label.id); setOpen(false); }}
                            className={`ofi-cal-labelmenu__row ${value === label.id ? 'is-on' : ''}`}
                        >
                            <span className="ofi-ucal-dot" style={{ background: label.color }} />
                            <span className="truncate">{calLabelDisplayName(label)}</span>
                        </button>
                    ))}
                    {labels.length === 0 && (
                        <div className="ofi-cal-labelmenu__empty">{t('calendar.labels.empty')}</div>
                    )}
                </div>,
                document.body,
            )}
        </>
    );
};
