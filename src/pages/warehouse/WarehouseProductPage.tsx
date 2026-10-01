import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Info, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { cachedQuery } from '@/lib/api/queryCache';
import { cachedWarehouseSettings, readWarehouseCatalog, readWarehouseProduct, warehouseApi, warehouseErrorOf, warehouseErrorText } from '@/lib/api/warehouse';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';
import { useAuthStore } from '@/store/authStore';
import type { WarehouseCatalog, WarehouseMissingField, WarehouseProduct, WarehouseProductDetail, WarehouseSerial } from '@/types/warehouse';
import '@/styles/modules/warehouse.css';

import { SerialNumbersPanel, type SerialRowModel } from './components/SerialNumbersPanel';
import { SupplierListEditor } from './components/SupplierListEditor';
import { cleanScan } from './hooks/scanRules';
import { BarcodesSection } from './product/BarcodesSection';
import { Group, Row } from './product/formParts';
import { IdentitySection, type ErpCodeState } from './product/IdentitySection';
import { DraftNotice, ProductHeader } from './product/ProductHeader';
import { buildInput, EMPTY_FORM, fieldOfMissing, formOf, missingOf, sameForm, type FieldError, type FormState } from './product/productForm';
import { SerialSection } from './product/SerialSection';
import { StockSection } from './product/StockSection';
import { rowWithBarcode, supplierRowsOf } from './supplierRows';
import { numberToInput } from './warehouseFormat';

type Tab = 'details' | 'serials';
type SaveMode = 'draft' | 'final';

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

/**
 * ── DEPO · ÜRÜN KARTI (26.09.2026, Vorgabe Samet) ───────────────────────────
 *
 * Dieselbe Seite legt an (`/warehouse/products/new`, auch mit `?barcode=` aus
 * «Ürün ekle») und ändert (`/:id`). Die Felder stehen in den gruppierten
 * Tafeln der macOS-Systemeinstellungen (Abschnitte in `product/`). Gespeichert
 * wird ausdrücklich (Knopf oder ⌘/Strg+S); wer mit ungespeicherten Änderungen
 * gehen will, wird gefragt — nie aber, weil sich die Kamera nach einem Scan
 * schliesst («barkod okuttuktan sonra kaydedilmemiş değişiklikler pop-up'ı …
 * asla», lib/backDismiss.ts).
 *
 * 30.09.2026: «Ürün kodu», «Üretici kodu» (statt Model numarası), Einheit,
 * E-Mail je Lieferant — und die Pflicht einer fertigen Karte (Name, Einheit,
 * ein Lieferant, eine E-Mail); ohne sie nur «Taslak olarak kaydet».
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
    const [saving, setSaving] = useState<SaveMode | null>(null);
    const [fieldError, setFieldError] = useState<FieldError | null>(null);
    /** Ein «Kaydet» fand Lücken — der Hinweis bleibt, bis sie geschlossen sind. */
    const [attempted, setAttempted] = useState(false);
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
    const guard = useUnsavedChangesGuard(canManage && dirty && saving === null && !deleting);
    const savedDraft = Boolean(detail?.product.isDraft);
    const missing: WarehouseMissingField[] = useMemo(() => missingOf(form), [form]);

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        if (fieldError?.field === key) setFieldError(null);
    };

    /* ── Speichern ─────────────────────────────────────────────────────── */
    const save = useCallback(async (mode: SaveMode): Promise<boolean> => {
        if (saving || !canManage) return false;
        const built = buildInput(form, isNew ? null : baseline);
        if (!('input' in built)) {
            setFieldError({ field: built.field, text: built.error, rowKey: built.rowKey ?? null });
            if (tab !== 'details') setTab('details');
            if (built.field === 'name') window.setTimeout(() => nameRef.current?.focus(), 0);
            toast.error(built.error);
            return false;
        }
        // «Kaydet» nur mit allem, was eine fertige Karte braucht — sonst bleibt «Taslak olarak kaydet».
        if (mode === 'final') {
            const gaps = missingOf(form);
            if (gaps.length) {
                const first = gaps[0]!;
                setAttempted(true);
                setFieldError({ field: fieldOfMissing(first), text: t(`warehouse.missing.${first}Hint`) });
                if (tab !== 'details') setTab('details');
                toast.error(t('warehouse.product.incompleteToast'));
                return false;
            }
        }
        const isDraft = mode === 'draft';
        const heldSerials = form.serialRequired && pendingSerials.length
            ? { serials: pendingSerials.map((row) => ({ serialNumber: row.serialNumber })) }
            : {};
        const draftChanged = !isNew && Boolean(detail?.product.isDraft) !== isDraft;
        if (!isNew && !Object.keys(built.input).length && !pendingSerials.length && !draftChanged) return true;

        setSaving(mode);
        try {
            if (isNew) {
                const created = await warehouseApi.create({ ...built.input, ...heldSerials, isDraft });
                const next = formOf(created.product);
                setDetail(created);
                setForm(next);
                setBaseline(next);
                setPendingSerials([]);
                pendingRef.current = [];
                // Die neue Karte liegt sofort im Speicher — kein zweites Laden.
                void cachedQuery(`warehouse:product:${created.product.id}`, () => Promise.resolve(created), { freshMs: 15_000, staleMs: 600_000, tags: ['warehouse'] });
                toast.success(t(isDraft ? 'warehouse.product.createdDraft' : 'warehouse.product.created'));
                navigate(`/warehouse/products/${created.product.id}${tab === 'serials' ? '?tab=serials' : ''}`, { replace: true });
            } else {
                const updated = await warehouseApi.update(id!, { ...built.input, ...heldSerials, isDraft });
                const next = formOf(updated.product);
                setDetail(updated);
                setForm(next);
                setBaseline(next);
                setPendingSerials([]);
                pendingRef.current = [];
                toast.success(t(isDraft ? 'warehouse.product.savedDraft' : 'warehouse.product.saved'));
            }
            setFieldError(null);
            setAttempted(false);
            return true;
        } catch (error) {
            const info = warehouseErrorOf(error);
            const text = warehouseErrorText(error);
            // Ein Barcode einer anderen Karte: die Zeile, die ihn trägt, wird rot.
            const barcodeTaken = info.code === 'BARCODE_TAKEN' || info.code === 'MANUFACTURER_BARCODE_TAKEN';
            const field: keyof FormState | null = info.code === 'NAME_REQUIRED'
                ? 'name'
                : info.code === 'UNIT_INVALID'
                    ? 'unit'
                    : info.code === 'GROUP_CODE_MISSING' || info.code === 'GROUP_NOT_FOUND'
                        ? 'materialGroup'
                        : barcodeTaken || info.code?.startsWith('SUPPLIER_') || info.code === 'TOO_MANY_SUPPLIERS' || info.code === 'PRODUCT_INCOMPLETE' ? 'suppliers' : null;
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
            setSaving(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving, canManage, form, baseline, isNew, id, pendingSerials, tab, detail]);

    // ⌘S / Strg+S speichert — fertig, wenn alles da ist, sonst als Taslak.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (dirty || isNew) void save(missingOf(form).length ? 'draft' : 'final');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [save, dirty, isNew, form]);

    const discard = () => {
        if (isNew) {
            navigate('/warehouse/products');
            return;
        }
        setForm(baseline);
        setPendingSerials([]);
        pendingRef.current = [];
        setFieldError(null);
        setAttempted(false);
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
    const codeState: ErpCodeState = (() => {
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
            <ProductHeader
                title={title}
                meta={meta}
                savedCode={savedCode}
                draft={savedDraft}
                dirty={dirty}
                canManage={canManage}
                isNew={isNew}
                saving={saving}
                onDelete={() => setConfirmDelete(true)}
                onDiscard={discard}
                onSaveDraft={() => void save('draft')}
                onSave={() => void save('final')}
            />

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
            {canManage && tab === 'details' && (savedDraft || attempted) && <DraftNotice missing={missing} draft={savedDraft} />}

            {tab === 'details' && (
                <div className="ofi-wh-form" role="tabpanel" aria-labelledby="ofi-wh-tab-details">
                    <div className="ofi-wh-form__col">
                        <IdentitySection
                            form={form}
                            update={update}
                            errorFor={errorFor}
                            readOnly={readOnly}
                            isNew={isNew}
                            catalog={catalog}
                            codeState={codeState}
                            groupCleared={groupChanged && !form.materialGroup}
                            nameRef={nameRef}
                        />

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
                        <StockSection form={form} update={update} errorFor={errorFor} readOnly={readOnly} serialCount={serialCount} />
                        <BarcodesSection
                            savedBarcode={savedBarcode}
                            savedCode={savedCode}
                            printing={printing}
                            onPrint={() => void printLabel()}
                            rows={form.suppliers}
                            onRows={(next) => update('suppliers', next)}
                            readOnly={readOnly}
                            invalidKey={invalidSupplierRow}
                        />
                        <SerialSection
                            serialRequired={form.serialRequired}
                            onSerialRequired={(next) => update('serialRequired', next)}
                            readOnly={readOnly}
                            serialInput={serialInput}
                            onSerialInput={setSerialInput}
                            addSerial={addSerial}
                            serialCount={serialCount}
                            onOpenList={() => setTab('serials')}
                        />
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
                            loading={saving !== null}
                            // Beim Gehen wird gesichert, was da ist — mit Lücken als Taslak.
                            onClick={() => { void save(missingOf(form).length ? 'draft' : 'final').then((ok) => { if (ok) guard.proceed(); }); }}
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
