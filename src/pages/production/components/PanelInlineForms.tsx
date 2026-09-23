import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronUp, Plus } from 'lucide-react';

import { CELL_INPUT_CLASS } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { articleCodesApi, type CodeCategory } from '@/lib/api/articleCodes';
import { panelApi } from '@/lib/api/panels';
import { productionApi, productionErrorOf } from '@/lib/api/production';
import type { PanelModel, PanelModelPreview, PanelSettingsPage, PanelTypeFamily, PanelUnit } from '@/types/panel';
import type { ProductionItem, ProductionOrderNode, ProductionPickerProject } from '@/types/production';

const Field = ({ label, required, hint, children, wide = false }: {
    label: string;
    required?: boolean;
    hint?: string;
    children: React.ReactNode;
    wide?: boolean;
}) => (
    <label className={`ofi-panel-field ${wide ? 'is-wide' : ''}`}>
        <span className="ofi-panel-field__label">
            {label}{required && <b aria-hidden="true">*</b>}
        </span>
        {children}
        {hint && <span className="ofi-panel-field__hint">{hint}</span>}
    </label>
);

const numberOrNull = (value: string): number | null => {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const unitLabel = (unit: string): string => {
    switch (String(unit || '').toUpperCase()) {
        case 'KW': return 'kW';
        case 'A': return 'A';
        case 'KVAR': return 'kvar';
        default: return '';
    }
};

export const PanelModelInlineForm = ({
    families,
    settings,
    onCancel,
    onCreated,
}: {
    families: PanelTypeFamily[];
    settings: PanelSettingsPage | null;
    onCancel: () => void;
    onCreated: (model: PanelModel) => void;
}) => {
    const active = useMemo(() => families.filter((row) => row.isActive), [families]);
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
    const [codeCategories, setCodeCategories] = useState<CodeCategory[] | null>(null);
    const [codeSchemeId, setCodeSchemeId] = useState('');
    const [preview, setPreview] = useState<PanelModelPreview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const family = active.find((row) => row.id === typeFamilyId) ?? null;

    useEffect(() => {
        setTypeFamilyId(active[0]?.id ?? '');
        setVoltage(settings?.settings.defaultVoltage ? String(settings.settings.defaultVoltage) : '400');
        setPhases(settings?.settings.defaultPhases ? String(settings.settings.defaultPhases) : '3');
        setFrequency(settings?.settings.defaultHz ? String(settings.settings.defaultHz) : '50');
        setIp(settings?.settings.defaultIpRating ?? '');
        setStandard(settings?.settings.defaultStandard ?? '');
    }, [active, settings]);

    useEffect(() => {
        let alive = true;
        articleCodesApi.list({ active: true })
            .then((rows) => { if (alive) setCodeCategories(rows); })
            .catch(() => { if (alive) setCodeCategories([]); });
        return () => { alive = false; };
    }, []);

    useEffect(() => setCodeSchemeId(family?.codeSchemeId ?? ''), [family]);

    useEffect(() => {
        const value = Number(rating.replace(',', '.'));
        if (!typeFamilyId || !Number.isFinite(value) || value <= 0) {
            setPreview(null);
            return undefined;
        }
        let alive = true;
        const timer = window.setTimeout(() => {
            panelApi.previewModel({ typeFamilyId, ratingValue: value, variantCode: variant || null })
                .then((result) => { if (alive) setPreview(result); })
                .catch(() => { if (alive) setPreview(null); });
        }, 180);
        return () => { alive = false; window.clearTimeout(timer); };
    }, [typeFamilyId, rating, variant]);

    const schemes = useMemo(() => (codeCategories ?? []).flatMap((category) => category.schemes.map((scheme) => ({
        id: scheme.id,
        label: `${category.code} · ${scheme.code}`,
        next: scheme.nextCode,
    }))), [codeCategories]);

    const requiredReady = Boolean(
        family && preview && !preview.taken && codeSchemeId && name.trim()
        && numberOrNull(voltage) && numberOrNull(current) && numberOrNull(phases)
        && numberOrNull(frequency) && ip.trim() && standard.trim()
        && numberOrNull(icw) && numberOrNull(icwTime) && numberOrNull(ipk),
    );

    const submit = async () => {
        if (!family || !preview || !requiredReady) return;
        setSaving(true);
        setError(null);
        try {
            const created = await panelApi.createModel({
                typeFamilyId: family.id,
                ratingValue: Number(rating.replace(',', '.')),
                codeSchemeId,
                variantCode: variant.trim() || null,
                name: name.trim(),
                ratedVoltage: numberOrNull(voltage),
                ratedCurrent: numberOrNull(current),
                phaseCount: numberOrNull(phases),
                frequency: numberOrNull(frequency),
                shortCircuitIcw: numberOrNull(icw),
                shortCircuitTime: numberOrNull(icwTime),
                shortCircuitIpk: numberOrNull(ipk),
                ipRating: ip.trim(),
                standard: standard.trim(),
            });
            onCreated({
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
            setError(info.message || t('panels.err.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="ofi-panel-editor" aria-label={t('panels.model.newTitle')}>
            <div className="ofi-panel-editor__head">
                <div>
                    <strong>{t('panels.model.newTitle')}</strong>
                    <span>{t('panels.model.newSubtitle')}</span>
                </div>
                <button type="button" className="ofi-btn" onClick={onCancel}><ChevronUp size={16} />{t('common.cancel')}</button>
            </div>

            <div className="ofi-panel-model-number">
                <span>{t('panels.model.numberCaption')}</span>
                <strong>{preview?.modelNumber ?? '—'}</strong>
                {preview?.taken && <em>{t('panels.model.numberTaken')}</em>}
            </div>

            <div className="ofi-panel-formgrid">
                <Field label={t('panels.model.family')} required>
                    <select className={CELL_INPUT_CLASS} value={typeFamilyId} onChange={(event) => setTypeFamilyId(event.target.value)}>
                        {active.map((row) => <option key={row.id} value={row.id}>{`${row.code} · ${row.name}`}</option>)}
                    </select>
                </Field>
                <Field label={family ? t('panels.model.ratingWithUnit', { unit: unitLabel(family.ratingUnit) }) : t('panels.model.rating')} required>
                    <input className={CELL_INPUT_CLASS} inputMode="decimal" value={rating} onChange={(event) => setRating(event.target.value)} />
                </Field>
                <Field label={t('panels.model.variant')} hint={t('panels.model.variantHint')}>
                    <input className={CELL_INPUT_CLASS} value={variant} maxLength={8} onChange={(event) => setVariant(event.target.value.toUpperCase())} />
                </Field>
                <Field label={t('panels.model.codeScheme')} required>
                    <select className={CELL_INPUT_CLASS} value={codeSchemeId} onChange={(event) => setCodeSchemeId(event.target.value)}>
                        <option value="">{t('panels.model.codeSchemePick')}</option>
                        {schemes.map((option) => <option key={option.id} value={option.id}>{`${option.label} → ${option.next}`}</option>)}
                    </select>
                </Field>
                <Field label={t('panels.model.name')} required wide>
                    <input className={CELL_INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} />
                </Field>
            </div>

            <div className="ofi-panel-editor__divider"><span>{t('panels.model.nameplateSection')}</span></div>
            <div className="ofi-panel-formgrid is-technical">
                <Field label={t('panels.field.ratedVoltage')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={voltage} onChange={(event) => setVoltage(event.target.value)} /></Field>
                <Field label={t('panels.field.ratedCurrent')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} /></Field>
                <Field label={t('panels.field.phases')} required><input className={CELL_INPUT_CLASS} inputMode="numeric" value={phases} onChange={(event) => setPhases(event.target.value)} /></Field>
                <Field label={t('panels.field.frequency')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={frequency} onChange={(event) => setFrequency(event.target.value)} /></Field>
                <Field label={t('panels.field.icw')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={icw} onChange={(event) => setIcw(event.target.value)} /></Field>
                <Field label={t('panels.field.icwTime')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={icwTime} onChange={(event) => setIcwTime(event.target.value)} /></Field>
                <Field label={t('panelCenter.ipk')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={ipk} onChange={(event) => setIpk(event.target.value)} /></Field>
                <Field label={t('panels.field.ip')} required><input className={CELL_INPUT_CLASS} value={ip} onChange={(event) => setIp(event.target.value.toUpperCase())} /></Field>
                <Field label={t('panels.field.standard')} required wide><input className={CELL_INPUT_CLASS} value={standard} onChange={(event) => setStandard(event.target.value)} /></Field>
            </div>

            {error && <div className="ofi-prod-note is-warn">{error}</div>}
            <div className="ofi-panel-editor__actions">
                <span>{t('panelCenter.requiredHint')}</span>
                <button type="button" className="ofi-btn is-primary" disabled={!requiredReady || saving} onClick={submit}>
                    <Check size={16} />{saving ? t('common.saving') : t('panels.model.create')}
                </button>
            </div>
        </section>
    );
};

const flattenItems = (nodes: ProductionOrderNode[]): ProductionItem[] => nodes.flatMap((node) => [
    ...node.items.map((entry) => entry.item),
    ...flattenItems(node.addons),
]);

export const PanelUnitInlineForm = ({
    models,
    settings,
    onCancel,
    onCreated,
}: {
    models: PanelModel[];
    settings: PanelSettingsPage | null;
    onCancel: () => void;
    onCreated: (units: PanelUnit[]) => void;
}) => {
    const active = useMemo(() => models.filter((row) => row.isActive), [models]);
    const [panelModelId, setPanelModelId] = useState(active[0]?.id ?? '');
    const [count, setCount] = useState('1');
    const [projects, setProjects] = useState<ProductionPickerProject[]>([]);
    const [projectId, setProjectId] = useState('');
    const [devices, setDevices] = useState<ProductionItem[]>([]);
    const [deviceId, setDeviceId] = useState('');
    const [orderNumber, setOrderNumber] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [siteName, setSiteName] = useState('');
    const [retro, setRetro] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (!panelModelId && active[0]) setPanelModelId(active[0].id); }, [active, panelModelId]);
    useEffect(() => { productionApi.pickerProjects().then(setProjects).catch(() => setProjects([])); }, []);
    useEffect(() => {
        setDeviceId('');
        setDevices([]);
        if (!projectId) return;
        const project = projects.find((row) => row.id === projectId);
        if (project?.customerName && !customerName) setCustomerName(project.customerName);
        setLoadingDevices(true);
        productionApi.pickerProject(projectId)
            .then((result) => setDevices(flattenItems(result.orders).filter((item) => item.kind === 'DEVICE' && item.isActive)))
            .catch(() => setDevices([]))
            .finally(() => setLoadingDevices(false));
        // Customer input must remain editable; only seed it when the project changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, projects]);

    const amount = Math.max(1, Math.min(200, Math.trunc(Number(count) || 1)));
    const submit = async () => {
        if (!panelModelId) return;
        setSaving(true);
        setError(null);
        try {
            const result = await panelApi.issueSerials({
                panelModelId,
                count: amount,
                retro,
                productionProjectId: projectId || null,
                productionItemId: deviceId || null,
                orderNumber: orderNumber.trim() || null,
                customerName: customerName.trim() || null,
                siteName: siteName.trim() || null,
            });
            onCreated(result.units.map((unit) => ({
                ...unit,
                model: active.find((model) => model.id === panelModelId),
            })));
        } catch (failure) {
            const info = productionErrorOf(failure);
            setError(info.message || t('panels.err.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="ofi-panel-editor" aria-label={t('panels.issue.title')}>
            <div className="ofi-panel-editor__head">
                <div><strong>{t('panels.issue.title')}</strong><span>{t('panelCenter.issueSubtitle')}</span></div>
                <button type="button" className="ofi-btn" onClick={onCancel}><ChevronUp size={16} />{t('common.cancel')}</button>
            </div>
            <div className="ofi-panel-formgrid">
                <Field label={t('panels.issue.model')} required wide>
                    <select className={CELL_INPUT_CLASS} value={panelModelId} onChange={(event) => setPanelModelId(event.target.value)}>
                        {!active.length && <option value="">{t('panels.issue.noModels')}</option>}
                        {active.map((model) => <option key={model.id} value={model.id}>{`${model.modelNumber} · ${model.article?.name ?? ''}`}</option>)}
                    </select>
                </Field>
                <Field label={t('panels.issue.count')} required><input className={CELL_INPUT_CLASS} inputMode="numeric" min={1} max={200} value={count} onChange={(event) => setCount(event.target.value)} /></Field>
                <Field label={t('production.columns.project')} hint={t('panelCenter.optional')} wide>
                    <select className={CELL_INPUT_CLASS} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                        <option value="">{t('panelCenter.noProject')}</option>
                        {projects.map((project) => <option key={project.id} value={project.id}>{`${project.projectNumber} · ${project.projectName}`}</option>)}
                    </select>
                </Field>
                <Field label={t('production.columns.device')} hint={t('panelCenter.optional')} wide>
                    <select className={CELL_INPUT_CLASS} value={deviceId} disabled={!projectId || loadingDevices} onChange={(event) => setDeviceId(event.target.value)}>
                        <option value="">{loadingDevices ? t('common.loading') : t('panelCenter.noDevice')}</option>
                        {devices.map((device) => <option key={device.id} value={device.id}>{`${device.positionNumber ?? '—'} · ${device.name}`}</option>)}
                    </select>
                </Field>
                <Field label={t('panels.columns.order')}><input className={CELL_INPUT_CLASS} value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} /></Field>
                <Field label={t('panels.columns.customer')}><input className={CELL_INPUT_CLASS} value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></Field>
                <Field label={t('panels.columns.site')}><input className={CELL_INPUT_CLASS} value={siteName} onChange={(event) => setSiteName(event.target.value)} /></Field>
            </div>
            <label className={`ofi-panel-check ${settings?.settings.retroBlockStart ? '' : 'is-off'}`}>
                <input type="checkbox" checked={retro} disabled={!settings?.settings.retroBlockStart} onChange={(event) => setRetro(event.target.checked)} />
                <span>{t('panels.issue.retro')}<small>{settings?.settings.retroBlockStart ? t('panels.issue.retroHint', { block: settings.settings.retroBlockStart }) : t('panels.issue.retroOff')}</small></span>
            </label>
            {error && <div className="ofi-prod-note is-warn">{error}</div>}
            <div className="ofi-panel-editor__actions">
                <span>{settings ? t('panels.issue.next', { serial: settings.nextSerialPreview }) : ''}</span>
                <button type="button" className="ofi-btn is-primary" disabled={!panelModelId || saving} onClick={submit}>
                    <Plus size={16} />{saving ? t('common.saving') : t('panels.issue.confirm', { count: amount })}
                </button>
            </div>
        </section>
    );
};

export const PanelModelInlineDetail = ({ model, onClose, onUpdated }: {
    model: PanelModel;
    onClose: () => void;
    onUpdated: (model: PanelModel) => void;
}) => {
    const [voltage, setVoltage] = useState(String(model.ratedVoltage ?? ''));
    const [current, setCurrent] = useState(String(model.ratedCurrent ?? ''));
    const [phases, setPhases] = useState(String(model.phaseCount ?? ''));
    const [frequency, setFrequency] = useState(String(model.frequency ?? ''));
    const [icw, setIcw] = useState(String(model.shortCircuitIcw ?? ''));
    const [icwTime, setIcwTime] = useState(String(model.shortCircuitTime ?? ''));
    const [ipk, setIpk] = useState(String(model.shortCircuitIpk ?? ''));
    const [ip, setIp] = useState(model.ipRating ?? '');
    const [standard, setStandard] = useState(model.standard ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ready = Boolean(numberOrNull(voltage) && numberOrNull(current) && numberOrNull(phases)
        && numberOrNull(frequency) && numberOrNull(icw) && numberOrNull(icwTime)
        && numberOrNull(ipk) && ip.trim() && standard.trim());

    const save = async () => {
        if (!ready) return;
        setSaving(true);
        setError(null);
        try {
            const updated = await panelApi.updateModel(model.id, {
                ratedVoltage: numberOrNull(voltage), ratedCurrent: numberOrNull(current),
                phaseCount: numberOrNull(phases), frequency: numberOrNull(frequency),
                shortCircuitIcw: numberOrNull(icw), shortCircuitTime: numberOrNull(icwTime),
                shortCircuitIpk: numberOrNull(ipk), ipRating: ip.trim(), standard: standard.trim(),
            });
            onUpdated({ ...model, ...updated, article: model.article, typeFamily: model.typeFamily });
        } catch (failure) {
            setError(productionErrorOf(failure).message || t('panels.err.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="ofi-panel-editor">
            <div className="ofi-panel-editor__head">
                <div><strong className="ofi-panel-mono">{model.modelNumber}</strong><span>{model.article?.name ?? t('panels.models.title')}</span></div>
                <button type="button" className="ofi-btn" onClick={onClose}><ChevronUp size={16} />{t('common.close')}</button>
            </div>
            <div className="ofi-panel-editor__divider"><span>{t('panels.model.nameplateSection')}</span></div>
            <div className="ofi-panel-formgrid is-technical">
                <Field label={t('panels.field.ratedVoltage')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={voltage} onChange={(event) => setVoltage(event.target.value)} /></Field>
                <Field label={t('panels.field.ratedCurrent')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} /></Field>
                <Field label={t('panels.field.phases')} required><input className={CELL_INPUT_CLASS} inputMode="numeric" value={phases} onChange={(event) => setPhases(event.target.value)} /></Field>
                <Field label={t('panels.field.frequency')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={frequency} onChange={(event) => setFrequency(event.target.value)} /></Field>
                <Field label={t('panels.field.icw')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={icw} onChange={(event) => setIcw(event.target.value)} /></Field>
                <Field label={t('panels.field.icwTime')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={icwTime} onChange={(event) => setIcwTime(event.target.value)} /></Field>
                <Field label={t('panelCenter.ipk')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={ipk} onChange={(event) => setIpk(event.target.value)} /></Field>
                <Field label={t('panels.field.ip')} required><input className={CELL_INPUT_CLASS} value={ip} onChange={(event) => setIp(event.target.value.toUpperCase())} /></Field>
                <Field label={t('panels.field.standard')} required wide><input className={CELL_INPUT_CLASS} value={standard} onChange={(event) => setStandard(event.target.value)} /></Field>
            </div>
            {error && <div className="ofi-prod-note is-warn">{error}</div>}
            <div className="ofi-panel-editor__actions"><span>{t('panelCenter.requiredHint')}</span><button type="button" className="ofi-btn is-primary" disabled={!ready || saving} onClick={save}><Check size={16} />{saving ? t('common.saving') : t('common.save')}</button></div>
        </section>
    );
};
