import { useEffect, useMemo, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { t } from '@/i18n/translate';
import { articleCodesApi, type CodeCategory } from '@/lib/api/articleCodes';
import { panelApi, refreshPanelFamilies, refreshPanelModels } from '@/lib/api/panels';
import { productionErrorOf } from '@/lib/api/production';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { PanelModel, PanelModelPreview, PanelTypeFamily } from '@/types/panel';
import '@/styles/modules/production.css';
import '@/styles/modules/panels.css';

import { PanelEditorPage, PanelMacSelect, PanelPageActions, PanelPageField, PanelPageNotice, PanelPageSection } from './components/PanelEditorKit';
import { panelRatingUnitLabel } from './panelFormat';

const positive = (value: string): number | null => {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const PanelModelEditorPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const { modelId } = useParams<{ modelId: string }>();
    const editing = Boolean(modelId);
    const [model, setModel] = useState<PanelModel | null>(null);
    const [families, setFamilies] = useState<PanelTypeFamily[]>([]);
    const [codeCategories, setCodeCategories] = useState<CodeCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFamilyId, setTypeFamilyId] = useState('');
    const [rating, setRating] = useState('');
    const [variant, setVariant] = useState('');
    const [codeSchemeId, setCodeSchemeId] = useState('');
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
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteAsk, setDeleteAsk] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        Promise.all([
            panelApi.families(),
            panelApi.settings(),
            articleCodesApi.list({ active: true }),
            modelId ? panelApi.model(modelId) : Promise.resolve(null),
        ]).then(([familyRows, settingPage, categories, current]) => {
            if (!alive) return;
            const active = familyRows.filter((row) => row.isActive);
            setFamilies(familyRows);
            setCodeCategories(categories);
            setModel(current);
            if (current) {
                setTypeFamilyId(current.typeFamilyId);
                setRating(String(current.ratingValue ?? ''));
                setVariant(current.variantCode ?? '');
                setName(current.article?.name ?? '');
                setVoltage(String(current.ratedVoltage ?? ''));
                setCurrent(String(current.ratedCurrent ?? ''));
                setPhases(String(current.phaseCount ?? ''));
                setFrequency(String(current.frequency ?? ''));
                setIcw(String(current.shortCircuitIcw ?? ''));
                setIcwTime(String(current.shortCircuitTime ?? ''));
                setIpk(String(current.shortCircuitIpk ?? ''));
                setIp(current.ipRating ?? '');
                setStandard(current.standard ?? '');
            } else {
                const initial = active[0] ?? null;
                setTypeFamilyId(initial?.id ?? '');
                setCodeSchemeId(initial?.codeSchemeId ?? '');
                setVoltage(String(settingPage.settings.defaultVoltage ?? 400));
                setPhases(String(settingPage.settings.defaultPhases ?? 3));
                setFrequency(String(settingPage.settings.defaultHz ?? 50));
                setIp(settingPage.settings.defaultIpRating ?? '');
                setStandard(settingPage.settings.defaultStandard ?? '');
            }
        }).catch((failure) => {
            if (alive) setError(productionErrorOf(failure).message || t('panels.loadFailed'));
        }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [modelId]);

    const activeFamilies = useMemo(() => families.filter((row) => row.isActive), [families]);
    const family = families.find((row) => row.id === typeFamilyId) ?? null;
    const schemeOptions = useMemo(() => codeCategories.flatMap((category) => category.schemes.map((scheme) => ({
        id: scheme.id,
        label: `${category.code} · ${scheme.code}`,
        next: scheme.nextCode,
    }))), [codeCategories]);
    const chosenScheme = schemeOptions.find((row) => row.id === codeSchemeId) ?? null;

    useEffect(() => {
        if (editing) return;
        setCodeSchemeId(family?.codeSchemeId ?? '');
    }, [editing, family]);

    useEffect(() => {
        if (editing || !typeFamilyId || !positive(rating)) { setPreview(null); return undefined; }
        let alive = true;
        const timer = window.setTimeout(() => {
            panelApi.previewModel({ typeFamilyId, ratingValue: positive(rating)!, variantCode: variant.trim() || null })
                .then((value) => { if (alive) setPreview(value); })
                .catch(() => { if (alive) setPreview(null); });
        }, 180);
        return () => { alive = false; window.clearTimeout(timer); };
    }, [editing, typeFamilyId, rating, variant]);

    const complete = Boolean(name.trim() && positive(voltage) && positive(current) && positive(phases)
        && positive(frequency) && positive(icw) && positive(icwTime) && positive(ipk)
        && ip.trim() && standard.trim());
    const canSave = complete && (editing || Boolean(family && preview && !preview.taken && codeSchemeId && positive(rating)));

    const save = async () => {
        if (!canSave) return;
        setSaving(true); setError(null);
        try {
            const technical = {
                name: name.trim(),
                ratedVoltage: positive(voltage), ratedCurrent: positive(current),
                phaseCount: positive(phases), frequency: positive(frequency),
                shortCircuitIcw: positive(icw), shortCircuitTime: positive(icwTime),
                shortCircuitIpk: positive(ipk), ipRating: ip.trim().toUpperCase(), standard: standard.trim(),
            };
            if (editing && modelId) {
                await panelApi.updateModel(modelId, technical);
            } else if (family) {
                await panelApi.createModel({
                    ...technical,
                    typeFamilyId: family.id,
                    ratingValue: positive(rating)!,
                    variantCode: variant.trim().toUpperCase() || null,
                    codeSchemeId,
                });
                refreshPanelFamilies();
            }
            await refreshPanelModels({});
            navigate('/production/panels?view=models', { replace: true });
        } catch (failure) {
            const info = productionErrorOf(failure);
            if (info.code === 'VARIANT_REQUIRED') {
                const reasons = ((info.details as { reasons?: string[] })?.reasons ?? []).map((reason) => t(`panels.variantReason.${reason}`)).join(', ');
                setError(t('panels.err.variantRequired', { reasons }));
            } else setError(info.message || t('panels.err.saveFailed'));
        } finally { setSaving(false); }
    };

    const remove = async () => {
        if (!modelId || !deleteAsk) return;
        setDeleting(true); setError(null);
        try {
            await panelApi.deleteModel(modelId);
            await refreshPanelModels({});
            navigate('/production/panels?view=models', { replace: true });
        } catch (failure) {
            setError(productionErrorOf(failure).message || t('panels.err.saveFailed'));
            setDeleteAsk(false);
        } finally { setDeleting(false); }
    };

    if (loading) return <div className="ofi-panel-page-state">{t('common.loading')}</div>;

    return (
        <PanelEditorPage
            title={editing ? (model?.modelNumber ?? t('panels.models.title')) : t('panels.model.newTitle')}
            subtitle={editing ? model?.article?.name : t('panels.model.newSubtitle')}
        >
            {!editing && (
                <PanelPageSection title={t('panels.columns.modelNumber')} description={t('panels.model.newSubtitle')}>
                    <div className="ofi-panel-page-number">
                        <span>{t('panels.model.numberCaption')}</span>
                        <strong>{preview?.modelNumber ?? '—'}</strong>
                        {preview?.taken && <small>{t('panels.model.numberTaken')}</small>}
                    </div>
                    <div className="ofi-panel-page-grid is-three">
                        <PanelPageField label={t('panels.model.family')} required>
                            <PanelMacSelect
                                value={typeFamilyId}
                                onChange={setTypeFamilyId}
                                ariaLabel={t('panels.model.family')}
                                options={activeFamilies.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` }))}
                            />
                        </PanelPageField>
                        <PanelPageField label={family ? t('panels.model.ratingWithUnit', { unit: panelRatingUnitLabel(family.ratingUnit) }) : t('panels.model.rating')} required>
                            <input className="ofi-panel-page-control" inputMode="numeric" value={rating} onChange={(event) => setRating(event.target.value)} />
                        </PanelPageField>
                        <PanelPageField label={t('panels.model.variant')} hint={t('panels.model.variantHint')}>
                            <input className="ofi-panel-page-control" value={variant} onChange={(event) => setVariant(event.target.value.toUpperCase())} />
                        </PanelPageField>
                        <PanelPageField label={t('panels.model.codeScheme')} hint={chosenScheme ? t('panels.model.codeSchemeNext', { code: chosenScheme.next }) : undefined} wide required>
                            <PanelMacSelect
                                value={codeSchemeId}
                                onChange={setCodeSchemeId}
                                ariaLabel={t('panels.model.codeScheme')}
                                options={[{ value: '', label: t('panels.model.codeSchemePick') }, ...schemeOptions.map((row) => ({ value: row.id, label: `${row.label} → ${row.next}` }))]}
                            />
                        </PanelPageField>
                    </div>
                </PanelPageSection>
            )}

            <PanelPageSection title={t('panels.model.nameplateSection')} description={t('panelCenter.requiredHint')}>
                <div className="ofi-panel-page-grid">
                    <PanelPageField label={t('panels.model.name')} wide required><input className="ofi-panel-page-control" value={name} onChange={(event) => setName(event.target.value)} /></PanelPageField>
                    <PanelPageField label={t('panels.field.ratedVoltage')} required><input className="ofi-panel-page-control" inputMode="decimal" value={voltage} onChange={(event) => setVoltage(event.target.value)} /></PanelPageField>
                    <PanelPageField label={t('panels.field.ratedCurrent')} required><input className="ofi-panel-page-control" inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} /></PanelPageField>
                    <PanelPageField label={t('panels.field.phases')} required><input className="ofi-panel-page-control" inputMode="numeric" value={phases} onChange={(event) => setPhases(event.target.value)} /></PanelPageField>
                    <PanelPageField label={t('panels.field.frequency')} required><input className="ofi-panel-page-control" inputMode="decimal" value={frequency} onChange={(event) => setFrequency(event.target.value)} /></PanelPageField>
                    <PanelPageField label={t('panels.field.icw')} required><input className="ofi-panel-page-control" inputMode="decimal" value={icw} onChange={(event) => setIcw(event.target.value)} /></PanelPageField>
                    <PanelPageField label={t('panels.field.icwTime')} required><input className="ofi-panel-page-control" inputMode="decimal" value={icwTime} onChange={(event) => setIcwTime(event.target.value)} /></PanelPageField>
                    <PanelPageField label={t('panelCenter.ipk')} required><input className="ofi-panel-page-control" inputMode="decimal" value={ipk} onChange={(event) => setIpk(event.target.value)} /></PanelPageField>
                    <PanelPageField label={t('panels.field.ip')} required><input className="ofi-panel-page-control" value={ip} onChange={(event) => setIp(event.target.value.toUpperCase())} /></PanelPageField>
                    <PanelPageField label={t('panels.field.standard')} wide required><input className="ofi-panel-page-control" value={standard} onChange={(event) => setStandard(event.target.value)} /></PanelPageField>
                </div>
            </PanelPageSection>

            {error && <PanelPageNotice danger>{error}</PanelPageNotice>}
            <PanelPageActions>
                {editing && !deleteAsk && <button type="button" className="ofi-panel-page-button is-danger" disabled={deleting} onClick={() => setDeleteAsk(true)}><Trash2 size={15} />{t('common.delete')}</button>}
                {editing && deleteAsk && <div className="ofi-panel-inline-delete"><span>{t('panelCenter.deleteQuestion')}</span><button type="button" onClick={() => setDeleteAsk(false)}>{t('common.cancel')}</button><button type="button" className="is-danger" disabled={deleting} onClick={remove}>{t('common.delete')}</button></div>}
                <span />
                <button type="button" className="ofi-panel-page-button" onClick={() => navigate('/production/panels?view=models')}>{t('common.cancel')}</button>
                <button type="button" className="ofi-panel-page-button is-primary" disabled={!canSave || saving} onClick={save}><Save size={15} />{saving ? t('common.loading') : t('common.save')}</button>
            </PanelPageActions>
        </PanelEditorPage>
    );
};

export default PanelModelEditorPage;
