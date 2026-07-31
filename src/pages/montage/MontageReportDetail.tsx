import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CheckCircle, File05, Package, Receipt, Wrench, X } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { SignatureSheet } from '@/components/ui-shared/SignatureSheet';
import { SnapshotView } from '@/components/ui-shared/SnapshotView';
import { t } from '@/i18n/translate';
import {
    deliveryReportApi,
    projectApi,
    signatureApi,
    type DeliveryReportDto,
    type SignatureRequestDetailDto,
    type SignatureSnapshot,
} from '@/lib/api/project';
import type { MontageReportResourcesDto } from '@/types/project';
import { buildFieldSnapshot } from '@/pages/project/features/installations/utils/installationSnapshots';
import { buildDeliverySnapshot } from '@/pages/project/features/projects/utils/deliveryReportSnapshots';

import { BigButton } from './components/BigButton';
import { MontageHeader } from './components/MontageHeader';
import { dateFmt } from './utils/montageFormat';

type ReportKind = 'field' | 'delivery' | 'general';
type ReportPayload = Record<string, any> | DeliveryReportDto | SignatureRequestDetailDto;
type FieldTab = 'work' | 'expenses' | 'materials';

const isReportKind = (value: string | undefined): value is ReportKind =>
    value === 'field' || value === 'delivery' || value === 'general';

const reportSnapshot = (kind: ReportKind, report: ReportPayload): SignatureSnapshot => {
    if (kind === 'general') return (report as SignatureRequestDetailDto).snapshot;
    if (kind === 'delivery') {
        const delivery = report as DeliveryReportDto;
        const snapshot = buildDeliverySnapshot(delivery, []);
        return {
            ...snapshot,
            customerName: delivery.customerName || undefined,
            projectName: delivery.projectName || undefined,
            meta: delivery.orderNumber
                ? [{ label: t('projects.delivery.pdf.commission'), value: delivery.orderNumber }]
                : undefined,
        };
    }
    const field = report as Record<string, any>;
    const appointment = field.appointment || {};
    return buildFieldSnapshot({
        project: field.project,
        salesOrder: field.salesOrder,
        assignedTechnician: field.employee,
        startTime: appointment.startTime || field.workDate || field.reportDate,
        endTime: appointment.endTime || field.endedAt || field.workDate || field.reportDate,
    }, field);
};

const withFieldResources = (
    snapshot: SignatureSnapshot,
    resources: MontageReportResourcesDto,
): SignatureSnapshot => {
    const materials = [
        ...resources.usedMaterials.map((item) => ({
            label: item.article?.name || item.material?.name || '-',
            value: `${item.quantity} ${item.article?.unit || ''}`.trim(),
        })),
        ...resources.extraMaterials.map((item) => ({
            label: item.material?.name || item.description || '-',
            value: String(item.quantity),
        })),
    ];
    return {
        ...snapshot,
        sections: [
            ...(snapshot.sections || []),
            {
                heading: 'Giderler',
                rows: resources.expenses.length
                    ? resources.expenses.map((item) => ({ label: item.expenseType, value: `${item.amount.toFixed(2)}${item.description ? ` · ${item.description}` : ''}` }))
                    : [{ label: '-' }],
            },
            {
                heading: 'Malzemeler',
                rows: materials.length ? materials : [{ label: '-' }],
            },
        ],
    };
};

/** Lazy, read-only report result with summary and signature side by side. */
export const MontageReportDetail = () => {
    const { kind: rawKind, reportId } = useParams();
    const [searchParams] = useSearchParams();
    const kind = isReportKind(rawKind) ? rawKind : null;
    const [report, setReport] = useState<ReportPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [signOpen, setSignOpen] = useState(false);
    const [pdfOpen, setPdfOpen] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [signing, setSigning] = useState(false);
    const [fieldTab, setFieldTab] = useState<FieldTab>('work');
    const [resources, setResources] = useState<MontageReportResourcesDto | null>(null);
    const [resourcesLoading, setResourcesLoading] = useState(false);

    useEffect(() => {
        setFieldTab('work');
        setResources(null);
        setPdfOpen(false);
        setPdfUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
        });
        if (!kind || !reportId) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        const request = kind === 'field'
            ? projectApi.getMyMontageReport(reportId)
            : kind === 'delivery'
                ? deliveryReportApi.getOne(reportId)
                : signatureApi.getOne(reportId);
        request
            .then((data) => {
                if (!cancelled) setReport(data);
            })
            .catch((error: any) => {
                if (!cancelled) {
                    toast.error(error.response?.data?.error || t('montage.reports.emptyHint'));
                    setReport(null);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [kind, reportId]);

    useEffect(() => () => {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    }, [pdfUrl]);

    const snapshot = useMemo(
        () => (kind && report ? reportSnapshot(kind, report) : null),
        [kind, report],
    );
    const isSigned = Boolean(
        kind === 'general'
            ? (report as SignatureRequestDetailDto | null)?.status === 'SIGNED'
            : (report as any)?.isSigned,
    );
    const signature = kind === 'general'
        ? (report as SignatureRequestDetailDto | null)?.signatureBase64
        : (report as any)?.customerSignature;
    const signedAt = (report as any)?.signedAt as string | null | undefined;

    const saveSignature = async (value: string | null) => {
        if (!value || !kind || !reportId) return;
        setSigning(true);
        try {
            const updated = kind === 'field'
                ? await projectApi.signReport(reportId, value)
                : kind === 'delivery'
                    ? await deliveryReportApi.sign(reportId, value)
                    : await signatureApi.sign(reportId, value);
            setReport((current) => ({
                ...(current || {}),
                ...updated,
                isSigned: true,
                status: 'SIGNED',
                customerSignature: value,
                signatureBase64: value,
            }));
            setPdfUrl((current) => {
                if (current) URL.revokeObjectURL(current);
                return null;
            });
            setSignOpen(false);
            toast.success(t('signatures.signed'), { position: 'top-center' });
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('signatures.signError'));
        } finally {
            setSigning(false);
        }
    };

    const openFieldTab = useCallback(async (tab: FieldTab) => {
        setFieldTab(tab);
        if (tab === 'work' || kind !== 'field' || !reportId || resources || resourcesLoading) return;
        setResourcesLoading(true);
        try {
            setResources(await projectApi.getMyMontageReportResources(reportId));
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('montage.reports.emptyHint'));
        } finally {
            setResourcesLoading(false);
        }
    }, [kind, reportId, resources, resourcesLoading]);

    const openPdf = useCallback(async () => {
        if (!snapshot) return;
        setPdfOpen(true);
        if (pdfUrl || pdfLoading) return;
        setPdfLoading(true);
        try {
            let pdfSnapshot = snapshot;
            if (kind === 'field' && reportId) {
                const loadedResources = resources || await projectApi.getMyMontageReportResources(reportId);
                if (!resources) setResources(loadedResources);
                pdfSnapshot = withFieldResources(snapshot, loadedResources);
            }
            const { createSnapshotPdfBlob } = await import('@/utils/pdf/snapshotPdf');
            const blob = await createSnapshotPdfBlob(pdfSnapshot, signature);
            setPdfUrl(URL.createObjectURL(blob));
        } catch {
            setPdfOpen(false);
            toast.error(t('projects.pdf_olusturulamadi'));
        } finally {
            setPdfLoading(false);
        }
    }, [kind, pdfLoading, pdfUrl, reportId, resources, signature, snapshot]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center rounded-[3px] border border-slate-200 bg-white dark:border-white/10 dark:bg-[#17191c]">
                <span aria-hidden className="size-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#d30f15] dark:border-t-amber-500" />
            </div>
        );
    }

    if (!kind || !reportId || !report || !snapshot) {
        return (
            <div className="space-y-4">
                <MontageHeader title={t('projects.saha_raporu_yok')} backTo="/montage/reports" />
                <EmptyState title={t('projects.saha_raporu_yok')} description={t('montage.reports.emptyHint')} />
            </div>
        );
    }

    const title = kind === 'field'
        ? t('signatures.tabs.field')
        : kind === 'delivery'
            ? t('signatures.tabs.delivery')
            : t('signatures.tabs.general');
    const createdAt = (report as any).workDate || (report as any).reportDate || (report as any).createdAt;

    return (
        <div className="space-y-4">
            <MontageHeader
                title={title}
                subtitle={[dateFmt(createdAt), snapshot.customerName, snapshot.projectName].filter(Boolean).join(' · ')}
                backTo={searchParams.get('from') === 'completed' ? '/montage/orders/completed' : '/montage/reports'}
                actions={(
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                        isSigned ? 'bg-emerald-600 text-white' : 'bg-rose-50 text-[#d30f15] dark:bg-amber-500 dark:text-white'
                    }`}>
                        {isSigned && <CheckCircle size={13} />}
                        {isSigned ? t('projects.delivery.statusSigned') : t('projects.delivery.statusUnsigned')}
                    </span>
                )}
            />

            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
                <section className="rounded-[3px] border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#17191c]">
                    {kind === 'field' ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2 dark:border-white/10">
                                {([
                                    ['work', <Wrench size={14} />, 'Yapılan işler'],
                                    ['expenses', <Receipt size={14} />, 'Giderler'],
                                    ['materials', <Package size={14} />, 'Malzemeler'],
                                ] as const).map(([tab, icon, label]) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => void openFieldTab(tab)}
                                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-[3px] px-3 text-[12.5px] font-semibold transition-colors ${
                                            fieldTab === tab
                                                ? 'bg-[#1f2654] text-white dark:bg-amber-500'
                                                : 'border border-slate-200 bg-white text-slate-600 hover:border-[#1f2654] dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:border-amber-500'
                                        }`}
                                    >
                                        {icon}{label}
                                    </button>
                                ))}
                            </div>

                            {fieldTab === 'work' && <SnapshotView snapshot={snapshot} />}
                            {fieldTab !== 'work' && resourcesLoading && (
                                <div className="flex h-32 items-center justify-center gap-2 text-[12.5px] text-slate-500">
                                    <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-t-amber-500" />
                                    {t('common.loading')}
                                </div>
                            )}
                            {fieldTab === 'expenses' && !resourcesLoading && (
                                <div className="overflow-hidden rounded-[3px] border border-slate-200 dark:border-white/10">
                                    {(resources?.expenses || []).length ? resources!.expenses.map((expense) => (
                                        <div key={expense.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 dark:border-white/10">
                                            <div>
                                                <div className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{expense.expenseType}</div>
                                                {expense.description && <div className="text-[11.5px] text-slate-500">{expense.description}</div>}
                                            </div>
                                            <div className="text-[12.5px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{expense.amount.toFixed(2)}</div>
                                        </div>
                                    )) : (
                                        <div className="px-3 py-8 text-center text-[12.5px] text-slate-400">{t('projects.gider_yok')}</div>
                                    )}
                                </div>
                            )}
                            {fieldTab === 'materials' && !resourcesLoading && (
                                <div className="space-y-2">
                                    {[...(resources?.usedMaterials || []).map((item) => ({
                                        id: `used-${item.id}`,
                                        name: item.article?.name || item.material?.name || '-',
                                        detail: item.article?.articleCode || 'Kullanılan',
                                        quantity: item.quantity,
                                    })), ...(resources?.extraMaterials || []).map((item) => ({
                                        id: `extra-${item.id}`,
                                        name: item.material?.name || item.description || '-',
                                        detail: 'Ek malzeme',
                                        quantity: item.quantity,
                                    }))].length ? (
                                        <div className="overflow-hidden rounded-[3px] border border-slate-200 dark:border-white/10">
                                            {[...(resources?.usedMaterials || []).map((item) => ({
                                                id: `used-${item.id}`,
                                                name: item.article?.name || item.material?.name || '-',
                                                detail: item.article?.articleCode || 'Kullanılan',
                                                quantity: item.quantity,
                                            })), ...(resources?.extraMaterials || []).map((item) => ({
                                                id: `extra-${item.id}`,
                                                name: item.material?.name || item.description || '-',
                                                detail: 'Ek malzeme',
                                                quantity: item.quantity,
                                            }))].map((item) => (
                                                <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 dark:border-white/10">
                                                    <div>
                                                        <div className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{item.name}</div>
                                                        <div className="text-[11.5px] text-slate-500">{item.detail}</div>
                                                    </div>
                                                    <div className="text-[12.5px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{item.quantity}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-[3px] border border-slate-200 px-3 py-8 text-center text-[12.5px] text-slate-400 dark:border-white/10">
                                            {t('projects.malzeme_yok')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <SnapshotView snapshot={snapshot} />
                    )}
                </section>

                <aside className="space-y-3 lg:sticky lg:top-3">
                    <section className="rounded-[3px] border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#17191c]">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('montage.table.status')}</div>
                        <div className={`mt-1 text-[14px] font-semibold ${isSigned ? 'text-emerald-700 dark:text-emerald-300' : 'text-[#d30f15] dark:text-amber-300'}`}>
                            {isSigned ? t('projects.delivery.statusSigned') : t('projects.delivery.statusUnsigned')}
                        </div>
                        {signedAt && <div className="mt-0.5 text-[11.5px] text-slate-500">{dateFmt(signedAt)}</div>}
                    </section>

                    <section className="rounded-[3px] border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#17191c]">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('projects.task.signature')}</div>
                        {signature ? (
                            <img src={signature} alt={t('projects.task.signature')} className="mt-2 h-28 w-full object-contain" />
                        ) : (
                            <div className="mt-3 text-[12px] text-slate-500">{t('projects.imza_bekliyor')}</div>
                        )}
                    </section>

                    <BigButton tone="brand" className="w-full" icon={<File05 size={16} />} onClick={() => void openPdf()}>
                        {t('montage.pdfPreview')}
                    </BigButton>
                    {!isSigned && (
                        <BigButton tone="brand" className="w-full" disabled={signing} onClick={() => setSignOpen(true)}>
                            {t('signatures.getSignature')}
                        </BigButton>
                    )}
                </aside>
            </div>

            <SignatureSheet
                open={signOpen}
                title={title}
                snapshot={snapshot}
                saving={signing}
                onClose={() => setSignOpen(false)}
                onSave={saveSignature}
            />

            {pdfOpen && createPortal(
                <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
                    <button type="button" aria-label={t('common.close')} onClick={() => setPdfOpen(false)} className="absolute inset-0 bg-slate-950/55" />
                    <section role="dialog" aria-modal="true" className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[3px] bg-white shadow-2xl">
                        <header className="flex items-center justify-between bg-[#1f2654] px-4 py-3 text-white dark:bg-amber-500">
                            <div>
                                <div className="text-[14px] font-semibold">{t('montage.pdfPreview')}</div>
                                <div className="text-[11.5px] text-white/70">{title}</div>
                            </div>
                            <button type="button" onClick={() => setPdfOpen(false)} aria-label={t('common.close')} className="grid size-10 place-items-center rounded-[3px] bg-white/12 text-white hover:bg-white/20">
                                <X size={19} />
                            </button>
                        </header>
                        <div className="min-h-0 flex flex-1 bg-white">
                            {pdfLoading || !pdfUrl ? (
                                <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-slate-500">
                                    <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654]" />
                                    PDF hazırlanıyor…
                                </div>
                            ) : (
                                <iframe
                                    title={t('montage.pdfPreview')}
                                    src={pdfUrl}
                                    className="h-[78vh] w-full border-0 bg-white"
                                />
                            )}
                        </div>
                    </section>
                </div>,
                document.body,
            )}
        </div>
    );
};
