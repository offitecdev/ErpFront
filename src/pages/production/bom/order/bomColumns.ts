/**
 * ── DIE EIGENEN SPALTEN EINES BOM-BELEGS (27.09.2026) ───────────────────────
 *
 * Die Bestellung trägt vorn den ERP-Code (`stdErp`: «erp kodu, ürün adı …»),
 * die Preisanfrage gleich nach dem Produktnamen das Modell (`stdModel`, Samet:
 * «fiyat talebinde sadece ürün adı, miktarı, modeli ile aktarım yapılsın»).
 * Beide schreibt die BOM (productionBomPurchaseWriter); die Auftragsseite
 * zeigt sie fest, ändert sie nicht und schreibt sie beim Speichern an ihre
 * Stelle zurück — auch wenn eine andere Vorlage gewählt wird.
 */
export const BOM_ERP_KEY = 'stdErp';
export const BOM_MODEL_KEY = 'stdModel';

/** Code, Modell, Name und Menge stehen fest («satır ekleyemiyoruz»). */
export const isBomLockedColumn = (id: string): boolean =>
    id === BOM_ERP_KEY || id === BOM_MODEL_KEY || id === 'name' || id === 'quantity';

/** Das Modell gleich nach der Spalte des Produktnamens (ohne sie: vorn). */
const withModelAfterName = <C>(rest: C[], model: C[], isName: (column: C) => boolean): C[] => {
    if (!model.length) return rest;
    const at = rest.findIndex(isName);
    return at >= 0 ? [...rest.slice(0, at + 1), ...model, ...rest.slice(at + 1)] : [...model, ...rest];
};

/** Die Spalten der Tabelle eines BOM-Belegs: ERP-Code vorn, Modell nach dem Namen. */
export const orderBomColumns = <C extends { id: string; label?: string | null }>(columns: C[]): C[] => {
    const erp = columns.filter((column) => column.id === BOM_ERP_KEY);
    const model = columns.filter((column) => column.id === BOM_MODEL_KEY);
    const rest = columns.filter((column) => column.id !== BOM_ERP_KEY && column.id !== BOM_MODEL_KEY);
    return [...erp, ...withModelAfterName(rest, model, (column) => column.label === 'productName')];
};

/**
 * Was als `tableColumns` gespeichert wird: die Spalten der gewählten Vorlage
 * und dazu die eigenen Spalten, die der Beleg schon HAT — an ihrer Stelle.
 * Eine Bestellung trägt den ERP-Code immer (`erpAlways`), eine Preisanfrage
 * nur, wenn sie ihn schon hatte (die alten Kopien einer Bestellung).
 */
export const bomColumnsSnapshot = <C extends { key: string; name: string; label: string | null; type: 'text' | 'number' }>(
    snapshot: C[],
    loaded: ReadonlyArray<C> | null | undefined,
    options: { erpAlways: boolean },
): C[] => {
    const own = (key: string): C | null => loaded?.find((column) => column.key === key) ?? null;
    const erp = own(BOM_ERP_KEY) ?? (options.erpAlways ? ({ key: BOM_ERP_KEY, name: 'ERP-Code', label: null, type: 'text' } as C) : null);
    const model = own(BOM_MODEL_KEY);
    const rest = snapshot.filter((column) => column.key !== BOM_ERP_KEY && column.key !== BOM_MODEL_KEY);
    return [
        ...(erp ? [erp] : []),
        ...withModelAfterName(rest, model ? [model] : [], (column) => column.label === 'productName'),
    ];
};
