import type { MouseEvent } from 'react';

import { t } from '@/i18n/translate';
import { hrefFor, isModifiedClick } from '@/lib/navLink';
import type { ProductionDeviceRow, ProductionProjectDevices } from '@/types/production';

import { quantity } from '../components/productionUi';

type Props = {
    device: ProductionDeviceRow;
    project: ProductionProjectDevices['project'];
    projectPath: string;
    onOpenProject: () => void;
};

/**
 * Der Kopf der Geräteseite — EINE kleine Zeile (Vorgabe Samet, 24.09.2026:
 * «ürünün ismi üstte … tek satır, küçük boy, baya küçük»): der Name des Geräts,
 * dahinter leise Position, Artikel, Menge und Auftrag, rechts das Projekt, zu
 * dem es gehört — ein Klick darauf führt dorthin. Alles Übrige der Seite
 * gehört der grossen, leeren Fläche darunter.
 */
export const DeviceHeader = ({ device, project, projectPath, onOpenProject }: Props) => {
    const meta = [
        device.positionNumber ? `${t('production.device.position')} ${device.positionNumber}` : '',
        device.articleCode ?? '',
        quantity(device.quantity, device.unit),
    ].filter(Boolean);

    const openProject = (event: MouseEvent<HTMLAnchorElement>) => {
        if (isModifiedClick(event)) return;
        event.preventDefault();
        onOpenProject();
    };

    return (
        <header className="ofi-pdev-head">
            <h1 className="ofi-pdev-head__title" title={device.name}>{device.name}</h1>
            <span className="ofi-pdev-head__meta">
                {meta.map((part) => <span key={part}>{part}</span>)}
                {device.salesOrderNumber && (
                    <span>
                        {device.salesOrderNumber}
                        {device.orderKind === 'ADDON' && <em>{t('production.kind.addon')}</em>}
                    </span>
                )}
            </span>
            <a
                className="ofi-pdev-head__project"
                href={hrefFor(projectPath)}
                onClick={openProject}
                title={t('production.devicePage.openProject')}
            >
                <span className="ofi-pdev-head__projnum">{project.projectNumber}</span>
                <span className="ofi-pdev-head__projname">{project.projectName}</span>
            </a>
        </header>
    );
};
