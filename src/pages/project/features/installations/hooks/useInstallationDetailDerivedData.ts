import { useMemo } from 'react';

import type { InstallationAppointment } from './useInstallationDetail';
import { orderAppointments } from '../utils/installationAppointments';
import { sumInstallationCosts } from '../utils/installationCosts';
import { getInstallationUsedMaterials } from '../utils/installationMaterials';
import { reportDateValue } from '../utils/installationScope';

// Derived, render-only data for the installation detail card: cost aggregates, used
// materials, completion flags and the sibling-appointment list for the general report.
export const useInstallationDetailDerivedData = ({
    selected,
    appointments,
    canFinish,
    saving,
    generalDetailId,
}: {
    selected: InstallationAppointment;
    appointments: InstallationAppointment[];
    canFinish: boolean;
    saving: boolean;
    generalDetailId: string | null;
}) => {
    const costs = useMemo(() => sumInstallationCosts(selected), [selected]);
    const usedMaterials = useMemo(() => getInstallationUsedMaterials(selected), [selected]);
    // The montaj is finished only when the appointment is actually COMPLETED — not when
    // a report merely exists. A manager can attach/edit a report while the job stays
    // open, so the technician keeps working and can finish it themselves.
    const finished = selected.status === 'COMPLETED';
    const disabled = finished || !canFinish || saving;
    const relatedAppointments = useMemo(() => orderAppointments(selected, appointments), [selected, appointments]);
    const overtimeReports = useMemo(
        () => [...costs.reports].sort((a: any, b: any) => String(reportDateValue(a) || '').localeCompare(String(reportDateValue(b) || ''))),
        [costs],
    );
    const generalDetail = useMemo(
        () => relatedAppointments.find((row) => row.id === generalDetailId) || relatedAppointments[0] || null,
        [relatedAppointments, generalDetailId],
    );

    return { costs, usedMaterials, finished, disabled, relatedAppointments, overtimeReports, generalDetail };
};
