import type { ProjectStatus } from '@/types/project';

import { getStatusLabel, STATUS_VARIANT } from '../../utils/projectFormatters';

// Shared project-status indicator used by the project list and the detail screen
// so the labels and colors stay identical across both. Every status — COMPLETED
// included — renders as its worded chip: a bare checkmark said "done" without
// saying done *what*, and read as a control rather than a state.
const CHIP_CLASS: Record<string, string> = {
    active: 'bg-[#059669] text-white border-transparent',
    approved: 'bg-[#272f67] text-white border-transparent',
    passive: 'bg-[#64748b] text-white border-transparent',
    info: 'bg-[#3b82f6] text-white border-transparent',
    warning: 'bg-[#f59e0b] text-white border-transparent',
    danger: 'bg-[#dc2626] text-white border-transparent',
    neutral: 'bg-[#64748b] text-white border-transparent',
    order: 'bg-[#059669] text-white border-transparent',
};

// Kept native on the initial project route: importing the shared StatusBadge
// also imports Ant Design Tag even though this screen only needs a plain chip.
export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => {
    const variant = STATUS_VARIANT[status];
    return (
        <span className={`inline-flex size-max items-center whitespace-nowrap rounded-[13px] border px-2.5 py-0.5 text-[11px] font-semibold ${CHIP_CLASS[variant]}`}>
            {getStatusLabel()[status]}
        </span>
    );
};
