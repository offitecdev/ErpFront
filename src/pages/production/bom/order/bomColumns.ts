/**
 * ── DIE EIGENEN SPALTEN EINES BOM-BELEGS (27.09.2026) ───────────────────────
 *
 * Die Preisanfrage trägt gleich nach dem Produktnamen das Modell (`stdModel`,
 * Samet: «fiyat talebinde sadece ürün adı, miktarı, modeli ile aktarım
 * yapılsın»). Die BOM schreibt es (productionBomPurchaseWriter); die
 * Auftragsseite zeigt es fest, ändert es nicht und schreibt es beim Speichern an
 * seine Stelle zurück — auch wenn eine andere Vorlage gewählt wird.
 *
 * KEIN ERP-CODE MEHR (29.09.2026, Samet: «sipariş PDF'lerinde ERP kodları
 * gözükmesin, satırlarda da gözükmesin — sipariş, hani aktarım yapıyoruz»): die
 * frühere Spalte `stdErp` («ERP-Code» vorn in der Bestellung) wird weder gezeigt
 * noch gedruckt noch wieder gespeichert — ältere Belege, die sie noch tragen,
 * verlieren sie beim nächsten Speichern. Der Code reist still im Feld `code` der
 * Position mit (Wareneingang, Artikel).
 */
export const BOM_ERP_KEY = 'stdErp';
export const BOM_MODEL_KEY = 'stdModel';

/** Modell, Name und Menge stehen fest («satır ekleyemiyoruz»). */
export const isBomLockedColumn = (id: string): boolean =>
    id === BOM_MODEL_KEY || id === 'name' || id === 'quantity';

/** Das Modell gleich nach der Spalte des Produktnamens (ohne sie: vorn). */
const withModelAfterName = <C>(rest: C[], model: C[], isName: (column: C) => boolean): C[] => {
    if (!model.length) return rest;
    const at = rest.findIndex(isName);
    return at >= 0 ? [...rest.slice(0, at + 1), ...model, ...rest.slice(at + 1)] : [...model, ...rest];
};

/** Die Spalten der Tabelle eines BOM-Belegs: das Modell nach dem Namen, nie der ERP-Code. */
export const orderBomColumns = <C extends { id: string; label?: string | null }>(columns: C[]): C[] => {
    const model = columns.filter((column) => column.id === BOM_MODEL_KEY);
    const rest = columns.filter((column) => column.id !== BOM_ERP_KEY && column.id !== BOM_MODEL_KEY);
    return withModelAfterName(rest, model, (column) => column.label === 'productName');
};

/**
 * Was als `tableColumns` gespeichert wird: die Spalten der gewählten Vorlage
 * und dazu das Modell, wenn der Beleg es schon HAT — an seiner Stelle. Die
 * alte ERP-Spalte fällt dabei weg.
 */
export const bomColumnsSnapshot = <C extends { key: string; name: string; label: string | null; type: 'text' | 'number' }>(
    snapshot: C[],
    loaded: ReadonlyArray<C> | null | undefined,
): C[] => {
    const model = loaded?.find((column) => column.key === BOM_MODEL_KEY) ?? null;
    const rest = snapshot.filter((column) => column.key !== BOM_ERP_KEY && column.key !== BOM_MODEL_KEY);
    return withModelAfterName(rest, model ? [model] : [], (column) => column.label === 'productName');
};
