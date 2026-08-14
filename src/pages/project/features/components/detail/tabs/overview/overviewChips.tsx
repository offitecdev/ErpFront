import { t } from '@/i18n/translate';
import type { ProjectStatus } from '@/types/project';

import { getStatusLabel, STATUS_VARIANT } from '../../../../utils/projectFormatters';
import type { DeliveryState, TechnicalState } from './overviewShared';

export type ChipTone = 'active' | 'approved' | 'passive' | 'info' | 'warning' | 'danger';

// Hand-rolled chips — no antd on this screen. The colours are the same ones the
// rest of the app uses for these states, so a green chip here means exactly what
// a green chip means on the project list.
const TONE_CLASS: Record<ChipTone, string> = {
    active: 'bg-[#059669] text-white',
    approved: 'bg-[#272f67] text-white',
    passive: 'bg-[#64748b] text-white',
    info: 'bg-[#3b82f6] text-white',
    warning: 'bg-[#f59e0b] text-white',
    danger: 'bg-[#dc2626] text-white',
};

export const Chip = ({ tone, children }: { tone: ChipTone; children: React.ReactNode }) => (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONE_CLASS[tone]}`}>
        {children}
    </span>
);

export const ProjectStatusChip = ({ status }: { status: ProjectStatus }) => (
    <Chip tone={STATUS_VARIANT[status]}>{getStatusLabel()[status]}</Chip>
);

export const DeliveryChip = ({ state }: { state: DeliveryState }) => (
    <Chip tone={state === 'delivered' ? 'active' : state === 'unsigned' ? 'warning' : 'passive'}>
        {state === 'delivered'
            ? t('projects.detail.overview.delivered')
            : state === 'unsigned'
                ? t('projects.delivery.statusUnsigned')
                : t('projects.detail.overview.notDelivered')}
    </Chip>
);

export const TechnicalChip = ({ state }: { state: TechnicalState }) => (
    <Chip tone={state === 'completed' ? 'active' : state === 'ongoing' ? 'warning' : 'passive'}>
        {state === 'completed'
            ? t('projects.flow.stateCompleted')
            : state === 'ongoing'
                ? t('projects.flow.stateOngoing')
                : t('projects.detail.incomplete')}
    </Chip>
);
