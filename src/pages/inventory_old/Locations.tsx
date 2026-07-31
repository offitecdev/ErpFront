// ARCHIVED: eski envanter modülü — yeni tablo-tabanlı modül src/pages/inventory altında. Bu dosya devre dışı bırakıldı.
// import { useEffect, useMemo, useState } from 'react';
// import { toast } from 'sonner';
// import { Building05 as Warehouse, GitBranch01 as Workflow, LayersThree01 as Layers, MarkerPin01 as MapPin, Plus } from '@/components/icons/antIconCompat';
// 
// import { PageHeader } from '../../components/layout/PageHeader';
// import { Card } from '../../components/ui-shared/Card';
// import { Button } from '../../components/ui-shared/Button';
// import { Field, Input, Select } from '../../components/ui-shared/Field';
// import { Modal } from '../../components/ui-shared/Modal';
// import { EmptyState } from '../../components/ui-shared/EmptyState';
// 
// import { useInventoryStore } from '../../store/inventoryStore';
// import { useAuthStore } from '../../store/authStore';
// import type { InventoryLocation, LocationType } from '../../types/inventory';
// 
// import { t } from '@/i18n/translate';
// 
// const TYPE_LABEL: Record<LocationType, string> = {
//     MAIN_WAREHOUSE:t('auto.ana_depo'),
//     SUB_WAREHOUSE:t('auto.alt_depo'),
//     STATION_BUFFER:t('auto.istasyon_buffer'),
//     PROJECT_RESERVE:t('auto.proje_rezerv'),
// };
// 
// const TYPE_ICON: Record<LocationType, React.ReactNode> = {
//     MAIN_WAREHOUSE: <Warehouse size={15} />,
//     SUB_WAREHOUSE: <Layers size={15} />,
//     STATION_BUFFER: <Workflow size={15} />,
//     PROJECT_RESERVE: <MapPin size={15} />,
// };
// 
// // Per-type accent palette so the hierarchy reads at a glance.
// const TYPE_COLOR: Record<LocationType, { badge: string; dot: string; text: string }> = {
//     MAIN_WAREHOUSE: { badge: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100', dot: 'bg-indigo-500', text: 'text-indigo-600' },
//     SUB_WAREHOUSE: { badge: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100', dot: 'bg-sky-500', text: 'text-sky-600' },
//     STATION_BUFFER: { badge: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100', dot: 'bg-amber-500', text: 'text-amber-600' },
//     PROJECT_RESERVE: { badge: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100', dot: 'bg-emerald-500', text: 'text-emerald-600' },
// };
// 
// const TYPE_ORDER: LocationType[] = ['MAIN_WAREHOUSE', 'SUB_WAREHOUSE', 'STATION_BUFFER', 'PROJECT_RESERVE'];
// 
// interface TreeNode extends InventoryLocation {
//     children: TreeNode[];
// }
// 
// const buildTree = (locations: InventoryLocation[]): TreeNode[] => {
//     const map = new Map<string, TreeNode>();
//     locations.forEach((l) => map.set(l.id, { ...l, children: [] }));
//     const roots: TreeNode[] = [];
//     map.forEach((n) => {
//         const parent = n.parentLocationId ? map.get(n.parentLocationId) : null;
//         if (parent) parent.children.push(n);
//         else roots.push(n);
//     });
//     return roots;
// };
// 
// export const Locations = () => {
//     const { permissions } = useAuthStore();
//     const canManage = permissions.length === 0 || permissions.includes('inventory.manage');
// 
//     const { locations, fetchLocations, createLocation } = useInventoryStore();
//     const [open, setOpen] = useState(false);
//     const [form, setForm] = useState<{
//         locationName: string;
//         locationType: LocationType;
//         parentLocationId: string;
//     }>({
//         locationName: '',
//         locationType: 'MAIN_WAREHOUSE',
//         parentLocationId: '',
//     });
//     const [submitting, setSubmitting] = useState(false);
// 
//     useEffect(() => {
//         fetchLocations();
//     }, [fetchLocations]);
// 
//     const tree = useMemo(() => buildTree(locations), [locations]);
//     const counts = useMemo(() => {
//         const by: Record<LocationType, number> = { MAIN_WAREHOUSE: 0, SUB_WAREHOUSE: 0, STATION_BUFFER: 0, PROJECT_RESERVE: 0 };
//         locations.forEach((l) => { by[l.locationType] += 1; });
//         return by;
//     }, [locations]);
// 
//     return (
//         <div>
//             <PageHeader
//                 breadcrumb={t('auto.breadcrumb_locations')}
//                 title={t('auto.depo_lokasyon_yonetimi')}
//                 description={t('auto.ana_depo_alt_depo_istasyon_buffer_ve_proje_rezer')}
//                 actions={
//                     canManage && (
//                         <Button variant="primary" icon={<Plus size={13} />} onClick={() => setOpen(true)}>{t('auto.yeni_lokasyon')}</Button>
//                     )
//                 }
//             />
// 
//             {/* Per-type summary */}
//             {locations.length > 0 && (
//                 <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
//                     {TYPE_ORDER.map((type) => (
//                         <div key={type} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-shadow hover:shadow-sm">
//                             <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${TYPE_COLOR[type].badge}`}>{TYPE_ICON[type]}</span>
//                             <div className="min-w-0">
//                                 <div className="text-[18px] font-semibold leading-none text-slate-800">{counts[type]}</div>
//                                 <div className="mt-1 truncate text-[10.5px] font-medium uppercase tracking-wider text-slate-500">{TYPE_LABEL[type]}</div>
//                             </div>
//                         </div>
//                     ))}
//                 </div>
//             )}
// 
//             <Card title={t('auto.lokasyon_hiyerarsisi')} icon={<MapPin size={13} />}>
//                 {tree.length === 0 ? (
//                     <EmptyState
//                         icon={<Warehouse size={32} />}
//                         title={t('auto.henuz_lokasyon_yok')}
//                         description={t('auto.once_bir_ana_depo_olusturarak_baslayin_ardindan_')}
//                         action={canManage && (
//                             <Button variant="primary" icon={<Plus size={13} />} onClick={() => setOpen(true)}>{t('auto.lokasyon_ekle')}</Button>
//                         )}
//                     />
//                 ) : (
//                     <div className="space-y-1">
//                         {tree.map((root) => (
//                             <LocationNodeView key={root.id} node={root} level={0} />
//                         ))}
//                     </div>
//                 )}
//             </Card>
// 
//             <Modal
//                 open={open}
//                 title={t('auto.yeni_lokasyon')}
//                 description={t('auto.depo_turunu_ve_bagli_oldugu_ust_lokasyonu_secin')}
//                 onClose={() => setOpen(false)}
//                 width="md"
//                 footer={
//                     <>
//                         <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
//                         <Button
//                             variant="primary"
//                             loading={submitting}
//                             onClick={async () => {
//                                 if (!form.locationName.trim()) {
//                                     toast.error(t('auto.lokasyon_adi_zorunlu'));
//                                     return;
//                                 }
//                                 setSubmitting(true);
//                                 try {
//                                     await createLocation({
//                                         locationName: form.locationName.trim(),
//                                         locationType: form.locationType,
//                                         parentLocationId: form.parentLocationId || null,
//                                     });
//                                     toast.success(t('auto.lokasyon_olusturuldu'));
//                                     setForm({ locationName: '', locationType: 'MAIN_WAREHOUSE', parentLocationId: '' });
//                                     setOpen(false);
//                                 } catch (e: any) {
//                                     toast.error(e.response?.data?.error ||t('auto.olusturulamadi'));
//                                 } finally {
//                                     setSubmitting(false);
//                                 }
//                             }}
//                         >{t('common.create')}</Button>
//                     </>
//                 }
//             >
//                 <div className="space-y-3">
//                     <Field label={t('auto.lokasyon_adi')} required>
//                         <Input
//                             value={form.locationName}
//                             onChange={(e) => setForm({ ...form, locationName: e.target.value })}
//                             placeholder={t('auto.ana_depo_schubelbach')}
//                         />
//                     </Field>
//                     <Field label={t('auto.tip')} required>
//                         <Select
//                             value={form.locationType}
//                             onChange={(e) => setForm({ ...form, locationType: e.target.value as LocationType })}
//                         >
//                             <option value="MAIN_WAREHOUSE">{t('auto.ana_depo')}</option>
//                             <option value="SUB_WAREHOUSE">{t('auto.alt_depo_departman_buffer')}</option>
//                             <option value="STATION_BUFFER">{t('auto.istasyon_buffer_orn_istasyon_1')}</option>
//                             <option value="PROJECT_RESERVE">{t('auto.proje_rezerv_alani')}</option>
//                         </Select>
//                     </Field>
//                     <Field label={t('auto.ust_lokasyon')} hint={t('auto.istege_bagli_hiyerarsik_yapi_icin')}>
//                         <Select
//                             value={form.parentLocationId}
//                             onChange={(e) => setForm({ ...form, parentLocationId: e.target.value })}
//                         >
//                             <option value="">{t('auto.kok_lokasyon')}</option>
//                             {locations.map((l) => (
//                                 <option key={l.id} value={l.id}>{t('auto.location_option_label', { name: l.locationName, type: TYPE_LABEL[l.locationType] })}</option>
//                             ))}
//                         </Select>
//                     </Field>
//                 </div>
//             </Modal>
//         </div>
//     );
// };
// 
// const LocationNodeView: React.FC<{ node: TreeNode; level: number }> = ({ node, level }) => {
//     const color = TYPE_COLOR[node.locationType];
//     return (
//         <div className={level > 0 ? 'ml-3 border-l border-dashed border-slate-200 pl-3' : ''}>
//             <div className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-slate-100">
//                 <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${color.badge}`}>{TYPE_ICON[node.locationType]}</span>
//                 <div className="min-w-0 flex-1">
//                     <div className="flex items-center gap-2">
//                         <span className="truncate text-[13px] font-semibold text-slate-800">{node.locationName}</span>
//                         {node.children.length > 0 && (
//                             <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{node.children.length}</span>
//                         )}
//                     </div>
//                     <div className={`mt-0.5 inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider ${color.text}`}>
//                         <span className={`size-1.5 rounded-full ${color.dot}`} />
//                         {TYPE_LABEL[node.locationType]}
//                     </div>
//                 </div>
//                 {!node.isActive && (
//                     <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{t('common.inactive')}</span>
//                 )}
//             </div>
//             {node.children.length > 0 && (
//                 <div className="space-y-0.5">
//                     {node.children.map((c) => (
//                         <LocationNodeView key={c.id} node={c} level={level + 1} />
//                     ))}
//                 </div>
//             )}
//         </div>
//     );
// };
