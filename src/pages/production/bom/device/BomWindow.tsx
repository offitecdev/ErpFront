import { useCallback } from 'react';
import { Boxes } from 'lucide-react';

import { PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { useNavGuardStore } from '@/store/navGuardStore';
import type { BomArea } from '@/types/productionBom';

import { DeviceBomArea } from './DeviceBomArea';

/**
 * ── DAS BOM-FENSTER DER STUFE «BOM» (02.10.2026) ────────────────────────────
 *
 * «BOM stage page should be like the other stage pages with tasks, files etc.
 *  buttons … only add a new button BOM. It will open the standard BOM creation
 *  window.» Die Stufe zeigt ihre Plättchen wie jede andere; das Plättchen «BOM»
 * öffnet hier die gewohnte BOM-Fläche (Haupt-BOM, Alt-BOMs, Revisionen) des
 * Bereichs — fest oder eigene Kategorie. Schliessen fragt, wenn eine BOM
 * ungespeicherte Änderungen hat (dieselbe Wache wie beim Wechsel der Ansicht).
 */
export const BomWindow = ({
    open,
    deviceId,
    deviceName,
    area,
    areaLabel,
    onClose,
}: {
    open: boolean;
    deviceId: string;
    deviceName: string;
    area: BomArea;
    areaLabel: string;
    onClose: () => void;
}) => {
    const close = useCallback(() => {
        const { attempt } = useNavGuardStore.getState();
        if (attempt) attempt(onClose);
        else onClose();
    }, [onClose]);

    return (
        <PopupDialog
            open={open}
            onClose={close}
            title={t('productionBom.window.title', { area: areaLabel })}
            subtitle={deviceName || undefined}
            icon={<Boxes size={18} />}
            fullScreen
            z={600}
            // Eine halbe BOM verliert man nicht mit einem Klick daneben oder Escape.
            closeOnBackdrop={false}
            closeOnEscape={false}
            bodyClassName="ofi-bomwin"
            // Die BOM-Fläche ist unter `#root` gestaltet — das Fenster hängt darum dort.
            container={document.getElementById('root')}
        >
            <div className="ofi-bomwin__frame">
                <DeviceBomArea key={`${deviceId}:${area}`} deviceId={deviceId} area={area} areaLabel={areaLabel} tasks={null} />
            </div>
        </PopupDialog>
    );
};
