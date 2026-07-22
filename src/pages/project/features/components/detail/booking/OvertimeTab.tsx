import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { InfoCircle, Save01 as Save, Settings01 } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { projectApi } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { CostList } from '../../common/CostList';
import { TotalRow } from '../../common/TotalRow';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { displayOperationsDone, durationFmt, money } from '../../../utils/projectFormatters';

// Overtime beyond the tolerance threshold. The hourly fee is a project setting, so
// it lives behind a gear icon in a small dialog instead of sitting on the page.
export const OvertimeTab = ({ project, order, isPrimary, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; onSaved: () => Promise<void> }) => {
    // Only managers may change the fee; everyone else sees the overtime read-only.
    const { permissions } = useAuthStore();
    const canManage = permissions.includes('projects.manage');
    // The threshold beyond which extra work is billed (backend default 15%).
    const tolerance = Number(project.overtimeTolerancePercent ?? 15);
    const currentRate = Number(project.overtimeHourlyRate) || 0;
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [rate, setRate] = useState<number>(currentRate);
    const [savingRate, setSavingRate] = useState(false);

    // Re-seed the dialog from the project whenever it opens or the value changes.
    useEffect(() => {
        if (settingsOpen) setRate(currentRate);
    }, [settingsOpen, currentRate]);

    // Persist the per-project hourly fee. The backend applies it per minute to any
    // work beyond the tolerance, so it takes effect across this order and every
    // addon order from the next saved field report onward.
    const saveRate = async () => {
        const next = Math.max(0, Number(rate) || 0);
        setSavingRate(true);
        try {
            await projectApi.update(project.id, { overtimeHourlyRate: next });
            toast.success(t('projects.settings.saveSuccess'));
            setSettingsOpen(false);
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.settings.saveError'));
        } finally {
            setSavingRate(false);
        }
    };

    const overtimeReports = useMemo(
        () => scopedRecords(project.reports, order, isPrimary, project.salesOrders).filter((report: any) => Number(report.overtimeCost) > 0),
        [project.reports, project.salesOrders, order, isPrimary],
    );
    const total = useMemo(
        () => overtimeReports.reduce((sum: number, report: any) => sum + (Number(report.overtimeCost) || 0), 0),
        [overtimeReports],
    );
    const rows = useMemo(
        () => overtimeReports.map((report: any) => ({
            id: report.id,
            title: dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY'),
            meta: `${durationFmt(Number(report.overtimeMinutes || 0))} × ${money(report.overtimeHourlyRate)}`,
            amount: Number(report.overtimeCost) || 0,
            note: report.operationsDone ? displayOperationsDone(report.operationsDone) : undefined,
        })),
        [overtimeReports],
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200/70 bg-white px-4 py-3">
                <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-slate-900">{t('projects.settings.overtimeTitle', { tolerance })}</div>
                    <div className="mt-0.5 text-[11.5px] text-slate-500">
                        {t('projects.settings.laborFeeLabel')}: <span className="font-mono font-semibold text-slate-800">{money(currentRate)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('common.total')}</div>
                        <div className="font-mono text-[14px] font-bold text-[#272f67]">{money(total)}</div>
                    </div>
                    {canManage && (
                        <button
                            type="button"
                            aria-label={t('projects.settings.overtimeSettings')}
                            title={t('projects.settings.overtimeSettings')}
                            onClick={() => setSettingsOpen(true)}
                            className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#272f67]"
                        >
                            <Settings01 size={16} />
                        </button>
                    )}
                </div>
            </div>

            <div className="max-w-xl rounded-md border border-slate-200/70 bg-slate-50/50 p-4">
                <div className="space-y-3 text-[13px]">
                    <TotalRow label={t('projects.settings.overtimeShort', { tolerance })} value={total} total />
                </div>
            </div>

            <CostList
                title={t('projects.settings.overtimeShort', { tolerance })}
                empty={t('projects.settings.noOvertime')}
                rows={rows}
            />

            <Modal
                open={settingsOpen}
                width="sm"
                title={t('projects.settings.overtimeSettings')}
                onClose={() => { if (!savingRate) setSettingsOpen(false); }}
                closeOnBackdrop={!savingRate}
                footer={(
                    <>
                        <Button variant="ghost" disabled={savingRate} onClick={() => setSettingsOpen(false)}>{t('common.cancel')}</Button>
                        <Button variant="primary" loading={savingRate} icon={<Save size={13} />} onClick={() => void saveRate()}>{t('common.save')}</Button>
                    </>
                )}
            >
                <div className="space-y-3">
                    <Field label={t('projects.settings.laborFeeLabel')}>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={rate}
                            placeholder="0"
                            onChange={(e) => setRate(Number(e.target.value) || 0)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void saveRate(); }}
                        />
                    </Field>
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                        <InfoCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                        <span>{t('projects.settings.laborFeeHint', { tolerance })}</span>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
