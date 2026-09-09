import { useState } from 'react';
import { ChevronDown, Trash01 } from '@/components/icons/antIconCompat';
import { ColResizeHandle } from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { t } from '@/i18n/translate';
import { RichTextMarkdownEditor } from '@/pages/sales/detail/components/RichTextMarkdownEditor';
import { richTextToHtml, richTextToPlain } from '@/pages/sales/detail/utils/markdown.utils';
import { applyDiscounts, createDiscountEntry, type TenderDiscountEntry } from '@/pages/sales/detail/utils/tenderDiscounts.utils';
import { DocumentProductCell } from './DocumentProductCell';
import { documentArticlePatch, documentLineAmount, documentLineBase, type DocumentLine } from './documentLines';

/**
 * ── POSITIONSTABELLE DES BELEGS ──────────────────────────────────────────────
 *
 * Eine Tabelle für Offertlogik, Direktrechnung und Nachtrag. Vorgaben Samet
 * (05.09.2026, dritte Runde):
 *
 *   • KEINE Fenster für Text und Rabatt. Die Beschreibung steht AUFKLAPPBAR
 *     unter der Bezeichnung, der Zeilenrabatt ist eine Zelle — beides wird
 *     dort eingetippt, wo es hingehört.
 *   • Die Spalten sind ZIEHBAR wie in den übrigen Listen der Anwendung
 *     (`useColumnWidths` + `ColResizeHandle`, derselbe Griff wie in der
 *     Kunden-, Auftrags- und Offertliste); die Bezeichnung nimmt den Rest.
 *   • «Position hinzufügen» steht NICHT mehr über der Tabelle, sondern unten
 *     rechts unter ihr (siehe `DocumentWorkspace`).
 *
 * Der Rabatt einer Zeile ist ein STAPEL (mehrere Nachlässe wirken
 * nacheinander). Die Zelle bearbeitet den einfachen Fall — einen Prozentsatz;
 * trägt eine Zeile mehrere Nachlässe (aus dem Rabattfenster für die Auswahl),
 * zeigt die Zelle deren Gesamtwirkung und rührt den Stapel nicht an, solange
 * niemand hier tippt.
 */

/** Die ziehbaren Spalten; die Bezeichnung hat keine Breite und nimmt den Rest. */
const COLUMNS = ['unit', 'quantity', 'unitPrice', 'discount', 'total'] as const;
type ColumnKey = 'select' | 'pos' | (typeof COLUMNS)[number] | 'actions';

const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
    select: 38,
    pos: 42,
    unit: 92,
    quantity: 86,
    unitPrice: 128,
    discount: 96,
    total: 132,
    actions: 46,
};

const COLUMN_LABEL: Record<(typeof COLUMNS)[number], () => string> = {
    unit: () => t('invoices.colUnit'),
    quantity: () => t('invoices.colQty'),
    unitPrice: () => t('invoices.colUnitPrice'),
    discount: () => t('invoices.colDiscount'),
    total: () => t('invoices.colLineTotal'),
};

/** Der Prozentsatz, den die Rabattzelle zeigt: die Wirkung des ganzen Stapels. */
const combinedPercent = (line: DocumentLine): number =>
    applyDiscounts(documentLineBase(line), line.discounts).combinedPercent || 0;

/** Tippen in die Zelle setzt EINEN Nachlass; 0 löscht den Stapel. */
const percentToStack = (line: DocumentLine, percent: number): TenderDiscountEntry[] => {
    if (!Number.isFinite(percent) || percent <= 0) return [];
    const first = line.discounts[0];
    return [{ ...(first ?? createDiscountEntry(0)), kind: 'PERCENT', value: Math.min(100, percent) }];
};

/**
 * Was der getippte Text mit dem Rest der Zeile macht — dieselbe Regel wie in der
 * Offerte (`applyLineText` in TenderDetail):
 *
 *  • GELEERT = das Produkt wird von der Zeile genommen: Name, Artikelbezug und
 *    die Beschreibung des Artikels gehen zusammen (der Preis bleibt stehen, die
 *    Zeile kann von Hand benannt und bepreist werden).
 *  • UMBENANNT auf einer Artikelzeile: die Beschreibung des Artikels geht mit,
 *    denn sie beschriebe sonst etwas anderes als die Zeile sagt — und stünde so
 *    auch auf dem Beleg.
 *  • Eine frei getippte Zeile behält ihre handgeschriebene Beschreibung.
 */
const textPatch = (line: DocumentLine, next: string): Partial<DocumentLine> => {
    if (!next.trim()) return { description: '', articleId: null, longDescription: '' };
    return { description: next, ...(line.articleId ? { longDescription: '' } : {}) };
};

export function DocumentLineTable({ lines, selected, onSelect, onChange, formatMoney, readOnly = false }: {
    lines: DocumentLine[];
    selected: Set<string>;
    onSelect: (keys: Set<string>) => void;
    onChange: (lines: DocumentLine[]) => void;
    formatMoney: (value: number) => string;
    readOnly?: boolean;
}) {
    /* Aufgeklappte Beschreibungen. Eine Zeile MIT Text startet zu — die
       Tabelle soll beim Öffnen kurz sein —, und der Pfeil sagt, dass da etwas
       liegt (er steht kräftig statt blass). */
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const grid = useColumnWidths<ColumnKey>({
        storageKey: 'offitec:document-lines:col-widths:v1',
        defaults: DEFAULT_WIDTHS,
        minPx: 38,
        maxPx: 320,
    });

    const patch = (key: string, changes: Partial<DocumentLine>) =>
        onChange(lines.map((line) => (line.key === key ? { ...line, ...changes } : line)));
    const toggleExpanded = (key: string) => setExpanded((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
    const allSelected = lines.length > 0 && lines.every((line) => selected.has(line.key));

    return (
        <div className="document-table-scroll">
            <table className="document-table" data-unstyled-table data-no-col-resize>
                <colgroup>
                    <col ref={grid.setColRef('select')} style={{ width: grid.widths.select }} />
                    <col ref={grid.setColRef('pos')} style={{ width: grid.widths.pos }} />
                    {/* Ohne Breite: die Bezeichnung nimmt, was übrig bleibt. */}
                    <col />
                    {COLUMNS.map((key) => (
                        <col key={key} ref={grid.setColRef(key)} style={{ width: grid.widths[key] }} />
                    ))}
                    <col ref={grid.setColRef('actions')} style={{ width: grid.widths.actions }} />
                </colgroup>
                <thead>
                    <tr>
                        <th>
                            <input
                                type="checkbox"
                                aria-label={t('documentEditor.selectAll')}
                                disabled={readOnly || !lines.length}
                                checked={allSelected}
                                onChange={() => onSelect(allSelected ? new Set() : new Set(lines.map((line) => line.key)))}
                            />
                        </th>
                        <th>{t('invoices.colPos')}</th>
                        <th className="document-th-text">{t('invoices.colDescription')}</th>
                        {COLUMNS.map((key) => (
                            <th key={key} className="document-th-num">
                                <span>{COLUMN_LABEL[key]()}</span>
                                <ColResizeHandle {...grid.resizeProps(key)} />
                            </th>
                        ))}
                        <th aria-label={t('common.actions')} />
                    </tr>
                </thead>
                <tbody>
                    {lines.map((line, index) => {
                        const isOpen = expanded.has(line.key);
                        const percent = combinedPercent(line);
                        const stacked = line.discounts.length > 1;
                        return (
                            <tr key={line.key} className={selected.has(line.key) ? 'is-selected' : ''}>
                                <td>
                                    <input
                                        type="checkbox"
                                        aria-label={t('documentEditor.selectLine', { number: index + 1 })}
                                        disabled={readOnly}
                                        checked={selected.has(line.key)}
                                        onChange={() => {
                                            const next = new Set(selected);
                                            if (next.has(line.key)) next.delete(line.key); else next.add(line.key);
                                            onSelect(next);
                                        }}
                                    />
                                </td>
                                <td className="document-ordinal">{index + 1}</td>
                                <td className="document-description">
                                    <div className="document-namerow">
                                        {readOnly
                                            ? <span className="document-name">{line.description}</span>
                                            : (
                                                <DocumentProductCell
                                                    value={line.description}
                                                    hasArticle={Boolean(line.articleId)}
                                                    /* Ein Produkt bringt seine Angaben mit —
                                                       Bezeichnung, Beschreibung, Einheit, Preis
                                                       aus derselben Quelle wie die Offerte. */
                                                    onPickArticle={(article) => patch(line.key, documentArticlePatch(article))}
                                                    onCommitText={(next) => patch(line.key, textPatch(line, next))}
                                                />
                                            )}
                                        {/* Die Beschreibung steht RECHTS in der Zeile —
                                            OHNE Beschriftung: ein grosser Pfeil, der
                                            hinunter zeigt und beim Öffnen hinauf
                                            (Vorgabe Samet 05.09.2026). */}
                                        <button
                                            type="button"
                                            className={`document-desc-toggle ${isOpen ? 'is-open' : ''} ${richTextToPlain(line.longDescription || '').trim() ? 'has-text' : ''}`}
                                            aria-expanded={isOpen}
                                            aria-label={t('invoices.longDescription')}
                                            title={t('invoices.longDescription')}
                                            onClick={() => toggleExpanded(line.key)}
                                        >
                                            <ChevronDown size={22} className={`document-chevron ${isOpen ? 'is-open' : ''}`} />
                                        </button>
                                    </div>
                                    {/* Der Text trägt Auszeichnung: fett, Aufzählung und
                                        die Hausfarben. Ausgewählter Text bekommt dazu
                                        die schwebende Leiste des Offert-Editors
                                        (Vorgabe Samet 05.09.2026) — geschrieben wird in
                                        einem Kasten, der so hoch ist wie sein Inhalt. */}
                                    {isOpen && (
                                        readOnly
                                            ? (
                                                <div
                                                    className="document-detail-text"
                                                    dangerouslySetInnerHTML={{ __html: richTextToHtml(line.longDescription || '') }}
                                                />
                                            )
                                            : (
                                                <div className="document-detail-field">
                                                    <RichTextMarkdownEditor
                                                        value={line.longDescription}
                                                        onChange={(next) => patch(line.key, { longDescription: next })}
                                                        variant="inline"
                                                        commitOnBlur
                                                        autoFocus
                                                        bubbleInPortal
                                                        minHeight={22}
                                                        placeholder={t('invoices.longDescriptionPlaceholder')}
                                                    />
                                                </div>
                                            )
                                    )}
                                </td>
                                {(['unit', 'quantity', 'unitPrice'] as const).map((field) => (
                                    <td key={field}>
                                        <input
                                            className={`document-cell ${field === 'unit' ? 'is-text' : ''}`}
                                            aria-label={`${COLUMN_LABEL[field]()} ${index + 1}`}
                                            readOnly={readOnly}
                                            inputMode={field === 'unit' ? 'text' : 'decimal'}
                                            value={line[field]}
                                            /* Ein Zahlenfeld ist beim Anklicken GANZ markiert: der
                                               erste Anschlag ersetzt den Wert, statt sich an ihn
                                               anzuhängen (Vorgabe Samet 05.09.2026). */
                                            onFocus={field === 'unit' ? undefined : (event) => event.currentTarget.select()}
                                            onChange={(event) => patch(line.key, { [field]: event.target.value })}
                                        />
                                    </td>
                                ))}
                                <td>
                                    {/* Der Rabatt der Zeile — hier getippt, nicht in einem
                                        Fenster. Mehrere gestapelte Nachlässe zeigt die Zelle
                                        als ihre Gesamtwirkung mit einem Stapelzeichen. */}
                                    <span className="document-discount-cell">
                                        <input
                                            className="document-cell"
                                            aria-label={`${t('invoices.colDiscount')} ${index + 1}`}
                                            readOnly={readOnly || stacked}
                                            inputMode="decimal"
                                            value={percent ? String(Number(percent.toFixed(2))) : ''}
                                            placeholder="0"
                                            onFocus={(event) => event.currentTarget.select()}
                                            onChange={(event) => patch(line.key, {
                                                discounts: percentToStack(line, Number(event.target.value.replace(',', '.'))),
                                            })}
                                        />
                                        <span className="document-unit">{stacked ? `%·${line.discounts.length}` : '%'}</span>
                                    </span>
                                </td>
                                <td className="document-amount">{formatMoney(documentLineAmount(line))}</td>
                                <td>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            className="document-rowbtn"
                                            aria-label={t('invoices.removeLine')}
                                            title={t('invoices.removeLine')}
                                            onClick={() => onChange(lines.filter((row) => row.key !== line.key))}
                                        >
                                            <Trash01 size={15} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {!lines.length && <p className="document-empty">{t('documentEditor.empty')}</p>}
        </div>
    );
}
