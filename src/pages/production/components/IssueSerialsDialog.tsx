import { useEffect, useMemo, useState } from 'react';

import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { CELL_INPUT_CLASS } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { panelApi } from '@/lib/api/panels';
import { productionApi, productionErrorOf } from '@/lib/api/production';
import type { PanelModel, PanelSettingsPage, PanelUnit } from '@/types/panel';
import type { ProductionItem, ProductionOrderNode, ProductionPickerProject } from '@/types/production';

const flattenItems = (nodes: ProductionOrderNode[]): ProductionItem[] => nodes.flatMap((node) => [
    ...node.items.map((entry) => entry.item),
    ...flattenItems(node.addons),
]);

/**
 * ── SERİ ÜRET ───────────────────────────────────────────────────────────────
 *
 * Der Augenblick, in dem aus einem TYP einzelne Schränke werden: für `Anzahl`
 * Stück wird je eine Seriennummer gezogen. Bewusst am ANFANG der Fertigung,
 * nicht bei der Lieferung — die Nummer soll schon im Schaltplan stehen
 * (Vorgabe Baris).
 *
 * Gezogene Nummern kommen nie zurück: sie werden fortlaufend vergeben, und ein
 * abgebrochener Vorgang lässt keine Lücke (der Zähler läuft in derselben
 * Transaktion). Darum fragt die Maske vorher, wie viele es wirklich sind.
 */
export const IssueSerialsDialog = ({
    open,
    models,
    settings,
    onClose,
    onIssued,
}: {
    open: boolean;
    models: PanelModel[];
    settings: PanelSettingsPage | null;
    onClose: () => void;
    onIssued: (serials: string[], units?: PanelUnit[]) => void;
}) => {
    const active = useMemo(() => models.filter((model) => model.isActive), [models]);
    const [panelModelId, setPanelModelId] = useState('');
    const [count, setCount] = useState('1');
    const [orderNumber, setOrderNumber] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [siteName, setSiteName] = useState('');
    const [projects, setProjects] = useState<ProductionPickerProject[]>([]);
    const [projectId, setProjectId] = useState('');
    const [devices, setDevices] = useState<ProductionItem[]>([]);
    const [deviceId, setDeviceId] = useState('');
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [retro, setRetro] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setPanelModelId(active[0]?.id ?? '');
        setCount('1'); setOrderNumber(''); setCustomerName(''); setSiteName('');
        setProjectId(''); setDeviceId(''); setDevices([]);
        setRetro(false); setError(null);
    }, [open, active]);

    useEffect(() => {
        if (!open) return;
        productionApi.pickerProjects().then(setProjects).catch(() => setProjects([]));
    }, [open]);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, projects]);

    const amount = Math.max(1, Math.min(200, Math.trunc(Number(count) || 1)));
    const retroAllowed = Boolean(settings?.settings.retroBlockStart);

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
            onIssued(result.units.map((unit) => unit.serialNumber), result.units.map((unit) => ({
                ...unit,
                model: active.find((model) => model.id === panelModelId),
            })));
        } catch (failure) {
            const info = productionErrorOf(failure);
            if (info.code === 'RETRO_BLOCK_MISSING') setError(t('panels.err.retroBlockMissing'));
            else if (info.code === 'SERIAL_BLOCK_FULL') setError(t('panels.err.serialBlockFull'));
            else setError(info.message || t('panels.err.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            width={640}
            title={t('panels.issue.title')}
            subtitle={t('panels.issue.subtitle')}
            footer={(
                <PopupActions
                    start={settings ? (
                        <span className="ofi-panel-preview">
                            {t('panels.issue.next', { serial: settings.nextSerialPreview })}
                        </span>
                    ) : null}
                >
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={saving} disabled={!panelModelId || saving} onClick={submit}>
                        {t('panels.issue.confirm', { count: amount })}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-panel-form">
                <PopupField label={t('panels.issue.model')} required>
                    <select className={CELL_INPUT_CLASS} value={panelModelId} onChange={(event) => setPanelModelId(event.target.value)}>
                        {!active.length && <option value="">{t('panels.issue.noModels')}</option>}
                        {active.map((model) => (
                            <option key={model.id} value={model.id}>
                                {`${model.modelNumber} · ${model.article?.name ?? ''}`.trim()}
                            </option>
                        ))}
                    </select>
                </PopupField>

                <div className="ofi-panel-grid ofi-panel-pair-grid">
                    <PopupField label={t('panels.issue.count')} required hint={t('panels.issue.countHint')}>
                        <input className={CELL_INPUT_CLASS} inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('panels.columns.order')}>
                        <input className={CELL_INPUT_CLASS} value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="AB-2026-…" />
                    </PopupField>
                </div>

                <PopupField label={t('production.columns.project')} hint={t('panelCenter.optional')}>
                    <select className={CELL_INPUT_CLASS} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                        <option value="">{t('panelCenter.noProject')}</option>
                        {projects.map((project) => (
                            <option key={project.id} value={project.id}>{`${project.projectNumber} · ${project.projectName}`}</option>
                        ))}
                    </select>
                </PopupField>
                <PopupField label={t('production.columns.device')} hint={t('panelCenter.optional')}>
                    <select className={CELL_INPUT_CLASS} value={deviceId} disabled={!projectId || loadingDevices} onChange={(event) => setDeviceId(event.target.value)}>
                        <option value="">{loadingDevices ? t('common.loading') : t('panelCenter.noDevice')}</option>
                        {devices.map((device) => (
                            <option key={device.id} value={device.id}>{`${device.positionNumber ?? '—'} · ${device.name}`}</option>
                        ))}
                    </select>
                </PopupField>

                <div className="ofi-panel-grid ofi-panel-pair-grid">
                    <PopupField label={t('panels.columns.customer')}>
                        <input className={CELL_INPUT_CLASS} value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                    </PopupField>
                    <PopupField label={t('panels.columns.site')}>
                        <input className={CELL_INPUT_CLASS} value={siteName} onChange={(event) => setSiteName(event.target.value)} />
                    </PopupField>
                </div>

                {/* FRAGE 7 — Altschränke ziehen aus einem EIGENEN Block, damit sie
                    sich nie mit laufender Produktion mischen. */}
                <label className={`ofi-panel-check ${retroAllowed ? '' : 'is-off'}`}>
                    <input
                        type="checkbox"
                        checked={retro}
                        disabled={!retroAllowed}
                        onChange={(event) => setRetro(event.target.checked)}
                    />
                    <span>
                        {t('panels.issue.retro')}
                        <span className="ofi-panel-sub">
                            {retroAllowed
                                ? t('panels.issue.retroHint', { block: String(settings?.settings.retroBlockStart ?? '') })
                                : t('panels.issue.retroOff')}
                        </span>
                    </span>
                </label>

                <PopupNote>{t('panels.issue.note')}</PopupNote>
                {error && <PopupNote tone="warning">{error}</PopupNote>}
            </div>
        </PopupDialog>
    );
};
