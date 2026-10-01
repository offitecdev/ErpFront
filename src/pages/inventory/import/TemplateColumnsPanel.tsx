import { useState } from 'react';

import { Minus, Plus } from '@/components/icons/antIconCompat';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { t } from '@/i18n/translate';
import type { PurchaseTemplateDocumentType, SupplierCalcConfig, TemplateLabel } from '@/types/inventory';
import { TEMPLATE_MAX_COLUMNS } from '@/types/inventory';

import { labelsForDocument, nextColumnKey, templateLabelName } from './importTemplate';

/**
 * ── DIE SPALTEN DER VORLAGE ─────────────────────────────────────────────────
 *
 * Vorgabe Samet (11.09.2026): «Der Spaltenbereich ist anfangs leer. Jede
 * Spalte bekommt einen Namen, eine Art (Text/Zahl) und eine Zuordnung;
 * Produktname und Menge sind ueberall Pflicht — fehlt eine, zeigt das System
 * einen Fehler. Einzelpreis, Nettopreis, Rabatt, Rabatt 2 und Zeilensumme
 * gibt es je einmal. Kein Auge mehr. Die Reihenfolge ist frei — sie ist
 * zugleich die Reihenfolge in der Tabelle. Hoechstens zwoelf Spalten; der
 * ERP-Code ist die dreizehnte, fest, oben, ohne Knoepfe.»
 *
 * Dieselbe KISTE wie in den Bestelldetails (`.ofi-ord-*`,
 * styles/orderDetails.css): eine Zeile je Spalte — rotes Minus, Name, Art,
 * Zuordnung, Breite, Griff. Wegnehmen fragt nach, solange die Vorlage nicht
 * gespeichert ist.
 */
export const TemplateColumnsPanel = ({ config, onChange, documentType, showErrors = false }: {
    config: SupplierCalcConfig;
    onChange: (next: SupplierCalcConfig) => void;
    /** Eine Preisanfrage kennt nur Produktname und Menge als Zuordnung. */
    documentType: PurchaseTemplateDocumentType;
    /** Nach einem gescheiterten Speichern: leere Namen rot anstreichen. */
    showErrors?: boolean;
}) => {
    const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
    /** Welche Spalte gerade gezogen wird — null, wenn niemand zieht. */
    const [dragKey, setDragKey] = useState<string | null>(null);
    const [fullWarning, setFullWarning] = useState(false);

    const columns = config.columns ?? [];
    const patch = (next: SupplierCalcConfig['columns']) => { setFullWarning(false); onChange({ ...config, columns: next }); };
    const patchColumn = (key: string, change: Partial<SupplierCalcConfig['columns'][number]>) =>
        patch(columns.map((column) => (column.key === key ? { ...column, ...change } : column)));

    const allowedLabels = labelsForDocument(documentType);
    const usedLabels = new Map<TemplateLabel, string>();
    columns.forEach((column) => { if (column.label) usedLabels.set(column.label, column.key); });

    /* Ist kein Platz mehr, SAGT es der Satz unter der Liste, statt dass der
       Knopf nur grau wird. */
    const addColumn = () => {
        const key = nextColumnKey(columns);
        if (!key || columns.length >= TEMPLATE_MAX_COLUMNS) {
            setFullWarning(true);
            return;
        }
        /* Die erste Spalte einer leeren Vorlage ist der Produktname, die zweite
           die Menge — die beiden Pflichtzuordnungen, damit man sie nicht
           jedes Mal von Hand setzen muss. Wer anderes will, aendert es. */
        const label: TemplateLabel | null = !usedLabels.has('productName')
            ? 'productName'
            : (!usedLabels.has('quantity') ? 'quantity' : null);
        patch([...columns, {
            key,
            name: label ? templateLabelName(label) : '',
            type: label === 'quantity' ? 'number' : 'text',
            label,
            width: 120,
        }]);
    };

    const labelOptions = (ownKey: string) => [
        { value: '', label: t('inv.aiImport.labelNone') },
        ...allowedLabels.map((label) => ({
            value: label,
            label: templateLabelName(label),
            /* Eine Zuordnung, die schon eine ANDERE Spalte traegt, ist hier
               nicht waehlbar — «je einmal» (Vorgabe Samet). */
            disabled: usedLabels.has(label) && usedLabels.get(label) !== ownKey,
        })),
    ];

    return (
        <>
            <span className="ofi-ord-cap">{t('inv.aiImport.columnsTitle')}</span>
            <div className="ofi-ord-group">
                {/* ── DER ERP-CODE: FEST, OHNE KNOEPFE ───────────────────────
                    Er steht hier, damit man sieht, dass die Tabelle ihn
                    traegt — aendern laesst sich an ihm nichts, und ins PDF
                    und an das Modell geht er nicht. */}
                <div className="ofi-ord-row is-muted">
                    <span className="ofi-ord-bullet" aria-hidden="true" />
                    <span className="ofi-ord-label is-grow">{t('inv.columns.serialCode')}</span>
                    <span className="ofi-ord-kind">{t('inv.aiImport.columnFixed')}</span>
                </div>

                {columns.map((column, position) => (
                    <div
                        className={[
                            'ofi-ord-row',
                            dragKey === column.key ? 'is-dragging' : '',
                            showErrors && !column.name.trim() ? 'is-invalid' : '',
                        ].filter(Boolean).join(' ')}
                        key={column.key}
                        onDragOver={(event) => {
                            event.preventDefault();
                            if (!dragKey || dragKey === column.key) return;
                            const from = columns.findIndex((entry) => entry.key === dragKey);
                            if (from < 0 || from === position) return;
                            const next = [...columns];
                            const [moved] = next.splice(from, 1);
                            next.splice(position, 0, moved);
                            patch(next);
                        }}
                    >
                        <button
                            type="button"
                            className="ofi-ord-dot is-remove"
                            onClick={() => setPendingRemoval(column.key)}
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                        >
                            <Minus size={13} />
                        </button>
                        <input
                            value={column.name}
                            placeholder={t('inv.aiImport.columnPlaceholder')}
                            maxLength={60}
                            onChange={(event) => patchColumn(column.key, { name: event.target.value })}
                        />
                        <SelectMenu
                            className="ofi-ord-menu is-narrow"
                            buttonClassName="ofi-ord-select"
                            ariaLabel={t('inv.aiImport.columnType')}
                            value={column.type}
                            listWidth={170}
                            options={[
                                { value: 'text', label: t('inv.aiImport.columnText') },
                                { value: 'number', label: t('inv.aiImport.columnNumber') },
                            ]}
                            onChange={(next) => patchColumn(column.key, { type: next === 'number' ? 'number' : 'text' })}
                        />
                        {/* ── DIE ZUORDNUNG ──────────────────────────────────
                            Sie sagt der Tabelle, in welches Feld der Wert
                            gehoert, und dem Modell, was er bedeutet. Eine
                            Zahl-Zuordnung stellt die Art gleich mit um —
                            eine Menge als Text waere ein stiller Fehler. */}
                        <SelectMenu
                            className="ofi-ord-menu is-label"
                            buttonClassName="ofi-ord-select"
                            ariaLabel={t('inv.aiImport.columnLabel')}
                            value={column.label ?? ''}
                            listWidth={220}
                            options={labelOptions(column.key)}
                            onChange={(next) => {
                                const label = (next || null) as TemplateLabel | null;
                                patchColumn(column.key, {
                                    label,
                                    ...(label && label !== 'productName' ? { type: 'number' } : {}),
                                    ...(label === 'productName' ? { type: 'text' } : {}),
                                });
                            }}
                        />
                        <label className="ofi-template-width">
                            <input
                                type="range"
                                min="80"
                                max="240"
                                step="10"
                                value={column.width ?? 120}
                                aria-label={`${column.name || t('inv.aiImport.columnPlaceholder')} width`}
                                onChange={(event) => patchColumn(column.key, { width: Number(event.target.value) })}
                            />
                            <small>{column.width ?? 120}px</small>
                        </label>
                        {/* NUR der Griff ist ziehbar, nicht die ganze Zeile: sonst
                            liesse sich der Text im Feld nicht mehr markieren. */}
                        <span
                            className="ofi-ord-grip"
                            aria-hidden="true"
                            draggable
                            onDragStart={() => setDragKey(column.key)}
                            onDragEnd={() => setDragKey(null)}
                        >
                            ⠿
                        </span>
                    </div>
                ))}
                <button
                    type="button"
                    className="ofi-ord-action"
                    aria-disabled={columns.length >= TEMPLATE_MAX_COLUMNS}
                    onClick={addColumn}
                >
                    <span className="ofi-ord-dot is-add"><Plus size={13} /></span>
                    {t('inv.aiImport.columnAdd')}
                </button>
            </div>
            {fullWarning && (
                <p className="ofi-ord-foot-note is-warn" role="alert">
                    {t('inv.aiImport.columnsMax', { max: TEMPLATE_MAX_COLUMNS })}
                </p>
            )}
            <p className="ofi-ord-foot-note">
                {t('inv.aiImport.columnsHint', { max: TEMPLATE_MAX_COLUMNS })}
                {' '}
                {t('inv.aiImport.columnsFixedErp')}
            </p>

            <ConfirmDialog
                open={pendingRemoval !== null}
                title={t('inv.aiImport.extraRemoveTitle')}
                message={t('inv.aiImport.extraRemoveConfirm')}
                onConfirm={() => {
                    if (pendingRemoval) patch(columns.filter((entry) => entry.key !== pendingRemoval));
                    setPendingRemoval(null);
                }}
                onCancel={() => setPendingRemoval(null)}
                /* Über dem Vorlagenfenster (900), sonst läge die Rückfrage
                   dahinter und niemand könnte sie beantworten. */
                zIndex={960}
            />
        </>
    );
};
