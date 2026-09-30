import { useEffect, useState } from 'react';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import type { Bom } from '@/types/productionBom';
import { LoadingState } from '../bomUi';
import { BomGoodsInSection, BomProcurementSection } from './BomProcurementPanels';

/** Each tab reads its own data and leaves the material editor mounted. */
export const BomActivityPanel = ({ bom, section, canEdit, onChanged }: {
    bom: Bom; section: 'requests' | 'goods'; canEdit: boolean; onChanged: (bom: Bom) => void;
}) => {
    const key = `${bom.id}:${bom.updatedAt}:${section}`;
    const [state, setState] = useState<{ key: string; data: Pick<Bom, 'procurement' | 'goodsIn'> | null; error: string | null } | null>(null);
    const [retry, setRetry] = useState(0);
    const compact = Boolean(bom.activity);
    useEffect(() => {
        if (!compact) return;
        const controller = new AbortController();
        setState(null);
        productionBomApi.bomSection(bom.id, section, controller.signal)
            .then((data) => { if (!controller.signal.aborted) setState({ key, data, error: null }); })
            .catch((failure) => { if (!controller.signal.aborted) setState({ key, data: null, error: productionBomErrorText(failure) }); });
        return () => controller.abort();
    }, [bom.id, compact, section, key, retry]);
    const data = compact ? (state?.key === key ? state.data : null) : bom;
    const error = state?.key === key ? state.error : null;
    if (!data) return error ? <div className="ofi-bom-state is-error"><b>{error}</b>
        <button type="button" className="ofi-bom-btn ofi-nosize" onClick={() => setRetry((value) => value + 1)}>{t('productionBom.common.retry')}</button>
    </div> : <LoadingState />;
    const shown = { ...bom, ...data };
    return section === 'requests'
        ? <BomProcurementSection bom={shown} canEdit={canEdit} onChanged={onChanged} />
        : <BomGoodsInSection bom={shown} />;
};
