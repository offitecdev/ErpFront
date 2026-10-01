import { useEffect, useMemo, useState } from 'react';
import { Check, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { readWarehouseCatalog, warehouseApi, warehouseErrorText } from '@/lib/api/warehouse';
import type { BomProduct } from '@/types/productionBom';
import type { BuiltInArea } from '@/types/productionTasks';
import type { WarehouseCatalog, WarehouseGroupRef } from '@/types/warehouse';
import { MaterialGroupSelect } from '@/pages/warehouse/components/MaterialGroupSelect';
import { SupplierSelect, type SupplierValue } from '@/pages/warehouse/components/SupplierSelect';
import { UnitPicker } from '@/pages/warehouse/components/UnitPicker';
import { isEmail } from '@/pages/warehouse/supplierRows';
import type { WarehouseUnit } from '@/types/warehouse';
import '@/styles/modules/warehouse.css';

import { parseInputNumber } from './bomFormat';

/** Sieht die Eingabe aus wie ein Code (Typennummer), nicht wie ein Name? */
const looksLikeCode = (value: string): boolean => /\d/.test(value) && !/\s{2,}/.test(value) && value.length <= 40 && /^[A-Za-z0-9 ./_-]+$/.test(value);

/**
 * ── «ÜRÜN KARTI OLUŞTUR» — DAS KLEINE FENSTER NEBEN DER SUCHE ──────────────
 *
 * «Eğer yoksa hemen küçük modal yanında ürün kartı oluştur olmalıdır.» Die
 * Felder, die eine BOM-Zeile braucht: Name, Marke, Modellnummer, die
 * Materialgruppe (daraus der ERP-Code — ohne ihn lässt sich nicht bestellen),
 * Lieferant, Seriennummernpflicht und die Mindestbestellmenge. Angelegt wird
 * im Depo (wie auf der Produktkarte); die neue Karte kommt gleich als Zeile.
 */
export const QuickProductCard = ({
    seed,
    onClose,
    onCreated,
    area,
}: {
    seed: string;
    onClose: () => void;
    onCreated: (product: BomProduct) => void;
    /** Bereich der BOM (01.10.2026): nur Gruppen der Kod türleri dieses Bereichs oder beider. */
    area?: BuiltInArea;
}) => {
    const seedIsCode = looksLikeCode(seed);
    const [name, setName] = useState(seedIsCode ? '' : seed);
    const [brand, setBrand] = useState('');
    const [modelNumber, setModelNumber] = useState(seedIsCode ? seed : '');
    /* Seine Artikel- und Bestellnummer (01.10.2026) — statt des früheren «Ürün kodu» der Karte. */
    const [articleNumber, setArticleNumber] = useState('');
    const [orderNumber, setOrderNumber] = useState('');
    const [unit, setUnit] = useState<WarehouseUnit>('PCS');
    const [group, setGroup] = useState<WarehouseGroupRef | null>(null);
    const [supplier, setSupplier] = useState<SupplierValue | null>(null);
    /* «Tedarikçi, tedarikçi maili» (30.09.2026) — ohne sie wird die Karte ein Taslak. */
    const [supplierEmail, setSupplierEmail] = useState('');
    const [serialRequired, setSerialRequired] = useState(false);
    const [minimum, setMinimum] = useState('');
    const [catalog, setCatalog] = useState<WarehouseCatalog | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => readWarehouseCatalog(
        (value) => setCatalog(value),
        () => setCatalog({ categories: [], ungroupedCount: 0 }),
    ), []);
    /* Eine Karte, die die Suche dieser BOM nie zeigen würde, soll hier gar nicht erst entstehen. */
    const groupCatalog = useMemo<WarehouseCatalog | null>(() => (catalog && area ? {
        ...catalog,
        categories: catalog.categories.filter((category) => !category.bomArea || category.bomArea === 'BOTH' || category.bomArea === area),
    } : catalog), [catalog, area]);

    const minimumValue = parseInputNumber(minimum);
    const minimumInvalid = minimum.trim() !== '' && (minimumValue === null || Number.isNaN(minimumValue) || minimumValue <= 0);
    const emailInvalid = supplierEmail.trim() !== '' && (!supplier || !isEmail(supplierEmail));
    // Die Nummern gehören dem Lieferanten — ohne ihn gibt es sie nicht.
    const numbersInvalid = !supplier && Boolean(articleNumber.trim() || orderNumber.trim());
    const canCreate = Boolean(name.trim()) && !minimumInvalid && !emailInvalid && !numbersInvalid && !busy;
    // Was einer fertigen Karte fehlt — die Karte entsteht dann als Taslak (der Server entscheidet genauso).
    const draft = !supplier || !supplierEmail.trim();

    const create = async () => {
        if (!canCreate) return;
        setBusy(true);
        setError(null);
        try {
            const detail = await warehouseApi.create({
                name: name.trim(),
                brand: brand.trim() || null,
                modelNumber: modelNumber.trim() || null,
                unit,
                materialGroupId: group?.id ?? null,
                suppliers: supplier ? [{
                    supplierId: supplier.id,
                    name: supplier.name,
                    barcode: null,
                    email: supplierEmail.trim() || null,
                    articleNumber: articleNumber.trim() || null,
                    orderNumber: orderNumber.trim() || null,
                }] : [],
                serialRequired,
                quantity: 0,
                // Die Mindestbestellmenge versteht der Server ab der Migration der BOM.
                ...(minimumValue && minimumValue > 0 ? { minimumOrderQuantity: minimumValue } : {}),
            } as Parameters<typeof warehouseApi.create>[0]);
            const product = detail.product;
            toast.success(t(product.isDraft ? 'productionBom.quickCard.createdDraft' : 'productionBom.quickCard.created', { code: product.erpCode ?? product.name }));
            onCreated({
                id: product.id,
                erpCode: product.erpCode,
                name: product.name,
                brand: product.brand,
                modelNumber: product.modelNumber,
                productCode: product.productCode ?? null,
                unit: product.unit ?? unit,
                isDraft: Boolean(product.isDraft),
                materialGroupName: product.materialGroup?.name ?? null,
                description: product.description,
                supplierName: product.supplier?.name ?? null,
                suppliers: product.suppliers.map((entry) => ({ id: entry.id, name: entry.name, hasEmail: Boolean(entry.email) })),
                quantity: product.quantity,
                free: product.quantity,
                serialRequired: product.serialRequired,
                minimumOrderQuantity: minimumValue && minimumValue > 0 ? minimumValue : null,
                hasErpCode: Boolean(product.erpCode),
            });
        } catch (failure) {
            setError(warehouseErrorText(failure));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PopupDialog
            open
            onClose={() => { if (!busy) onClose(); }}
            title={t('productionBom.quickCard.title')}
            subtitle={t('productionBom.quickCard.subtitle')}
            icon={<PackagePlus size={18} />}
            width={520}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={busy}>{t('productionBom.common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={busy} disabled={!canCreate} onClick={() => void create()}>
                        {t('productionBom.quickCard.create')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <form
                className="ofi-wh-pop ofi-bom-pop ofi-bom-quickcard"
                onSubmit={(event) => { event.preventDefault(); void create(); }}
            >
                <section className="ofi-wh-group">
                    <div className="ofi-wh-group__box">
                        <div className="ofi-wh-row">
                            <label className="ofi-wh-row__label" htmlFor="bom-qc-name">
                                {t('productionBom.quickCard.name')}<b>*</b>
                            </label>
                            <div className="ofi-wh-row__control">
                                <input id="bom-qc-name" className="ofi-wh-input" value={name} autoFocus={!seedIsCode} onChange={(event) => setName(event.target.value)} />
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <label className="ofi-wh-row__label" htmlFor="bom-qc-brand">{t('productionBom.quickCard.brand')}</label>
                            <div className="ofi-wh-row__control">
                                <input id="bom-qc-brand" className="ofi-wh-input" value={brand} onChange={(event) => setBrand(event.target.value)} />
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <label className="ofi-wh-row__label" htmlFor="bom-qc-model">{t('productionBom.quickCard.modelNumber')}</label>
                            <div className="ofi-wh-row__control">
                                <input id="bom-qc-model" className="ofi-wh-input is-mono" value={modelNumber} autoFocus={seedIsCode} onChange={(event) => setModelNumber(event.target.value)} />
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <span className="ofi-wh-row__label">{t('productionBom.quickCard.unit')}<b>*</b></span>
                            <div className="ofi-wh-row__control">
                                <UnitPicker value={unit} onChange={setUnit} />
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <span className="ofi-wh-row__label">{t('productionBom.quickCard.group')}</span>
                            <div className="ofi-wh-row__control">
                                <MaterialGroupSelect value={group} catalog={groupCatalog} onChange={setGroup} />
                                <span className="ofi-wh-row__hint">
                                    {group ? t('productionBom.quickCard.groupHint') : t('productionBom.quickCard.noGroupWarn')}
                                </span>
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <span className="ofi-wh-row__label">{t('productionBom.quickCard.supplier')}</span>
                            <div className="ofi-wh-row__control">
                                <SupplierSelect
                                    value={supplier}
                                    onChange={(next) => {
                                        setSupplier(next);
                                        if (next?.email && !supplierEmail.trim()) setSupplierEmail(next.email);
                                    }}
                                />
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <label className="ofi-wh-row__label" htmlFor="bom-qc-mail">{t('productionBom.quickCard.supplierEmail')}</label>
                            <div className="ofi-wh-row__control">
                                <input
                                    id="bom-qc-mail"
                                    type="email"
                                    className={`ofi-wh-input${emailInvalid ? ' is-invalid' : ''}`}
                                    value={supplierEmail}
                                    placeholder={t('warehouse.supplier.emailPlaceholder')}
                                    onChange={(event) => setSupplierEmail(event.target.value)}
                                />
                                <span className={`ofi-wh-row__hint${draft ? ' is-warn' : ''}`}>
                                    {draft ? t('productionBom.quickCard.draftHint') : t('productionBom.quickCard.completeHint')}
                                </span>
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <label className="ofi-wh-row__label" htmlFor="bom-qc-article">{t('productionBom.quickCard.articleNumber')}</label>
                            <div className="ofi-wh-row__control">
                                <input
                                    id="bom-qc-article"
                                    className={`ofi-wh-input is-mono${numbersInvalid && articleNumber.trim() ? ' is-invalid' : ''}`}
                                    value={articleNumber}
                                    maxLength={120}
                                    spellCheck={false}
                                    placeholder={t('warehouse.supplier.articleNumberPlaceholder')}
                                    onChange={(event) => setArticleNumber(event.target.value)}
                                />
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <label className="ofi-wh-row__label" htmlFor="bom-qc-order">{t('productionBom.quickCard.orderNumber')}</label>
                            <div className="ofi-wh-row__control">
                                <input
                                    id="bom-qc-order"
                                    className={`ofi-wh-input is-mono${numbersInvalid && orderNumber.trim() ? ' is-invalid' : ''}`}
                                    value={orderNumber}
                                    maxLength={120}
                                    spellCheck={false}
                                    placeholder={t('warehouse.supplier.orderNumberPlaceholder')}
                                    onChange={(event) => setOrderNumber(event.target.value)}
                                />
                                {numbersInvalid && <span className="ofi-wh-row__hint is-warn">{t('productionBom.quickCard.numbersNeedSupplier')}</span>}
                            </div>
                        </div>
                        <div className="ofi-wh-row">
                            <label className="ofi-wh-row__label" htmlFor="bom-qc-min">{t('productionBom.quickCard.minimum')}</label>
                            <div className="ofi-wh-row__control">
                                <input
                                    id="bom-qc-min"
                                    className={`ofi-wh-input is-num${minimumInvalid ? ' is-invalid' : ''}`}
                                    inputMode="decimal"
                                    value={minimum}
                                    placeholder="—"
                                    onChange={(event) => setMinimum(event.target.value)}
                                />
                            </div>
                        </div>
                        <div className="ofi-wh-row is-block">
                            <div className="ofi-wh-row__control">
                                <label className="ofi-wh-check">
                                    <input type="checkbox" checked={serialRequired} onChange={(event) => setSerialRequired(event.target.checked)} />
                                    <span className="ofi-wh-check__box" aria-hidden><Check /></span>
                                    <span className="ofi-wh-check__text"><b>{t('productionBom.quickCard.serialRequired')}</b></span>
                                </label>
                            </div>
                        </div>
                    </div>
                </section>
                {error && <p className="ofi-bom-inline-error" role="alert">{error}</p>}
                <button type="submit" hidden aria-hidden tabIndex={-1} />
            </form>
        </PopupDialog>
    );
};
