import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { FilterBar, FilterSelect, SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { readPanelFamilies, readPanelModels, readPanelUnits } from '@/lib/api/panels';
import { productionErrorText } from '@/lib/api/production';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { fmtDate } from '@/pages/inventory/utils/format';
import { PANEL_UNIT_STATUSES, type PanelModel, type PanelTypeFamily, type PanelUnitsPage as UnitsPage } from '@/types/panel';
import '@/styles/modules/production.css';
import '@/styles/modules/panels.css';

import { panelRatingUnitLabel } from './panelFormat';

type View = 'units' | 'models';

/** Pano ve modeller tek merkezde; hızlı işlemler ortak Apple popup sistemiyle açılır. */
export const PanelUnitsPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const view: View = params.get('view') === 'models' ? 'models' : 'units';
    const [search, setSearch] = useState(params.get('serial') ?? '');
    const debounced = useDebouncedValue(search.trim(), 180);
    const [status, setStatus] = useState('');
    const [modelId, setModelId] = useState('');
    const [familyId, setFamilyId] = useState('');
    const [unitsPage, setUnitsPage] = useState<UnitsPage | null>(null);
    const [models, setModels] = useState<PanelModel[] | null>(null);
    const [families, setFamilies] = useState<PanelTypeFamily[]>([]);
    const [loadingUnits, setLoadingUnits] = useState(true);
    const [loadingModels, setLoadingModels] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => readPanelFamilies((value) => setFamilies(value), () => undefined), []);

    const unitQuery = useMemo(() => ({
        ...(status ? { status } : {}),
        ...(modelId ? { modelId } : {}),
        ...(view === 'units' && debounced ? { q: debounced } : {}),
    }), [status, modelId, view, debounced]);
    const modelQuery = useMemo(() => ({
        ...(familyId ? { familyId } : {}),
        ...(view === 'models' && debounced ? { q: debounced } : {}),
    }), [familyId, view, debounced]);

    useEffect(() => {
        setLoadingUnits(true);
        return readPanelUnits(unitQuery, (value) => { setUnitsPage(value); setLoadingUnits(false); }, (failure) => {
            setError(productionErrorText(failure, t('panels.loadFailed')));
            setLoadingUnits(false);
        });
    }, [unitQuery]);

    useEffect(() => {
        setLoadingModels(true);
        return readPanelModels(modelQuery, (value) => { setModels(value); setLoadingModels(false); }, (failure) => {
            setError(productionErrorText(failure, t('panels.loadFailed')));
            setLoadingModels(false);
        });
    }, [modelQuery]);

    useEffect(() => {
        const serial = params.get('serial');
        if (!serial || !unitsPage) return;
        const hit = unitsPage.rows.find((row) => row.serialNumber === serial);
        if (!hit) return;
        navigate(`/production/panels/${hit.id}`, { replace: true });
    }, [navigate, params, unitsPage]);

    const switchView = (next: View) => {
        const nextParams = new URLSearchParams();
        if (next === 'models') nextParams.set('view', 'models');
        setParams(nextParams, { replace: true });
        setSearch('');
        setError(null);
    };
    const unitRows = unitsPage?.rows ?? [];
    const modelRows = models ?? [];

    return (
        <div className="ofi-prod-page ofi-panels">
            <InventoryListHeader
                title={t('panelCenter.title')}
                action={<button type="button" className="ofi-btn is-primary" onClick={() => navigate(view === 'units' ? '/production/panels/new' : '/production/panels/models/new')}><Plus size={16} />{view === 'units' ? t('panels.units.issue') : t('panels.models.new')}</button>}
            />

            <div className="ofi-prod-segment" role="tablist" aria-label={t('panelCenter.title')}>
                <button type="button" role="tab" aria-selected={view === 'units'} className={view === 'units' ? 'is-on' : ''} onClick={() => switchView('units')}>{t('panels.units.title')}<span>{unitsPage?.total ?? 0}</span></button>
                <button type="button" role="tab" aria-selected={view === 'models'} className={view === 'models' ? 'is-on' : ''} onClick={() => switchView('models')}>{t('panels.models.title')}<span>{modelRows.length}</span></button>
            </div>

            {error && <div className="ofi-prod-note is-warn">{error}</div>}

            {view === 'units' ? (
                <>
                    <FilterBar>
                        <SearchBox value={search} onChange={setSearch} placeholder={t('panels.units.search')} busy={loadingUnits && Boolean(unitsPage)} />
                        <FilterSelect value={status} onChange={setStatus} label={t('panels.columns.state')}><option value="">{t('panels.units.allStates')}</option>{PANEL_UNIT_STATUSES.map((value) => <option key={value} value={value}>{t(`panels.status.${value}`)}</option>)}</FilterSelect>
                        <FilterSelect value={modelId} onChange={setModelId} label={t('panels.columns.modelNumber')} width="wide"><option value="">{t('panels.units.allModels')}</option>{modelRows.map((model) => <option key={model.id} value={model.id}>{model.modelNumber}</option>)}</FilterSelect>
                    </FilterBar>

                    <SectionCard title={<span>{t('panels.units.sectionTitle')}<span className="font-normal text-slate-400"> · {unitsPage?.total ?? 0}</span></span>}>
                        <div className="overflow-x-auto"><table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[1080px]">
                            <colgroup><col style={{ width: 150 }} /><col style={{ width: 150 }} /><col style={{ width: 140 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 130 }} /><col style={{ width: 110 }} /></colgroup>
                            <thead><tr><th>{t('panels.columns.serial')}</th><th>{t('panels.columns.modelNumber')}</th><th>{t('panels.columns.order')}</th><th>{t('panels.columns.customer')}</th><th>{t('panels.columns.schema')}</th><th>{t('panels.columns.state')}</th><th>{t('panels.columns.created')}</th></tr></thead>
                            <tbody>
                                {!unitRows.length && <TableStateRow colSpan={7} loading={loadingUnits} emptyText={t('panels.units.empty')} />}
                                {unitRows.map((unit) => <tr key={unit.id} onClick={() => navigate(`/production/panels/${unit.id}`)} className="cursor-pointer">
                                    <td><span className="ofi-panel-mono">{unit.serialNumber}</span>{unit.isRetro && <span className="ofi-panel-sub">{t('panels.units.retroTag')}</span>}</td>
                                    <td><span className="ofi-panel-mono is-muted">{unit.model?.modelNumber ?? unit.modelNumberSnapshot ?? '—'}</span></td>
                                    <td>{unit.orderNumber ?? '—'}</td>
                                    <td className="truncate">{unit.customerName ?? '—'}{unit.siteName && <span className="ofi-panel-sub">{unit.siteName}</span>}</td>
                                    <td>{unit.schemaNumber ? <span className="ofi-panel-sub is-strong">{`${unit.schemaNumber}${unit.schemaRevision ? ` · ${unit.schemaRevision}` : ''}`}</span> : <span className="ofi-panel-sub">{t('panels.units.noSchema')}</span>}</td>
                                    <td><span className={`ofi-panel-chip is-${String(unit.status).toLowerCase()}`}>{t(`panels.status.${unit.status}`)}</span></td>
                                    <td className="ofi-panel-sub">{unit.createdAt ? fmtDate(unit.createdAt) : '—'}</td>
                                </tr>)}
                            </tbody>
                        </table></div>
                    </SectionCard>
                </>
            ) : (
                <>
                    <FilterBar>
                        <SearchBox value={search} onChange={setSearch} placeholder={t('panels.models.search')} busy={loadingModels && Boolean(models)} />
                        <FilterSelect value={familyId} onChange={setFamilyId} label={t('panels.models.family')} width="wide"><option value="">{t('panels.models.allFamilies')}</option>{families.map((family) => <option key={family.id} value={family.id}>{`${family.code} · ${family.name}`}</option>)}</FilterSelect>
                    </FilterBar>
                    <SectionCard title={<span>{t('panels.models.sectionTitle')}<span className="font-normal text-slate-400"> · {modelRows.length}</span></span>}>
                        <div className="overflow-x-auto"><table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[980px]">
                            <colgroup><col style={{ width: 150 }} /><col style={{ width: 150 }} /><col /><col style={{ width: 180 }} /><col style={{ width: 140 }} /><col style={{ width: 92 }} /><col style={{ width: 100 }} /></colgroup>
                            <thead><tr><th>{t('panels.columns.modelNumber')}</th><th>{t('panels.columns.articleCode')}</th><th>{t('panels.columns.name')}</th><th>{t('panels.columns.electrical')}</th><th>{t('panels.columns.protection')}</th><th className="text-right">{t('panels.columns.units')}</th><th>{t('panels.columns.state')}</th></tr></thead>
                            <tbody>
                                {!modelRows.length && <TableStateRow colSpan={7} loading={loadingModels} emptyText={t('panels.models.empty')} />}
                                {modelRows.map((model) => <tr key={model.id} className="cursor-pointer" onClick={() => navigate(`/production/panels/models/${model.id}`)}>
                                    <td><span className="ofi-panel-mono">{model.modelNumber}</span><span className="ofi-panel-sub">{model.typeFamily ? `${model.typeFamily.code} · ${model.typeFamily.name}` : model.typeCode}</span></td>
                                    <td><span className="ofi-panel-mono is-muted">{model.article?.articleCode ?? '—'}</span></td>
                                    <td className="truncate">{model.article?.name ?? '—'}</td>
                                    <td><span className="ofi-panel-sub is-strong">{[model.phaseCount ? `${model.phaseCount}~` : null, model.ratedVoltage ? `${model.ratedVoltage} V` : null, model.frequency ? `${model.frequency} Hz` : null].filter(Boolean).join(' / ') || '—'}</span><span className="ofi-panel-sub">{model.ratedCurrent ? `InA ${model.ratedCurrent} A` : ''}{model.shortCircuitIcw ? ` · Icw ${model.shortCircuitIcw} kA` : ''}</span></td>
                                    <td><span className="ofi-panel-sub is-strong">{model.ipRating ?? '—'}</span><span className="ofi-panel-sub">{model.standard ?? ''}</span></td>
                                    <td className="text-right tabular-nums">{model.unitCount ?? 0}</td>
                                    <td><span className={`ofi-panel-chip ${model.isActive ? '' : 'is-off'}`}>{model.isActive ? t('panels.state.active') : t('panels.state.inactive')}</span><span className="ofi-panel-sub">{model.ratingValue ? `${model.ratingValue} ${panelRatingUnitLabel(String(model.ratingUnit))}` : ''}</span></td>
                                </tr>)}
                            </tbody>
                        </table></div>
                    </SectionCard>
                </>
            )}

        </div>
    );
};

export default PanelUnitsPage;
