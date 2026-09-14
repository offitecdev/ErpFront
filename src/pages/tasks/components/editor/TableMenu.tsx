import type { ReactNode } from 'react';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import { TABLE_CELL_COLORS, type CellVAlign } from './tableModel';

/**
 * Menü einer Tabelle (Vorbild Samet, 14.09.2026): Zellfarbe als Farbfeld,
 * Breite (Notiz/Fenster), senkrechte Ausrichtung, Spalten gleich verteilen,
 * Löschen. Geöffnet vom Pfeil der Zelle, vom Spalten-/Zeilengriff oder vom
 * Griff oben links.
 */
export const TableMenu = ({
    anchorEl,
    onClose,
    cellBg,
    vAlign,
    fit,
    onCellBg,
    onFit,
    onVAlign,
    onDistribute,
    onDeleteColumns,
    onDeleteRows,
    onDeleteTable,
}: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    cellBg: string;
    vAlign: CellVAlign;
    fit: 'note' | 'window' | undefined;
    onCellBg: (color: string) => void;
    onFit: (fit: 'note' | 'window') => void;
    onVAlign: (align: CellVAlign) => void;
    onDistribute: () => void;
    onDeleteColumns: () => void;
    onDeleteRows: () => void;
    onDeleteTable: () => void;
}) => {
    const row = (key: string, label: string, run: () => void, marked?: boolean): ReactNode => (
        <button
            key={key}
            type="button"
            role={marked !== undefined ? 'menuitemradio' : 'menuitem'}
            aria-checked={marked !== undefined ? marked : undefined}
            className="ofi-option-row ofi-gv-picker__row ofi-gv-menu__row ofi-gv-tblmenu__row"
            onClick={() => { onClose(); run(); }}
        >
            <i className={`ofi-gv-tblmenu__mark ${marked ? 'is-on' : ''}`} aria-hidden />
            <span className="ofi-gv-picker__name">{label}</span>
        </button>
    );

    return (
        <AnchoredPicker anchorEl={anchorEl} onClose={onClose} width={296} maxHeight={560} panelClassName="ofi-gv-picker ofi-gv-menu ofi-gv-tblmenu">
            <div role="menu" aria-label={t('tasksModule.editor.table.menu')} className="ofi-gv-picker__list ofi-gv-menu__list">
                <div className="ofi-gv-tblmenu__caption">{t('tasksModule.editor.table.cellBackground')}</div>
                <div className="ofi-gv-tblmenu__swatches" role="radiogroup" aria-label={t('tasksModule.editor.table.cellBackground')}>
                    {TABLE_CELL_COLORS.map((color) => (
                        <button
                            key={color.value || 'none'}
                            type="button"
                            role="radio"
                            aria-checked={cellBg === color.value}
                            aria-label={color.value || t('tasksModule.editor.table.noColor')}
                            title={color.value || t('tasksModule.editor.table.noColor')}
                            className={`ofi-gv-tblmenu__swatch ofi-btn-plain ${cellBg === color.value ? 'is-on' : ''} ${color.value ? '' : 'is-none'}`}
                            style={color.value ? { background: color.value } : undefined}
                            onClick={() => { onClose(); onCellBg(color.value); }}
                        />
                    ))}
                </div>
                <div role="separator" className="ofi-gv-menu__sep" />
                {row('fit-note', t('tasksModule.editor.table.noteWidth'), () => onFit('note'), fit === 'note')}
                {row('fit-window', t('tasksModule.editor.table.windowWidth'), () => onFit('window'), fit === 'window')}
                <div role="separator" className="ofi-gv-menu__sep" />
                <div className="ofi-gv-tblmenu__caption is-small">{t('tasksModule.editor.table.cellAlignment')}</div>
                {row('va-top', t('tasksModule.editor.table.alignTop'), () => onVAlign('top'), vAlign === 'top')}
                {row('va-middle', t('tasksModule.editor.table.alignMiddle'), () => onVAlign('middle'), vAlign === 'middle')}
                {row('va-bottom', t('tasksModule.editor.table.alignBottom'), () => onVAlign('bottom'), vAlign === 'bottom')}
                <div role="separator" className="ofi-gv-menu__sep" />
                {row('distribute', t('tasksModule.editor.table.distribute'), onDistribute)}
                <div role="separator" className="ofi-gv-menu__sep" />
                {row('del-cols', t('tasksModule.editor.table.deleteColumns'), onDeleteColumns)}
                {row('del-rows', t('tasksModule.editor.table.deleteRows'), onDeleteRows)}
                {row('del-table', t('tasksModule.editor.table.deleteTable'), onDeleteTable)}
            </div>
        </AnchoredPicker>
    );
};
