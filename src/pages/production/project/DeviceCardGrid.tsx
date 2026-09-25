import type { MouseEvent } from 'react';

import { Box, ChevronRight, Wrench } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { hrefFor, isModifiedClick } from '@/lib/navLink';
import type { ProductionDeviceRow } from '@/types/production';

import { quantity } from '../components/productionUi';

type Props = {
    projectId: string;
    rows: ProductionDeviceRow[];
    onOpen: (path: string) => void;
};

/** Die Adresse der Geräteseite (Route in appPageRoutes, Rahmen in MainLayout). */
const devicePath = (projectId: string, deviceId: string): string =>
    `/production/orders/${projectId}/devices/${deviceId}`;

/**
 * ── DIE GERÄTEKARTEN (24.09.2026, Vorgabe Samet) ────────────────────────────
 *
 * «Cihaz isimleri kartlar şeklinde olacak … her cihaz kartına basınca yeni
 *  sayfa yüklenecek, aynı pencerede.»
 *
 * Je Gerät oder Leistung EINE Karte, der NAME ist ihr Titel. Darüber Art und
 * Position, darunter Artikel und Menge. Die Karte ist ein echter Verweis:
 * Klick öffnet die Geräteseite im selben Fenster, Mittelklick in einem neuen
 * Reiter — und das Zeigen darauf lädt die Seite schon vor (lib/routeIntent).
 */
export const DeviceCardGrid = ({ projectId, rows, onOpen }: Props) => {
    if (!rows.length) {
        return <div className="ofi-pprj-empty">{t('production.cards.empty')}</div>;
    }

    const open = (event: MouseEvent<HTMLAnchorElement>, deviceId: string) => {
        if (isModifiedClick(event)) return;
        event.preventDefault();
        onOpen(devicePath(projectId, deviceId));
    };

    return (
        <div className="ofi-pprj-cards">
            {rows.map((row) => (
                <a
                    key={row.id}
                    className="ofi-pprj-card"
                    data-kind={row.kind}
                    href={hrefFor(devicePath(projectId, row.id))}
                    onClick={(event) => open(event, row.id)}
                    aria-label={`${t('production.cards.open')}: ${row.name}`}
                >
                    <span className="ofi-pprj-card__top">
                        <span className="ofi-pprj-card__icon" aria-hidden="true">
                            {row.kind === 'SERVICE' ? <Wrench /> : <Box />}
                        </span>
                        <span className="ofi-pprj-card__kind">
                            {row.kind === 'SERVICE' ? t('production.kind.service') : t('production.kind.device')}
                            {row.positionNumber && <> · {t('production.device.position')} {row.positionNumber}</>}
                        </span>
                        {row.orderKind === 'ADDON' && <em className="ofi-pprj-card__addon">{t('production.kind.addon')}</em>}
                        <ChevronRight className="ofi-pprj-card__chev" aria-hidden="true" />
                    </span>
                    <span className="ofi-pprj-card__name" title={row.name}>{row.name}</span>
                    {row.description && <span className="ofi-pprj-card__desc">{row.description}</span>}
                    <span className="ofi-pprj-card__foot">
                        <span className="ofi-pprj-card__code">{row.articleCode || '—'}</span>
                        <span className="ofi-pprj-card__qty">{quantity(row.quantity, row.unit)}</span>
                    </span>
                </a>
            ))}
        </div>
    );
};
