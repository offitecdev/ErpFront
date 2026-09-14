import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import type { WorkReport } from '@/types/tasksModule';
import type { WorkPeriod } from './workReportModel';
import type { SupportedLanguage } from '@/i18n/loadResources';

/**
 * «PDF»: baut aus GENAU den Daten, die auf dem Bildschirm stehen. Das
 * PDF-Modul (jsPDF + Arial) wird erst beim Klick geladen — eigener Chunk.
 */
export const useReportPdf = () => {
    const [busy, setBusy] = useState(false);

    const create = useCallback(async (
        report: WorkReport,
        options: { period: WorkPeriod; language: SupportedLanguage },
    ) => {
        setBusy(true);
        try {
            const { exportTasksReportPdf } = await import('@/utils/pdf/tasksReportPdf');
            await exportTasksReportPdf(report, options);
        } catch (error) {
            console.error('Tasks report PDF failed:', error);
            toast.error(t('tasksModule.reports.work.pdfFailed'));
        } finally {
            setBusy(false);
        }
    }, []);

    return { busy, create };
};
