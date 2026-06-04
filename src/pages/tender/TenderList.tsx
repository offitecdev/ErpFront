import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    Building02 as Building2,
    ChevronLeft,
    ChevronRight,
    File05 as FileSpreadsheet,
    FileCheck02 as FileCheck2,
    FilterLines as Filter,
    Plus,
    SearchLg as Search,
    Trash01 as Trash2,
    UploadCloud02 as Upload,
} from '@untitledui/icons';

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

const STATUS_LABEL: Record<string, string> = {
    Draft: 'Taslak',
    Approved: 'Onaylı',
    Exported: 'Dışa Aktarıldı',
};

const STATUS_VARIANT: Record<string, 'warning' | 'approved' | 'info' | 'passive'> = {
    Draft: 'warning',
    Approved: 'approved',
    Exported: 'info',
};

const tenderStatusLabel = (tender: TenderListItem) =>
    tender.projectId ? 'Siparişte' : STATUS_LABEL[tender.status];

const tenderStatusVariant = (tender: TenderListItem): 'warning' | 'approved' | 'info' | 'passive' | 'order' =>
    tender.projectId ? 'order' : STATUS_VARIANT[tender.status];

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
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0 || permissions.includes('tenders.manage');
    const canImport = permissions.length === 0 || permissions.includes('tenders.import');

    const {
        list, listTotal, listPage, listTotalPages, loadingList, filter, setFilter, fetchList,
        importTender, deleteTender,
    } = useTenderStore();

    const [customers, setCustomers] = useState<CustomerLite[]>([]);
    const [searchInput, setSearchInput] = useState('');
    const pageSize = 10;

    const [importOpen, setImportOpen] = useState(false);
    const [importAttempted, setImportAttempted] = useState(false);

    const [importForm, setImportForm] = useState({
        customerId: '',
        format: 'SIA451' as TenderFormat,
        xmlContent: '',
    });
    const [importing, setImporting] = useState(false);
    const importMissing = importOpen && importAttempted && (!importForm.customerId || !importForm.xmlContent.trim());

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
        const draft = list.filter((t) => !t.projectId && t.status === 'Draft').length;
        const approved = list.filter((t) => !t.projectId && t.status === 'Approved').length;
        const exported = list.filter((t) => !t.projectId && t.status === 'Exported').length;
        const salesOrder = list.filter((t) => t.projectId).length;
        const totalValue = list.reduce((s, t) => s + (t.grandTotal ?? 0), 0);
        return { total, draft, approved, exported, salesOrder, totalValue };
    }, [list]);

    const handleImport = async () => {
        setImportAttempted(true);
        if (!importForm.customerId || !importForm.xmlContent.trim()) {
            toast.error('Müşteri ve XML içeriği zorunludur.');
            return;
        }
        try {
            setImporting(true);
            const created = await importTender({
                customerId: importForm.customerId,
                xmlContent: importForm.xmlContent,
                format: importForm.format,
            });
            toast.success('İhale içe aktarıldı.');
            setImportOpen(false);
            setImportAttempted(false);
            setImportForm({ customerId: '', format: 'SIA451', xmlContent: '' });
            navigate(`/crm/tenders/${created.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'İçe aktarım başarısız.');
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

    const handleDelete = async (t: TenderListItem) => {
        if (!confirm(`${t.tenderNumber} teklifi silinsin mi?`)) return;
        try {
            await deleteTender(t.id);
            toast.success('Teklif silindi.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Silinemedi.');
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
                title="Teklif içe aktarılıyor"
                description="XML verisi okunuyor ve teklif pozisyonları hazırlanıyor. İşlem tamamlanınca detay sayfası açılacak."
            />
            <PageHeader
                breadcrumb="CRM › Teklif Yönetimi"
                title="Teklif ve İhale Listesi"
                description="Swiss CRB/NPK standartlarında ihale verilerini içe aktarın, maliyetlendirin ve resmi formatta dışa aktarın."
                actions={
                    <>
                        {canImport && (
                            <Button variant="secondary" icon={<Upload size={13} />} onClick={() => { setImportAttempted(false); setImportOpen(true); }}>
                                XML İçe Aktar
                            </Button>
                        )}
                        {canManage && (
                            <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/crm/tenders/new')}>
                                Yeni Teklif
                            </Button>
                        )}
                    </>
                }
            />

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                <StatCard label="Toplam" value={stats.total} accent="text-slate-800" />
                <StatCard label="Taslak" value={stats.draft} accent="text-amber-700" />
                <StatCard label="Onaylı" value={stats.approved} accent="text-emerald-700" />
                <StatCard label="Dışa Aktarılan" value={stats.exported} accent="text-[#272f67]" />
                <StatCard label="Siparişte" value={stats.salesOrder} accent="text-emerald-700" />
                <StatCard label="Tahmini Hacim" value={fmtMoney(stats.totalValue)} accent="text-slate-900" small />
            </div>

            {/* Filters + Table */}
            <Card
                title="Teklifler"
                icon={<FileSpreadsheet size={13} />}
                noPadding
                actions={
                    <form onSubmit={onSearch} className="flex items-center gap-2">
                        <div className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder="Teklif no..."
                                className="min-h-9 rounded-md border border-slate-300 bg-slate-50/80 py-2 pl-8 pr-2.5 text-[12px] transition-colors focus:border-[#272f67] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#272f67]/10"
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
                            <option value="">Tüm statüler</option>
                            <option value="Draft">Taslak</option>
                            <option value="Approved">Onaylı</option>
                            <option value="Exported">Dışa Aktarıldı</option>
                        </Select>
                        <Button type="submit" variant="ghost" size="sm" icon={<Filter size={12} />}>
                            Uygula
                        </Button>
                    </form>
                }
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px] text-left">
                        <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2.5 font-semibold">Teklif No</th>
                                <th className="px-4 py-2.5 font-semibold">Müşteri</th>
                                <th className="px-4 py-2.5 font-semibold text-center">Versiyon</th>
                                <th className="px-4 py-2.5 font-semibold">Durum</th>
                                <th className="px-4 py-2.5 font-semibold">Oluşturan</th>
                                <th className="px-4 py-2.5 font-semibold text-right">Tutar</th>
                                <th className="px-4 py-2.5 font-semibold">Oluşturma</th>
                                <th className="px-4 py-2.5 font-semibold text-right">Aksiyon</th>
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
                                            title="Henüz teklif yok"
                                            description="CRB/SIA 451 dosyasını içe aktarın veya sıfırdan teklif oluşturun."
                                            action={
                                                <div className="flex gap-2 justify-center">
                                                    {canImport && (
                                                        <Button variant="secondary" icon={<Upload size={13} />} onClick={() => { setImportAttempted(false); setImportOpen(true); }}>
                                                            XML İçe Aktar
                                                        </Button>
                                                    )}
                                                    {canManage && (
                                                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/crm/tenders/new')}>
                                                            Yeni Teklif
                                                        </Button>
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
                                        {dayjs(t.createdAt).format('DD.MM.YYYY HH:mm')}
                                    </td>
                                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="inline-flex items-center gap-1">
                                            {t.status === 'Draft' && canManage && (
                                                <button
                                                    onClick={() => handleDelete(t)}
                                                    className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                                    title="Sil"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                            {t.status === 'Approved' && (
                                                <FileCheck2 size={13} className="text-emerald-600" />
                                            )}
                                            <ChevronRight size={14} className="text-slate-400" />
                                        </div>
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

            {/* Import Modal */}
            <Modal
                open={importOpen}
                title="XML İhale İçe Aktarma"
                description="CRB/SIA 451 standardına uyumlu XML dosyasını sisteme yükleyin."
                onClose={() => { setImportOpen(false); setImportAttempted(false); }}
                width="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => { setImportOpen(false); setImportAttempted(false); }}>İptal</Button>
                        <Button variant="primary" loading={importing} onClick={handleImport}>
                            İçe Aktar
                        </Button>
                    </>
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    {importMissing && (
                        <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-md border border-utility-yellow-200 bg-warning-primary px-3 py-2 text-[12px] text-warning-primary">
                            <StatusChip variant="warning">Zorunlu alan</StatusChip>
                            <span className="font-medium">Müşteri ve XML içerik alanları doldurulmadan içe aktarma başlatılamaz.</span>
                        </div>
                    )}
                    <Field label="Müşteri" required error={importMissing && !importForm.customerId ? 'Müşteri seçimi zorunludur.' : null}>
                        <Select
                            value={importForm.customerId}
                            onChange={(e) => setImportForm({ ...importForm, customerId: e.target.value })}
                        >
                            <option value="">Müşteri seçin</option>
                            {customers.map((c) => (
                                <option key={c.id} value={c.id}>{c.companyName}</option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Format" required>
                        <Select
                            value={importForm.format}
                            onChange={(e) => setImportForm({ ...importForm, format: e.target.value as TenderFormat })}
                        >
                            <option value="SIA451">SIA 451</option>
                            <option value="CRBX">CRBX</option>
                        </Select>
                    </Field>
                    <Field label="XML Dosyası" hint=".xml, .crbx veya .sia451 uzantılı dosya seçebilirsiniz." className="col-span-2">
                        <input
                            type="file"
                            accept=".xml,.crbx,.sia,.sia451,text/xml"
                            onChange={handleFileUpload}
                            className="w-full text-[12px] file:mr-3 file:rounded file:border-0 file:bg-[#272f67]/10 file:px-3 file:py-1.5 file:font-medium file:text-[#272f67] hover:file:bg-[#272f67]/15"
                        />
                    </Field>
                    <Field label="XML İçerik" required className="col-span-2" error={importMissing && !importForm.xmlContent.trim() ? 'XML içerik zorunludur.' : null}>
                        <textarea
                            value={importForm.xmlContent}
                            onChange={(e) => setImportForm({ ...importForm, xmlContent: e.target.value })}
                            placeholder="<tender>...</tender>"
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
        <span className="text-slate-500">Toplam {total} kayit</span>
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
                    className={`h-8 min-w-8 rounded-md border px-2 font-medium ${p === page ? 'border-[#272f67] bg-[#272f67] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
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
