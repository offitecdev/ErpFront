import { StatusChip } from '@/components/ui-shared/StatusBadge';
import type { ProjectStatus } from '@/types/project';

import { getStatusLabel, STATUS_VARIANT } from '../../utils/projectFormatters';

// Shared project-status indicator used by the project list and the detail screen
// so the labels and colors stay identical across both. Every status — COMPLETED
// included — renders as its worded chip: a bare checkmark said "done" without
// saying done *what*, and read as a control rather than a state.
export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => (
    <StatusChip variant={STATUS_VARIANT[status]}>{getStatusLabel()[status]}</StatusChip>
);
