import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    ArrowRight,
    Building02 as Building2,
    ChevronLeft,
    ChevronRight,
    File05 as FileSpreadsheet,
    FilterLines as Filter,
    Plus,
    SearchLg as Search,
    UploadCloud02 as Upload,
    XClose,
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { BlockingDialog } from '../../components/ui-shared/BlockingDialog';

import { useTenderStore } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../lib/axios';
import type { CustomerLite, TenderFormat, TenderListItem } from '../../types/tender';

import { t as i18nT } from '@/i18n/translate';
import { isSourceSalesOrder } from './detail/utils/tenderStatus.utils';
import { useLanguageRefresh } from './detail/hooks/useLanguageRefresh';

const getStatusLabel = (): Record<string, string> => ({
    Draft:i18nT('crm.tenders.statusDraft'),
    Approved:i18nT('crm.tenders.statusApproved'),
    Exported:i18nT('crm.tenders.statusExported'),
});

const STATUS_VARIANT: Record<string, 'warning' | 'approved' | 'info' | 'passive'> = {
    Draft: 'passive',
    Approved: 'approved',
    Exported: 'info',
};

const tenderStatusLabel = (tender: TenderListItem) =>
    tender.projectId || isSourceSalesOrder(tender.sourceStatus) ?i18nT('crm.tenders.statusOrdered') : getStatusLabel()[tender.status];

const tenderStatusVariant = (tender: TenderListItem): 'warning' | 'approved' | 'info' | 'passive' | 'order' =>
    tender.projectId || isSourceSalesOrder(tender.sourceStatus) ? 'order' : STATUS_VARIANT[tender.status];

const tenderCreatorName = (tender: TenderListItem) =>
    tender.createdByName || tender.createdByEmail || tender.createdByEmployeeId || '—';

const initialsFromName = (value?: string | null) => {
    const cleaned = value?.trim();
    if (!cleaned || cleaned === '—') return '?';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const source = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [cleaned];
    return source.map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
};

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '—';

export const TenderList = () => {
    useLanguageRefresh();
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0 || permissions.includes('tenders.manage');
    const canImport = permissions.length === 0 || permissions.includes('tenders.import');

    const {
        list, listTotal, listPage, listTotalPages, loadingList, filter, setFilter, fetchList,
        importTender, importSalesOrderCsv,
    } = useTenderStore();

    const [customers, setCustomers] = useState<CustomerLite[]>([]);
    const [searchInput, setSearchInput] = useState('');
    const pageSize = 10;

    const [importOpen, setImportOpen] = useState(false);
    const [importAttempted, setImportAttempted] = useState(false);
    const [salesCsvOpen, setSalesCsvOpen] = useState(false);
    const [salesCsvAttempted, setSalesCsvAttempted] = useState(false);

    const [importForm, setImportForm] = useState({
        customerId: '',
        format: 'SIA451' as TenderFormat,
        xmlContent: '',
    });
    const [salesCsvForm, setSalesCsvForm] = useState({
        fileName: '',
        csvContent: '',
    });
    const [importing, setImporting] = useState(false);
    const [salesCsvImporting, setSalesCsvImporting] = useState(false);
    const importMissing = importOpen && importAttempted && (!importForm.customerId || !importForm.xmlContent.trim());
    const salesCsvMissing = salesCsvOpen && salesCsvAttempted && !salesCsvForm.csvContent.trim();

    useEffect(() => {
        fetchList({ page: 1, pageSize });
    }, [fetchList]);

    useEffect(() => {
        if (!importOpen || customers.length > 0) return;
        apiClient.get('/customers?page=1&pageSize=100')
            .then((r) => setCustomers(Array.isArray(r.data) ? r.data : r.data.items || []))
            .catch(() => setCustomers([]));
    }, [customers.length, importOpen]);

    const stats = useMemo(() => {
        const total = listTotal;
        const draft = list.filter((t) => !t.projectId && t.status === "Draft").length;
        const approved = list.filter((t) => !t.projectId && t.status === "Approved").length;
        const exported = list.filter((t) => !t.projectId && t.status === "Exported").length;
        const salesOrder = list.filter((t) => t.projectId || isSourceSalesOrder(t.sourceStatus)).length;
        const totalValue = list.reduce((s, t) => s + (t.grandTotal ?? 0), 0);
        return { total, draft, approved, exported, salesOrder, totalValue };
    }, [list]);

    const handleImport = async () => {
        setImportAttempted(true);
        if (!importForm.customerId || !importForm.xmlContent.trim()) {
            toast.error(i18nT('tenders.customer_ve_xml_content_zorunludur'));
            return;
        }
        try {
            setImporting(true);
            const created = await importTender({
                customerId: importForm.customerId,
                xmlContent: importForm.xmlContent,
                format: importForm.format,
            });
            toast.success(i18nT('tenders.tender_import_aktarildi'));
            setImportOpen(false);
            setImportAttempted(false);
            setImportForm({ customerId: '', format: 'SIA451', xmlContent: '' });
            navigate(`/crm/tenders/${created.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||i18nT('tenders.import_aktarim_basarisiz'));
        } finally {
            setImporting(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        setImportForm((p) => ({ ...p, xmlContent: text }));
    };

    const handleSalesCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (/\.xlsx?$/i.test(file.name)) {
            toast.error(i18nT('tenders.bu_aktarim_csv_dosyasiyla_calisir_lutfen_csv_dos'));
            e.currentTarget.value = '';
            return;
        }
        const text = await file.text();
        setSalesCsvForm({ fileName: file.name, csvContent: text });
    };

    const handleSalesCsvImport = async () => {
        setSalesCsvAttempted(true);
        if (!salesCsvForm.csvContent.trim()) {
            toast.error(i18nT('tenders.csv_file_zorunludur'));
            return;
        }
        try {
            setSalesCsvImporting(true);
            const created = await importSalesOrderCsv({
                csvContent: salesCsvForm.csvContent,
                fileName: salesCsvForm.fileName || null,
            });
            toast.success(i18nT('tenders.sales_order_csv_import_aktarildi'));
            setSalesCsvOpen(false);
            setSalesCsvAttempted(false);
            setSalesCsvForm({ fileName: '', csvContent: '' });
            if (created) navigate(`/crm/tenders/${created.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||i18nT('tenders.import_csv_failed'));
        } finally {
            setSalesCsvImporting(false);
        }
    };

    const onSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setFilter({ ...filter, search: searchInput.trim() || undefined });
        fetchList({ ...filter, search: searchInput.trim() || undefined, page: 1, pageSize });
    };

    const goPage = (page: number) => {
        const next = { ...filter, page, pageSize };
        setFilter(next);
        fetchList(next);
    };

    return (
        <div>
            <BlockingDialog
                open={importing}
                title={i18nT('tenders.tender_import_aktariliyor')}
                description={i18nT('tenders.xml_data_okunuyor_ve_tender_satirlari_hazirlan')}
            />
            <BlockingDialog
                open={salesCsvImporting}
                title={i18nT('tenders.import_csving')}
                description={i18nT('tenders.sales_order_satirlari_okunuyor_customer_product_v')}
            />
            <PageHeader
                breadcrumb={i18nT('tenders.crm_teklif_yonetimi')}
                title={i18nT('tenders.tender_ve_tender_listesi')}
                description={i18nT('tenders.tenders_import_aktarin_esnek_satirlarla_maliyetl')}
                actions={
                    <>
                        {canImport && (
                            <>
                                <Button variant="secondary" icon={<Upload size={13} />} onClick={() => { setSalesCsvAttempted(false); setSalesCsvOpen(true); }}>{i18nT('tenders.csv_export')}</Button>
                                <Button variant="secondary" icon={<Upload size={13} />} onClick={() => { setImportAttempted(false); setImportOpen(true); }}>{i18nT('tenders.xml_import_export')}</Button>
                            </>
                        )}
                        {canManage && (
                            <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/crm/tenders/new')}>{i18nT('tenders.new_tender')}</Button>
                        )}
                    </>
                }
            />

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                <StatCard label={i18nT('common.total')} value={stats.total} accent="text-slate-800" />
                <StatCard label={i18nT('crm.tenders.statusDraft')} value={stats.draft} accent="text-amber-700" />
                <StatCard label={i18nT('crm.tenders.statusApproved')} value={stats.approved} accent="text-emerald-700" />
                <StatCard label={i18nT('tenders.export_exported')} value={stats.exported} accent="text-[#272f67]" />
                <StatCard label={i18nT('crm.tenders.statusOrdered')} value={stats.salesOrder} accent="text-emerald-700" />
                <StatCard label={i18nT('tenders.tahmini_hacim')} value={fmtMoney(stats.totalValue)} accent="text-slate-900" small />
            </div>

            {/* Filters + Table */}
            <Card
                title={i18nT('crm.tenders.tableTitle')}
                icon={<FileSpreadsheet size={13} />}
                noPadding
                actions={
                    <form onSubmit={onSearch} className="flex items-center gap-2">
                        <div className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder={i18nT('tenders.tender_no')}
                                className="ofi-light-search-input min-h-9 rounded-md border border-slate-300 bg-slate-50/80 py-2 pl-8 pr-2.5 text-[12px] text-slate-950 transition-colors placeholder:text-slate-400 focus:border-[#272f67] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#272f67]/10 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-400"
                            />
                        </div>
                        <Select
                            value={filter.status ?? ''}
                            onChange={(e) => {
                                const v = e.target.value as 'Draft' | 'Approved' | 'Exported' | '';
                                const next = { ...filter, status: v === '' ? undefined : v, page: 1, pageSize };
                                setFilter(next);
                                fetchList(next);
                            }}
                            size="sm"
                            className="w-[142px] text-[12px]"
                        >
                            <option value="">{i18nT('tenders.all_statuler')}</option>
                            <option value="Draft">{i18nT('crm.tenders.statusDraft')}</option>
                            <option value="Approved">{i18nT('crm.tenders.statusApproved')}</option>
                            <option value="Exported">{i18nT('crm.tenders.statusExported')}</option>
                        </Select>
                        <Button type="submit" variant="ghost" size="sm" icon={<Filter size={12} />}>{i18nT('tenders.uygula')}</Button>
                    </form>
                }
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px] text-left">
                        <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2.5 font-semibold">{i18nT('tenders.tender_no')}</th>
                                <th className="px-4 py-2.5 font-semibold">{i18nT('nav.quickActionsGroup.customers')}</th>
                                <th className="px-4 py-2.5 font-semibold text-center">{i18nT('tenders.versiyon')}</th>
                                <th className="px-4 py-2.5 font-semibold">{i18nT('common.status')}</th>
                                <th className="px-4 py-2.5 font-semibold">{i18nT('tenders.olusturan')}</th>
                                <th className="px-4 py-2.5 font-semibold text-right">{i18nT('common.amount')}</th>
                                <th className="px-4 py-2.5 font-semibold">{i18nT('tenders.olusturma')}</th>
                                <th className="px-4 py-2.5 font-semibold text-center">{i18nT('tenders.mail')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loadingList && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                                        <div className="mx-auto max-w-sm animate-pulse space-y-2">
                                            <div className="h-3 bg-slate-100 rounded" />
                                            <div className="h-3 bg-slate-100 rounded w-2/3 mx-auto" />
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loadingList && list.length === 0 && (
                                <tr>
                                    <td colSpan={8}>
                                        <EmptyState
                                            icon={<FileSpreadsheet size={32} />}
                                            title={i18nT('tenders.no_tenders_yet')}
                                            description={i18nT('tenders.crb_sia_451_dosyasini_import_aktarin_veya_sifirdan')}
                                            action={
                                                <div className="flex gap-2 justify-center">
                                                    {canImport && (
                                                        <>
                                                            <Button variant="secondary" icon={<Upload size={13} />} onClick={() => { setSalesCsvAttempted(false); setSalesCsvOpen(true); }}>{i18nT('tenders.csv_export')}</Button>
                                                            <Button variant="secondary" icon={<Upload size={13} />} onClick={() => { setImportAttempted(false); setImportOpen(true); }}>{i18nT('tenders.xml_import_export')}</Button>
                                                        </>
                                                    )}
                                                    {canManage && (
                                                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/crm/tenders/new')}>{i18nT('tenders.new_tender')}</Button>
                                                    )}
                                                </div>
                                            }
                                        />
                                    </td>
                                </tr>
                            )}
                            {!loadingList && list.map((t) => (
                                <tr
                                    key={t.id}
                                    className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                                    onClick={() => navigate(`/crm/tenders/${t.id}`)}
                                >
                                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                                        <div className="flex items-center gap-1.5">
                                            <FileSpreadsheet size={13} className="text-[#272f67]" />
                                            {t.tenderNumber}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-700">
                                        <div className="flex items-center gap-1.5">
                                            <Building2 size={11} className="text-slate-400" />
                                            {t.customerName || '—'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-center text-slate-600 font-mono text-[11.5px]">
                                        v{t.version}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <StatusChip variant={tenderStatusVariant(t)}>
                                            {tenderStatusLabel(t)}
                                        </StatusChip>
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-600">
                                        <div className="flex min-w-[140px] items-center gap-2">
                                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                                                {initialsFromName(tenderCreatorName(t))}
                                            </span>
                                            <span className="truncate text-[12px] font-medium text-slate-700">
                                                {tenderCreatorName(t)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900 font-mono">
                                        {fmtMoney(t.grandTotal)}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-500 text-[12px]">
                                        {dayjs(t.createdAt).format("DD.MM.YYYY HH:mm")}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        {t.offerMailSentAt ? (
                                            <span
                                                className="inline-flex items-center justify-center text-emerald-600"
                                                title={`${i18nT('tenders.mail')} · ${dayjs(t.offerMailSentAt).format("DD.MM.YYYY HH:mm")}`}
                                            >
                                                <ArrowRight size={16} />
                                            </span>
                                        ) : (
                                            <span
                                                className="inline-flex items-center justify-center text-slate-300"
                                                title={i18nT('tenders.mail')}
                                            >
                                                <XClose size={16} />
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!loadingList && listTotalPages > 1 && (
                    <PaginationBar
                        page={listPage}
                        totalPages={listTotalPages}
                        total={listTotal}
                        onPage={goPage}
                    />
                )}
            </Card>

            <Modal
                open={salesCsvOpen}
                title={i18nT('tenders.sales_order_csv_export')}
                description={i18nT('tenders.odoo_sales_order_csv_dosyasindaki_customer_uru')}
                onClose={() => { setSalesCsvOpen(false); setSalesCsvAttempted(false); }}
                width="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => { setSalesCsvOpen(false); setSalesCsvAttempted(false); }}>{i18nT('common.cancel')}</Button>
                        <Button variant="primary" loading={salesCsvImporting} onClick={handleSalesCsvImport}>{i18nT('tenders.csv_export')}</Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-3">
                    {salesCsvMissing && (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-utility-yellow-200 bg-warning-primary px-3 py-2 text-[12px] text-warning-primary">
                            <StatusChip variant="warning">{i18nT('common.required')}</StatusChip>
                            <span className="font-medium">{i18nT('tenders.cannot_import_without_csv_file')}</span>
                        </div>
                    )}
                    <Field label={i18nT('tenders.csv_file')} required hint={i18nT('tenders.csv_uzantili_sales_order_dosyasini_select')} error={salesCsvMissing ?i18nT('tenders.csv_file_zorunludur') : null}>
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={handleSalesCsvUpload}
                            className="w-full text-[12px] file:mr-3 file:rounded file:border-0 file:bg-[#272f67]/10 file:px-3 file:py-1.5 file:font-medium file:text-[#272f67] hover:file:bg-[#272f67]/15"
                        />
                    </Field>
                    {salesCsvForm.fileName && (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-700">
                            {salesCsvForm.fileName}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Import Modal */}
            <Modal
                open={importOpen}
                title={i18nT('tenders.xml_tender_import')}
                description={i18nT('tenders.crb_sia_451_standardina_uyumlu_xml_dosyasini_sis')}
                onClose={() => { setImportOpen(false); setImportAttempted(false); }}
                width="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => { setImportOpen(false); setImportAttempted(false); }}>{i18nT('common.cancel')}</Button>
                        <Button variant="primary" loading={importing} onClick={handleImport}>{i18nT('tenders.import_export')}</Button>
                    </>
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    {importMissing && (
                        <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-md border border-utility-yellow-200 bg-warning-primary px-3 py-2 text-[12px] text-warning-primary">
                            <StatusChip variant="warning">{i18nT('common.required')}</StatusChip>
                            <span className="font-medium">{i18nT('tenders.customer_ve_xml_icerik_alanlari_doldurulmadan_import')}</span>
                        </div>
                    )}
                    <Field label={i18nT('nav.quickActionsGroup.customers')} required error={importMissing && !importForm.customerId ?i18nT('tenders.customer_secimi_zorunludur') : null}>
                        <Select
                            value={importForm.customerId}
                            onChange={(e) => setImportForm({ ...importForm, customerId: e.target.value })}
                        >
                            <option value="">{i18nT('tenders.customer_select')}</option>
                            {customers.map((c) => (
                                <option key={c.id} value={c.id}>{c.companyName}</option>
                            ))}
                        </Select>
                    </Field>
                    <Field label={i18nT('tenders.format')} required>
                        <Select
                            value={importForm.format}
                            onChange={(e) => setImportForm({ ...importForm, format: e.target.value as TenderFormat })}
                        >
                            <option value="SIA451">{i18nT('tenders.sia_451')}</option>
                            <option value="CRBX">CRBX</option>
                        </Select>
                    </Field>
                    <Field label={i18nT('tenders.xml_file')} hint={i18nT('tenders.xml_crbx_veya_sia451_uzantili_file_secebilirsin')} className="col-span-2">
                        <input
                            type="file"
                            accept=".xml,.crbx,.sia,.sia451,text/xml"
                            onChange={handleFileUpload}
                            className="w-full text-[12px] file:mr-3 file:rounded file:border-0 file:bg-[#272f67]/10 file:px-3 file:py-1.5 file:font-medium file:text-[#272f67] hover:file:bg-[#272f67]/15"
                        />
                    </Field>
                    <Field label={i18nT('tenders.xml_icerik')} required className="col-span-2" error={importMissing && !importForm.xmlContent.trim() ?i18nT('tenders.xml_icerik_zorunludur') : null}>
                        <textarea
                            value={importForm.xmlContent}
                            onChange={(e) => setImportForm({ ...importForm, xmlContent: e.target.value })}
                            placeholder={i18nT('tenders.tender')}
                            rows={10}
                            className="w-full rounded-md border border-slate-300 bg-slate-50/40 px-3 py-2 font-mono text-[12px] focus:border-[#272f67] focus:outline-none focus:ring-2 focus:ring-[#272f67]/10"
                        />
                    </Field>
                </div>
            </Modal>
        </div>
    );
};

const pageWindow = (page: number, totalPages: number) => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
};

const PaginationBar: React.FC<{
    page: number;
    totalPages: number;
    total: number;
    onPage: (page: number) => void;
}> = ({ page, totalPages, total, onPage }) => (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[12px]">
        <span className="text-slate-500">{i18nT('common.total')}{total}{i18nT('tenders.record')}</span>
        <div className="inline-flex items-center gap-1">
            <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
            >
                <ChevronLeft size={14} />
            </button>
            {pageWindow(page, totalPages).map((p) => (
                <button
                    key={p}
                    type="button"
                    onClick={() => onPage(p)}
                    className={`h-8 min-w-8 rounded-md border px-2 font-medium ${p === page ?"border-[#272f67] bg-[#272f67] text-white" :"border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                    {p}
                </button>
            ))}
            <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPage(page + 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
            >
                <ChevronRight size={14} />
            </button>
        </div>
    </div>
);

interface StatCardProps {
    label: string;
    value: number | string;
    accent: string;
    small?: boolean;
}
const StatCard: React.FC<StatCardProps> = ({ label, value, accent, small }) => (
    <div className="bg-white border border-slate-200/70 rounded-md px-4 py-3">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {label}
        </div>
        <div className={`mt-1 ${small ? 'text-[14px]' : 'text-[20px]'} font-semibold leading-tight ${accent}`}>
            {value}
        </div>
    </div>
);
