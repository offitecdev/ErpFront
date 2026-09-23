import { useEffect, useState } from 'react';

import { PopupActions, PopupButton, PopupCaption, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { CELL_INPUT_CLASS } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { panelApi } from '@/lib/api/panels';
import { productionErrorOf } from '@/lib/api/production';
import type { PanelModel } from '@/types/panel';

const positive = (value: string): number | null => {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const PanelModelEditDialog = ({ model, onClose, onUpdated }: {
    model: PanelModel | null;
    onClose: () => void;
    onUpdated: (model: PanelModel) => void;
}) => {
    const [voltage, setVoltage] = useState('');
    const [current, setCurrent] = useState('');
    const [phases, setPhases] = useState('');
    const [frequency, setFrequency] = useState('');
    const [icw, setIcw] = useState('');
    const [icwTime, setIcwTime] = useState('');
    const [ipk, setIpk] = useState('');
    const [ip, setIp] = useState('');
    const [standard, setStandard] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!model) return;
        setVoltage(String(model.ratedVoltage ?? ''));
        setCurrent(String(model.ratedCurrent ?? ''));
        setPhases(String(model.phaseCount ?? ''));
        setFrequency(String(model.frequency ?? ''));
        setIcw(String(model.shortCircuitIcw ?? ''));
        setIcwTime(String(model.shortCircuitTime ?? ''));
        setIpk(String(model.shortCircuitIpk ?? ''));
        setIp(model.ipRating ?? '');
        setStandard(model.standard ?? '');
        setError(null);
    }, [model]);

    const complete = Boolean(positive(voltage) && positive(current) && positive(phases)
        && positive(frequency) && positive(icw) && positive(icwTime) && positive(ipk)
        && ip.trim() && standard.trim());

    const save = async () => {
        if (!model || !complete) return;
        setSaving(true);
        setError(null);
        try {
            const updated = await panelApi.updateModel(model.id, {
                ratedVoltage: positive(voltage), ratedCurrent: positive(current),
                phaseCount: positive(phases), frequency: positive(frequency),
                shortCircuitIcw: positive(icw), shortCircuitTime: positive(icwTime),
                shortCircuitIpk: positive(ipk), ipRating: ip.trim(), standard: standard.trim(),
            });
            onUpdated({ ...model, ...updated, article: model.article, typeFamily: model.typeFamily });
        } catch (failure) {
            setError(productionErrorOf(failure).message || t('panels.err.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PopupDialog
            open={Boolean(model)}
            onClose={onClose}
            width={680}
            title={model?.modelNumber ?? t('panels.models.title')}
            subtitle={model?.article?.name ?? t('panels.model.nameplateSection')}
            footer={<PopupActions><PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton><PopupButton variant="primary" loading={saving} disabled={!complete} onClick={save}>{t('common.save')}</PopupButton></PopupActions>}
        >
            <PopupCaption>{t('panels.model.nameplateSection')}</PopupCaption>
            <div className="ofi-panel-grid ofi-panel-pair-grid">
                <PopupField label={t('panels.field.ratedVoltage')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={voltage} onChange={(event) => setVoltage(event.target.value)} /></PopupField>
                <PopupField label={t('panels.field.ratedCurrent')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} /></PopupField>
                <PopupField label={t('panels.field.phases')} required><input className={CELL_INPUT_CLASS} inputMode="numeric" value={phases} onChange={(event) => setPhases(event.target.value)} /></PopupField>
                <PopupField label={t('panels.field.frequency')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={frequency} onChange={(event) => setFrequency(event.target.value)} /></PopupField>
                <PopupField label={t('panels.field.icw')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={icw} onChange={(event) => setIcw(event.target.value)} /></PopupField>
                <PopupField label={t('panels.field.icwTime')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={icwTime} onChange={(event) => setIcwTime(event.target.value)} /></PopupField>
                <PopupField label={t('panelCenter.ipk')} required><input className={CELL_INPUT_CLASS} inputMode="decimal" value={ipk} onChange={(event) => setIpk(event.target.value)} /></PopupField>
                <PopupField label={t('panels.field.ip')} required><input className={CELL_INPUT_CLASS} value={ip} onChange={(event) => setIp(event.target.value.toUpperCase())} /></PopupField>
                <PopupField label={t('panels.field.standard')} required className="col-span-2"><input className={CELL_INPUT_CLASS} value={standard} onChange={(event) => setStandard(event.target.value)} /></PopupField>
            </div>
            {error && <PopupNote tone="warning">{error}</PopupNote>}
        </PopupDialog>
    );
};
