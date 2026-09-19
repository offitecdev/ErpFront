import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { t } from '@/i18n/translate';
import { getReportTranslator, type ReportTranslator } from '@/i18n/reportLanguage';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import '@/styles/modules/tasksReports.css';
import { ReportBody } from './components/reports/ReportBody';
import { ReportPdfButton } from './components/reports/ReportPdfButton';
import { readReportQuery, writeReportQuery, type ReportQuery } from './components/reports/reportQuery';
import { ReportToolbar } from './components/reports/ReportToolbar';
import { useReportData } from './components/reports/useReportData';
import { useReportPdf } from './components/reports/useReportPdf';
import { buildWorkReportDocument } from './components/reports/workReportModel';
import { TasksModuleShell } from './components/shared/TasksModuleShell';
import { useIsTasksManager, useTasksModuleStore } from './store/tasksModuleStore';
import { TasksAdminOnly } from './components/shared/TasksAdminOnly';

/**
 * ── GÖREVLER · RAPORLAR (16.09.2026, Vorgabe Samet) ──────────────────────────
 *
 * «Rapor tek kişi için — günlük veya haftalık, GÜN GÜN: o gün sonunda neler
 * yaptığını yazdıysa o.» Person (Leitung) → Täglich/Wöchentlich → Tag → PDF.
 * Die Vorschau zeigt dasselbe Dokument wie das PDF, in der gewählten
 * Rapportsprache. Die Wahl steht in der Adresse
 * (`?period=week&date=…&person=…&lang=…`).
 */
const TaskReportsPageContent = () => {
    useLanguageTick();
    const ready = useTasksModuleStore((state) => Boolean(state.bootstrap));
    const isManager = useIsTasksManager();
    const [params, setParams] = useSearchParams();
    const query = readReportQuery(params, isManager);
    const company = usePdfSettings().companyName;
    const directory = useTasksModuleStore((state) => state.directory);
    const loadDirectory = useTasksModuleStore((state) => state.loadDirectory);
    const actorId = useTasksModuleStore((state) => state.bootstrap?.actor.employeeId ?? '');
    const firstPersonId = directory === null ? '' : directory[0]?.id ?? actorId;
    const effectiveQuery = isManager && !query.person && firstPersonId
        ? { ...query, person: firstPersonId }
        : query;

    useEffect(() => {
        if (isManager) void loadDirectory();
    }, [isManager, loadDirectory]);

    useEffect(() => {
        if (!isManager || query.person || !firstPersonId) return;
        setParams(writeReportQuery({ ...query, person: firstPersonId }), { replace: true });
    }, [firstPersonId, isManager, query, setParams]);

    const data = useReportData(effectiveQuery, ready && (!isManager || Boolean(firstPersonId)));
    const pdf = useReportPdf();

    const [translator, setTranslator] = useState<ReportTranslator | null>(null);
    useEffect(() => {
        let active = true;
        void getReportTranslator(effectiveQuery.language).then((next) => { if (active) setTranslator(next); });
        return () => { active = false; };
    }, [effectiveQuery.language]);

    const doc = useMemo(
        () => (data.report && translator
            ? buildWorkReportDocument(data.report, { period: data.period, t: translator.t, locale: translator.locale, company })
            : null),
        [data.report, data.period, translator, company],
    );

    const apply = (next: ReportQuery) => setParams(writeReportQuery(next), { replace: true });

    return (
        <TasksModuleShell
            title={t('tasksModule.nav.reports')}
            actions={(
                <ReportPdfButton
                    busy={pdf.busy}
                    disabled={!data.report || data.stale}
                    onClick={() => {
                        if (data.report && !data.stale) void pdf.create(data.report, { period: data.period, language: effectiveQuery.language });
                    }}
                />
            )}
            toolbar={ready ? <ReportToolbar query={effectiveQuery} isManager={isManager} onChange={apply} /> : undefined}
        >
            <ReportBody data={data} doc={doc} />
        </TasksModuleShell>
    );
};

/** Nur die Administratorrolle (siehe TasksAdminOnly). */
export const TaskReportsPage = () => (
    <TasksAdminOnly>
        <TaskReportsPageContent />
    </TasksAdminOnly>
);
