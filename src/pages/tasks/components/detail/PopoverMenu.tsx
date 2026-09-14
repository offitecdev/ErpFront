import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { LuCheck } from 'react-icons/lu';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';

/**
 * Das Menü der Detailseite (⋯ der Seite, ⋯ eines Blocks, «Ekle», Checklisten):
 * EIN Aufklappfenster am Auslöser, Zeilen = `.ofi-option-row` (die app-weite
 * Zeilenfüllung), Trenner und kleine Überschriften. Vorgabe Samet: der Inhalt
 * eines Menüs muss klar sichtbar sein — darum die Hausfläche AnchoredPicker
 * (Portal, klappt nach oben, wenn unten kein Platz ist) statt eines eigenen
 * absolut gesetzten Kastens, der im Panel abgeschnitten würde.
 */

export type MenuEntry =
    | {
        kind?: 'item';
        key: string;
        label: string;
        icon?: ReactNode;
        onSelect: () => void;
        danger?: boolean;
        /** Gesetzt = Auswahlzeile (Haken bei true). */
        checked?: boolean;
        disabled?: boolean;
    }
    | { kind: 'separator'; key: string }
    | { kind: 'caption'; key: string; label: string };

export const PopoverMenu = ({
    anchorEl,
    onClose,
    entries,
    width = 220,
    focusFirst = false,
    label,
}: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    entries: MenuEntry[];
    width?: number;
    /** Tastatur: erste Zeile fokussieren (Menü aus «/» oder per Tastatur geöffnet). */
    focusFirst?: boolean;
    label?: string;
}) => {
    const listRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!anchorEl || !focusFirst) return undefined;
        const id = window.requestAnimationFrame(() => {
            listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        });
        return () => window.cancelAnimationFrame(id);
    }, [anchorEl, focusFirst]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        if (!rows.length) return;
        event.preventDefault();
        const index = rows.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown'
            ? rows[(index + 1) % rows.length]
            : rows[(index - 1 + rows.length) % rows.length];
        next?.focus();
    };

    return (
        <AnchoredPicker anchorEl={anchorEl} onClose={onClose} width={width} maxHeight={440} panelClassName="ofi-gv-picker ofi-gv-menu">
            <div ref={listRef} role="menu" aria-label={label} className="ofi-gv-picker__list ofi-gv-menu__list" onKeyDown={onKeyDown}>
                {entries.map((entry) => {
                    if (entry.kind === 'separator') return <div key={entry.key} role="separator" className="ofi-gv-menu__sep" />;
                    if (entry.kind === 'caption') return <div key={entry.key} className="ofi-gv-menu__caption">{entry.label}</div>;
                    const radio = entry.checked !== undefined;
                    return (
                        <button
                            key={entry.key}
                            type="button"
                            role={radio ? 'menuitemradio' : 'menuitem'}
                            aria-checked={radio ? Boolean(entry.checked) : undefined}
                            disabled={entry.disabled}
                            className={`ofi-option-row ofi-gv-picker__row ofi-gv-menu__row ${entry.danger ? 'is-danger' : ''}`}
                            onClick={() => {
                                onClose();
                                entry.onSelect();
                            }}
                        >
                            {entry.icon ?? <i className="ofi-gv-menu__noicon" aria-hidden />}
                            <span className="ofi-gv-picker__name">{entry.label}</span>
                            {entry.checked ? <LuCheck size={14} className="ofi-gv-menu__check" /> : null}
                        </button>
                    );
                })}
            </div>
        </AnchoredPicker>
    );
};
