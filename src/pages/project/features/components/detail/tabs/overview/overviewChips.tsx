import type { ProjectStatus } from '@/types/project';

import { getStatusLabel, STATUS_VARIANT } from '../../../../utils/projectFormatters';
import { deliveryStateLabel, technicalStateLabel } from './overviewShared';
import type { DeliveryState, TechnicalState } from './overviewShared';

export type ChipTone = 'active' | 'approved' | 'passive' | 'info' | 'warning' | 'danger';

// Hand-rolled chips — no antd on this screen. Google-clean since 19.08.2026:
// a soft tint with the matching dark ink instead of a solid colour block, so a
// row of chips no longer shouts over the figures beside it. The meaning of each
// colour is unchanged — green still means done, red still means closed.
const TONE_CLASS: Record<ChipTone, string> = {
    active: 'is-green',
    approved: 'is-blue',
    passive: 'is-grey',
    info: 'is-blue',
    warning: 'is-amber',
    danger: 'is-red',
};

export const Chip = ({ tone, children }: { tone: ChipTone; children: React.ReactNode }) => (
    <span className={`ofi-prj-state ${TONE_CLASS[tone]}`}>{children}</span>
);

export const ProjectStatusChip = ({ status }: { status: ProjectStatus }) => (
    <Chip tone={STATUS_VARIANT[status]}>{getStatusLabel()[status]}</Chip>
);

export const DeliveryChip = ({ state }: { state: DeliveryState }) => (
    <Chip tone={state === 'delivered' ? 'active' : state === 'unsigned' ? 'warning' : 'passive'}>
        {deliveryStateLabel(state)}
    </Chip>
);

export const TechnicalChip = ({ state }: { state: TechnicalState }) => (
    <Chip tone={state === 'completed' ? 'active' : state === 'ongoing' ? 'warning' : 'passive'}>
        {technicalStateLabel(state)}
    </Chip>
);
