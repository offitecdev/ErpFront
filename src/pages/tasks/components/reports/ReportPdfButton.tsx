import { LuFileDown } from 'react-icons/lu';

import { Spinner } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { TaskButton } from '../shared/TaskButton';

/** Die EINE blaue Handlung der Rapportseite. */
export const ReportPdfButton = ({
    busy,
    disabled,
    onClick,
}: {
    busy: boolean;
    disabled: boolean;
    onClick: () => void;
}) => (
    <TaskButton
        variant="primary"
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        onClick={onClick}
        icon={busy ? <Spinner size="xs" /> : <LuFileDown size={14} aria-hidden />}
    >
        {busy ? t('tasksModule.reports.work.pdfCreating') : t('tasksModule.reports.work.pdf')}
    </TaskButton>
);
