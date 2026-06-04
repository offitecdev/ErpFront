import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Building02 as Building2,
    ChevronLeft,
    ChevronRight,
    Eye,
    Hash01 as Hash,
    Mail01 as Mail,
    MarkerPin01 as MapPin,
    Phone,
    Plus,
    Save01 as Save,
    SearchLg as Search,
    X as XIcon,
} from '@untitledui/icons';

import { apiClient } from '../../lib/axios';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';

interface CustomerRow {
    id: string;
    companyName: string;
    segment?: string | null;
    taxOffice?: string | null;
    taxNumber?: string | null;
    mainEmail?: string | null;
    mainPhone?: string | null;
    address?: string | null;
    isActive: boolean;
}

const SEGMENT_LABEL: Record<string, string> = {
    Enterprise: 'Kurumsal',
    SMB: 'KOBİ',
    Startup: 'Startup',
};

export const CustomerList = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const [form, setForm] = useState({
        companyName: '',
        segment: '',
        taxOffice: '',
        taxNumber: '',
        mainEmail: '',
        mainPhone: '',
        address: '',
    });
    const pageSize = 10;

    const fetchCustomers = async (nextPage = page, nextSearch = search) => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
            const q = nextSearch.trim();
            if (q) params.set('search', q);
            const res = await apiClient.get(`/customers?${params.toString()}`);
            if (Array.isArray(res.data)) {
                setCustomers(res.data || []);
                setTotal(res.data?.length || 0);
                setTotalPages(1);
                setPage(1);
            } else {
                setCustomers(res.data.items || []);
                setTotal(res.data.total || 0);
                setTotalPages(res.data.totalPages || 1);
                setPage(res.data.page || nextPage);
            }
        } catch {
            toast.error('Müşteriler yüklenemedi.');
            setCustomers([]);
            setTotal(0);
            setTotalPages(1);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = window.setTimeout(() => fetchCustomers(1, search), 250);
        return () => window.clearTimeout(t);
    }, [search]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitAttempted(true);
        if (!form.companyName.trim()) {
            toast.error('Firma adı zorunludur.');
            return;
        }
        try {
            setSubmitting(true);
            await apiClient.post('/customers', form);
            toast.success('Müşteri eklendi.');
            setForm({
                companyName: '', segment: '', taxOffice: '', taxNumber: '',
                mainEmail: '', mainPhone: '', address: '',
            });
            setSubmitAttempted(false);
            setShowForm(false);
            fetchCustomers(1, search);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Müşteri eklenemedi.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="CRM"
                title="Müşteri Listesi"
                description="Müşteri kayıtlarını yönetin, 360° detaylarını ve tekliflerini görüntüleyin."
                actions={
                    <>
                        <div className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => {
                                    setPage(1);
                                    setSearch(e.target.value);
                                }}
                                placeholder="Müşteri ara..."
                                className="pl-7 pr-2.5 py-1.5 text-[12.5px] border border-slate-200 rounded bg-slate-50/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10 focus:border-blue-400 w-[200px]"
                            />
                        </div>
                        <Button
                            variant={showForm ? 'secondary' : 'primary'}
                            icon={showForm ? <XIcon size={13} /> : <Plus size={13} />}
                            onClick={() => {
                                setSubmitAttempted(false);
                                setShowForm(!showForm);
                            }}
                        >
                            {showForm ? 'Kapat' : 'Yeni Müşteri'}
                        </Button>
                    </>
                }
            />

            {/* Inline add form (NOT a popup/modal) */}
            {showForm && (
                <Card
                    title="Yeni Müşteri"
                    description="Sistemde aktif olarak yer alacak yeni bir müşteri kaydı oluşturun."
                    icon={<Plus size={13} />}
                    className="mb-4"
                >
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {submitAttempted && !form.companyName.trim() && (
                            <div className="md:col-span-3 flex flex-wrap items-center gap-2 rounded-md border border-utility-yellow-200 bg-warning-primary px-3 py-2 text-[12px] text-warning-primary">
                                <StatusChip variant="warning">Zorunlu alan</StatusChip>
                                <span className="font-medium">Firma Adı doldurulmadan müşteri kaydı oluşturulamaz.</span>
                            </div>
                        )}
                        <Field label="Firma Adı" required className="md:col-span-2" error={submitAttempted && !form.companyName.trim() ? 'Firma adı zorunludur.' : null}>
                            <Input
                                value={form.companyName}
                                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                                placeholder="Örn. Offitec AG"
                            />
                        </Field>
                        <Field label="Segment">
                            <Select
                                value={form.segment}
                                onChange={(e) => setForm({ ...form, segment: e.target.value })}
                            >
                                <option value="">Seçiniz</option>
                                <option value="Enterprise">Kurumsal</option>
                                <option value="SMB">KOBİ</option>
                                <option value="Startup">Startup</option>
                            </Select>
                        </Field>
                        <Field label="Vergi Dairesi">
                            <Input value={form.taxOffice}
                                onChange={(e) => setForm({ ...form, taxOffice: e.target.value })} />
                        </Field>
                        <Field label="Vergi No">
                            <Input value={form.taxNumber}
                                onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} />
                        </Field>
                        <Field label="E-posta">
                            <Input type="email" value={form.mainEmail}
                                onChange={(e) => setForm({ ...form, mainEmail: e.target.value })} />
                        </Field>
                        <Field label="Telefon">
                            <Input value={form.mainPhone}
                                onChange={(e) => setForm({ ...form, mainPhone: e.target.value })} />
                        </Field>
                        <Field label="Açık Adres" className="md:col-span-3">
                            <Textarea rows={2} value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })} />
                        </Field>
                        <div className="md:col-span-3 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <Button variant="secondary" type="button" onClick={() => { setSubmitAttempted(false); setShowForm(false); }}>
                                İptal
                            </Button>
                            <Button variant="primary" type="submit" loading={submitting} icon={<Save size={13} />}>
                                Müşteriyi Kaydet
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card
                title={`Müşteriler · ${total}`}
                icon={<Building2 size={13} />}
                noPadding
            >
                {loading ? (
                    <div className="px-6 py-10 animate-pulse space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-12 rounded-md bg-slate-50 border border-slate-100" />
                        ))}
                    </div>
                ) : customers.length === 0 ? (
                    <EmptyState
                        icon={<Building2 size={32} />}
                        title="Müşteri bulunamadı"
                        description={search ? 'Arama kriterinize uygun kayıt yok.' : 'Henüz hiç müşteri eklenmemiş.'}
                        action={
                            !search && (
                                <Button variant="primary" icon={<Plus size={13} />} onClick={() => { setSubmitAttempted(false); setShowForm(true); }}>
                                    İlk Müşteriyi Ekle
                                </Button>
                            )
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px] text-left">
                            <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-2.5 font-semibold">Firma</th>
                                    <th className="px-4 py-2.5 font-semibold">Segment</th>
                                    <th className="px-4 py-2.5 font-semibold">Vergi</th>
                                    <th className="px-4 py-2.5 font-semibold">İletişim</th>
                                    <th className="px-4 py-2.5 font-semibold">Durum</th>
                                    <th className="px-4 py-2.5 font-semibold text-right">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {customers.map((c) => (
                                    <tr
                                        key={c.id}
                                        className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                                        onClick={() => navigate(`/crm/customers/${c.id}`)}
                                    >
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded bg-blue-50 text-blue-700 flex items-center justify-center font-semibold text-[12px]">
                                                    {c.companyName.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-slate-900">{c.companyName}</div>
                                                    {c.address && (
                                                        <div className="text-[11.5px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                            <MapPin size={10} />{c.address}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {c.segment ? (
                                                <span className="text-[12px] font-medium text-blue-700">
                                                    {SEGMENT_LABEL[c.segment] || c.segment}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-[12px] text-slate-600">
                                            {c.taxNumber ? (
                                                <div className="flex items-center gap-1.5 font-mono">
                                                    <Hash size={10} className="text-slate-300" />
                                                    {c.taxNumber}
                                                    {c.taxOffice && <span className="text-slate-400 ml-1">/ {c.taxOffice}</span>}
                                                </div>
                                            ) : (
                                                <span className="text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-[12.5px]">
                                            <div className="flex items-center gap-1.5 text-slate-700">
                                                <Mail size={11} className="text-slate-400" />
                                                {c.mainEmail || <span className="text-slate-300">—</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-500 text-[11.5px] mt-0.5">
                                                <Phone size={11} className="text-slate-400" />
                                                {c.mainPhone || <span className="text-slate-300">—</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <StatusChip variant={c.isActive ? 'active' : 'passive'}>
                                                {c.isActive ? 'Aktif' : 'Pasif'}
                                            </StatusChip>
                                        </td>
                                        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => navigate(`/crm/customers/${c.id}`)}
                                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[12px] text-blue-700 hover:bg-blue-50 transition-colors"
                                            >
                                                <Eye size={12} /> Detay <ChevronRight size={11} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {totalPages > 1 && (
                            <PaginationBar
                                page={page}
                                totalPages={totalPages}
                                total={total}
                                onPage={(p) => fetchCustomers(p, search)}
                            />
                        )}
                    </div>
                )}
            </Card>
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
                    className={`h-8 min-w-8 rounded-md border px-2 font-medium ${p === page ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
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
