import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Save01 as Save } from '@/components/icons/antIconCompat';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { productionApi, productionErrorText } from '@/lib/api/production';
import { useAuthStore } from '@/store/authStore';
import '@/styles/modules/moduleSettings.css';
import type { ProductionSupplierLinks } from '@/types/production';

/**
 * Üretim → Üretim tedarikçisi (02.10.2026, Samet: «modül ayarları üretimde
 * üretim tedarikçisi seç diye bir alan olsun … seçilen tedarikçi seçilirse
 * bizim üretim olan şirkette proje olarak açılsın»).
 *
 * Je Produktionsfirma des Firmenbaums wählt die BESTELLENDE Firma den eigenen
 * Lieferanten, der diese Produktionsfirma ist. Wird eine Bestellung bei diesem
 * Lieferanten bestätigt, öffnet die Produktionsfirma das Projekt — wie bei
 * einer Bestellung über «Üretilecek». Speichern gleicht dort sofort ab.
 */

const K = 'settings.productionSupplier';

type Selection = Record<string, string>;

const selectionOf = (data: ProductionSupplierLinks): Selection =>
    Object.fromEntries(data.producers.map((producer) => [producer.id, producer.supplierId ?? '']));

export const ProductionSupplierSection = () => {
    const permissions = useAuthStore((state) => state.permissions);
    const isSystemAdmin = useAuthStore((state) => state.isSystemAdmin);
    const canEdit = isSystemAdmin || permissions.includes('roles.manage');

    const [data, setData] = useState<ProductionSupplierLinks | null>(null);
    const [value, setValue] = useState<Selection>({});
    const [unavailable, setUnavailable] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        productionApi.supplierLinks()
            .then((next) => {
                if (cancelled) return;
                setData(next);
                setValue(selectionOf(next));
            })
            .catch(() => { if (!cancelled) setUnavailable(true); });
        return () => { cancelled = true; };
    }, []);

    const saved = useMemo(() => (data ? selectionOf(data) : {}), [data]);
    const dirty = Boolean(data) && data!.producers.some((producer) => (value[producer.id] ?? '') !== (saved[producer.id] ?? ''));

    // Ein Lieferant gehört höchstens einer Produktionsfirma.
    const duplicate = useMemo(() => {
        const chosen = Object.values(value).filter(Boolean);
        return new Set(chosen).size !== chosen.length;
    }, [value]);

    const save = async () => {
        if (!data || duplicate) return;
        setSaving(true);
        try {
            const next = await productionApi.saveSupplierLinks(
                data.producers.map((producer) => ({ producerTenantId: producer.id, supplierId: value[producer.id] || null })),
            );
            setData(next);
            setValue(selectionOf(next));
            toast.success(t(`${K}.saved`));
        } catch (error) {
            toast.error(productionErrorText(error, t(`${K}.saveFailed`)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="ofi-mset-card">
            <div className="ofi-mset-card__head">
                <h2 className="ofi-mset-card__title">{t(`${K}.title`)}</h2>
            </div>

            <div className="ofi-mset-card__body">
                {!data && !unavailable ? (
                    <div className="py-10"><InlineLoading label={t('common.loading')} /></div>
                ) : unavailable ? (
                    <p className="ofi-mset-empty">{t(`${K}.unavailable`)}</p>
                ) : data!.producers.length === 0 ? (
                    <p className="ofi-mset-empty">{t(`${K}.noProducer`)}</p>
                ) : (
                    <>
                        <div className="px-4 pt-4 text-[12px] text-[color:var(--ofi-cal-muted)] md:px-6">
                            {t(`${K}.hint`)}
                        </div>
                        {data!.producers.map((producer) => {
                            const current = value[producer.id] ?? '';
                            return (
                                <div key={producer.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-6">
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-medium text-[color:var(--ofi-cal-text)]">{producer.name}</div>
                                        <div className="text-[12px] text-[color:var(--ofi-cal-muted)]">{t(`${K}.producerLabel`)}</div>
                                    </div>
                                    <select
                                        aria-label={t(`${K}.supplierLabel`, { company: producer.name })}
                                        value={current}
                                        onChange={(event) => setValue((prev) => ({ ...prev, [producer.id]: event.target.value }))}
                                        disabled={!canEdit || saving}
                                        className="ofi-cal-input w-full max-w-[320px]"
                                    >
                                        <option value="">{t(`${K}.none`)}</option>
                                        {data!.suppliers
                                            // Stillgelegte nur, wenn sie schon gewählt sind.
                                            .filter((supplier) => supplier.isActive || supplier.id === current)
                                            .map((supplier) => (
                                                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                                            ))}
                                    </select>
                                </div>
                            );
                        })}
                        {duplicate && (
                            <div className="px-4 pb-3 text-[12px] text-[#ff3b30] md:px-6" role="alert">
                                {t('production.err.SUPPLIER_DUPLICATE')}
                            </div>
                        )}
                    </>
                )}
            </div>

            {data && data.producers.length > 0 && (
                <div className="ofi-mset-card__foot justify-end">
                    {!canEdit && <span className="ofi-mset-hint">{t(`${K}.readOnly`)}</span>}
                    {canEdit && dirty && <span className="ofi-mset-hint">{t('settings.reminders.unsaved')}</span>}
                    {canEdit && (
                        <button
                            type="button"
                            disabled={!dirty || duplicate || saving}
                            onClick={() => void save()}
                            className="ofi-mset-primary"
                        >
                            <Save size={13} aria-hidden />
                            {t('common.save')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
