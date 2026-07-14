import { memo } from 'react';

import { Clock } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { cleanLabel, dateFmt, durationFmt } from '../../utils/installationFormatters';
import { money } from '../../utils/installationMoney';
import { reportDateValue, reportOvertimeMinutes, reportPlannedMinutes, reportWorkedMinutes } from '../../utils/installationScope';
import { OvertimeStat } from './OvertimeStat';

// Read-only overtime card for one field report/day.
export const OvertimeCard = memo(({ report }: { report: any }) => {
    const overtime = reportOvertimeMinutes(report);
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-900"><Clock size={12} />{dateFmt(reportDateValue(report))}</div>
                {overtime > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">+{durationFmt(overtime)}</span>}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
                <OvertimeStat label={cleanLabel(t('projects.planlanan'))} value={durationFmt(reportPlannedMinutes(report))} />
                <OvertimeStat label={t('projects.mesai_calisilan')} value={durationFmt(reportWorkedMinutes(report))} />
                <OvertimeStat label={cleanLabel(t('projects.fazla_calisma'))} value={durationFmt(overtime)} tone={overtime > 0 ? 'amber' : undefined} />
                <OvertimeStat label={t('projects.mesai_ucret')} value={money(report?.overtimeCost)} />
            </div>
        </div>
    );
});
