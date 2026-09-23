import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { FilterBar, FilterSelect, SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { readPanelFamilies, readPanelModels, readPanelSettings, refreshPanelFamilies, refreshPanelModels } from '@/lib/api/panels';
import { productionErrorText } from '@/lib/api/production';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { PanelModel, PanelSettingsPage, PanelTypeFamily } from '@/types/panel';
import '@/styles/modules/production.css';
import '@/styles/modules/panels.css';

import { PanelModelDialog, unitLabel } from './components/PanelModelDialog';

/**
 * ── PANO MODELLERİ (20.09.2026, Vorgabe Baris) ──────────────────────────────
 *
 * Der Katalog der TYPEN. Eine Zeile = ein Modell = eine Produktkarte:
 *
 *   Produktnummer `PNO-CP-00001` · Modellnummer `OT-CP-250` · Technik · Stück
 *
 * Die Modellnummer wird hier nie getippt, nur gebildet (siehe PanelModelDialog).
 * Wie viele Schränke dieses Modells schon gebaut wurden, steht rechts — die
 * Seriennummern selbst leben auf der Seite «Panolar».
 */
export const PanelModelsPage = () => {
    useLanguageTick();
    const [search, setSearch] = useState('');
    const debounced = useDebouncedValue(search.trim(), 250);
    const [familyId, setFamilyId] = useState('');
    const [models, setModels] = useState<PanelModel[] | null>(null);
    const [families, setFamilies] = useState<PanelTypeFamily[]>([]);
    const [settings, setSettings] = useState<PanelSettingsPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);

    useEffect(() => readPanelFamilies((value) => setFamilies(value), () => undefined), []);
    useEffect(() => readPanelSettings((value) => setSettings(value), () => undefined), []);

    useEffect(() => {
        setLoading(true);
        setError(null);
        return readPanelModels(
            { ...(familyId ? { familyId } : {}), ...(debounced ? { q: debounced } : {}) },
            (value) => { setModels(value); setLoading(false); },
            (failure) => { setError(productionErrorText(failure, t('panels.loadFailed'))); setLoading(false); },
        );
    }, [familyId, debounced]);

    const rows = models ?? [];

    return (
        <div className="ofi-prod-page ofi-panels">
            <InventoryListHeader
                title={t('panels.models.title')}
                action={(
                    <button type="button" className="ofi-btn is-primary" onClick={() => setDialogOpen(true)}>
                        <Plus size={16} />
                        {t('panels.models.new')}
                    </button>
                )}
            />

            <FilterBar>
                <SearchBox value={search} onChange={setSearch} placeholder={t('panels.models.search')} busy={loading && Boolean(models)} />
                <FilterSelect value={familyId} onChange={setFamilyId} label={t('panels.models.family')} width="wide">
                    <option value="">{t('panels.models.allFamilies')}</option>
                    {families.map((family) => (
                        <option key={family.id} value={family.id}>{`${family.code} · ${family.name}`}</option>
                    ))}
                </FilterSelect>
            </FilterBar>

            {flash && <div className="ofi-prod-note">{flash}</div>}
            {error && <div className="ofi-prod-note is-warn">{error}</div>}

            <SectionCard
                title={(
                    <span>
                        {t('panels.models.sectionTitle')}
                        <span className="font-normal text-slate-400"> · {rows.length}</span>
                    </span>
                )}
            >
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[980px]">
                        <colgroup>
                            <col style={{ width: 150 }} />
                            <col style={{ width: 150 }} />
                            <col />
                            <col style={{ width: 120 }} />
                            <col style={{ width: 120 }} />
                            <col style={{ width: 92 }} />
                            <col style={{ width: 92 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>{t('panels.columns.modelNumber')}</th>
                                <th>{t('panels.columns.articleCode')}</th>
                                <th>{t('panels.columns.name')}</th>
                                <th>{t('panels.columns.electrical')}</th>
                                <th>{t('panels.columns.protection')}</th>
                                <th className="text-right">{t('panels.columns.units')}</th>
                                <th>{t('panels.columns.state')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!rows.length && (
                                <TableStateRow colSpan={7} loading={loading} emptyText={t('panels.models.empty')} />
                            )}
                            {rows.map((model) => (
                                <tr key={model.id}>
                                    <td>
                                        <span className="ofi-panel-mono">{model.modelNumber}</span>
                                        <span className="ofi-panel-sub">
                                            {model.typeFamily ? `${model.typeFamily.code} · ${model.typeFamily.name}` : model.typeCode}
                                        </span>
                                    </td>
                                    <td><span className="ofi-panel-mono is-muted">{model.article?.articleCode ?? '—'}</span></td>
                                    <td className="truncate">{model.article?.name ?? '—'}</td>
                                    <td>
                                        {/* Genau die Zeile vom Schild: 3~ / 400 V / 50 Hz */}
                                        <span className="ofi-panel-sub is-strong">
                                            {[
                                                model.phaseCount ? `${model.phaseCount}~` : null,
                                                model.ratedVoltage ? `${model.ratedVoltage} V` : null,
                                                model.frequency ? `${model.frequency} Hz` : null,
                                            ].filter(Boolean).join(' / ') || '—'}
                                        </span>
                                        <span className="ofi-panel-sub">
                                            {model.ratedCurrent ? `InA ${model.ratedCurrent} A` : ''}
                                            {model.shortCircuitIcw ? ` · Icw ${model.shortCircuitIcw} kA` : ''}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="ofi-panel-sub is-strong">{model.ipRating ?? '—'}</span>
                                        <span className="ofi-panel-sub">{model.standard ?? ''}</span>
                                    </td>
                                    <td className="text-right tabular-nums">{model.unitCount ?? 0}</td>
                                    <td>
                                        <span className={`ofi-panel-chip ${model.isActive ? '' : 'is-off'}`}>
                                            {model.isActive ? t('panels.state.active') : t('panels.state.inactive')}
                                        </span>
                                        <span className="ofi-panel-sub">
                                            {model.ratingValue ? `${model.ratingValue} ${unitLabel(String(model.ratingUnit))}` : ''}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            <PanelModelDialog
                open={dialogOpen}
                families={families}
                settings={settings}
                onClose={() => setDialogOpen(false)}
                onCreated={(modelNumber) => {
                    setDialogOpen(false);
                    setFlash(t('panels.models.created', { modelNumber }));
                    window.setTimeout(() => setFlash(null), 6000);
                    refreshPanelModels({ ...(familyId ? { familyId } : {}), ...(debounced ? { q: debounced } : {}) });
                    // Der gewählte Nummernkreis steht jetzt am Typ — beim
                    // nächsten Modell ist er vorgewählt.
                    refreshPanelFamilies();
                }}
            />
        </div>
    );
};

export default PanelModelsPage;
