// ARCHIVED: eski envanter modülü — yeni tablo-tabanlı modül src/pages/inventory altında. Bu dosya devre dışı bırakıldı.
// import { useEffect, useRef, useState } from 'react';
// import { useSearchParams, useLocation } from 'react-router-dom';
// import { toast } from 'sonner';
// import dayjs from 'dayjs';
// import {
//     ArrowDown as ArrowDownToLine,
//     ArrowUp as ArrowUpFromLine,
//     ClockRewind as History,
//     Package,
//     Save01 as Save,
//     Scan as ScanLine,
//     SearchLg as Search,
//     Sliders02 as SlidersHorizontal,
// } from '@/components/icons/antIconCompat';
// 
// import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
// import { Card } from '../../components/ui-shared/Card';
// import { Button } from '../../components/ui-shared/Button';
// import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
// import { EmptyState } from '../../components/ui-shared/EmptyState';
// import { StatusChip } from '../../components/ui-shared/StatusBadge';
// 
// import { useInventoryStore } from '../../store/inventoryStore';
// import { inventoryApi, articleApi } from '../../lib/api/inventory';
// import type { ArticleStockInfo, ArticleStockSummary, MovementType, SearchItem, SupplierRow } from '../../types/inventory';
// 
// import { t } from '@/i18n/translate';
// 
// const BRAND = '#272f67';
// 
// // Düzeltme (ADJUSTMENT) kaldırıldı: yalnızca giriş ve çıkış hareketleri.
// const ACTIVE_MOVEMENT_TYPES: MovementType[] = ['IN', 'OUT'];
// 
// const MOVEMENT_LABEL: Record<MovementType, string> = {
//     IN: t('dashboard.colCheckIn'),
//     OUT: t('dashboard.colCheckOut'),
//     TRANSFER: t('auto.transfer'),
//     RETURN: t('auto.iade'),
//     ADJUSTMENT: t('auto.duzeltme'),
// };
// 
// const MOVEMENT_VARIANT: Record<MovementType, 'active' | 'danger' | 'info' | 'warning' | 'neutral'> = {
//     IN: 'active',
//     OUT: 'danger',
//     TRANSFER: 'info',
//     RETURN: 'warning',
//     ADJUSTMENT: 'neutral',
// };
// 
// const MOVEMENT_ICON: Record<MovementType, React.ReactNode> = {
//     IN: <ArrowDownToLine size={12} />,
//     OUT: <ArrowUpFromLine size={12} />,
//     TRANSFER: <SlidersHorizontal size={12} />,
//     RETURN: <ArrowDownToLine size={12} />,
//     ADJUSTMENT: <SlidersHorizontal size={12} />,
// };
// 
// const fmtNumber = (v: number) =>
//     new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);
// 
// const fmtMoney = (v: number) =>
//     new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', minimumFractionDigits: 2 }).format(v || 0);
// 
// // Ürün özet kaydını birleşik arama kalemine çevirir (yukarı/aşağı ikonundan ön seçim için).
// const toSearchItem = (a: ArticleStockSummary): SearchItem => ({
//     kind: 'PRODUCT',
//     id: a.id,
//     code: a.articleCode,
//     name: a.name,
//     unit: a.unit,
//     salePrice: Number(a.salePrice || 0),
//     baseCost: Number(a.baseCost || 0),
//     imageUrl: a.imageUrl ?? null,
//     itemType: a.itemType,
//     minStockLevel: a.minStockLevel,
//     criticalStockLevel: a.criticalStockLevel,
//     maxStockLevel: a.maxStockLevel ?? null,
//     stockQuantity: a.totalQuantity,
// });
// 
// type FormTab = 'movement' | 'settings';
// type CardTab = 'general' | 'avgcost';
// 
// // Küçük, modül içi sekme şeridi.
// const TabStrip = <T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) => (
//     <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
//         {tabs.map((tab) => (
//             <button
//                 key={tab.key}
//                 type="button"
//                 onClick={() => onChange(tab.key)}
//                 className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
//                     value === tab.key ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
//                 }`}
//                 style={value === tab.key ? { color: BRAND } : undefined}
//             >
//                 {tab.label}
//             </button>
//         ))}
//     </div>
// );
// 
// export const Movements = () => {
//     const [searchParams, setSearchParams] = useSearchParams();
//     const location = useLocation();
//     const { movements, fetchMovements, scanMovement, articles, fetchArticlesSummary } = useInventoryStore();
// 
//     const [formTab, setFormTab] = useState<FormTab>('movement');
//     const [cardTab, setCardTab] = useState<CardTab>('general');
// 
//     // Birleşik ürün + malzeme araması
//     const [query, setQuery] = useState('');
//     const [results, setResults] = useState<SearchItem[]>([]);
//     const [searching, setSearching] = useState(false);
//     const [dropdownOpen, setDropdownOpen] = useState(false);
//     const [selected, setSelected] = useState<SearchItem | null>(null);
// 
//     const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
// 
//     // Seçili ürünün yalın canlı stok bilgisi (sayaç + ortalama maliyet). Depo verisi
//     // içermez; her hareketten sonra tek uçtan hızlıca yenilenir.
//     const [stockInfo, setStockInfo] = useState<ArticleStockInfo | null>(null);
// 
//     const [form, setForm] = useState<{
//         movementType: MovementType;
//         quantity: number;
//         unitCost: string;
//         salePrice: string;
//         supplierId: string;
//         description: string;
//     }>({
//         movementType: 'IN',
//         quantity: 1,
//         unitCost: '',
//         salePrice: '',
//         supplierId: '',
//         description: '',
//     });
// 
//     // Seçili ürünün stok ayarları (ayrı sekmede düzenlenir)
//     const [settings, setSettings] = useState({ minStockLevel: 0, criticalStockLevel: 0, maxStockLevel: '' as number | '' });
//     const [savingSettings, setSavingSettings] = useState(false);
//     const [submitting, setSubmitting] = useState(false);
// 
//     const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//     const prefillApplied = useRef(false);
// 
//     useEffect(() => {
//         inventoryApi.listSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
//     }, []);
// 
//     const preselectId = searchParams.get('item');
// 
//     // Ağır ürün özeti (tüm tenant + depo bakiyeleri) yalnızca Ürünler sayfasından
//     // gelen ön seçim (?item=) varsa çekilir; normal arama akışında hiç yüklenmez.
//     useEffect(() => {
//         if (preselectId && articles.length === 0) fetchArticlesSummary();
//     }, [preselectId, articles.length, fetchArticlesSummary]);
// 
//     // Otomatik arama (debounce) — alış/çıkış hareketlerinde ürün ve malzeme birlikte aranır.
//     useEffect(() => {
//         if (searchTimer.current) clearTimeout(searchTimer.current);
//         if (!query.trim()) {
//             setResults([]);
//             return;
//         }
//         setSearching(true);
//         searchTimer.current = setTimeout(async () => {
//             try {
//                 const items = await inventoryApi.searchItems(query.trim());
//                 setResults(items);
//                 setDropdownOpen(true);
//             } catch {
//                 setResults([]);
//             } finally {
//                 setSearching(false);
//             }
//         }, 250);
//         return () => {
//             if (searchTimer.current) clearTimeout(searchTimer.current);
//         };
//     }, [query]);
// 
//     // Seçili ürünün canlı stok bilgisini (sayaç + ortalama maliyet) yalın uçtan çeker.
//     const refreshStockInfo = (articleId: string) => {
//         void inventoryApi.getArticleStock(articleId).then(setStockInfo).catch(() => setStockInfo(null));
//     };
// 
//     const selectItem = (item: SearchItem) => {
//         setSelected(item);
//         setQuery(`${item.name} · ${item.code}`);
//         setDropdownOpen(false);
//         setResults([]);
//         setStockInfo(null);
//         if (item.kind === 'PRODUCT') {
//             fetchMovements(item.id);
//             refreshStockInfo(item.id);
//             setSettings({
//                 minStockLevel: item.minStockLevel ?? 0,
//                 criticalStockLevel: item.criticalStockLevel ?? 0,
//                 maxStockLevel: item.maxStockLevel == null ? '' : item.maxStockLevel,
//             });
//         }
//     };
// 
//     const clearSelection = () => {
//         setSelected(null);
//         setQuery('');
//         setResults([]);
//         setStockInfo(null);
//     };
// 
//     // Ürün listesi (Stok > Ürünler) sayfasındaki yukarı/aşağı ikonundan gelen ön seçim.
//     useEffect(() => {
//         if (!preselectId || articles.length === 0) return;
//         const article = articles.find((a) => a.id === preselectId);
//         if (!article) return;
//         // eslint-disable-next-line react-hooks/set-state-in-effect -- URL param ile gelen ön seçimi senkronize eder
//         selectItem(toSearchItem(article));
//         setCardTab('general');
//         searchParams.delete('item');
//         setSearchParams(searchParams, { replace: true });
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [preselectId, articles]);
// 
//     // Tedarik Talepleri ekranındaki "yukarı ok" buradan gelir: ürün/malzeme, miktar ve
//     // tedarikçi router state ile önceden dolu gelir; giriş (IN) hareketi seçili olur ve
//     // kullanıcının yalnızca alış fiyatını girip kaydetmesi yeterlidir.
//     useEffect(() => {
//         const pre = (location.state as { supplyPrefill?: {
//             kind: 'PRODUCT' | 'MATERIAL'; id: string; code: string; name: string; unit?: string; quantity?: number; supplierId?: string;
//         } } | null)?.supplyPrefill;
//         if (!pre || prefillApplied.current) return;
//         prefillApplied.current = true;
//         selectItem({
//             kind: pre.kind,
//             id: pre.id,
//             code: pre.code,
//             name: pre.name,
//             unit: pre.unit || undefined,
//             salePrice: 0,
//             itemType: pre.kind,
//         });
//         setFormTab('movement');
//         setCardTab('general');
//         setForm((f) => ({
//             ...f,
//             movementType: 'IN',
//             quantity: pre.quantity && pre.quantity > 0 ? pre.quantity : 1,
//             supplierId: pre.supplierId || '',
//         }));
//         // State'i temizle ki sayfa yenilenince prefill tekrar uygulanmasın.
//         window.history.replaceState({}, document.title);
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [location.state]);
// 
//     const isMaterial = selected?.kind === 'MATERIAL';
//     const isInbound = form.movementType === 'IN';
// 
//     const handleSubmit = async () => {
//         if (!selected) {
//             toast.error(t('auto.barkod_veya_stok_kodu_girin'));
//             return;
//         }
//         if (form.quantity <= 0) {
//             toast.error(t('auto.miktar_0_dan_buyuk_olmali'));
//             return;
//         }
// 
//         // Malzemelerde yalnızca satış fiyatı; ürünlerde alış birim maliyeti.
//         const priceRaw = isMaterial ? form.salePrice : form.unitCost;
//         const parsedPrice = Number(priceRaw.replace(',', '.'));
//         const price = isInbound && priceRaw.trim() !== '' && Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;
// 
//         setSubmitting(true);
//         try {
//             const movement = await scanMovement({
//                 codeOrBarcode: selected.code,
//                 movementType: form.movementType,
//                 quantity: form.quantity,
//                 unitCost: price,
//                 itemKind: selected.kind,
//                 materialId: isMaterial ? selected.id : null,
//                 supplierId: !isMaterial && form.supplierId ? form.supplierId : null,
//                 description: form.description || null,
//             });
//             toast.success(t('auto.stok_hareketi_kaydedildi'));
//             if (selected.kind === 'PRODUCT') {
//                 // Yalnızca ilgili ürünün hareket geçmişi ve yalın stok bilgisi yenilenir.
//                 fetchMovements(selected.id);
//                 refreshStockInfo(selected.id);
//             } else {
//                 // Malzeme hareketinde yanıt güncel stok adedini taşır — sayacı anında güncelle.
//                 const nextQty = (movement as unknown as { stockQuantity?: number }).stockQuantity;
//                 if (typeof nextQty === 'number') {
//                     setSelected((p) => (p ? { ...p, stockQuantity: nextQty } : p));
//                 }
//             }
//             setForm((p) => ({ ...p, quantity: 1, unitCost: '', salePrice: '', description: '' }));
//         } catch (e: any) {
//             toast.error(e.response?.data?.error || t('auto.hareket_basarisiz'));
//         } finally {
//             setSubmitting(false);
//         }
//     };
// 
//     const saveSettings = async () => {
//         if (!selected || selected.kind !== 'PRODUCT') return;
//         setSavingSettings(true);
//         try {
//             await articleApi.update(selected.id, {
//                 minStockLevel: Number(settings.minStockLevel) || 0,
//                 criticalStockLevel: Number(settings.criticalStockLevel) || 0,
//                 maxStockLevel: settings.maxStockLevel === '' ? null : Number(settings.maxStockLevel),
//             });
//             toast.success('Stok ayarları kaydedildi.');
//             setSelected({
//                 ...selected,
//                 minStockLevel: Number(settings.minStockLevel) || 0,
//                 criticalStockLevel: Number(settings.criticalStockLevel) || 0,
//                 maxStockLevel: settings.maxStockLevel === '' ? null : Number(settings.maxStockLevel),
//             });
//         } catch (e: any) {
//             toast.error(e.response?.data?.error || t('common.error'));
//         } finally {
//             setSavingSettings(false);
//         }
//     };
// 
//     return (
//         <div>
//             <InventoryListHeader title={t('nav.movements')} />
// 
//             {/* Seçili kalem her zaman görünür. */}
//             {selected && (
//                 <div className="mb-4 flex items-center gap-3 rounded-md border border-emerald-200/60 bg-emerald-50/60 p-2.5">
//                     {selected.imageUrl ? (
//                         <img src={selected.imageUrl} alt="" className="h-10 w-10 rounded object-cover border border-white" />
//                     ) : (
//                         <div className="flex h-10 w-10 items-center justify-center rounded border border-emerald-200 bg-white/70 text-emerald-700">
//                             <Package size={14} />
//                         </div>
//                     )}
//                     <div className="min-w-0 flex-1">
//                         <div className="truncate text-[12.5px] font-semibold text-emerald-900">{selected.name}</div>
//                         <div className="text-[10.5px] font-mono text-emerald-700/80">
//                             {selected.code}{selected.unit ? ` · ${selected.unit}` : ''} · {selected.kind === 'MATERIAL' ? t('nav.materials') : t('nav.articles')}
//                         </div>
//                     </div>
//                     <button type="button" onClick={clearSelection} className="text-[11px] text-emerald-700/70 hover:text-emerald-900">{t('common.clear')}</button>
//                 </div>
//             )}
// 
//             {/* Bölünmüş görünüm: sol = hareket girişi + (ayrı sekme) stok ayarları, sağ = her zaman görünür ana kart. */}
//             <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
//                 {/* Sol: form kartı, içinde "Yeni Hareket" ve "Stok Ayarları" sekmeleri. */}
//                 <div className="lg:col-span-5">
//                     <Card
//                         title={t('auto.yeni_stok_hareketi')}
//                         icon={<ScanLine size={13} />}
//                         actions={
//                             <TabStrip
//                                 tabs={[
//                                     { key: 'movement', label: t('auto.yeni_stok_hareketi') },
//                                     { key: 'settings', label: t('auto.stok_ayarlari') },
//                                 ]}
//                                 value={formTab}
//                                 onChange={setFormTab}
//                             />
//                         }
//                     >
//                         {formTab === 'movement' ? (
//                             <div className="space-y-3">
//                                 {/* Birleşik ürün + malzeme arama kutusu */}
//                                 <Field label={t('auto.barkod_stok_kodu')} required>
//                                     <div className="relative">
//                                         <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
//                                         <Input
//                                             value={query}
//                                             onChange={(e) => {
//                                                 setQuery(e.target.value);
//                                                 if (selected) setSelected(null);
//                                             }}
//                                             onFocus={() => results.length > 0 && setDropdownOpen(true)}
//                                             placeholder={'Ürün veya malzeme ara (ad, kod, barkod)'}
//                                             className="pl-7"
//                                             autoFocus
//                                         />
//                                         {dropdownOpen && (results.length > 0 || searching) && (
//                                             <div className="absolute z-20 mt-1 w-full max-h-[280px] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
//                                                 {searching && results.length === 0 && (
//                                                     <div className="px-3 py-2 text-[12px] text-slate-400">{t('common.loading')}</div>
//                                                 )}
//                                                 {results.map((item) => (
//                                                     <button
//                                                         key={`${item.kind}-${item.id}`}
//                                                         type="button"
//                                                         onClick={() => selectItem(item)}
//                                                         className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 border-b border-slate-50 last:border-0"
//                                                     >
//                                                         {item.imageUrl ? (
//                                                             <img src={item.imageUrl} alt="" className="w-8 h-8 rounded object-cover border border-slate-200" />
//                                                         ) : (
//                                                             <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400">
//                                                                 <Package size={13} />
//                                                             </div>
//                                                         )}
//                                                         <div className="min-w-0 flex-1">
//                                                             <div className="text-[12.5px] font-medium text-slate-800 truncate">{item.name}</div>
//                                                             <div className="text-[10.5px] font-mono text-slate-500">{item.code}</div>
//                                                         </div>
//                                                         <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${item.kind === 'MATERIAL' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'}`}>
//                                                             {item.kind === 'MATERIAL' ? t('nav.materials') : t('nav.articles')}
//                                                         </span>
//                                                     </button>
//                                                 ))}
//                                                 {!searching && results.length === 0 && (
//                                                     <div className="px-3 py-2 text-[12px] text-slate-400">{t('auto.arama_sonucu_yok')}</div>
//                                                 )}
//                                             </div>
//                                         )}
//                                     </div>
//                                 </Field>
// 
//                                 <Field label={t('auto.hareket_tipi')} required>
//                                     <div className="grid grid-cols-2 gap-1.5">
//                                         {ACTIVE_MOVEMENT_TYPES.map((mt) => (
//                                             <button
//                                                 key={mt}
//                                                 type="button"
//                                                 onClick={() => setForm({ ...form, movementType: mt })}
//                                                 className={`flex flex-col items-center gap-1 py-2 rounded text-[10.5px] font-medium border ${
//                                                     form.movementType === mt
//                                                         ? 'border-blue-700 bg-blue-50 text-blue-800'
//                                                         : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
//                                                 }`}
//                                             >
//                                                 {MOVEMENT_ICON[mt]}
//                                                 {MOVEMENT_LABEL[mt]}
//                                             </button>
//                                         ))}
//                                     </div>
//                                 </Field>
// 
//                                 <Field label={t('common.quantity')} required>
//                                     <Input
//                                         type="number"
//                                         step="1"
//                                         min={1}
//                                         value={form.quantity}
//                                         onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })}
//                                     />
//                                 </Field>
// 
//                                 {/* Malzeme: yalnızca satış fiyatı. Ürün: alış birim maliyeti + tedarikçi. */}
//                                 {isInbound && isMaterial && (
//                                     <Field label={'Satış Fiyatı (CHF)'}>
//                                         <Input
//                                             type="number"
//                                             step="0.01"
//                                             min={0}
//                                             value={form.salePrice}
//                                             onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
//                                             placeholder={selected ? fmtMoney(selected.salePrice) : '0.00'}
//                                         />
//                                     </Field>
//                                 )}
// 
//                                 {isInbound && !isMaterial && (
//                                     <>
//                                         <Field label={t('auto.birim_maliyet_chf')} hint={t('auto.bu_partinin_alis_birim_maliyeti_agirlikli_ortala')}>
//                                             <Input
//                                                 type="number"
//                                                 step="0.01"
//                                                 min={0}
//                                                 value={form.unitCost}
//                                                 onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
//                                                 placeholder={t('auto.orn_12_50')}
//                                             />
//                                         </Field>
//                                         <Field label={t('nav.suppliers')}>
//                                             <Select
//                                                 className="w-full"
//                                                 value={form.supplierId}
//                                                 onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
//                                             >
//                                                 <option value="">{t('common.select')}</option>
//                                                 {suppliers.map((s) => (
//                                                     <option key={s.id} value={s.id}>{s.companyName}</option>
//                                                 ))}
//                                             </Select>
//                                         </Field>
//                                     </>
//                                 )}
// 
//                                 <Field label={t('auto.not_aciklama')}>
//                                     <Textarea
//                                         rows={2}
//                                         value={form.description}
//                                         onChange={(e) => setForm({ ...form, description: e.target.value })}
//                                         placeholder={t('auto.opsiyonel_neden_atif_vb')}
//                                     />
//                                 </Field>
// 
//                                 <Button
//                                     variant="primary"
//                                     icon={<ScanLine size={13} />}
//                                     loading={submitting}
//                                     onClick={handleSubmit}
//                                     className="w-full"
//                                 >{t('auto.hareketi_kaydet')}</Button>
//                             </div>
//                         ) : (
//                             /* Stok ayarları — ayrı sekme (yalnızca ürünler). */
//                             selected && selected.kind === 'PRODUCT' ? (
//                                 <div className="space-y-3">
//                                     <Field label={t('auto.minimum')}>
//                                         <Input type="number" step="1" min={0} value={settings.minStockLevel}
//                                             onChange={(e) => setSettings({ ...settings, minStockLevel: Number(e.target.value) || 0 })} />
//                                     </Field>
//                                     <Field label={t('auto.kritik_esik')}>
//                                         <Input type="number" step="1" min={0} value={settings.criticalStockLevel}
//                                             onChange={(e) => setSettings({ ...settings, criticalStockLevel: Number(e.target.value) || 0 })} />
//                                     </Field>
//                                     <Field label={t('auto.maksimum')}>
//                                         <Input type="number" step="1" min={0} value={settings.maxStockLevel}
//                                             onChange={(e) => setSettings({ ...settings, maxStockLevel: e.target.value === '' ? '' : Number(e.target.value) })} />
//                                     </Field>
//                                     <Button variant="secondary" icon={<Save size={13} />} loading={savingSettings} onClick={saveSettings} className="w-full">
//                                         {t('common.save')}
//                                     </Button>
//                                 </div>
//                             ) : (
//                                 <EmptyState
//                                     icon={<SlidersHorizontal size={28} />}
//                                     title={t('auto.once_bir_urun_secin')}
//                                     description={t('auto.barkod_veya_stok_kodunu_girip_tab_a_basin_gecmis')}
//                                 />
//                             )
//                         )}
//                     </Card>
//                 </div>
// 
//                 {/* Sağ: her zaman görünür ana kart — Genel Bilgi (varsayılan) + Ortalama Maliyet sekmeleri. */}
//                 <div className="lg:col-span-7">
//                     <Card
//                         title={t('auto.hareket_gecmisi')}
//                         icon={<History size={13} />}
//                         noPadding
//                         actions={
//                             <TabStrip
//                                 tabs={[
//                                     { key: 'general', label: 'General Info' },
//                                     { key: 'avgcost', label: 'Average Cost Calculation' },
//                                 ]}
//                                 value={cardTab}
//                                 onChange={setCardTab}
//                             />
//                         }
//                     >
//                         {!selected ? (
//                             <EmptyState
//                                 icon={<History size={28} />}
//                                 title={t('auto.once_bir_urun_secin')}
//                                 description={t('auto.barkod_veya_stok_kodunu_girip_tab_a_basin_gecmis')}
//                             />
//                         ) : cardTab === 'general' ? (
//                             <GeneralInfoTab selected={selected} stockInfo={stockInfo} movements={movements} />
//                         ) : (
//                             <AverageCostTab selected={selected} stockInfo={stockInfo} />
//                         )}
//                     </Card>
//                 </div>
//             </div>
//         </div>
//     );
// };
// 
// // Genel Bilgi sekmesi: ad + toplam adet (ana görünüm) ve hareket dökümü. Ürün ve malzemeyi kapsar.
// const GeneralInfoTab = ({
//     selected,
//     stockInfo,
//     movements,
// }: {
//     selected: SearchItem;
//     stockInfo: ArticleStockInfo | null;
//     movements: ReturnType<typeof useInventoryStore.getState>['movements'];
// }) => {
//     const totalQuantity = stockInfo?.totalQuantity ?? selected.stockQuantity ?? 0;
//     return (
//         <div>
//             <div className="flex items-center gap-4 border-b border-slate-100 p-4">
//                 {selected.imageUrl ? (
//                     <img src={selected.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover border border-slate-200" />
//                 ) : (
//                     <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
//                         <Package size={20} />
//                     </div>
//                 )}
//                 <div className="min-w-0 flex-1">
//                     <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
//                         {selected.kind === 'MATERIAL' ? t('nav.materials') : t('nav.articles')}
//                     </div>
//                     <div className="truncate text-[18px] font-semibold text-slate-900">{selected.name}</div>
//                     <div className="text-[11.5px] font-mono text-slate-500">{selected.code}</div>
//                 </div>
//                 <div className="text-right">
//                     <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('auto.toplam_adet')}</div>
//                     <div className="text-[22px] font-semibold tabular-nums" style={{ color: BRAND }}>
//                         {fmtNumber(totalQuantity)} <span className="text-[13px] text-slate-400">{selected.unit ?? ''}</span>
//                     </div>
//                 </div>
//             </div>
// 
//             {selected.kind !== 'PRODUCT' ? (
//                 <p className="px-4 py-4 text-[12.5px] text-slate-500">
//                     {t('nav.materials')} · {t('auto.mevcut_miktar')}: <span className="font-mono font-semibold text-slate-800">{fmtNumber(totalQuantity)}</span>
//                 </p>
//             ) : movements.length === 0 ? (
//                 <EmptyState
//                     icon={<History size={28} />}
//                     title={t('auto.henuz_hareket_yok')}
//                     description={t('auto.yeni_hareket_kaydedince_burada_gorunecek')}
//                 />
//             ) : (
//                 <div>
//                     <table className="w-full text-[12.5px]">
//                         <thead className="sticky top-0 border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
//                             <tr>
//                                 <th className="px-3 py-2 text-left font-semibold">{t('common.date')}</th>
//                                 <th className="px-3 py-2 text-left font-semibold">{t('auto.tip')}</th>
//                                 <th className="px-3 py-2 text-right font-semibold">{t('common.quantity')}</th>
//                                 <th className="px-3 py-2 text-right font-semibold">{t('auto.birim_maliyet')}</th>
//                                 <th className="px-3 py-2 text-left font-semibold">{t('nav.suppliers')}</th>
//                                 <th className="px-3 py-2 text-left font-semibold">{t('iam.roles.colUsers')}</th>
//                                 <th className="px-3 py-2 text-left font-semibold">{t('common.description')}</th>
//                             </tr>
//                         </thead>
//                         <tbody className="divide-y divide-slate-100">
//                             {movements.map((m) => (
//                                 <tr key={m.id}>
//                                     <td className="px-3 py-2 text-slate-500 text-[11.5px] whitespace-nowrap">
//                                         {dayjs(m.transactionDate).format('DD.MM.YYYY HH:mm')}
//                                     </td>
//                                     <td className="px-3 py-2">
//                                         <StatusChip variant={MOVEMENT_VARIANT[m.movementType]}>
//                                             <span className="inline-flex items-center gap-1">
//                                                 {MOVEMENT_ICON[m.movementType]}
//                                                 {MOVEMENT_LABEL[m.movementType]}
//                                             </span>
//                                         </StatusChip>
//                                     </td>
//                                     <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">
//                                         {fmtNumber(m.quantity)}
//                                     </td>
//                                     <td className="px-3 py-2 text-right font-mono text-[11.5px] text-slate-600">
//                                         {m.unitCost != null && m.unitCost > 0 ? fmtMoney(m.unitCost) : '—'}
//                                     </td>
//                                     <td className="px-3 py-2 text-slate-600 text-[11.5px]">
//                                         {m.supplier?.companyName || '—'}
//                                     </td>
//                                     <td className="px-3 py-2 text-slate-700 text-[11.5px]">
//                                         {m.employee ? `${m.employee.firstName} ${m.employee.lastName}` : m.employeeId}
//                                     </td>
//                                     <td className="px-3 py-2 text-slate-600 text-[11.5px] max-w-[220px] truncate">
//                                         {m.description || '—'}
//                                     </td>
//                                 </tr>
//                             ))}
//                         </tbody>
//                     </table>
//                 </div>
//             )}
//         </div>
//     );
// };
// 
// // Ortalama Maliyet Hesabı sekmesi: ağırlıklı ortalama maliyetin nasıl oluştuğu.
// const AverageCostTab = ({ selected, stockInfo }: { selected: SearchItem; stockInfo: ArticleStockInfo | null }) => {
//     if (selected.kind !== 'PRODUCT' || !stockInfo) {
//         return (
//             <EmptyState
//                 icon={<SlidersHorizontal size={28} />}
//                 title={t('nav.materials')}
//                 description={t('auto.bu_urunun_tum_hareketleri_ve_denetim_izi')}
//             />
//         );
//     }
// 
//     const rows = [
//         { label: 'Supplier purchases', qty: Number(stockInfo.supplierCostQuantity ?? 0), value: Number(stockInfo.supplierCostValue ?? 0) },
//         { label: 'Manual entries', qty: Number(stockInfo.manualCostQuantity ?? 0), value: Number(stockInfo.manualCostValue ?? 0) },
//     ];
//     const totalQty = Number(stockInfo.costBasisQuantity ?? rows.reduce((s, r) => s + r.qty, 0));
//     const totalValue = Number(stockInfo.costBasisValue ?? rows.reduce((s, r) => s + r.value, 0));
//     const weightedAvg = Number(stockInfo.weightedAverageCost ?? (totalQty > 0 ? totalValue / totalQty : 0));
// 
//     return (
//         <div className="overflow-x-auto">
//             <table className="w-full text-[12.5px]">
//                 <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
//                     <tr>
//                         <th className="px-3 py-2 text-left font-semibold">Source</th>
//                         <th className="px-3 py-2 text-right font-semibold">{t('common.quantity')}</th>
//                         <th className="px-3 py-2 text-right font-semibold">Total value</th>
//                         <th className="px-3 py-2 text-right font-semibold">{t('auto.ort_maliyet')}</th>
//                     </tr>
//                 </thead>
//                 <tbody className="divide-y divide-slate-100">
//                     {rows.map((r) => (
//                         <tr key={r.label}>
//                             <td className="px-3 py-2 text-slate-700">{r.label}</td>
//                             <td className="px-3 py-2 text-right font-mono text-slate-600">{fmtNumber(r.qty)}</td>
//                             <td className="px-3 py-2 text-right font-mono text-slate-600">{fmtMoney(r.value)}</td>
//                             <td className="px-3 py-2 text-right font-mono text-slate-500">{r.qty > 0 ? fmtMoney(r.value / r.qty) : '—'}</td>
//                         </tr>
//                     ))}
//                     <tr className="bg-slate-50/40 font-semibold" style={{ color: BRAND }}>
//                         <td className="px-3 py-2">Weighted average</td>
//                         <td className="px-3 py-2 text-right font-mono">{fmtNumber(totalQty)}</td>
//                         <td className="px-3 py-2 text-right font-mono">{fmtMoney(totalValue)}</td>
//                         <td className="px-3 py-2 text-right font-mono">{fmtMoney(weightedAvg)}</td>
//                     </tr>
//                 </tbody>
//             </table>
//             <p className="px-3 py-3 text-[11px] text-slate-400">
//                 Weighted average = total value ÷ total quantity = {fmtMoney(totalValue)} ÷ {fmtNumber(totalQty)} = <span className="font-semibold" style={{ color: BRAND }}>{fmtMoney(weightedAvg)}</span>
//             </p>
//         </div>
//     );
// };
