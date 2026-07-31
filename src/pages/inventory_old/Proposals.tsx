// ARCHIVED: eski envanter modülü — yeni tablo-tabanlı modül src/pages/inventory altında. Bu dosya devre dışı bırakıldı.
// import { useEffect } from 'react';
// import dayjs from 'dayjs';
// import { toast } from 'sonner';
// import {
//     AlertTriangle,
//     CheckCircle as CheckCircle2,
//     Package,
//     PackageX as XCircle,
//     ShoppingCart01 as ShoppingCart,
// } from '@/components/icons/antIconCompat';
// 
// import { PageHeader } from '../../components/layout/PageHeader';
// import { Card } from '../../components/ui-shared/Card';
// import { Button } from '../../components/ui-shared/Button';
// import { EmptyState } from '../../components/ui-shared/EmptyState';
// 
// import { useInventoryStore } from '../../store/inventoryStore';
// 
// import { t } from '@/i18n/translate';
// 
// const fmtNumber = (v: number) =>
//     new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);
// 
// export const Proposals = () => {
//     const { proposals, fetchProposals, resolveProposal } = useInventoryStore();
// 
//     useEffect(() => {
//         fetchProposals();
//     }, [fetchProposals]);
// 
//     const handle = async (id: string, isApproved: boolean) => {
//         try {
//             await resolveProposal(id, isApproved);
//             toast.success(isApproved ?t('auto.satin_alma_onaylandi') :t('auto.oneri_reddedildi'));
//         } catch (e: any) {
//             toast.error(e.response?.data?.error ||t('dashboard.actionFailed'));
//         }
//     };
// 
//     return (
//         <div>
//             <PageHeader
//                 breadcrumb={t('auto.breadcrumb_purchase_proposals')}
//                 title={t('auto.otomatik_satin_alma_onerileri')}
//                 description={t('auto.kritik_stok_seviyesine_dusen_urunler_icin_sistem')}
//             />
// 
//             <Card title={t('auto.bekleyen_oneriler')} icon={<ShoppingCart size={13} />} noPadding>
//                 {proposals.length === 0 ? (
//                     <EmptyState
//                         icon={<CheckCircle2 size={32} />}
//                         title={t('auto.onay_bekleyen_oneri_yok')}
//                         description={t('auto.tum_stoklar_guvenli_seviyede_sistem_otomatik_one')}
//                     />
//                 ) : (
//                     <div className="divide-y divide-slate-100">
//                         {proposals.map((p) => (
//                             <div key={p.id} className="px-4 py-3 hover:bg-slate-100">
//                                 <div className="flex items-start gap-3">
//                                     {p.article?.imageUrl ? (
//                                         <img src={p.article.imageUrl} alt="" className="w-12 h-12 rounded object-cover border border-slate-200" />
//                                     ) : (
//                                         <div className="w-12 h-12 rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
//                                             <Package size={18} />
//                                         </div>
//                                     )}
// 
//                                     <div className="flex-1 min-w-0">
//                                         <div className="flex items-center gap-2">
//                                             <h4 className="text-[13px] font-semibold text-slate-800 truncate">{p.article?.name ?? p.articleId}</h4>
//                                             <span className="inline-flex items-center gap-1 text-[10.5px] bg-amber-50 border border-amber-200/70 text-amber-700 px-1.5 py-0.5 rounded">
//                                                 <AlertTriangle size={9} />{t('auto.kritik')}</span>
//                                         </div>
//                                         <div className="text-[11px] font-mono text-slate-500 mt-0.5">{p.article?.articleCode}</div>
//                                         <div className="mt-2 grid grid-cols-3 gap-3 text-[12px]">
//                                             <div>
//                                                 <div className="text-[10.5px] text-slate-400 uppercase tracking-wider font-semibold">{t('auto.onerilen_miktar')}</div>
//                                                 <div className="font-mono font-semibold text-slate-800">{fmtNumber(p.proposedQuantity)}</div>
//                                             </div>
//                                             <div>
//                                                 <div className="text-[10.5px] text-slate-400 uppercase tracking-wider font-semibold">{t('common.date')}</div>
//                                                 <div className="text-slate-700">{dayjs(p.createdAt).format("DD.MM.YYYY HH:mm")}</div>
//                                             </div>
//                                             <div>
//                                                 <div className="text-[10.5px] text-slate-400 uppercase tracking-wider font-semibold">{t('auto.tedarikci')}</div>
//                                                 <div className="text-slate-700">{p.supplierId ||t('auto.atanmadi')}</div>
//                                             </div>
//                                         </div>
//                                     </div>
// 
//                                     <div className="flex flex-col gap-1.5">
//                                         <Button
//                                             variant="primary"
//                                             size="sm"
//                                             icon={<CheckCircle2 size={12} />}
//                                             onClick={() => handle(p.id, true)}
//                                         >{t('common.confirm')}</Button>
//                                         <Button
//                                             variant="ghost"
//                                             size="sm"
//                                             icon={<XCircle size={12} />}
//                                             onClick={() => handle(p.id, false)}
//                                         >{t('auto.reddet')}</Button>
//                                     </div>
//                                 </div>
//                             </div>
//                         ))}
//                     </div>
//                 )}
//             </Card>
//         </div>
//     );
// };
