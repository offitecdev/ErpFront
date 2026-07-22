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

        {/* View menu. A segmented track rather than an underline: on its own
            recessed surface with a raised pill for the active view, so the menu
            reads as a distinct layer instead of dissolving into the panel behind
            it — the underline version was invisible in dark mode, where every
            neighbouring surface collapses to the same tone. */}
        {/* Plain buttons + aria-current, not role="tablist"/"tab": the full tab
            pattern also owes screen readers tabpanel linkage and arrow-key
            navigation, and a half-implemented one reads worse than none. */}
        <div className="ofi-rep-tabs flex items-center gap-1 overflow-x-auto rounded-xl p-1">
            {views.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    aria-current={view === tab.key ? 'page' : undefined}
                    onClick={() => setView(tab.key)}
                    className={`ofi-rep-tab shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-all duration-200 ${
                        view === tab.key ? 'is-active' : ''
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    </>
));
