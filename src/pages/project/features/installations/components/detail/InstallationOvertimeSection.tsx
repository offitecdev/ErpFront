import { memo } from 'react';

import { t } from '@/i18n/translate';

import { OvertimeCard } from '../common/OvertimeCard';

// "Overtime" view: one read-only card per field report/day that recorded overtime.
export const InstallationOvertimeSection = memo(({ overtimeReports }: { overtimeReports: any[] }) => (
    overtimeReports.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-[12.5px] text-slate-500">{t('projects.mesai_yok')}</div>
    ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {overtimeReports.map((report: any) => <OvertimeCard key={report.id} report={report} />)}
        </div>
    )
));
