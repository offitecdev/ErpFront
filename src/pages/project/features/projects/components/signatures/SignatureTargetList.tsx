import dayjs from 'dayjs';
import {
    Clipboard as ClipboardPenLine,
    FileCheck02,
    FileDownload02 as FileDown,
    Send01 as Send,
} from '@/components/icons/antIconCompat';

import { StatusChip } from '@/components/ui-shared/StatusBadge';
import type { DeliveryReportDto, SignatureRequestDto } from '@/lib/api/project';
import type { ProjectDto } from '@/types/project';
import { t } from '@/i18n/translate';

import type { SignatureDispatchTarget } from '../../types/signatureTypes';
import {
    computeSignatureStatus,
    getSignatureStatusLabel,
    getSignatureStatusVariant,
    isGeneralSigned,
    requestFor,
} from '../../utils/signatureRequestUtils';
import {
    buildDeliverySignatureSnapshot,
    buildFieldSignatureSnapshot,
    buildGeneralSignatureSnapshot,
} from '../../utils/signatureSnapshots';

// Each report type gets its own icon + accent so the groups are distinguishable
// at a glance instead of three identical lists.
const GROUP_ACCENT = {
    field: { icon: <ClipboardPenLine size={13} />, chip: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300' },
    delivery: { icon: <FileDown size={13} />, chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' },
    general: { icon: <FileCheck02 size={13} />, chip: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300' },
} as const;

const Group = ({ kind, title, count, empty, children }: { kind: keyof typeof GROUP_ACCENT; title: string; count: number; empty?: string; children?: React.ReactNode }) => (
    <section className="overflow-hidden rounded-xl border border-slate-200">
        <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-md ${GROUP_ACCENT[kind].chip}`}>{GROUP_ACCENT[kind].icon}</span>
            <span className="text-[12.5px] font-semibold text-slate-700">{title}</span>
            <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">{count}</span>
        </header>
        {empty ? (
            <div className="px-3 py-6 text-center text-[12px] text-slate-400">{empty}</div>
        ) : (
            <div className="divide-y divide-slate-100">{children}</div>
        )}
    </section>
);

const Row = ({ primary, secondary, status }: { primary: React.ReactNode; secondary?: React.ReactNode; status: React.ReactNode }) => (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60">
        <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-slate-800">{primary}</div>
            {secondary ? <div className="truncate text-[11.5px] text-slate-500">{secondary}</div> : null}
        </div>
        <div className="shrink-0">{status}</div>
    </div>
);

/**
 * Grouped signature targets on a single page: field, delivery and general
 * reports each get their own list. A report that is signed — or already has a
 * dispatched request — shows a status chip; anything still sendable exposes a
 * row-level "Send for Signature" action.
 */
export const SignatureTargetList = ({
    project,
    salesOrderId,
    fieldReports,
    deliveries,
    requests,
    onSend,
    groups = ['field', 'delivery', 'general'],
}: {
    project: ProjectDto;
    salesOrderId: string | null;
    fieldReports: any[];
    deliveries: DeliveryReportDto[];
    requests: SignatureRequestDto[];
    onSend: (target: SignatureDispatchTarget) => void;
    // Which report-type groups to render; the project signatures tab shows only
    // the delivery reports (field/general dispatch lives in the field-report flow).
    groups?: Array<'field' | 'delivery' | 'general'>;
}) => {
    const statusCell = (signed: boolean, request: SignatureRequestDto | null, ready: boolean, target: () => SignatureDispatchTarget) => {
        const status = computeSignatureStatus({ signed, request, ready });
        if (status === 'ready') {
            return (
                <button
                    type="button"
                    className="ofi-sigbtn"
                    title={t('signatures.sendForSignature')}
                    onClick={() => onSend(target())}
                >
                    <Send size={13} />
                    <span className="ofi-sigbtn__text">{t('signatures.sendForSignature')}</span>
                </button>
            );
        }
        return <StatusChip variant={getSignatureStatusVariant(status)}>{getSignatureStatusLabel(status)}</StatusChip>;
    };

    const generalSigned = isGeneralSigned(requests);
    const generalReady = fieldReports.length > 0;

    return (
        <div className="space-y-4">
            {/* Field Report Signatures */}
            {groups.includes('field') && (
            <Group kind="field" title={t('signatures.groups.field')} count={fieldReports.length} empty={fieldReports.length === 0 ? t('signatures.noneField') : undefined}>
                {fieldReports.map((r: any) => (
                    <Row
                        key={r.id}
                        primary={dayjs(r.workDate || r.reportDate).format('DD.MM.YYYY')}
                        secondary={r.operationsDone || '—'}
                        status={statusCell(Boolean(r.isSigned), requestFor('FIELD', r.id, requests), true, () => ({
                            reportType: 'FIELD',
                            reportId: r.id,
                            title: `${project.projectName} – ${t('signatures.tabs.field')}`,
                            snapshot: buildFieldSignatureSnapshot(project, r),
                            alreadySigned: Boolean(r.isSigned),
                        }))}
                    />
                ))}
            </Group>
            )}

            {/* Delivery Report Signatures */}
            {groups.includes('delivery') && (
            <Group kind="delivery" title={t('signatures.groups.delivery')} count={deliveries.length} empty={deliveries.length === 0 ? t('signatures.noneDelivery') : undefined}>
                {deliveries.map((d) => (
                    <Row
                        key={d.id}
                        primary={d.checklistName || t('projects.delivery.pdf.title')}
                        secondary={dayjs(d.sentAt || d.createdAt).format('DD.MM.YYYY HH:mm')}
                        status={statusCell(Boolean(d.isSigned), requestFor('DELIVERY', d.id, requests), true, () => ({
                            reportType: 'DELIVERY',
                            reportId: d.id,
                            title: `${project.projectName} – ${d.checklistName || t('projects.delivery.pdf.title')}`,
                            snapshot: buildDeliverySignatureSnapshot(project, d),
                            alreadySigned: Boolean(d.isSigned),
                        }))}
                    />
                ))}
            </Group>
            )}

            {/* General Report Signature */}
            {groups.includes('general') && (
            <Group kind="general" title={t('signatures.groups.general')} count={1}>
                <Row
                    primary={t('projects.general.previewTitle')}
                    secondary={generalReady ? t('signatures.general.allFieldReports', { count: fieldReports.length }) : t('signatures.generalNotReady')}
                    status={statusCell(generalSigned, requestFor('GENERAL', null, requests), generalReady, () => ({
                        reportType: 'GENERAL',
                        reportId: null,
                        title: `${project.projectName} – ${t('projects.general.previewTitle')}`,
                        snapshot: buildGeneralSignatureSnapshot(project, salesOrderId, fieldReports),
                        alreadySigned: generalSigned,
                    }))}
                />
            </Group>
            )}
        </div>
    );
};

export default SignatureTargetList;
