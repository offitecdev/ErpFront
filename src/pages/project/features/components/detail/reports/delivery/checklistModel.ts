import type { DeliveryResponseItem, DeliveryStatus } from '@/lib/api/project';

/**
 * Ein Übergabe-Rapport besteht aus mehreren CHECKLISTEN. Auf dem Datensatz gibt
 * es dafür kein eigenes Feld: jede Antwortzeile trägt den Listennamen in
 * `category`. Diese Datei ist die einzige Stelle, die das weiss — Ansicht und
 * Popups arbeiten mit `ReportChecklist`.
 */
export type ReportChecklist = {
    name: string;
    items: DeliveryResponseItem[];
};

export const newRowId = () => Math.random().toString(36).slice(2, 10);

/** Der Listenname einer Zeile; Altdatensätze fallen auf den Rapportnamen zurück. */
export const checklistNameOf = (row: DeliveryResponseItem, fallback: string) =>
    row.category?.trim() || fallback;

/** Antwortzeilen → Checklisten, in der Reihenfolge ihres ersten Auftretens. */
export const groupChecklists = (responses: DeliveryResponseItem[], fallback: string): ReportChecklist[] => {
    const order: string[] = [];
    const map = new Map<string, DeliveryResponseItem[]>();
    for (const row of responses) {
        const key = checklistNameOf(row, fallback);
        if (!map.has(key)) {
            order.push(key);
            map.set(key, []);
        }
        map.get(key)!.push(row);
    }
    return order.map((name) => ({ name, items: map.get(name)! }));
};

/** Wie viele Kontrollpunkte beantwortet sind. */
export const answeredCount = (items: DeliveryResponseItem[]) =>
    items.filter((item) => item.status !== null).length;

export const emptyCheck = (checklistName: string, label = ''): DeliveryResponseItem => ({
    id: newRowId(),
    category: checklistName,
    label,
    status: null,
    measurement: '',
    measurementEnabled: true,
});

export const STATUS_ORDER: Array<Exclude<DeliveryStatus, null>> = ['YES', 'NO', 'NA'];

export const statusLabelKey: Record<Exclude<DeliveryStatus, null>, string> = {
    YES: 'projects.delivery.yes',
    NO: 'projects.delivery.no',
    NA: 'projects.delivery.na',
};
