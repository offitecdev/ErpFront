import type { InstallationAppointment } from '../hooks/useInstallationDetail';
import { matchesOrderScope } from './installationScope';

export const scopedInstallationRecords = <T extends { salesOrderId?: string | null }>(records: T[] | undefined, appointment: InstallationAppointment) => {
    return (records || []).filter((record) => matchesOrderScope(record, appointment));
};

export const sumInstallationCosts = (appointment: InstallationAppointment) => {
    const expenses = scopedInstallationRecords(appointment.project?.expenses, appointment);
    const materials = scopedInstallationRecords(appointment.project?.extraMaterials, appointment);
    const reports = scopedInstallationRecords(appointment.project?.reports, appointment);
    const expenseTotal = expenses.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const materialTotal = materials.reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const overtimeTotal = reports.reduce((sum: number, item: any) => sum + Number(item.overtimeCost || 0), 0);
    return { expenses, materials, reports, expenseTotal, materialTotal, overtimeTotal, total: expenseTotal + materialTotal + overtimeTotal };
};
