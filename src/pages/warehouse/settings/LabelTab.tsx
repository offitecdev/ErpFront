import { useEffect, useMemo, useState } from 'react';
import { Check, FileDown, Printer, Rows3, Tag } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { readWarehouseSettings, warehouseApi, warehouseErrorText } from '@/lib/api/warehouse';
import type { WarehouseLabelLayout, WarehouseLabelSettings, WarehouseSettings } from '@/types/warehouse';

import { LabelPreview } from '../components/LabelPreview';
import { a4Grid, ean13CheckDigit } from '../warehouseCodes';

/** Übliche Etiketten: Rollen der Etikettendrucker und A4-Bögen (70 × 37 = 24 je Bogen). */
const PRESETS: Array<{ widthMm: number; heightMm: number }> = [
    { widthMm: 50, heightMm: 25 },
    { widthMm: 60, heightMm: 30 },
    { widthMm: 70, heightMm: 37 },
    { widthMm: 100, heightMm: 50 },
];

const LIMITS = { minWidth: 25, maxWidth: 120, minHeight: 12, maxHeight: 80 };
const SAMPLE_BODY = '040000000001';
const SAMPLE_BARCODE = `${SAMPLE_BODY}${ean13CheckDigit(SAMPLE_BODY)}`;

const sameLabel = (a: WarehouseLabelSettings, b: WarehouseLabelSettings) =>
    a.widthMm === b.widthMm && a.heightMm === b.heightMm && a.layout === b.layout && a.showName === b.showName;

const parseMm = (raw: string): number | null => {
    const value = Number(raw.replace(',', '.'));
    return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
};

/**
 * ── AYARLAR › ETİKET ────────────────────────────────────────────────────────
 * «Bu ERP kodların hepsinin dikdörtgen etikete basılması gerekiyor, bir de
 *  ERP numarası yazsın altında.» Grösse und Druckart der Etiketten: ein
 * Etikettendrucker (jede Seite ein Etikett) oder A4-Etikettenbögen. Die
 * Vorschau rechnet genau wie die PDF.
 */
export const LabelTab = ({ canManage }: { canManage: boolean }) => {
    const [settings, setSettings] = useState<WarehouseSettings | null>(null);
    const [draft, setDraft] = useState<WarehouseLabelSettings | null>(null);
    const [widthText, setWidthText] = useState('');
    const [heightText, setHeightText] = useState('');
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => readWarehouseSettings(
        (value) => {
            setSettings(value);
            setDraft((current) => current ?? value.label);
            setWidthText((current) => current || String(value.label.widthMm));
            setHeightText((current) => current || String(value.label.heightMm));
        },
        (error) => toast.error(warehouseErrorText(error, 'warehouse.err.loadFailed')),
    ), []);

    const widthMm = parseMm(widthText);
    const heightMm = parseMm(heightText);
    const sizeValid = widthMm !== null && heightMm !== null
        && widthMm >= LIMITS.minWidth && widthMm <= LIMITS.maxWidth
        && heightMm >= LIMITS.minHeight && heightMm <= LIMITS.maxHeight;
    const effective = useMemo<WarehouseLabelSettings | null>(
        () => (draft && sizeValid ? { ...draft, widthMm: widthMm!, heightMm: heightMm! } : draft),
        [draft, sizeValid, widthMm, heightMm],
    );
    const dirty = Boolean(settings && effective && !sameLabel(settings.label, effective));
    const grid = useMemo(() => (effective ? a4Grid(effective.widthMm, effective.heightMm) : null), [effective]);

    if (!settings || !draft || !effective) {
        return <div className="ofi-wh-state"><span className="ofi-wh-spinner" /></div>;
    }

    const setSize = (next: { widthMm: number; heightMm: number }) => {
        setWidthText(String(next.widthMm));
        setHeightText(String(next.heightMm));
    };
    const setLayout = (layout: WarehouseLabelLayout) => setDraft({ ...draft, layout });

    const save = async () => {
        if (!sizeValid || saving) return;
        setSaving(true);
        try {
            const saved = await warehouseApi.saveSettings(effective);
            setSettings(saved);
            setDraft(saved.label);
            toast.success(t('warehouse.labels.saved'));
        } catch (error) {
            toast.error(warehouseErrorText(error));
        } finally {
            setSaving(false);
        }
    };

    const discard = () => {
        setDraft(settings.label);
        setSize(settings.label);
    };

    const testPdf = async () => {
        if (!sizeValid || testing) return;
        setTesting(true);
        try {
            const { buildLabelsPdf } = await import('../export/warehousePdf');
            const doc = await buildLabelsPdf(
                [{ erpCode: 'ELK-PLC-00001', barcode: SAMPLE_BARCODE, name: t('warehouse.labels.sampleName') }],
                effective,
            );
            doc.save(`etiket-${effective.widthMm}x${effective.heightMm}.pdf`);
        } catch (error) {
            toast.error(warehouseErrorText(error, 'warehouse.pdf.failed'));
        } finally {
            setTesting(false);
        }
    };

    const presetActive = (preset: { widthMm: number; heightMm: number }) =>
        preset.widthMm === widthMm && preset.heightMm === heightMm;

    return (
        <div className="ofi-wh-form">
            <div className="ofi-wh-form__col">
                <section className="ofi-wh-group">
                    <h2 className="ofi-wh-group__title">{t('warehouse.labels.size')}</h2>
                    <div className="ofi-wh-group__box">
                        <div className="ofi-wh-row">
                            <span className="ofi-wh-row__label">{t('warehouse.labels.presets')}</span>
                            <div className="ofi-wh-row__control">
                                <div className="ofi-wh-seg" role="radiogroup" aria-label={t('warehouse.labels.presets')}>
                                    {PRESETS.map((preset) => (
                                        <button
                                            key={`${preset.widthMm}x${preset.heightMm}`}
                                            type="button"
                                            role="radio"
                                            aria-checked={presetActive(preset)}
                                            className={`ofi-nosize ${presetActive(preset) ? 'is-on' : ''}`}
                                            disabled={!canManage}
                                            onClick={() => setSize(preset)}
                                        >
                                            {preset.widthMm} × {preset.heightMm}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <label className="ofi-wh-row__label" htmlFor="wh-label-w">{t('warehouse.labels.custom')}</label>
                            <div className="ofi-wh-row__control">
                                <div className="ofi-wh-size">
                                    <input
                                        id="wh-label-w"
                                        className={`ofi-wh-input is-num ${sizeValid ? '' : 'is-invalid'}`}
                                        inputMode="decimal"
                                        value={widthText}
                                        disabled={!canManage}
                                        aria-label={t('warehouse.labels.width')}
                                        onChange={(event) => setWidthText(event.target.value)}
                                    />
                                    <span>×</span>
                                    <input
                                        className={`ofi-wh-input is-num ${sizeValid ? '' : 'is-invalid'}`}
                                        inputMode="decimal"
                                        value={heightText}
                                        disabled={!canManage}
                                        aria-label={t('warehouse.labels.height')}
                                        onChange={(event) => setHeightText(event.target.value)}
                                    />
                                    <span>mm</span>
                                </div>
                                <span className={`ofi-wh-row__hint ${sizeValid ? '' : 'is-error'}`}>
                                    {t('warehouse.labels.limits', LIMITS)}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="ofi-wh-group">
                    <h2 className="ofi-wh-group__title">{t('warehouse.labels.layout')}</h2>
                    <div className="ofi-wh-group__box ofi-wh-choicebox" role="radiogroup" aria-label={t('warehouse.labels.layout')}>
                        {(['roll', 'a4'] as const).map((layout) => (
                            <button
                                key={layout}
                                type="button"
                                role="radio"
                                aria-checked={effective.layout === layout}
                                className={`ofi-wh-choicebox__item ofi-nosize ${effective.layout === layout ? 'is-on' : ''}`}
                                disabled={!canManage}
                                onClick={() => setLayout(layout)}
                            >
                                <span className="ofi-wh-choicebox__icon">{layout === 'roll' ? <Printer /> : <Rows3 />}</span>
                                <span className="ofi-wh-choicebox__text">
                                    <b>{t(`warehouse.labels.${layout}`)}</b>
                                    <small>
                                        {layout === 'roll'
                                            ? t('warehouse.labels.rollHint')
                                            : grid ? t('warehouse.labels.a4Hint', { count: grid.perPage, cols: grid.cols, rows: grid.rows }) : ''}
                                    </small>
                                </span>
                                <span className="ofi-wh-choicebox__check" aria-hidden>{effective.layout === layout && <Check />}</span>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="ofi-wh-group">
                    <h2 className="ofi-wh-group__title">{t('warehouse.labels.content')}</h2>
                    <div className="ofi-wh-group__box">
                        <div className="ofi-wh-row is-block">
                            <label className="ofi-wh-check">
                                <input
                                    type="checkbox"
                                    checked={effective.showName}
                                    disabled={!canManage}
                                    onChange={(event) => setDraft({ ...draft, showName: event.target.checked })}
                                />
                                <span className="ofi-wh-check__box" aria-hidden><Check /></span>
                                <span className="ofi-wh-check__text">
                                    <b>{t('warehouse.labels.showName')}</b>
                                    <small>{t('warehouse.labels.showNameHint')}</small>
                                </span>
                            </label>
                        </div>
                    </div>
                </section>

                {canManage && (
                    <div className="ofi-wh-formbar">
                        {dirty && <span className="ofi-wh-dirty">{t('warehouse.product.unsaved')}</span>}
                        <span className="ofi-wh-spacer" />
                        {dirty && (
                            <button type="button" className="ofi-wh-btn ofi-nosize" onClick={discard} disabled={saving}>
                                {t('warehouse.actions.discard')}
                            </button>
                        )}
                        <button type="button" className="ofi-wh-btn is-primary ofi-nosize" disabled={!dirty || !sizeValid || saving} onClick={() => void save()}>
                            {saving ? t('warehouse.actions.saving') : t('warehouse.actions.save')}
                        </button>
                    </div>
                )}
            </div>

            <div className="ofi-wh-form__col">
                <section className="ofi-wh-group">
                    <h2 className="ofi-wh-group__title">{t('warehouse.labels.preview')}</h2>
                    <div className="ofi-wh-group__box ofi-wh-labelstage">
                        <div
                            className="ofi-wh-labelstage__paper"
                            style={{ width: `min(100%, ${Math.round(effective.widthMm * 5.2)}px)` }}
                        >
                            <LabelPreview
                                widthMm={effective.widthMm}
                                heightMm={effective.heightMm}
                                showName={effective.showName}
                                name={t('warehouse.labels.sampleName')}
                                erpCode="ELK-PLC-00001"
                                barcode={SAMPLE_BARCODE}
                            />
                        </div>
                        <span className="ofi-wh-row__hint">
                            <Tag />
                            {t('warehouse.labels.previewHint', { width: effective.widthMm, height: effective.heightMm })}
                        </span>
                        <button type="button" className="ofi-wh-btn ofi-nosize" disabled={!sizeValid || testing} onClick={() => void testPdf()}>
                            <FileDown />
                            {testing ? t('warehouse.pdf.preparing') : t('warehouse.labels.testPdf')}
                        </button>
                    </div>
                </section>

                <section className="ofi-wh-group">
                    <h2 className="ofi-wh-group__title">{t('warehouse.labels.gs1Title')}</h2>
                    <div className="ofi-wh-group__box">
                        <div className="ofi-wh-row is-block">
                            <p className="ofi-wh-prose">{t('warehouse.labels.gs1Hint', { prefix: settings.barcodePrefix })}</p>
                            <p className="ofi-wh-prose is-muted">{t('warehouse.labels.gs1Count', { count: settings.barcodesIssued })}</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};
