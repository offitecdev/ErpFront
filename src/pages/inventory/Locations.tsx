import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Building05 as Warehouse, GitBranch01 as Workflow, LayersThree01 as Layers, MarkerPin01 as MapPin, Plus } from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { EmptyState } from '../../components/ui-shared/EmptyState';

import { useInventoryStore } from '../../store/inventoryStore';
import { useAuthStore } from '../../store/authStore';
import type { InventoryLocation, LocationType } from '../../types/inventory';

const TYPE_LABEL: Record<LocationType, string> = {
    MAIN_WAREHOUSE: 'Ana Depo',
    SUB_WAREHOUSE: 'Alt Depo',
    STATION_BUFFER: 'İstasyon Buffer',
    PROJECT_RESERVE: 'Proje Rezerv',
};

const TYPE_ICON: Record<LocationType, React.ReactNode> = {
    MAIN_WAREHOUSE: <Warehouse size={14} />,
    SUB_WAREHOUSE: <Layers size={14} />,
    STATION_BUFFER: <Workflow size={14} />,
    PROJECT_RESERVE: <MapPin size={14} />,
};

interface TreeNode extends InventoryLocation {
    children: TreeNode[];
}

const buildTree = (locations: InventoryLocation[]): TreeNode[] => {
    const map = new Map<string, TreeNode>();
    locations.forEach((l) => map.set(l.id, { ...l, children: [] }));
    const roots: TreeNode[] = [];
    map.forEach((n) => {
        const parent = n.parentLocationId ? map.get(n.parentLocationId) : null;
        if (parent) parent.children.push(n);
        else roots.push(n);
    });
    return roots;
};

export const Locations = () => {
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0 || permissions.includes('inventory.manage');

    const { locations, fetchLocations, createLocation } = useInventoryStore();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<{
        locationName: string;
        locationType: LocationType;
        parentLocationId: string;
    }>({
        locationName: '',
        locationType: 'MAIN_WAREHOUSE',
        parentLocationId: '',
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchLocations();
    }, [fetchLocations]);

    const tree = useMemo(() => buildTree(locations), [locations]);

    return (
        <div>
            <PageHeader
                breadcrumb="Stok › Lokasyonlar"
                title="Depo & Lokasyon Yönetimi"
                description="Ana depo, alt depo, istasyon buffer ve proje rezerv lokasyonlarını hiyerarşik olarak tanımlayın."
                actions={
                    canManage && (
                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => setOpen(true)}>
                            Yeni Lokasyon
                        </Button>
                    )
                }
            />

            <Card title="Lokasyon Hiyerarşisi" icon={<MapPin size={13} />}>
                {tree.length === 0 ? (
                    <EmptyState
                        icon={<Warehouse size={32} />}
                        title="Henüz lokasyon yok"
                        description="Önce bir Ana Depo oluşturarak başlayın, ardından bunun altına alt depolar ve istasyonlar ekleyin."
                        action={canManage && (
                            <Button variant="primary" icon={<Plus size={13} />} onClick={() => setOpen(true)}>
                                Lokasyon Ekle
                            </Button>
                        )}
                    />
                ) : (
                    <div className="space-y-1">
                        {tree.map((root) => (
                            <LocationNodeView key={root.id} node={root} level={0} />
                        ))}
                    </div>
                )}
            </Card>

            <Modal
                open={open}
                title="Yeni Lokasyon"
                description="Depo türünü ve bağlı olduğu üst lokasyonu seçin."
                onClose={() => setOpen(false)}
                width="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>İptal</Button>
                        <Button
                            variant="primary"
                            loading={submitting}
                            onClick={async () => {
                                if (!form.locationName.trim()) {
                                    toast.error('Lokasyon adı zorunlu.');
                                    return;
                                }
                                setSubmitting(true);
                                try {
                                    await createLocation({
                                        locationName: form.locationName.trim(),
                                        locationType: form.locationType,
                                        parentLocationId: form.parentLocationId || null,
                                    });
                                    toast.success('Lokasyon oluşturuldu.');
                                    setForm({ locationName: '', locationType: 'MAIN_WAREHOUSE', parentLocationId: '' });
                                    setOpen(false);
                                } catch (e: any) {
                                    toast.error(e.response?.data?.error || 'Oluşturulamadı.');
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                        >
                            Oluştur
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <Field label="Lokasyon Adı" required>
                        <Input
                            value={form.locationName}
                            onChange={(e) => setForm({ ...form, locationName: e.target.value })}
                            placeholder="Ana Depo - Schübelbach"
                        />
                    </Field>
                    <Field label="Tip" required>
                        <Select
                            value={form.locationType}
                            onChange={(e) => setForm({ ...form, locationType: e.target.value as LocationType })}
                        >
                            <option value="MAIN_WAREHOUSE">Ana Depo</option>
                            <option value="SUB_WAREHOUSE">Alt Depo / Departman Buffer</option>
                            <option value="STATION_BUFFER">İstasyon Buffer (örn: İstasyon 1)</option>
                            <option value="PROJECT_RESERVE">Proje Rezerv Alanı</option>
                        </Select>
                    </Field>
                    <Field label="Üst Lokasyon" hint="İsteğe bağlı – hiyerarşik yapı için">
                        <Select
                            value={form.parentLocationId}
                            onChange={(e) => setForm({ ...form, parentLocationId: e.target.value })}
                        >
                            <option value="">— Kök Lokasyon —</option>
                            {locations.map((l) => (
                                <option key={l.id} value={l.id}>{l.locationName} · {TYPE_LABEL[l.locationType]}</option>
                            ))}
                        </Select>
                    </Field>
                </div>
            </Modal>
        </div>
    );
};

const LocationNodeView: React.FC<{ node: TreeNode; level: number }> = ({ node, level }) => (
    <div>
        <div
            className="flex items-center gap-2.5 py-2 px-2.5 rounded hover:bg-slate-50/60"
            style={{ paddingLeft: 10 + level * 22 }}
        >
            <span className="text-slate-400">{TYPE_ICON[node.locationType]}</span>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 text-[13px] truncate">{node.locationName}</div>
                <div className="text-[10.5px] uppercase tracking-wider text-slate-500">{TYPE_LABEL[node.locationType]}</div>
            </div>
            {!node.isActive && (
                <span className="text-[11px] text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">Pasif</span>
            )}
        </div>
        {node.children.map((c) => (
            <LocationNodeView key={c.id} node={c} level={level + 1} />
        ))}
    </div>
);
