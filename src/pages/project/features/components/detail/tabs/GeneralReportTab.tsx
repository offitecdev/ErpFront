import { memo, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Clipboard as ClipboardPenLine, FileDownload02 as FileDown } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';

import { displayOperationsDone } from '../../../utils/projectFormatters';

// The general report is the signable aggregate of every field report. It can only
// exist once at least one field report has been recorded — without one there is
// nothing to aggregate, so the tab explains that instead of failing silently.
export const GeneralReportTab = memo(({
    project,
    onGoFieldReports,
}: {
    project: ProjectDto;
    onGoFieldReports: () => void;
}) => {
    const [busy, setBusy] = useState(false);
    const reports = useMemo(
        () => [...(project.reports || [])].sort((a: any, b: any) =>
            dayjs(b.workDate || b.reportDate).valueOf() - dayjs(a.workDate || a.reportDate).valueOf()),
        [project.reports],
    );

    if (!reports.length) {
        return (
            <EmptyState
                icon={<ClipboardPenLine size={28} />}
                title={t('projects.detail.noFieldReportsTitle')}
                description={t('projects.detail.generalReportNeedsField')}
                action={(
                    <Button variant="primary" size="sm" onClick={onGoFieldReports}>
                        {t('projects.detail.goFieldReports')}
                    </Button>
                )}
            />
        );
    }

    const generate = async () => {
        setBusy(true);
        try {
            const { exportProjectGeneralReportPdf } = await import('@/utils/pdf/projectReportPdf');
            await exportProjectGeneralReportPdf(project);
            toast.success(t('auto.genel_saha_raporu_olusturuldu'));
        } catch (e: any) {
            toast.error(e?.message || t('auto.genel_rapor_olusturulamadi'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3">
                <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900">{t('projects.flow.generalReport')}</div>
                    <div className="mt-0.5 text-[12px] text-slate-500">{t('projects.detail.generalReportHint')}</div>
                </div>
                <Button variant="primary" icon={<FileDown size={13} />} loading={busy} onClick={() => void generate()}>
                    {t('auto.genel_rapor_al')}
                </Button>
            </div>

            <Card title={t('projects.detail.generalReportIncludes')} icon={<ClipboardPenLine size={13} />} noPadding>
                <div className="divide-y divide-slate-100">
                    {reports.map((report: any) => (
                        <div key={report.id} className="flex items-start justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <div className="text-[12.5px] font-semibold text-slate-800">
                                    {dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')}
                                    <span className="ml-2 text-[11px] font-normal text-slate-400">
                                        {dayjs(report.startedAt).format('HH:mm')} - {dayjs(report.endedAt).format('HH:mm')}
                                    </span>
                                </div>
                                {report.operationsDone && (
                                    <div className="mt-1 line-clamp-2 text-[12px] text-slate-500">{displayOperationsDone(report.operationsDone)}</div>
                                )}
                            </div>
                            <StatusChip variant={report.isSigned ? 'active' : 'warning'}>
                                {report.isSigned ? t('auto.imzali') : t('auto.imza_bekliyor')}
                            </StatusChip>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
});
