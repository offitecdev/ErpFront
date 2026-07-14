import { memo } from 'react';

import { Save01 as Save } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { t } from '@/i18n/translate';

import type { InstallationAppointment, InstallationView } from '../../hooks/useInstallationDetail';
import { appointmentTechnicianNames, eventEnd, eventStart } from '../../utils/installationAppointments';
import { installationState } from '../../utils/installationStatus';
import { InstallationTaskHeader } from '../InstallationTaskHeader';
import { InstallationProcessSteps, type ProcessStep } from '../InstallationProcessSteps';

// Top of the detail card: the "today's job" header, the process-step tracker and the
// view tab bar. Purely presentational — view switching is delegated to setView.
export const InstallationDetailHeaderBlock = memo(({
    selected,
    selectedReport,
    finished,
    canFinish,
    saving,
    onSubmit,
    steps,
    views,
    view,
    setView,
}: {
    selected: InstallationAppointment;
    selectedReport: any;
    finished: boolean;
    canFinish: boolean;
    saving: boolean;
    onSubmit: (signatureBase64?: string) => void;
    steps: ProcessStep[];
    views: Array<{ key: InstallationView; label: string }>;
    view: InstallationView;
    setView: (view: InstallationView) => void;
}) => (
    <>
        <InstallationTaskHeader
            orderNumber={selected.salesOrder?.orderNumber}
            title={selected.project?.customer?.companyName || selected.project?.projectName || '-'}
            dateTimeText={`${eventStart(selected).format('DD.MM.YYYY HH:mm')} - ${eventEnd(selected).format('HH:mm')}`}
            technicianText={appointmentTechnicianNames(selected)}
            status={installationState(selected, selectedReport)}
            action={!finished ? (
                <Button variant="danger" icon={<Save size={13} />} loading={saving} disabled={!canFinish || saving} onClick={() => onSubmit()}>{t('projects.finish_and_send')}</Button>
            ) : undefined}
        />

        <InstallationProcessSteps steps={steps} />

        <div className="flex items-end justify-between gap-3 border-b border-slate-200">
            <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto px-1">
                {views.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setView(tab.key)}
                        className={`relative whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
                            view === tab.key
                                ?'text-brand-700 after:absolute after:inset-x-0 after:-bottom-px after:border-b-2 after:border-brand-600'
                                :'text-slate-600 hover:text-slate-950'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    </>
));
