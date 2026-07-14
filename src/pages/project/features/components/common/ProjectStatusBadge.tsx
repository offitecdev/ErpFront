import { CheckCircle } from '@/components/icons/antIconCompat';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import type { ProjectStatus } from '@/types/project';

import { getStatusLabel, STATUS_VARIANT } from '../../utils/projectFormatters';

// Shared project-status indicator used by the project list and the detail screen
// so the labels and colors stay identical across both. A COMPLETED project renders
// as a green checkmark instead of the word; every other status keeps its colored chip
// (ACTIVE is brand blue, distinct from the green completed state).
export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => {
    if (status === 'COMPLETED') {
        const label = getStatusLabel().COMPLETED;
        return (
            <span className="inline-flex items-center text-[#059669]" title={label} aria-label={label}>
                <CheckCircle size={18} strokeWidth={2.5} />
            </span>
        );
    }
    return <StatusChip variant={STATUS_VARIANT[status]}>{getStatusLabel()[status]}</StatusChip>;
};
