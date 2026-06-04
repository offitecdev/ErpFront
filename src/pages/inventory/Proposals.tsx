import { useEffect } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    AlertTriangle,
    CheckCircle as CheckCircle2,
    Package,
    PackageX as XCircle,
    ShoppingCart01 as ShoppingCart,
} from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { EmptyState } from '../../components/ui-shared/EmptyState';

import { useInventoryStore } from '../../store/inventoryStore';

const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);

export const Proposals = () => {
    const { proposals, fetchProposals, resolveProposal } = useInventoryStore();

    useEffect(() => {
        fetchProposals();
    }, [fetchProposals]);

    const handle = async (id: string, isApproved: boolean) => {
        try {
            await resolveProposal(id, isApproved);
            toast.success(isApproved ? 'Satın alma onaylandı.' : 'Öneri reddedildi.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'İşlem başarısız.');
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Stok › Satın Alma Önerileri"
                title="Otomatik Satın Alma Önerileri"
                description="Kritik stok seviyesine düşen ürünler için sistem otomatik öneri üretir. Onaylayarak satın alma sürecini başlatın."
            />

            <Card title="Bekleyen Öneriler" icon={<ShoppingCart size={13} />} noPadding>
                {proposals.length === 0 ? (
                    <EmptyState
                        icon={<CheckCircle2 size={32} />}
                        title="Onay bekleyen öneri yok"
                        description="Tüm stoklar güvenli seviyede. Sistem otomatik öneri ürettiğinde burada listelenir."
                    />
                ) : (
                    <div className="divide-y divide-slate-100">
                        {proposals.map((p) => (
                            <div key={p.id} className="px-4 py-3 hover:bg-slate-50/60">
                                <div className="flex items-start gap-3">
                                    {p.article?.imageUrl ? (
                                        <img src={p.article.imageUrl} alt="" className="w-12 h-12 rounded object-cover border border-slate-200" />
                                    ) : (
                                        <div className="w-12 h-12 rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                                            <Package size={18} />
                                        </div>
                                    )}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-[13px] font-semibold text-slate-800 truncate">{p.article?.name ?? p.articleId}</h4>
                                            <span className="inline-flex items-center gap-1 text-[10.5px] bg-amber-50 border border-amber-200/70 text-amber-700 px-1.5 py-0.5 rounded">
                                                <AlertTriangle size={9} />
                                                Kritik
                                            </span>
                                        </div>
                                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">{p.article?.articleCode}</div>
                                        <div className="mt-2 grid grid-cols-3 gap-3 text-[12px]">
                                            <div>
                                                <div className="text-[10.5px] text-slate-400 uppercase tracking-wider font-semibold">Önerilen Miktar</div>
                                                <div className="font-mono font-semibold text-slate-800">{fmtNumber(p.proposedQuantity)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10.5px] text-slate-400 uppercase tracking-wider font-semibold">Tarih</div>
                                                <div className="text-slate-700">{dayjs(p.createdAt).format('DD.MM.YYYY HH:mm')}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10.5px] text-slate-400 uppercase tracking-wider font-semibold">Tedarikçi</div>
                                                <div className="text-slate-700">{p.supplierId || 'Atanmadı'}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            icon={<CheckCircle2 size={12} />}
                                            onClick={() => handle(p.id, true)}
                                        >
                                            Onayla
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={<XCircle size={12} />}
                                            onClick={() => handle(p.id, false)}
                                        >
                                            Reddet
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};
