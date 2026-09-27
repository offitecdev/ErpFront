import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, Info, Printer, ScanLine, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { cachedQuery } from '@/lib/api/queryCache';
import { cachedWarehouseSettings, readWarehouseCatalog, readWarehouseProduct, warehouseApi, warehouseErrorOf, warehouseErrorText } from '@/lib/api/warehouse';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import { useAuthStore } from '@/store/authStore';
import { CURRENCY_CODES } from '@/utils/currency';
import type {
    WarehouseCatalog,
    WarehouseGroupRef,
    WarehouseProduct,
    WarehouseProductDetail,
    WarehouseProductInput,
    WarehouseSerial,
} from '@/types/warehouse';
import '@/styles/modules/warehouse.css';

import { BarcodeInput } from './components/BarcodeInput';
import { Ean13Barcode } from './components/Ean13Barcode';
import { MaterialGroupSelect } from './components/MaterialGroupSelect';
import { SerialNumbersPanel, type SerialRowModel } from './components/SerialNumbersPanel';
import { SupplierBarcodePicker } from './components/SupplierBarcodePicker';
import { SupplierListEditor } from './components/SupplierListEditor';
import { cleanScan } from './hooks/scanRules';
import { rowWithBarcode, sameSupplierRows, supplierInputOf, supplierRowsOf, type SupplierRow } from './supplierRows';
import { numberToInput, parseInputNumber, priceToInput } from './warehouseFormat';

type Tab = 'details' | 'serials';

/** Was die Felder zeigen — Texte, wie getippt. ERP-Code und Barcode vergibt der Server. */
interface FormState {
    materialGroup: WarehouseGroupRef | null;
    name: string;
    brand: string;
    modelNumber: string;
    /**
     * Die Lieferanten, jeder mit seinem Barcode des Produkts (dritter und
     * vierter Durchgang) — dazu höchstens eine Zeile mit Barcode, aber ohne
     * Lieferant (der Herstellerbarcode der Karte), und am Ende die leere Zeile.
     */
    suppliers: SupplierRow[];
    description: string;
    quantity: string;
    purchasePrice: string;
    /** Mindestbestellmenge (BOM: «bu minimum alışın altında sipariş verilemez»). */
    minimumOrderQuantity: string;
    currency: string;
    serialRequired: boolean;
}

const EMPTY_FORM: FormState = {
    materialGroup: null,
    name: '',
    brand: '',
    modelNumber: '',
    suppliers: supplierRowsOf(null),
    description: '',
    quantity: '0',
    purchasePrice: '',
    minimumOrderQuantity: '',
    currency: 'CHF',
    serialRequired: false,
};

const formOf = (product: WarehouseProduct): FormState => ({
    materialGroup: product.materialGroup ? { ...product.materialGroup } : null,
    name: product.name,
    brand: product.brand ?? '',
    modelNumber: product.modelNumber ?? '',
    suppliers: supplierRowsOf(product),
    description: product.description ?? '',
    quantity: numberToInput(product.quantity),
    purchasePrice: priceToInput(product.purchasePrice),
    minimumOrderQuantity: numberToInput(product.minimumOrderQuantity),
    currency: product.currency ?? 'CHF',
    serialRequired: product.serialRequired,
});

const sameForm = (a: FormState, b: FormState): boolean =>
    (a.materialGroup?.id ?? null) === (b.materialGroup?.id ?? null)
    && a.name === b.name
    && a.brand === b.brand
    && a.modelNumber === b.modelNumber
    && sameSupplierRows(a.suppliers, b.suppliers)
    && a.description === b.description
    && (a.serialRequired || a.quantity === b.quantity)
    && a.purchasePrice === b.purchasePrice
    && a.minimumOrderQuantity === b.minimumOrderQuantity
    && (a.purchasePrice.trim() === '' || a.currency === b.currency)
    && a.serialRequired === b.serialRequired;

/** Ein Fehler an einem Feld — bei den Lieferanten auch an einer Zeile. */
interface FieldError {
    field: keyof FormState;
    text: string;
    rowKey?: string | null;
}

type Built = { input: WarehouseProductInput } | (FieldError & { error: string });

/** Die Felder als Eingabe des Servers; `base` = nur, was sich geändert hat. */
const buildInput = (form: FormState, base: FormState | null): Built => {
    const name = form.name.trim();
    if (!name) return { error: t('warehouse.fields.nameMissing'), text: t('warehouse.fields.nameMissing'), field: 'name' };
    const quantity = parseInputNumber(form.quantity);
    if (!form.serialRequired && quantity !== null && (Number.isNaN(quantity) || quantity < 0)) {
        return { error: t('warehouse.err.QUANTITY_INVALID'), text: t('warehouse.err.QUANTITY_INVALID'), field: 'quantity' };
    }
    const price = parseInputNumber(form.purchasePrice);
    if (price !== null && (Number.isNaN(price) || price < 0)) {
        return { error: t('warehouse.err.PRICE_INVALID'), text: t('warehouse.err.PRICE_INVALID'), field: 'purchasePrice' };
    }
    const minimum = parseInputNumber(form.minimumOrderQuantity);
    if (minimum !== null && (Number.isNaN(minimum) || minimum < 0)) {
        return { error: t('warehouse.err.MIN_ORDER_INVALID'), text: t('warehouse.err.MIN_ORDER_INVALID'), field: 'minimumOrderQuantity' };
    }
    const suppliers = supplierInputOf(form.suppliers);
    if ('errorKey' in suppliers) {
        const error = t('warehouse.supplier.barcodeWithoutSupplier', { code: suppliers.code });
        return { error, text: error, field: 'suppliers', rowKey: suppliers.errorKey };
    }
    const text = (value: string) => value.trim() || null;
    const full: WarehouseProductInput = {
        materialGroupId: form.materialGroup?.id ?? null,
        name,
        brand: text(form.brand),
        modelNumber: text(form.modelNumber),
        suppliers: suppliers.suppliers,
        description: form.description.trim() ? form.description : null,
        purchasePrice: price,
        minimumOrderQuantity: minimum ? minimum : null,
        currency: price === null ? null : form.currency,
        manufacturerBarcode: suppliers.manufacturerBarcode,
        serialRequired: form.serialRequired,
        ...(form.serialRequired ? {} : { quantity: quantity ?? 0 }),
    };
    if (!base) return { input: full };

    const before = buildInput(base, null);
    if (!('input' in before)) return { input: full };
    const diff: WarehouseProductInput = {};
    const keys = Object.keys(full) as Array<keyof WarehouseProductInput>;
    for (const key of keys) {
        if (JSON.stringify(full[key]) !== JSON.stringify(before.input[key])) {
            (diff as Record<string, unknown>)[key] = full[key];
        }
    }
    return { input: diff };
};

const rowOf = (serial: WarehouseSerial): SerialRowModel => ({
    key: serial.id,
    id: serial.id,
    serialNumber: serial.serialNumber,
    project: serial.project
        ? { id: serial.project.id, number: serial.project.number, name: serial.project.name, isActive: serial.project.isActive }
        : null,
    device: serial.device
        ? { id: serial.device.id, name: serial.device.name, positionNumber: serial.device.positionNumber, isActive: serial.device.isActive }
        : null,
    createdAt: serial.createdAt,
});

/* ── Bausteine der gruppierten Tafeln (Systemeinstellungen) ─────────────── */

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="ofi-wh-group">
        <h2 className="ofi-wh-group__title">{title}</h2>
        <div className="ofi-wh-group__box">{children}</div>
    </section>
);

const Row = ({
    label,
    htmlFor,
    required,
    hint,
    error,
    top,
    children,
}: {
    label?: string;
    htmlFor?: string;
    required?: boolean;
    hint?: string;
    error?: string | null;
    top?: boolean;
    children: ReactNode;
}) => (
    <div className={`ofi-wh-row ${top ? 'is-top' : ''} ${label ? '' : 'is-block'}`}>
        {label && (
            <label className="ofi-wh-row__label" htmlFor={htmlFor}>
                {label}
                {required && <b aria-label={t('warehouse.fields.required')}>*</b>}
            </label>
        )}
        <div className="ofi-wh-row__control">
            {children}
            {error ? <span className="ofi-wh-row__hint is-error" role="alert">{error}</span> : hint ? <span className="ofi-wh-row__hint">{hint}</span> : null}
        </div>
    </div>
);

/**
 * ── DEPO · ÜRÜN KARTI (26.09.2026, Vorgabe Samet) ───────────────────────────
 *
 * «Erp kodu (başlangıçta boş), malzeme grubu (başlangıçta boş), ürün adı
 *  (zorunlu), ürün markası, model numarası, tedarikçi adı, tedarikçi numarası,
 *  ürün açıklaması, miktar, alış fiyatı, barkod, üretici barkodu … seri
 *  numarası gereklidir kutusu … üstte tek bir tab: Ürün Detayları; seri
 *  numaraları gerekli ise yanında Seri Numaraları tab'ı.»
 *
 * Dieselbe Seite legt an (`/warehouse/products/new`, auch mit `?barcode=` aus
 * «Ürün ekle») und ändert (`/:id`). Die Felder stehen in der Reihenfolge der
 * Vorgabe, Spalte für Spalte, in den gruppierten Tafeln der macOS-
 * Systemeinstellungen. Gespeichert wird ausdrücklich (Knopf oder ⌘/Strg+S);
 * wer mit ungespeicherten Änderungen gehen will, wird gefragt — nie aber,
 * weil sich die Kamera nach einem Scan schliesst («barkod okuttuktan sonra
 * kaydedilmemiş değişiklikler pop-up'ı … asla», lib/backDismiss.ts).
 *
 * Vierter Durchgang: neben jedem Lieferanten SEIN Barcode des Produkts (Feld
 * mit Kamera), am Ende immer eine leere Zeile; in «Barkodlar» wählt man den
 * Lieferanten und sieht dessen Barcode (SupplierBarcodePicker).
 */
export const WarehouseProductPage = () => {
    useLanguageTick();
    const { id } = useParams<{ id: string }>();
    const isNew = !id;
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const canManage = useAuthStore((state) => state.permissions.includes('production.manage'));

    const [detail, setDetail] = useState<WarehouseProductDetail | null>(null);
    /* Eine neue Karte aus «Ürün ekle» bringt den gelesenen Code mit — meist
       der Barcode des Herstellers auf der Verpackung. Er steht in der ersten
       Zeile der Lieferanten (der Lieferant wird noch gewählt) und zählt zum
       Anfang, nicht als Änderung. */
    const [baseline, setBaseline] = useState<FormState>(() => ({
        ...EMPTY_FORM,
        suppliers: supplierRowsOf({ suppliers: [], manufacturerBarcode: (!id && params.get('barcode')?.trim()) || null }),
    }));
    const [form, setForm] = useState<FormState>(baseline);
    const [pendingSerials, setPendingSerials] = useState<SerialRowModel[]>([]);
    const pendingRef = useRef<SerialRowModel[]>([]);
    const [catalog, setCatalog] = useState<WarehouseCatalog | null>(null);
    const [printing, setPrinting] = useState(false);
    const [serialInput, setSerialInput] = useState('');
    // Der Fehler gehört zu EINER Karte — beim Wechsel der Adresse gilt er nicht mehr.
    const [loadFailure, setLoadFailure] = useState<{ id: string; notFound: boolean; text: string } | null>(null);
    const loadError = loadFailure && loadFailure.id === id ? loadFailure : null;
    const [saving, setSaving] = useState(false);
    const [fieldError, setFieldError] = useState<FieldError | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);

    const tab: Tab = params.get('tab') === 'serials' && form.serialRequired ? 'serials' : 'details';
    const setTab = (next: Tab) => {
        setParams((current) => {
            const nextParams = new URLSearchParams(current);
            if (next === 'serials') nextParams.set('tab', 'serials');
            else nextParams.delete('tab');
            return nextParams;
        }, { replace: true });
    };

    /* ── Laden ─────────────────────────────────────────────────────────── */
    useEffect(() => {
        if (!id) return undefined;
        // Gerade angelegt: dieselbe Karte liegt schon da.
        if (detail?.product.id === id) return undefined;
        return readWarehouseProduct(
            id,
            (value) => {
                setDetail(value);
                const next = formOf(value.product);
                setForm(next);
                setBaseline(next);
            },
            (failure) => {
                const info = warehouseErrorOf(failure);
                setLoadFailure({ id, notFound: info.status === 404, text: warehouseErrorText(failure) });
            },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => readWarehouseCatalog(
        (value) => setCatalog(value),
        () => setCatalog({ categories: [], ungroupedCount: 0 }),
    ), []);

    const dirty = isNew
        ? !sameForm(form, baseline) || pendingSerials.length > 0
        : Boolean(detail) && (!sameForm(form, baseline) || (form.serialRequired && pendingSerials.length > 0));
    const guard = useUnsavedChangesGuard(canManage && dirty && !saving && !deleting);

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        if (fieldError?.field === key) setFieldError(null);
    };

    /* ── Speichern ─────────────────────────────────────────────────────── */
    const save = useCallback(async (): Promise<boolean> => {
        if (saving || !canManage) return false;
        const built = buildInput(form, isNew ? null : baseline);
        if (!('input' in built)) {
            setFieldError({ field: built.field, text: built.error, rowKey: built.rowKey ?? null });
            if (tab !== 'details') setTab('details');
            if (built.field === 'name') window.setTimeout(() => nameRef.current?.focus(), 0);
            toast.error(built.error);
            return false;
        }
        const heldSerials = form.serialRequired && pendingSerials.length
            ? { serials: pendingSerials.map((row) => ({ serialNumber: row.serialNumber })) }
            : {};
        if (!isNew && !Object.keys(built.input).length && !pendingSerials.length) return true;

        setSaving(true);
        try {
            if (isNew) {
                const created = await warehouseApi.create({ ...built.input, ...heldSerials });
                const next = formOf(created.product);
                setDetail(created);
                setForm(next);
                setBaseline(next);
                setPendingSerials([]);
                pendingRef.current = [];
                // Die neue Karte liegt sofort im Speicher — kein zweites Laden.
                void cachedQuery(`warehouse:product:${created.product.id}`, () => Promise.resolve(created), { freshMs: 15_000, staleMs: 600_000, tags: ['warehouse'] });
                toast.success(t('warehouse.product.created'));
                navigate(`/warehouse/products/${created.product.id}${tab === 'serials' ? '?tab=serials' : ''}`, { replace: true });
            } else {
                const updated = await warehouseApi.update(id!, { ...built.input, ...heldSerials });
                const next = formOf(updated.product);
                setDetail(updated);
                setForm(next);
                setBaseline(next);
                setPendingSerials([]);
                pendingRef.current = [];
                toast.success(t('warehouse.product.saved'));
            }
            setFieldError(null);
            return true;
        } catch (error) {
            const info = warehouseErrorOf(error);
            const text = warehouseErrorText(error);
            // Ein Barcode einer anderen Karte: die Zeile, die ihn trägt, wird rot.
            const barcodeTaken = info.code === 'BARCODE_TAKEN' || info.code === 'MANUFACTURER_BARCODE_TAKEN';
            const field: keyof FormState | null = info.code === 'NAME_REQUIRED'
                ? 'name'
                : info.code === 'GROUP_CODE_MISSING' || info.code === 'GROUP_NOT_FOUND'
                    ? 'materialGroup'
                    : barcodeTaken || info.code?.startsWith('SUPPLIER_') || info.code === 'TOO_MANY_SUPPLIERS' ? 'suppliers' : null;
            if (field) {
                const rowKey = barcodeTaken || info.code === 'SUPPLIER_NAME_REQUIRED'
                    ? rowWithBarcode(form.suppliers, info.params?.code)?.key ?? null
                    : null;
                setFieldError({ field, text, rowKey });
                if (tab !== 'details') setTab('details');
            }
            toast.error(text);
            return false;
        } finally {
            setSaving(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving, canManage, form, baseline, isNew, id, pendingSerials, tab]);

    // ⌘S / Strg+S speichert.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (dirty || isNew) void save();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [save, dirty, isNew]);

    const discard = () => {
        if (isNew) {
            navigate('/warehouse/products');
            return;
        }
        setForm(baseline);
        setPendingSerials([]);
        pendingRef.current = [];
        setFieldError(null);
    };

    const remove = async () => {
        if (!id || deleting) return;
        setDeleting(true);
        try {
            await warehouseApi.remove(id);
            toast.success(t('warehouse.product.deleted'));
            setConfirmDelete(false);
            navigate('/warehouse/products', { replace: true });
        } catch (error) {
            toast.error(warehouseErrorText(error));
            setDeleting(false);
        }
    };

    /* ── Seriennummern ─────────────────────────────────────────────────── */
    /* Solange die Pflicht nicht gespeichert ist (neue Karte oder Häkchen eben
       gesetzt), warten gelesene Nummern und gehen mit dem Speichern. Sonst
       bucht jeder Scan sofort. */
    const holdSerials = isNew || !baseline.serialRequired;
    const serialRows = useMemo(
        () => [...(detail?.serials ?? []).map(rowOf), ...(holdSerials ? pendingSerials : [])],
        [holdSerials, pendingSerials, detail],
    );

    /** Nach jeder Änderung an den Nummern: die Menge der Karte übernehmen (ohne «geändert»). */
    const takeQuantity = (product: WarehouseProduct | null) => {
        if (!product) return;
        const quantity = numberToInput(product.quantity);
        setForm((current) => ({ ...current, quantity }));
        setBaseline((current) => ({ ...current, quantity }));
    };

    /**
     * Eine Seriennummer buchen — aus dem Feld unter dem Häkchen oder aus dem
     * Reiter «Seri numaraları». Neue Karte: sie wartet und wird mit der Karte
     * gespeichert; der Vergleich läuft gegen einen Spiegel, der sofort
     * nachzieht (ein Handscanner liest schneller, als React zeichnet).
     */
    const addSerial = async (raw: string): Promise<boolean> => {
        const serialNumber = cleanScan(raw);
        if (!serialNumber) return false;
        if (holdSerials) {
            const key = serialNumber.toLocaleLowerCase();
            const exists = pendingRef.current.some((row) => row.serialNumber.toLocaleLowerCase() === key)
                || (detail?.serials ?? []).some((serial) => serial.serialNumber.toLocaleLowerCase() === key);
            if (exists) {
                toast.error(t('warehouse.err.SERIAL_TAKEN', { serial: serialNumber }));
                return false;
            }
            const row: SerialRowModel = { key: `new-${Date.now()}-${pendingRef.current.length}`, id: null, serialNumber, project: null, device: null, createdAt: null };
            pendingRef.current = [...pendingRef.current, row];
            setPendingSerials(pendingRef.current);
            return true;
        }
        try {
            const result = await warehouseApi.addSerial(id!, { serialNumber });
            setDetail((current) => current ? { product: result.product, serials: [...current.serials, result.serial] } : current);
            takeQuantity(result.product);
            // Keine Meldung je Nummer — die neue Zeile leuchtet in der Tabelle auf.
            return true;
        } catch (error) {
            toast.error(warehouseErrorText(error));
            return false;
        }
    };

    const removeSerial = async (row: SerialRowModel) => {
        if (!row.id) {
            pendingRef.current = pendingRef.current.filter((entry) => entry.key !== row.key);
            setPendingSerials(pendingRef.current);
            return;
        }
        try {
            const result = await warehouseApi.removeSerial(row.id);
            setDetail((current) => current
                ? { product: result.product ?? current.product, serials: current.serials.filter((serial) => serial.id !== row.id) }
                : current);
            takeQuantity(result.product);
            toast.success(t('warehouse.serials.removed'));
        } catch (error) {
            toast.error(warehouseErrorText(error));
        }
    };

    /** Das Etikett dieser Karte als PDF (Grösse aus Depo › Ayarlar › Etiket). */
    const printLabel = async () => {
        const product = detail?.product;
        if (!product?.erpCode || printing) return;
        setPrinting(true);
        try {
            const [{ buildLabelsPdf }, settings] = await Promise.all([
                import('./export/warehousePdf'),
                cachedWarehouseSettings(),
            ]);
            const doc = await buildLabelsPdf([{ erpCode: product.erpCode, barcode: product.barcode, name: product.name }], settings.label);
            doc.save(`${product.erpCode}.pdf`);
        } catch (error) {
            toast.error(warehouseErrorText(error, 'warehouse.pdf.failed'));
        } finally {
            setPrinting(false);
        }
    };

    /* ── Zeichnen ──────────────────────────────────────────────────────── */
    if (!isNew && loadError) {
        return (
            <div className="ofi-wh is-detail">
                <div className="ofi-wh-state is-error" style={{ flex: 1 }}>
                    <TriangleAlert />
                    <b>{loadError.notFound ? t('warehouse.product.notFound') : loadError.text}</b>
                    <button type="button" className="ofi-wh-btn ofi-nosize" onClick={() => navigate('/warehouse/products')}>
                        {t('warehouse.product.backToList')}
                    </button>
                </div>
            </div>
        );
    }

    if (!isNew && !detail) {
        return (
            <div className="ofi-wh is-detail" aria-busy="true">
                <div className="ofi-wh-state" style={{ flex: 1 }}>
                    <span className="ofi-wh-spinner" />
                </div>
            </div>
        );
    }

    const readOnly = !canManage;
    const serialCount = form.serialRequired ? serialRows.length : 0;
    const title = form.name.trim() || (isNew ? t('warehouse.product.newTitle') : t('warehouse.product.untitled'));
    const savedCode = detail?.product.erpCode ?? null;
    const savedBarcode = detail?.product.barcode ?? null;
    const meta = [savedCode, detail?.product.materialGroup?.name ?? form.materialGroup?.name].filter(Boolean) as string[];
    const errorFor = (field: keyof FormState) => (fieldError?.field === field ? fieldError.text : null);
    const invalidSupplierRow = fieldError?.field === 'suppliers' ? fieldError.rowKey ?? null : null;

    /* Was der ERP-Code nach dem Speichern sein wird (Vorschau aus der Gruppe). */
    const groupChanged = (form.materialGroup?.id ?? null) !== (baseline.materialGroup?.id ?? null);
    const nextPrefix = form.materialGroup?.code && form.materialGroup.category?.code
        ? `${form.materialGroup.category.code}-${form.materialGroup.code}-`
        : null;
    const codeState: { value: string | null; pending: string | null; hint: string } = (() => {
        if (isNew || !savedCode) {
            if (nextPrefix) return { value: null, pending: `${nextPrefix}•••••`, hint: t('warehouse.fields.erpCodePending') };
            return { value: null, pending: null, hint: t('warehouse.fields.erpCodeHint') };
        }
        if (groupChanged && nextPrefix) return { value: savedCode, pending: `${nextPrefix}•••••`, hint: t('warehouse.fields.erpCodeRegroup') };
        if (groupChanged && !form.materialGroup) return { value: savedCode, pending: null, hint: t('warehouse.fields.erpCodeClear') };
        return { value: savedCode, pending: null, hint: '' };
    })();

    return (
        <div className="ofi-wh is-detail">
            <header className="ofi-wh-head">
                <h1 className="ofi-wh-head__title" title={title}>{title}</h1>
                {meta.length > 0 && (
                    <span className="ofi-wh-head__meta">
                        {meta.map((part, index) => (
                            <span key={index} style={{ display: 'contents' }}>
                                {index > 0 && <span className="ofi-wh-dot">·</span>}
                                <span className={index === 0 && savedCode ? 'ofi-wh-code is-dim' : ''}>{part}</span>
                            </span>
                        ))}
                    </span>
                )}
                <div className="ofi-wh-head__actions">
                    {dirty && canManage && <span className="ofi-wh-dirty">{t('warehouse.product.unsaved')}</span>}
                    {!isNew && canManage && (
                        <button type="button" className="ofi-wh-btn is-danger is-quiet ofi-nosize" onClick={() => setConfirmDelete(true)}>
                            <Trash2 />
                            {t('warehouse.actions.delete')}
                        </button>
                    )}
                    {canManage && (isNew || dirty) && (
                        <button type="button" className="ofi-wh-btn ofi-nosize" onClick={discard} disabled={saving}>
                            {isNew ? t('warehouse.actions.cancel') : t('warehouse.actions.discard')}
                        </button>
                    )}
                    {canManage && (
                        <button
                            type="button"
                            className="ofi-wh-btn is-primary ofi-nosize"
                            disabled={saving || (!isNew && !dirty)}
                            onClick={() => void save()}
                        >
                            {saving ? t('warehouse.actions.saving') : isNew ? t('warehouse.actions.create') : t('warehouse.actions.save')}
                        </button>
                    )}
                </div>
            </header>

            <nav className="ofi-wh-tabs" role="tablist" aria-label={title}>
                <button
                    type="button"
                    role="tab"
                    id="ofi-wh-tab-details"
                    aria-selected={tab === 'details'}
                    className={`ofi-nosize ${tab === 'details' ? 'is-on' : ''}`}
                    onClick={() => setTab('details')}
                >
                    {t('warehouse.product.tabs.details')}
                </button>
                {form.serialRequired && (
                    <button
                        type="button"
                        role="tab"
                        id="ofi-wh-tab-serials"
                        aria-selected={tab === 'serials'}
                        className={`ofi-nosize ${tab === 'serials' ? 'is-on' : ''}`}
                        onClick={() => setTab('serials')}
                    >
                        {t('warehouse.product.tabs.serials')}
                        <span>{serialCount}</span>
                    </button>
                )}
            </nav>

            {readOnly && (
                <div className="ofi-wh-note">
                    <Info />
                    {t('warehouse.product.readOnly')}
                </div>
            )}

            {tab === 'details' && (
                <div className="ofi-wh-form" role="tabpanel" aria-labelledby="ofi-wh-tab-details">
                    <div className="ofi-wh-form__col">
                        <Group title={t('warehouse.section.identity')}>
                            <Row label={t('warehouse.fields.erpCode')} hint={codeState.hint || undefined}>
                                <div className="ofi-wh-erp" aria-live="polite">
                                    {codeState.value && (
                                        <span className={`ofi-wh-erp__code ${codeState.pending || (groupChanged && !form.materialGroup) ? 'is-old' : ''}`}>
                                            {codeState.value}
                                        </span>
                                    )}
                                    {codeState.pending && (
                                        <span className="ofi-wh-erp__next">
                                            {codeState.value && <span aria-hidden>→</span>}
                                            {codeState.pending}
                                        </span>
                                    )}
                                    {!codeState.value && !codeState.pending && <span className="ofi-wh-erp__empty">—</span>}
                                </div>
                            </Row>
                            <Row label={t('warehouse.fields.materialGroup')} error={errorFor('materialGroup')}>
                                <MaterialGroupSelect
                                    value={form.materialGroup}
                                    catalog={catalog}
                                    onChange={(next) => update('materialGroup', next)}
                                    disabled={readOnly}
                                    invalid={Boolean(errorFor('materialGroup'))}
                                />
                            </Row>
                            <Row label={t('warehouse.fields.name')} htmlFor="wh-name" required error={errorFor('name')}>
                                <input
                                    id="wh-name"
                                    ref={nameRef}
                                    className={`ofi-wh-input ${errorFor('name') ? 'is-invalid' : ''}`}
                                    value={form.name}
                                    maxLength={255}
                                    autoFocus={isNew}
                                    aria-required
                                    disabled={readOnly}
                                    onChange={(event) => update('name', event.target.value)}
                                />
                            </Row>
                            <Row label={t('warehouse.fields.brand')} htmlFor="wh-brand">
                                <input id="wh-brand" className="ofi-wh-input" value={form.brand} maxLength={120} disabled={readOnly} onChange={(event) => update('brand', event.target.value)} />
                            </Row>
                            <Row label={t('warehouse.fields.modelNumber')} htmlFor="wh-model">
                                <input id="wh-model" className="ofi-wh-input" value={form.modelNumber} maxLength={120} spellCheck={false} disabled={readOnly} onChange={(event) => update('modelNumber', event.target.value)} />
                            </Row>
                        </Group>

                        <Group title={t('warehouse.section.supplier')}>
                            <Row error={errorFor('suppliers')}>
                                <SupplierListEditor
                                    rows={form.suppliers}
                                    onChange={(next) => update('suppliers', next)}
                                    disabled={readOnly}
                                    invalidKey={invalidSupplierRow}
                                />
                            </Row>
                        </Group>

                        <Group title={t('warehouse.section.description')}>
                            <Row>
                                <textarea
                                    className="ofi-wh-input"
                                    aria-label={t('warehouse.fields.description')}
                                    value={form.description}
                                    rows={5}
                                    maxLength={20000}
                                    disabled={readOnly}
                                    onChange={(event) => update('description', event.target.value)}
                                />
                            </Row>
                        </Group>
                    </div>

                    <div className="ofi-wh-form__col">
                        <Group title={t('warehouse.section.stock')}>
                            <Row
                                label={t('warehouse.fields.quantity')}
                                htmlFor="wh-qty"
                                hint={form.serialRequired ? t('warehouse.fields.quantityFromSerials') : undefined}
                                error={errorFor('quantity')}
                            >
                                <input
                                    id="wh-qty"
                                    className={`ofi-wh-input is-num ${errorFor('quantity') ? 'is-invalid' : ''}`}
                                    inputMode="decimal"
                                    value={form.serialRequired ? String(serialCount) : form.quantity}
                                    readOnly={form.serialRequired}
                                    disabled={readOnly}
                                    onChange={(event) => update('quantity', event.target.value)}
                                />
                            </Row>
                            <Row label={t('warehouse.fields.purchasePrice')} htmlFor="wh-price" error={errorFor('purchasePrice')}>
                                <div className="ofi-wh-money">
                                    <input
                                        id="wh-price"
                                        className={`ofi-wh-input is-num ${errorFor('purchasePrice') ? 'is-invalid' : ''}`}
                                        inputMode="decimal"
                                        value={form.purchasePrice}
                                        placeholder="0.00"
                                        disabled={readOnly}
                                        onChange={(event) => update('purchasePrice', event.target.value)}
                                    />
                                    <select
                                        className="ofi-wh-input"
                                        aria-label={t('warehouse.fields.currency')}
                                        value={form.currency}
                                        disabled={readOnly}
                                        onChange={(event) => update('currency', event.target.value)}
                                    >
                                        {CURRENCY_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
                                    </select>
                                </div>
                            </Row>
                            <Row
                                label={t('warehouse.fields.minimumOrderQuantity')}
                                htmlFor="wh-moq"
                                hint={t('warehouse.fields.minimumOrderQuantityHint')}
                                error={errorFor('minimumOrderQuantity')}
                            >
                                <input
                                    id="wh-moq"
                                    className={`ofi-wh-input is-num ${errorFor('minimumOrderQuantity') ? 'is-invalid' : ''}`}
                                    inputMode="decimal"
                                    value={form.minimumOrderQuantity}
                                    placeholder="—"
                                    disabled={readOnly}
                                    onChange={(event) => update('minimumOrderQuantity', event.target.value)}
                                />
                            </Row>
                        </Group>

                        <Group title={t('warehouse.section.barcodes')}>
                            <Row label={t('warehouse.fields.barcode')} top={Boolean(savedBarcode)} hint={savedBarcode ? undefined : t('warehouse.fields.barcodeHint')}>
                                {savedBarcode ? (
                                    <div className="ofi-wh-gs1">
                                        <Ean13Barcode code={savedBarcode} caption={savedCode} className="ofi-wh-gs1__svg" />
                                        <div className="ofi-wh-gs1__side">
                                            <span className="ofi-wh-code">{savedBarcode}</span>
                                            <span className="ofi-wh-row__hint">{t('warehouse.fields.barcodeGs1')}</span>
                                            <button
                                                type="button"
                                                className="ofi-wh-btn is-small ofi-nosize"
                                                disabled={!savedCode || printing}
                                                title={savedCode ? undefined : t('warehouse.fields.printNeedsCode')}
                                                onClick={() => void printLabel()}
                                            >
                                                <Printer />
                                                {printing ? t('warehouse.pdf.preparing') : t('warehouse.fields.printLabel')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <span className="ofi-wh-erp__empty">—</span>
                                )}
                            </Row>
                            {/* «Barkod alanlarına göre tedarikçi seçim yeri olacak — eklenen
                                tedarikçileri seçtikçe barkodlar değişecek.» */}
                            <Row label={t('warehouse.fields.manufacturerBarcode')} top>
                                <SupplierBarcodePicker
                                    rows={form.suppliers}
                                    onChange={(next) => update('suppliers', next)}
                                    disabled={readOnly}
                                    invalidKey={invalidSupplierRow}
                                />
                            </Row>
                        </Group>

                        <Group title={t('warehouse.section.serial')}>
                            <Row>
                                <label className="ofi-wh-check">
                                    <input
                                        type="checkbox"
                                        checked={form.serialRequired}
                                        disabled={readOnly}
                                        onChange={(event) => update('serialRequired', event.target.checked)}
                                    />
                                    <span className="ofi-wh-check__box" aria-hidden><Check /></span>
                                    <span className="ofi-wh-check__text">
                                        <b>{t('warehouse.fields.serialRequired')}</b>
                                        <small>{t('warehouse.fields.serialRequiredHint')}</small>
                                    </span>
                                </label>
                            </Row>
                            {/* «Seri numarası gereklidir tıklayınca direkt altında input çıkmalı … okutuldukça
                                bir sayı olarak yazsın sadece, tıklayınca seri numaraları bölümü açılsın.» */}
                            {form.serialRequired && (
                                <Row>
                                    <div className="ofi-wh-serialinline">
                                        {!readOnly && (
                                            <BarcodeInput
                                                value={serialInput}
                                                onChange={setSerialInput}
                                                onEnter={(value) => {
                                                    // Sofort leer: der nächste Scan landet nie auf einer
                                                    // abgewiesenen Nummer (die Meldung nennt sie).
                                                    setSerialInput('');
                                                    return addSerial(value);
                                                }}
                                                continuous
                                                scanStatus={t('warehouse.serials.count', { count: serialCount })}
                                                lead={<ScanLine className="ofi-wh-field__lead" />}
                                                ariaLabel={t('warehouse.serials.inputPlaceholder')}
                                                placeholder={t('warehouse.serials.inputPlaceholder')}
                                                scanTitle={t('warehouse.serials.scanTitle')}
                                            />
                                        )}
                                        <button
                                            type="button"
                                            key={serialCount}
                                            className="ofi-wh-serialcount ofi-nosize"
                                            title={t('warehouse.serials.openList')}
                                            onClick={() => setTab('serials')}
                                        >
                                            <b>{serialCount}</b>
                                            <span>{t('warehouse.serials.countLabel', { count: serialCount })}</span>
                                            <ChevronRight />
                                        </button>
                                    </div>
                                </Row>
                            )}
                        </Group>
                    </div>
                </div>
            )}

            {tab === 'serials' && (
                <div role="tabpanel" aria-labelledby="ofi-wh-tab-serials" style={{ display: 'contents' }}>
                    <SerialNumbersPanel
                        rows={serialRows}
                        canEdit={canManage}
                        pending={holdSerials}
                        onAdd={addSerial}
                        onRemove={removeSerial}
                    />
                </div>
            )}

            <PopupDialog
                open={confirmDelete}
                onClose={() => { if (!deleting) setConfirmDelete(false); }}
                title={t('warehouse.product.deleteTitle')}
                subtitle={serialRows.length
                    ? t('warehouse.product.deleteTextSerials', { name: title, count: serialRows.length })
                    : t('warehouse.product.deleteText', { name: title })}
                icon={<Trash2 size={18} />}
                tone="danger"
                width={440}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setConfirmDelete(false)} disabled={deleting}>{t('warehouse.actions.cancel')}</PopupButton>
                        <PopupButton variant="danger" loading={deleting} onClick={() => void remove()}>{t('warehouse.actions.delete')}</PopupButton>
                    </PopupActions>
                )}
            />

            <PopupDialog
                open={guard.isOpen}
                onClose={guard.cancel}
                title={t('warehouse.product.unsaved')}
                subtitle={t('warehouse.product.unsavedLeave')}
                icon={<TriangleAlert size={18} />}
                tone="warning"
                width={460}
                footer={(
                    <PopupActions start={<PopupButton onClick={guard.cancel}>{t('warehouse.actions.cancel')}</PopupButton>}>
                        <PopupButton variant="danger" onClick={guard.proceed}>{t('warehouse.actions.discard')}</PopupButton>
                        <PopupButton
                            variant="primary"
                            loading={saving}
                            onClick={() => { void save().then((ok) => { if (ok) guard.proceed(); }); }}
                        >
                            {t('warehouse.actions.save')}
                        </PopupButton>
                    </PopupActions>
                )}
            />
        </div>
    );
};

export default WarehouseProductPage;
