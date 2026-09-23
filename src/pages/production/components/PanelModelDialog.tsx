import { useEffect, useMemo, useState } from 'react';

import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { CELL_INPUT_CLASS } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { articleCodesApi, type CodeCategory } from '@/lib/api/articleCodes';
import { panelApi } from '@/lib/api/panels';
import { productionErrorOf } from '@/lib/api/production';
import type { PanelModel, PanelModelPreview, PanelSettingsPage, PanelTypeFamily } from '@/types/panel';

/**
 * ── NEUES PANOMODELL ────────────────────────────────────────────────────────
 *
 * Die eine Regel, die diese Maske durchsetzt: **die Modellnummer wird nicht
 * getippt.** Es gibt kein Eingabefeld dafür — nur Typenfamilie, Leistungsklasse
 * und (wenn nötig) ein Variantenkürzel. Die Nummer steht gross darüber und
 * ändert sich beim Tippen mit; ist sie schon vergeben, sagt die Maske es sofort
 * und der Knopf bleibt aus: gleiche Technik ist dasselbe Modell.
 *
 * Was die Zahl BEDEUTET (kW, A, kvar), sagt die Familie — darum ändert sich die
 * Beschriftung des Feldes mit der Auswahl (FRAGE 2).
 */
export const PanelModelDialog = ({
    open,
    families,
    settings,
    onClose,
    onCreated,
}: {
    open: boolean;
    families: PanelTypeFamily[];
    settings: PanelSettingsPage | null;
    onClose: () => void;
    onCreated: (modelNumber: string, model?: PanelModel) => void;
}) => {
    const active = useMemo(() => families.filter((family) => family.isActive), [families]);
    const [typeFamilyId, setTypeFamilyId] = useState('');
    const [rating, setRating] = useState('');
    const [variant, setVariant] = useState('');
    const [name, setName] = useState('');
    const [voltage, setVoltage] = useState('');
    const [current, setCurrent] = useState('');
    const [phases, setPhases] = useState('3');
    const [frequency, setFrequency] = useState('50');
    const [icw, setIcw] = useState('');
    const [icwTime, setIcwTime] = useState('1');
    const [ipk, setIpk] = useState('');
    const [ip, setIp] = useState('');
    const [standard, setStandard] = useState('');
    const [preview, setPreview] = useState<PanelModelPreview | null>(null);
    /* DER NUMMERNKREIS DER PRODUKTNUMMER — Pflicht (Vorgabe Samet, 20.09.2026:
       «AB-000-111 falan olmasın, seçim zorunlu»): ein Panomodell bekommt NIE
       einen vorläufigen Code, sondern immer einen aus einem freigegebenen
       Kreis. Steht am Typ schon einer, ist er vorgewählt; sonst wird hier
       gewählt und danach AM TYP gemerkt. */
    const [codeCategories, setCodeCategories] = useState<CodeCategory[] | null>(null);
    const [codeSchemeId, setCodeSchemeId] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const family = active.find((row) => row.id === typeFamilyId) ?? null;

    // Die freigegebenen Nummernkreise (dieselbe Liste wie im Wareneingang).
    useEffect(() => {
        if (!open) return;
        let alive = true;
        setCodeCategories(null);
        articleCodesApi.list({ active: true })
            .then((rows) => { if (alive) setCodeCategories(rows); })
            .catch(() => { if (alive) setCodeCategories([]); });
        return () => { alive = false; };
    }, [open]);

    // Beim Öffnen: die Hausnorm der Firma steht schon drin, damit niemand sie
    // jedes Mal tippt (und die Variantenregel greift nur bei ABWEICHUNG).
    useEffect(() => {
        if (!open) return;
        setTypeFamilyId(active[0]?.id ?? '');
        setRating(''); setVariant(''); setName('');
        setVoltage(settings?.settings.defaultVoltage ? String(settings.settings.defaultVoltage) : '400');
        setCurrent('');
        setPhases(settings?.settings.defaultPhases ? String(settings.settings.defaultPhases) : '3');
        setFrequency(settings?.settings.defaultHz ? String(settings.settings.defaultHz) : '50');
        setIcw(''); setIcwTime('1'); setIpk('');
        setIp(settings?.settings.defaultIpRating ?? '');
        setStandard(settings?.settings.defaultStandard ?? '');
        setPreview(null); setError(null);
    }, [open, settings, active]);

    // Trägt der gewählte Typ schon einen Kreis, ist er vorgewählt — sonst muss
    // gewählt werden (es gibt keinen vorläufigen Code für ein Panomodell).
    useEffect(() => {
        if (!open) return;
        setCodeSchemeId(family?.codeSchemeId ?? '');
    }, [open, family]);

    // Die Nummer, die herauskäme — beim Tippen, ohne etwas zu ziehen.
    useEffect(() => {
        if (!open || !typeFamilyId) { setPreview(null); return undefined; }
        const value = Number(rating);
        if (!Number.isFinite(value) || value <= 0) { setPreview(null); return undefined; }
        let alive = true;
        const timer = window.setTimeout(() => {
            panelApi.previewModel({ typeFamilyId, ratingValue: value, variantCode: variant || null })
                .then((result) => { if (alive) setPreview(result); })
                .catch(() => { if (alive) setPreview(null); });
        }, 220);
        return () => { alive = false; window.clearTimeout(timer); };
    }, [open, typeFamilyId, rating, variant]);

    const schemeOptions = useMemo(
        () => (codeCategories ?? []).flatMap((category) => category.schemes.map((scheme) => ({
            id: scheme.id,
            label: `${category.code} · ${scheme.code}`,
            next: scheme.nextCode,
        }))),
        [codeCategories],
    );
    const chosenScheme = schemeOptions.find((option) => option.id === codeSchemeId) ?? null;
    const noSchemes = codeCategories !== null && schemeOptions.length === 0;

    const ratingLabel = family
        ? t('panels.model.ratingWithUnit', { unit: unitLabel(family.ratingUnit) })
        : t('panels.model.rating');

    const num = (value: string): number | null => {
        const parsed = Number(String(value).replace(',', '.'));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    const submit = async () => {
        if (!family || !preview || preview.taken || !codeSchemeId) return;
        setSaving(true);
        setError(null);
        try {
            const created = await panelApi.createModel({
                typeFamilyId: family.id,
                ratingValue: Number(rating),
                // Pflicht: aus DIESEM Kreis kommt die Produktnummer.
                codeSchemeId,
                variantCode: variant || null,
                name: name.trim() || null,
                ratedVoltage: num(voltage),
                ratedCurrent: num(current),
                phaseCount: num(phases),
                frequency: num(frequency),
                shortCircuitIcw: num(icw),
                shortCircuitTime: num(icwTime),
                shortCircuitIpk: num(ipk),
                ipRating: ip.trim() || null,
                standard: standard.trim() || null,
            });
            onCreated(created.modelNumber, {
                ...created,
                typeFamily: family,
                article: {
                    id: created.articleId,
                    articleCode: (created as PanelModel & { articleCode?: string }).articleCode ?? '',
                    name: name.trim(),
                    unit: 'Stk',
                    salePrice: 0,
                },
                unitCount: 0,
            });
        } catch (failure) {
            const info = productionErrorOf(failure);
            // VARIANT_REQUIRED nennt den GRUND — damit niemand raten muss,
            // warum ein Kürzel verlangt wird (FRAGE 5).
            if (info.code === 'VARIANT_REQUIRED') {
                const reasons = ((info.details as { reasons?: string[] })?.reasons ?? [])
                    .map((reason) => t(`panels.variantReason.${reason}`))
                    .join(', ');
                setError(t('panels.err.variantRequired', { reasons }));
            } else if (info.code === 'CODE_SCHEME_MISSING') {
                setError(t('panels.err.codeSchemeMissing'));
            } else {
                setError(info.message || t('panels.err.saveFailed'));
            }
        } finally {
            setSaving(false);
        }
    };

    const canSave = Boolean(family) && Boolean(preview) && !preview?.taken && Boolean(codeSchemeId)
        && Boolean(name.trim()) && Boolean(num(voltage)) && Boolean(num(current))
        && Boolean(num(phases)) && Boolean(num(frequency)) && Boolean(num(icw))
        && Boolean(num(icwTime)) && Boolean(num(ipk)) && Boolean(ip.trim())
        && Boolean(standard.trim()) && !saving;

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            width={720}
            title={t('panels.model.newTitle')}
            subtitle={t('panels.model.newSubtitle')}
            footer={(
                <PopupActions start={preview ? <span className="ofi-panel-preview">{preview.modelNumber}</span> : null}>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={saving} disabled={!canSave} onClick={submit}>
                        {t('panels.model.create')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-panel-form">
                {/* Die Nummer ist das Ergebnis, kein Eingabefeld. */}
                <div className="ofi-panel-numbercard">
                    <span className="ofi-panel-numbercard__caption">{t('panels.model.numberCaption')}</span>
                    <strong className="ofi-panel-numbercard__value">{preview?.modelNumber ?? '—'}</strong>
                    {preview?.taken && <span className="ofi-panel-numbercard__taken">{t('panels.model.numberTaken')}</span>}
                </div>

                <div className="ofi-panel-grid">
                    <PopupField label={t('panels.model.family')} required>
                        <select className={CELL_INPUT_CLASS} value={typeFamilyId} onChange={(event) => setTypeFamilyId(event.target.value)}>
                            {active.map((row) => (
                                <option key={row.id} value={row.id}>{`${row.code} · ${row.name}`}</option>
                            ))}
                        </select>
                    </PopupField>
                    <PopupField label={ratingLabel} required>
                        <input className={CELL_INPUT_CLASS} inputMode="numeric" value={rating} onChange={(event) => setRating(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('panels.model.variant')} hint={t('panels.model.variantHint')}>
                        <input className={CELL_INPUT_CLASS} value={variant} onChange={(event) => setVariant(event.target.value.toUpperCase())} />
                    </PopupField>
                </div>

                <PopupField
                    label={t('panels.model.codeScheme')}
                    required
                    hint={chosenScheme ? t('panels.model.codeSchemeNext', { code: chosenScheme.next }) : undefined}
                >
                    <select
                        className={CELL_INPUT_CLASS}
                        value={codeSchemeId}
                        onChange={(event) => setCodeSchemeId(event.target.value)}
                        disabled={noSchemes}
                    >
                        <option value="">{t('panels.model.codeSchemePick')}</option>
                        {schemeOptions.map((option) => (
                            <option key={option.id} value={option.id}>{`${option.label} → ${option.next}`}</option>
                        ))}
                    </select>
                </PopupField>
                {/* Kein freigegebener Kreis: dann sagt die Maske, WO er entsteht —
                    ein Panomodell bekommt nie einen vorläufigen Code. */}
                {noSchemes && <PopupNote tone="warning">{t('panels.err.codeSchemeMissing')}</PopupNote>}

                <PopupField label={t('panels.model.name')} required>
                    <input className={CELL_INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} />
                </PopupField>

                <div className="ofi-panel-caption">{t('panels.model.nameplateSection')}</div>
                <div className="ofi-panel-grid ofi-panel-pair-grid">
                    <PopupField label={t('panels.field.ratedVoltage')} required>
                        <input className={CELL_INPUT_CLASS} inputMode="decimal" value={voltage} onChange={(event) => setVoltage(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('panels.field.ratedCurrent')} required>
                        <input className={CELL_INPUT_CLASS} inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('panels.field.phases')} required>
                        <input className={CELL_INPUT_CLASS} inputMode="numeric" value={phases} onChange={(event) => setPhases(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('panels.field.frequency')} required>
                        <input className={CELL_INPUT_CLASS} inputMode="decimal" value={frequency} onChange={(event) => setFrequency(event.target.value)} />
                    </PopupField>
                    <PopupField
                        label={t('panels.field.icw')}
                        required
                    >
                        <input className={CELL_INPUT_CLASS} inputMode="decimal" value={icw} onChange={(event) => setIcw(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('panels.field.icwTime')} required>
                        <input className={CELL_INPUT_CLASS} inputMode="decimal" value={icwTime} onChange={(event) => setIcwTime(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('panelCenter.ipk')} required>
                        <input className={CELL_INPUT_CLASS} inputMode="decimal" value={ipk} onChange={(event) => setIpk(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('panels.field.ip')} required>
                        <input className={CELL_INPUT_CLASS} value={ip} onChange={(event) => setIp(event.target.value.toUpperCase())} />
                    </PopupField>
                    <PopupField label={t('panels.field.standard')} required className="col-span-2">
                        <input className={CELL_INPUT_CLASS} value={standard} onChange={(event) => setStandard(event.target.value)} />
                    </PopupField>
                </div>

                {error && <PopupNote tone="warning">{error}</PopupNote>}
            </div>
        </PopupDialog>
    );
};

/** kW / A / kvar — die Einheit, die die Familie der Zahl gibt. */
export const unitLabel = (unit: string): string => {
    switch (String(unit || '').toUpperCase()) {
        case 'KW': return 'kW';
        case 'A': return 'A';
        case 'KVAR': return 'kvar';
        default: return '';
    }
};
