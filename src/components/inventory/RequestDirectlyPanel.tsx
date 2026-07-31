// ARCHIVED: eski envanter modülü — yeni tablo-tabanlı modül src/pages/inventory altında. Bu dosya devre dışı bırakıldı.
// import { useEffect, useMemo, useState } from 'react';
// import { toast } from 'sonner';
// import dayjs from 'dayjs';
// import {
//     AlertTriangle,
//     ArrowLeft,
//     Mail01 as Mail,
//     Package,
//     Send01 as Send,
// } from '@/components/icons/antIconCompat';
// 
// import { SlidePanel } from '../layout/SlidePanel';
// import { Button } from '../ui-shared/Button';
// import { Field, Input, Textarea } from '../ui-shared/Field';
// 
// import { supplyApi } from '../../lib/api/inventory';
// import type { ItemSupplier, ItemType } from '../../types/inventory';
// 
// import { t } from '@/i18n/translate';
// 
// const fmtMoney = (v: number, currency = 'CHF') =>
//     new Intl.NumberFormat('de-CH', { style: 'currency', currency: currency || 'CHF', maximumFractionDigits: 2 }).format(v);
// 
// const fmtNumber = (v: number) =>
//     new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);
// 
// export interface RequestPanelItem {
//     kind: ItemType;
//     id: string;
//     code: string;
//     name: string;
//     unit: string;
//     /** Talep miktarı için önerilen başlangıç değeri (eksik miktar vb.). */
//     suggestedQuantity?: number;
// }
// 
// interface RequestDirectlyPanelProps {
//     open: boolean;
//     item: RequestPanelItem | null;
//     onClose: () => void;
//     /** Talep başarıyla oluşturulduğunda çağrılır (listeleri yenilemek için). */
//     onRequested?: () => void;
// }
// 
// const buildBody = (name: string, code: string, quantity: number, unit: string, companyName: string) =>
//     t('supply.emailBody', {
//         company: companyName,
//         item: `${name}${code ? ` (${code})` : ''}`,
//         qty: fmtNumber(quantity),
//         unit,
//     });
// 
// /**
//  * Sağdan açılan "Direkt Talep Et" paneli: önce kalemin daha önce alım yaptığı
//  * tedarikçileri (son alım bilgisiyle) listeler; bir tedarikçiye tıklandığında aynı
//  * panel içinde e-posta yazma ekranına geçer (alıcı e-postası otomatik dolu, içerik
//  * üstünde talep miktarı alanı). "Gönder" hem talebi kaydeder hem e-postayı yollar.
//  */
// export const RequestDirectlyPanel = ({ open, item, onClose, onRequested }: RequestDirectlyPanelProps) => {
//     const [loading, setLoading] = useState(false);
//     const [suppliers, setSuppliers] = useState<ItemSupplier[]>([]);
//     const [selected, setSelected] = useState<ItemSupplier | null>(null);
// 
//     const [quantity, setQuantity] = useState(0);
//     const [email, setEmail] = useState('');
//     const [subject, setSubject] = useState('');
//     const [body, setBody] = useState('');
//     const [bodyDirty, setBodyDirty] = useState(false);
//     const [sending, setSending] = useState(false);
// 
//     // Panel her açıldığında / kalem değiştiğinde ilgili tedarikçileri çek.
//     useEffect(() => {
//         if (!open || !item) return;
//         setSelected(null);
//         setLoading(true);
//         supplyApi
//             .itemSuppliers(item.kind, item.id)
//             .then((res) => setSuppliers(res.suppliers))
//             .catch((e: any) => toast.error(e.response?.data?.error || t('supply.suppliersLoadError')))
//             .finally(() => setLoading(false));
//     }, [open, item]);
// 
//     const startEmail = (supplier: ItemSupplier) => {
//         if (!item) return;
//         const initialQty = item.suggestedQuantity && item.suggestedQuantity > 0
//             ? Math.ceil(item.suggestedQuantity)
//             : (supplier.lastPurchaseQuantity && supplier.lastPurchaseQuantity > 0 ? supplier.lastPurchaseQuantity : 1);
//         setSelected(supplier);
//         setQuantity(initialQty);
//         setEmail(supplier.email || '');
//         setSubject(t('supply.subjectPrefix', { name: item.name }));
//         setBody(buildBody(item.name, item.code, initialQty, item.unit, supplier.companyName));
//         setBodyDirty(false);
//     };
// 
//     // Kullanıcı gövdeyi elle düzenlemediyse, miktar değiştikçe gövdeyi tazele.
//     useEffect(() => {
//         if (!selected || !item || bodyDirty) return;
//         setBody(buildBody(item.name, item.code, quantity, item.unit, selected.companyName));
//     }, [quantity, selected, item, bodyDirty]);
// 
//     const submit = async (sendEmail: boolean) => {
//         if (!item || !selected) return;
//         if (!(quantity > 0)) {
//             toast.error(t('supply.qtyError'));
//             return;
//         }
//         if (sendEmail && !email.trim()) {
//             toast.error(t('supply.recipientError'));
//             return;
//         }
//         setSending(true);
//         try {
//             const res = await supplyApi.createRequest({
//                 itemType: item.kind,
//                 articleId: item.kind === 'PRODUCT' ? item.id : null,
//                 materialId: item.kind === 'MATERIAL' ? item.id : null,
//                 itemName: item.name,
//                 itemCode: item.code,
//                 unit: item.unit,
//                 supplierId: selected.supplierId,
//                 supplierName: selected.companyName,
//                 supplierEmail: email.trim() || null,
//                 requestedQuantity: quantity,
//                 emailSubject: subject,
//                 emailBody: body,
//                 sendEmail,
//             });
//             if (sendEmail) {
//                 toast.success(res.emailPreview ? t('supply.savedPreview') : t('supply.savedAndSent'));
//             } else {
//                 toast.success(t('supply.saved'));
//             }
//             onRequested?.();
//             onClose();
//         } catch (e: any) {
//             toast.error(e.response?.data?.error || t('supply.createError'));
//         } finally {
//             setSending(false);
//         }
//     };
// 
//     const subtitle = useMemo(() => {
//         if (!item) return '';
//         return `${item.name}${item.code ? ` · ${item.code}` : ''}`;
//     }, [item]);
// 
//     return (
//         <SlidePanel
//             open={open}
//             onClose={onClose}
//             title={selected ? t('supply.panelEmailTitle') : t('supply.panelRequestTitle')}
//             subtitle={subtitle}
//             width={selected ? 560 : 480}
//         >
//             {!selected ? (
//                 // ---- Tedarikçi listesi görünümü ----
//                 <div>
//                     <div className="mb-3 text-[12.5px] text-slate-500">
//                         {t('supply.supplierListHint')}
//                     </div>
//                     {loading ? (
//                         <div className="space-y-2">
//                             {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-md bg-slate-100" />)}
//                         </div>
//                     ) : suppliers.length === 0 ? (
//                         <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-200 px-4 py-10 text-center">
//                             <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-slate-100 text-slate-400">
//                                 <AlertTriangle size={20} />
//                             </div>
//                             <div className="text-[13px] font-semibold text-slate-800">{t('supply.noSupplierTitle')}</div>
//                             <div className="mt-1 text-[12px] text-slate-500">
//                                 {item?.kind === 'MATERIAL'
//                                     ? t('supply.noSupplierMaterialDesc')
//                                     : t('supply.noSupplierProductDesc')}
//                             </div>
//                         </div>
//                     ) : (
//                         <div className="space-y-2">
//                             {suppliers.map((s) => (
//                                 <button
//                                     key={s.supplierId}
//                                     type="button"
//                                     onClick={() => startEmail(s)}
//                                     className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-100"
//                                 >
//                                     <div className="min-w-0">
//                                         <div className="truncate text-[13px] font-semibold text-slate-800">{s.companyName}</div>
//                                         <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-slate-500">
//                                             <Mail size={11} />
//                                             <span className="truncate">{s.email || t('supply.emailUndefined')}</span>
//                                         </div>
//                                         {s.lastPurchaseDate && (
//                                             <div className="mt-1 text-[11px] text-slate-500">
//                                                 {t('supply.lastPurchaseLabel')} {dayjs(s.lastPurchaseDate).format('DD.MM.YYYY')}
//                                                 {s.lastPurchasePrice != null && (
//                                                     <> · {fmtMoney(s.lastPurchasePrice, s.currency || 'CHF')}</>
//                                                 )}
//                                                 {s.lastPurchaseQuantity != null && (
//                                                     <> · {fmtNumber(s.lastPurchaseQuantity)} {item?.unit}</>
//                                                 )}
//                                             </div>
//                                         )}
//                                     </div>
//                                     <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-500">
//                                         {s.purchaseCount > 0 ? t('supply.purchaseCount', { count: s.purchaseCount }) : t('supply.newSupplier')}
//                                     </span>
//                                 </button>
//                             ))}
//                         </div>
//                     )}
//                 </div>
//             ) : (
//                 // ---- E-posta yazma görünümü ----
//                 <div className="space-y-4">
//                     <button
//                         type="button"
//                         onClick={() => setSelected(null)}
//                         className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:text-blue-900"
//                     >
//                         <ArrowLeft size={13} /> {t('supply.backToList')}
//                     </button>
// 
//                     <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2">
//                         <span className="flex size-8 items-center justify-center rounded-md bg-white text-slate-400 ring-1 ring-slate-200">
//                             <Package size={15} />
//                         </span>
//                         <div className="min-w-0">
//                             <div className="truncate text-[13px] font-semibold text-slate-800">{selected.companyName}</div>
//                             <div className="truncate font-mono text-[11px] text-slate-500">{selected.email || t('supply.emailUndefined')}</div>
//                         </div>
//                     </div>
// 
//                     {/* Talep miktarı — e-posta içeriğinin ÜSTÜNDE */}
//                     <Field label={t('supply.qtyLabel')} required hint={t('supply.unitHint', { unit: item?.unit ?? '' })}>
//                         <Input
//                             size="sm"
//                             type="number"
//                             min={0}
//                             step="0.01"
//                             value={quantity}
//                             onChange={(e) => setQuantity(Number(e.target.value) || 0)}
//                         />
//                     </Field>
// 
//                     <Field label={t('supply.recipientLabel')} required hint={t('supply.recipientHint')}>
//                         <Input
//                             size="sm"
//                             type="email"
//                             value={email}
//                             onChange={(e) => setEmail(e.target.value)}
//                             placeholder={t('supply.recipientPlaceholder')}
//                         />
//                     </Field>
// 
//                     <Field label={t('supply.subjectLabel')}>
//                         <Input size="sm" value={subject} onChange={(e) => setSubject(e.target.value)} />
//                     </Field>
// 
//                     <Field label={t('supply.bodyLabel')}>
//                         <Textarea
//                             size="sm"
//                             rows={9}
//                             value={body}
//                             onChange={(e) => { setBody(e.target.value); setBodyDirty(true); }}
//                         />
//                     </Field>
// 
//                     <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
//                         <Button variant="secondary" size="sm" disabled={sending} onClick={() => submit(false)}>
//                             {t('supply.saveOnly')}
//                         </Button>
//                         <Button
//                             variant="primary"
//                             size="sm"
//                             icon={<Send size={13} />}
//                             loading={sending}
//                             disabled={!email.trim()}
//                             onClick={() => submit(true)}
//                         >
//                             {t('supply.saveAndSend')}
//                         </Button>
//                     </div>
//                 </div>
//             )}
//         </SlidePanel>
//     );
// };
