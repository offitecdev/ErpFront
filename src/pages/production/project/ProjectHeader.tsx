import { t } from '@/i18n/translate';
import type { ProductionProjectDevices } from '@/types/production';

type Props = {
    project: ProductionProjectDevices['project'] | null;
};

type Project = ProductionProjectDevices['project'];

/**
 * Ein besonderer Stand des Projekts als leise Marke im Kopf. Der gewöhnliche
 * (aktiv, beauftragt) bleibt stumm — seit die Projekttabelle kürzer ist
 * (Samet: «çok detay var, biraz azaltabiliriz»), hat der Stand dort keine
 * eigene Zelle mehr. Nie das rohe Kennwort des Servers zeigen.
 */
const statusFlag = (project: Project): { text: string; bad: boolean } | null => {
    const status = String(project.sourceStatus || '').toUpperCase();
    if (!project.isActive || status === 'CANCELLED') return { text: t('production.status.cancelled'), bad: true };
    if (project.sourceKind === 'DELIVERY') return null;
    const labels: Record<string, string> = {
        AWAITING_APPROVAL: t('projects.statusPending'),
        ON_HOLD: t('projects.statusOnHold'),
        COMPLETED: t('common.completed'),
        SPECIALLY_CLOSED: t('projects.specialClosure.status'),
    };
    return labels[status] ? { text: labels[status], bad: false } : null;
};

/**
 * Der Kopf eines Produktionsprojekts — EINE Zeile wie die Titelleiste eines
 * macOS-Fensters: die Nummer als leise Marke, der Name als Titel, dahinter
 * ein besonderer Stand. Kunde, Firma und das Übrige stehen in der
 * Projekttabelle darunter.
 */
export const ProjectHeader = ({ project }: Props) => {
    const flag = project ? statusFlag(project) : null;
    return (
        <header className="ofi-pprj-head">
            {project && <span className="ofi-pprj-head__number">{project.projectNumber}</span>}
            <h1 className="ofi-pprj-head__title" title={project?.projectName}>
                {project ? project.projectName : t('production.project.title')}
            </h1>
            {flag && <em className={`ofi-pprj-head__flag${flag.bad ? '' : ' is-quiet'}`}>{flag.text}</em>}
        </header>
    );
};
