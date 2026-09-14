import {
    memo,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ClipboardEvent,
    type CSSProperties,
    type KeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
} from 'react';
import { LuChevronDown, LuPlus } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { ContentBlock } from '@/types/tasksModule';
import { insertPlainText } from './editorDom';
import {
    TABLE_DEFAULT_COL_PX,
    TABLE_MAX_COLS,
    TABLE_MAX_ROWS,
    TABLE_MIN_COL_PX,
    deleteColumns,
    deleteRows,
    distributeEvenly,
    fitTable,
    insertColumn,
    insertRow,
    isDarkCellColor,
    normalizeTable,
    paintRange,
    type CellVAlign,
    type TableMeta,
    type TableRange,
} from './tableModel';
import { TableMenu } from './TableMenu';

/** Breite der grauen Griffleisten oben und links. */
const STRIP = 16;
/** So nah (px) an einer Kante zeigt die Leiste das «+» statt des Griffs. */
const EDGE_HIT = 10;

/* Zeilenumbrüche in Zellen: `plaintext-only` legt keine <div>/<b> an. Ältere
   Browser kennen den Wert nicht — dort bleibt `true`, gelesen wird ohnehin
   über innerText. */
const EDITABLE_VALUE: 'plaintext-only' | 'true' = (() => {
    if (typeof document === 'undefined') return 'true';
    try {
        const probe = document.createElement('div');
        probe.contentEditable = 'plaintext-only';
        return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
    } catch {
        return 'true';
    }
})();

const cellText = (element: HTMLElement): string => {
    const text = (element.innerText ?? element.textContent ?? '').replace(/\r\n?/g, '\n');
    return text === '\n' ? '' : text;
};

const nearestEdge = (edges: readonly number[], position: number): number => {
    let best = -1;
    let distance = EDGE_HIT + 1;
    edges.forEach((edge, index) => {
        const gap = Math.abs(edge - position);
        if (gap < distance) {
            best = index;
            distance = gap;
        }
    });
    return best;
};

const cumulative = (sizes: readonly number[]): number[] => {
    const edges = [0];
    for (const size of sizes) edges.push(edges[edges.length - 1] + size);
    return edges;
};

/** Eine Zelle: Klartext, Inhalt nur beim Einhängen/Umbauen gesetzt (die Schreibmarke bleibt stehen). */
const Cell = ({
    value,
    editable,
    resetKey,
    row,
    column,
    background,
    vAlign,
    selected,
    onText,
    onKey,
    onMenu,
}: {
    value: string;
    editable: boolean;
    resetKey: string;
    row: number;
    column: number;
    background: string;
    vAlign: CellVAlign;
    selected: boolean;
    onText: (row: number, column: number, value: string) => void;
    onKey: (row: number, column: number, event: KeyboardEvent<HTMLDivElement>) => void;
    onMenu: (row: number, column: number, anchor: HTMLElement) => void;
}) => {
    const ref = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        if (ref.current) ref.current.textContent = value;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey, editable ? '' : value]);

    const dark = isDarkCellColor(background);
    return (
        <td
            className={`ofi-gv-tbl__cell ${selected ? 'is-selected' : ''} ${dark ? 'is-dark' : ''} ${background ? 'has-bg' : ''}`}
            // Farbe als Variable: die app-weiten Zeilen-Hover (dark.css, !important) lesen sie mit.
            style={{ '--cell-bg': background || undefined, verticalAlign: vAlign } as CSSProperties}
        >
            <div
                ref={ref}
                className="ofi-gv-tbl__text"
                data-table-cell={`${row}:${column}`}
                {...(editable
                    ? {
                        contentEditable: EDITABLE_VALUE,
                        suppressContentEditableWarning: true,
                        spellCheck: true,
                        role: 'textbox',
                        'aria-multiline': true,
                        onInput: (event) => onText(row, column, cellText(event.currentTarget)),
                        onKeyDown: (event) => onKey(row, column, event),
                        onPaste: (event: ClipboardEvent<HTMLDivElement>) => {
                            event.preventDefault();
                            insertPlainText(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'));
                        },
                    }
                    : {})}
            />
            {editable && (
                <button
                    type="button"
                    tabIndex={-1}
                    className="ofi-gv-tbl__chevron ofi-btn-plain"
                    aria-label={t('tasksModule.editor.table.menu')}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => onMenu(row, column, event.currentTarget)}
                >
                    <LuChevronDown size={14} />
                </button>
            )}
        </td>
    );
};

/**
 * Tabellenblock im Apple-Stil (14.09.2026, Vorbild Samet): dünne graue Linien,
 * sonst nichts. Die Griffleisten oben und links (samt der Punkte-Ecke, die die
 * ganze Tabelle wählt) erscheinen erst, wenn man in die Tabelle klickt — und
 * liegen AUSSERHALB der Tabelle, sie verschieben sie nicht. Überfahren einer Kante in der Leiste zeigt EIN
 * blaues «+» — ein Klick fügt dort eine Spalte bzw. Zeile ein. Spaltenkanten
 * in der Tabelle lassen sich ziehen; die Spalten sind fest (`table-layout:
 * fixed`), langer Text bricht in der Zelle um statt die Nachbarn zu drücken.
 * Das Menü (Pfeil in der Zelle, Griff, Ecke) trägt Farbe, Breite,
 * Ausrichtung, Verteilen und Löschen. Einfügen darf nur die Leitung — eine
 * bestehende Tabelle bearbeitet jede Person mit Bearbeitungsrecht.
 */
export const TableBlock = memo(({
    block,
    editable,
    rev,
    onTableChange,
}: {
    block: ContentBlock;
    editable: boolean;
    rev: string;
    /** null = Tabelle löschen. */
    onTableChange: (blockId: string, table: TableMeta | null) => void;
}) => {
    const table = useMemo(() => normalizeTable(block.meta), [block.meta]);
    // Die jüngste Fassung für Eingaben, die zwischen zwei Zeichnungen kommen.
    const tableRef = useRef(table);
    useLayoutEffect(() => { tableRef.current = table; }, [table]);
    const rowCount = table.rows.length;
    const columnCount = table.rows[0].length;

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<HTMLTableElement | null>(null);
    const [structRev, setStructRev] = useState(0);
    const [menu, setMenu] = useState<{ anchor: HTMLElement; range: TableRange } | null>(null);
    const [hoverCol, setHoverCol] = useState<{ edge: number } | { column: number } | null>(null);
    const [hoverRow, setHoverRow] = useState<{ edge: number } | { row: number } | null>(null);
    const [liveWidths, setLiveWidths] = useState<number[] | null>(null);
    const [space, setSpace] = useState({ note: 0, window: 0 });
    const [rowEdges, setRowEdges] = useState<number[]>([]);
    const focusAfterRef = useRef<string | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    /* Aktiv = zuletzt in die Tabelle geklickt. Ein Klick daneben (ausser ins
       Tabellenmenü, das als Portal am body hängt) blendet die Leisten aus. */
    const [active, setActive] = useState(false);
    useEffect(() => {
        if (!active) return undefined;
        const outside = (event: Event) => {
            const target = event.target as Element | null;
            if (!target || rootRef.current?.contains(target) || target.closest?.('.ofi-gv-tblmenu')) return;
            setActive(false);
        };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('focusin', outside, true);
        return () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('focusin', outside, true);
        };
    }, [active]);

    /* ── Platz messen: Notizbreite (eigener Kasten) und Fensterbreite (Modul) ── */
    useEffect(() => {
        const scroller = scrollRef.current;
        if (!scroller) return undefined;
        const pane = scroller.closest<HTMLElement>('.ofi-gv-detail') ?? scroller.closest<HTMLElement>('.ofi-gv');
        const measure = () => {
            const box = getComputedStyle(scroller);
            // Innenabstand (Platz für das «+» am Rand) gehört nicht zur Notizbreite.
            const note = Math.floor(scroller.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight));
            const windowWidth = Math.max(note, pane ? pane.clientWidth - 24 : note);
            setSpace((current) => (current.note === note && current.window === windowWidth ? current : { note, window: windowWidth }));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(scroller);
        if (pane) observer.observe(pane);
        return () => observer.disconnect();
    }, []);

    /* ── Spaltenbreiten in px ───────────────────────────────────────────── */
    const strip = editable ? STRIP : 0;
    const widths = useMemo(() => {
        if (liveWidths) return liveWidths;
        const base = table.colWidths ?? Array.from({ length: columnCount }, () => TABLE_DEFAULT_COL_PX);
        if (!table.fit) return base;
        const available = (table.fit === 'window' ? space.window : space.note) - strip - 1;
        if (available <= 0) return null;
        const total = base.reduce((sum, width) => sum + width, 0) || 1;
        const scaled = base.map((width) => Math.max(TABLE_MIN_COL_PX, Math.floor((width / total) * available)));
        // Rundungsrest in die letzte Spalte, damit die Tabelle genau bündig endet.
        scaled[scaled.length - 1] += Math.max(0, available - scaled.reduce((sum, width) => sum + width, 0));
        return scaled;
    }, [liveWidths, table.colWidths, table.fit, columnCount, space, strip]);
    const colEdges = useMemo(() => cumulative(widths ?? []), [widths]);
    const tableWidth = widths ? colEdges[colEdges.length - 1] : undefined;

    /* ── Zeilenhöhen für Leiste und «+» (Text bricht um: aus dem DOM) ──── */
    useLayoutEffect(() => {
        const grid = gridRef.current;
        if (!grid || !editable) return undefined;
        const measure = () => {
            const top = grid.getBoundingClientRect().top;
            const next = [0, ...Array.from(grid.rows, (row) => Math.round(row.getBoundingClientRect().bottom - top))];
            setRowEdges((current) => (current.join() === next.join() ? current : next));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(grid);
        return () => observer.disconnect();
    }, [editable, rowCount, columnCount]);

    // Nach dem Einfügen einer Zeile/Spalte die Schreibmarke in die neue Zelle.
    useLayoutEffect(() => {
        const target = focusAfterRef.current;
        if (!target) return;
        focusAfterRef.current = null;
        gridRef.current?.querySelector<HTMLElement>(`[data-table-cell="${target}"]`)?.focus();
    });

    /* ── Ändern ─────────────────────────────────────────────────────────── */
    const emit = (next: TableMeta | null) => onTableChange(block.id, next);
    const restructure = (next: TableMeta | null, focusCell?: string) => {
        if (focusCell) focusAfterRef.current = focusCell;
        setStructRev((value) => value + 1);
        setMenu(null);
        emit(next);
    };

    const onText = (row: number, column: number, value: string) => {
        const current = tableRef.current;
        const rows = current.rows.map((cells) => [...cells]);
        rows[row][column] = value;
        const next = { ...current, rows };
        tableRef.current = next;
        emit(next);
    };

    const addColumn = (at: number) => {
        if (columnCount >= TABLE_MAX_COLS) return;
        restructure(insertColumn(tableRef.current, at), `0:${at}`);
        setHoverCol(null);
    };

    const addRow = (at: number) => {
        if (rowCount >= TABLE_MAX_ROWS) return;
        restructure(insertRow(tableRef.current, at), `${at}:0`);
        setHoverRow(null);
    };

    const focusCell = (row: number, column: number) =>
        gridRef.current?.querySelector<HTMLElement>(`[data-table-cell="${row}:${column}"]`)?.focus();

    const onKey = (row: number, column: number, event: KeyboardEvent<HTMLDivElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Tab') {
            event.preventDefault();
            const flat = row * columnCount + column + (event.shiftKey ? -1 : 1);
            if (flat < 0) return;
            if (flat >= rowCount * columnCount) {
                addRow(rowCount);
                return;
            }
            focusCell(Math.floor(flat / columnCount), flat % columnCount);
        } else if (event.key === 'Escape') {
            event.currentTarget.blur();
        }
    };

    const openMenu = (anchor: HTMLElement, range: TableRange) => setMenu({ anchor, range });
    // Das Menü nimmt die Breite seines Auslösers an — am Griff einer breiten Spalte darum der Punkt.
    const handleAnchor = (handle: HTMLElement): HTMLElement => handle.querySelector<HTMLElement>('i') ?? handle;

    /* ── Spaltenkante ziehen ────────────────────────────────────────────── */
    const dragRef = useRef<{ index: number; startX: number; start: number[] } | null>(null);
    const onResizeDown = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
        if (!widths) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { index, startX: event.clientX, start: [...widths] };
        setLiveWidths([...widths]);
    };
    const onResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        const next = [...drag.start];
        next[drag.index] = Math.max(TABLE_MIN_COL_PX, Math.round(drag.start[drag.index] + event.clientX - drag.startX));
        setLiveWidths(next);
    };
    const onResizeUp = () => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag || !liveWidths) return;
        const changed = liveWidths.some((width, index) => width !== drag.start[index]);
        setLiveWidths(null);
        if (changed) emit({ ...tableRef.current, colWidths: liveWidths, fit: undefined });
    };

    /* ── Griffleisten ───────────────────────────────────────────────────── */
    // Über dem «+» selbst nichts neu berechnen — sonst verschwände es unter dem Zeiger.
    const overPlus = (event: ReactMouseEvent<HTMLDivElement>) => (event.target as HTMLElement).closest('.ofi-gv-tbl__plus') !== null;
    const onColBarMove = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (overPlus(event)) return;
        const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
        const edge = nearestEdge(colEdges, x);
        if (edge >= 0 && columnCount < TABLE_MAX_COLS) setHoverCol({ edge });
        else setHoverCol({ column: Math.max(0, colEdges.findIndex((value) => value > x) - 1) });
    };
    const onRowBarMove = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (overPlus(event)) return;
        const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
        const edge = nearestEdge(rowEdges, y);
        if (edge >= 0 && rowCount < TABLE_MAX_ROWS) setHoverRow({ edge });
        else setHoverRow({ row: Math.max(0, rowEdges.findIndex((value) => value > y) - 1) });
    };

    const range = menu?.range ?? null;
    const multi = Boolean(range && (range.r0 !== range.r1 || range.c0 !== range.c1));
    const anchorRow = range?.r0 ?? 0;
    const anchorColumn = range?.c0 ?? 0;
    const resetKey = `${rev}|${structRev}`;
    const colPlus = hoverCol && 'edge' in hoverCol ? hoverCol.edge : -1;
    const rowPlus = hoverRow && 'edge' in hoverRow ? hoverRow.edge : -1;

    const style = widths ? { width: tableWidth } : { width: '100%' };

    return (
        <div
            ref={rootRef}
            className={`ofi-gv-tbl ${editable ? 'is-editable' : ''} ${editable && (active || menu) ? 'is-active' : ''}`}
            onPointerDownCapture={editable ? () => setActive(true) : undefined}
            onFocusCapture={editable ? () => setActive(true) : undefined}
        >
            <div ref={scrollRef} className="ofi-gv-tbl__scroll">
                <div
                    className={`ofi-gv-tbl__frame ${liveWidths ? 'is-resizing' : ''}`}
                    style={{ width: tableWidth !== undefined ? tableWidth + strip + 1 : '100%' }}
                >
                    {editable && (
                        <>
                            <button
                                type="button"
                                className="ofi-gv-tbl__corner ofi-btn-plain"
                                aria-label={t('tasksModule.editor.table.menu')}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={(event) => openMenu(event.currentTarget, { r0: 0, r1: rowCount - 1, c0: 0, c1: columnCount - 1 })}
                            >
                                <i /><i /><i /><i />
                            </button>

                            <div className="ofi-gv-tbl__colbar" onMouseMove={onColBarMove} onMouseLeave={() => setHoverCol(null)}>
                                {widths && Array.from({ length: columnCount }, (_, column) => (
                                    <button
                                        key={column}
                                        type="button"
                                        className={`ofi-gv-tbl__handle ofi-btn-plain ${hoverCol && 'column' in hoverCol && hoverCol.column === column ? 'is-hover' : ''}`}
                                        style={{ left: colEdges[column], width: widths[column] }}
                                        aria-label={t('tasksModule.editor.table.selectColumn', { n: column + 1 })}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={(event) => openMenu(handleAnchor(event.currentTarget), { r0: 0, r1: rowCount - 1, c0: column, c1: column })}
                                    >
                                        <i />
                                    </button>
                                ))}
                                {widths && colPlus >= 0 && (
                                    <button
                                        type="button"
                                        className={`ofi-gv-tbl__plus ofi-btn-plain ${colPlus === columnCount ? 'is-end' : ''}`}
                                        style={{ left: colEdges[colPlus] }}
                                        aria-label={t('tasksModule.editor.table.addColumn')}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => addColumn(colPlus)}
                                    >
                                        <LuPlus size={11} strokeWidth={3} />
                                    </button>
                                )}
                            </div>

                            <div className="ofi-gv-tbl__rowbar" onMouseMove={onRowBarMove} onMouseLeave={() => setHoverRow(null)}>
                                {rowEdges.length === rowCount + 1 && Array.from({ length: rowCount }, (_, row) => (
                                    <button
                                        key={row}
                                        type="button"
                                        className={`ofi-gv-tbl__handle is-row ofi-btn-plain ${hoverRow && 'row' in hoverRow && hoverRow.row === row ? 'is-hover' : ''}`}
                                        style={{ top: rowEdges[row], height: rowEdges[row + 1] - rowEdges[row] }}
                                        aria-label={t('tasksModule.editor.table.selectRow', { n: row + 1 })}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={(event) => openMenu(handleAnchor(event.currentTarget), { r0: row, r1: row, c0: 0, c1: columnCount - 1 })}
                                    >
                                        <i />
                                    </button>
                                ))}
                                {rowPlus >= 0 && rowEdges[rowPlus] !== undefined && (
                                    <button
                                        type="button"
                                        className={`ofi-gv-tbl__plus is-row ofi-btn-plain ${rowPlus === rowCount ? 'is-end' : ''}`}
                                        style={{ top: rowEdges[rowPlus] }}
                                        aria-label={t('tasksModule.editor.table.addRow')}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => addRow(rowPlus)}
                                    >
                                        <LuPlus size={11} strokeWidth={3} />
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    <div className="ofi-gv-tbl__stage">
                        {/* data-unstyled-table: die app-weite Tabellenhaut (Einzug, Zeilen-Hover, Ecken) bleibt draussen. */}
                        <table ref={gridRef} className="ofi-gv-tbl__grid" style={style} data-unstyled-table>
                            <colgroup>
                                {Array.from({ length: columnCount }, (_, column) => (
                                    <col key={column} style={{ width: widths ? widths[column] : `${100 / columnCount}%` }} />
                                ))}
                            </colgroup>
                            <tbody>
                                {table.rows.map((cells, row) => (
                                    <tr key={row}>
                                        {cells.map((value, column) => (
                                            <Cell
                                                key={column}
                                                value={value}
                                                editable={editable}
                                                resetKey={resetKey}
                                                row={row}
                                                column={column}
                                                background={table.cellBg?.[row]?.[column] ?? ''}
                                                vAlign={(table.cellVAlign?.[row]?.[column] || 'top') as CellVAlign}
                                                selected={Boolean(multi && range && row >= range.r0 && row <= range.r1 && column >= range.c0 && column <= range.c1)}
                                                onText={onText}
                                                onKey={onKey}
                                                onMenu={(r, c, anchor) => openMenu(anchor, { r0: r, r1: r, c0: c, c1: c })}
                                            />
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {editable && widths && colEdges.slice(1).map((edge, index) => (
                            <div
                                key={index}
                                className="ofi-gv-tbl__resize"
                                style={{ left: edge - 3 }}
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={t('tasksModule.editor.table.resizeColumn', { n: index + 1 })}
                                onPointerDown={(event) => onResizeDown(index, event)}
                                onPointerMove={onResizeMove}
                                onPointerUp={onResizeUp}
                                onPointerCancel={onResizeUp}
                            />
                        ))}
                        {editable && colPlus >= 0 && <i className="ofi-gv-tbl__guide" style={{ left: colEdges[colPlus] - 1 }} aria-hidden />}
                        {editable && rowPlus >= 0 && rowEdges[rowPlus] !== undefined && (
                            <i className="ofi-gv-tbl__guide is-row" style={{ top: rowEdges[rowPlus] - 1 }} aria-hidden />
                        )}
                    </div>
                </div>
            </div>

            {editable && (
                <TableMenu
                    anchorEl={menu?.anchor ?? null}
                    onClose={() => setMenu(null)}
                    cellBg={table.cellBg?.[anchorRow]?.[anchorColumn] ?? ''}
                    vAlign={(table.cellVAlign?.[anchorRow]?.[anchorColumn] || 'top') as CellVAlign}
                    fit={table.fit}
                    onCellBg={(color) => {
                        if (!range) return;
                        const current = tableRef.current;
                        emit({ ...current, cellBg: paintRange(current, current.cellBg, range, color) });
                    }}
                    onVAlign={(align) => {
                        if (!range) return;
                        const current = tableRef.current;
                        emit({ ...current, cellVAlign: paintRange(current, current.cellVAlign, range, align === 'top' ? '' : align) });
                    }}
                    onFit={(fit) => emit(fitTable(tableRef.current, fit))}
                    onDistribute={() => {
                        const current = tableRef.current;
                        // Ohne gespeicherte Breiten sind die Spalten schon gleich breit.
                        if (current.colWidths) emit(distributeEvenly(current));
                    }}
                    onDeleteColumns={() => range && restructure(deleteColumns(tableRef.current, range.c0, range.c1))}
                    onDeleteRows={() => range && restructure(deleteRows(tableRef.current, range.r0, range.r1))}
                    onDeleteTable={() => restructure(null)}
                />
            )}
        </div>
    );
});

TableBlock.displayName = 'TableBlock';
