import { create } from 'zustand';
import { unitsApi } from '../lib/api/units';
import type { MeasurementUnit, UnitPatch } from '../lib/api/units';

/**
 * MENGENEINHEITEN — die Liste des Mandanten, aus der überall gewählt wird
 * (Stück, Meter, Kilogramm, Liter, Set, Packung …). Gepflegt wird sie unter
 * Einstellungen → Module → Lager → Einheiten.
 *
 * Sie steht in JEDEM Artikelformular, wird sich aber selten ändern — deshalb
 * wird sie EINMAL je Mandant geholt und danach aus dem Speicher bedient.
 * `ensure()` ist der einzige Ladeweg für die Auswahlfelder: mehrere Felder auf
 * derselben Seite teilen sich denselben Abruf, statt ihn mehrfach zu stellen.
 * Der Mandantenschlüssel gehört dazu — nach einem Firmenwechsel wäre die Liste
 * sonst die der vorigen Firma.
 *
 * `ensureUsage()` holt dieselbe Liste MIT den Verwendungszahlen (Verkauf,
 * Lager, Bestand). Nur die Einstellungsseite braucht sie; die Auswahlfelder
 * sollen die drei Gruppierungen nicht bei jedem Formular bezahlen.
 */

const tenantKey = () => sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId') || '';

interface UnitState {
    units: MeasurementUnit[];
    loading: boolean;
    /** Der Mandant, zu dem die geladene Liste gehört (null = noch nichts geladen). */
    loadedFor: string | null;
    /** Der Mandant, für den auch die Verwendungszahlen geholt wurden. */
    usageLoadedFor: string | null;
    error: string | null;

    /** Lädt die Liste, falls sie für diesen Mandanten noch fehlt. */
    ensure: () => Promise<void>;
    /** Dasselbe, aber mit den Verwendungszahlen (Einstellungsseite). */
    ensureUsage: () => Promise<void>;
    /** Holt die Liste in jedem Fall neu; behält dabei, was schon geladen war. */
    refresh: () => Promise<void>;

    create: (input: { code: string; name: string }) => Promise<MeasurementUnit>;
    update: (id: string, patch: UnitPatch) => Promise<MeasurementUnit>;
    remove: (id: string) => Promise<void>;
}

/** Läuft gerade ein Abruf? Dann hängen sich weitere Aufrufer an ihn an. */
let inFlight: Promise<void> | null = null;

export const useUnitStore = create<UnitState>((set, get) => {
    const load = async (withUsage: boolean) => {
        const forTenant = tenantKey();
        set({ loading: true, error: null });
        try {
            const units = await unitsApi.list({ usage: withUsage });
            set({
                units,
                loadedFor: forTenant,
                usageLoadedFor: withUsage ? forTenant : get().usageLoadedFor,
                loading: false,
            });
        } catch (error: any) {
            set({ loading: false, error: error?.response?.data?.error || 'Einheiten konnten nicht geladen werden.' });
        }
    };

    const fetchOnce = (withUsage: boolean) => {
        if (!inFlight) inFlight = load(withUsage).finally(() => { inFlight = null; });
        return inFlight;
    };

    return {
        units: [],
        loading: false,
        loadedFor: null,
        usageLoadedFor: null,
        error: null,

        ensure: async () => {
            if (get().loadedFor === tenantKey()) return;
            await fetchOnce(false);
        },

        ensureUsage: async () => {
            if (get().usageLoadedFor === tenantKey()) return;
            await fetchOnce(true);
        },

        // Nach dem Pflegen: die Zahlen nur dann wieder mitholen, wenn sie
        // überhaupt jemand sieht.
        refresh: () => fetchOnce(get().usageLoadedFor === tenantKey()),

        create: async (input) => {
            const created = await unitsApi.create(input);
            set((state) => ({ units: [...state.units, { ...created, usage: created.usage ?? { salesPositions: 0, articles: 0, stockQuantity: 0 } }] }));
            return created;
        },

        update: async (id, patch) => {
            const saved = await unitsApi.update(id, patch);
            set((state) => ({
                units: state.units.map((unit) => {
                    // Die Antwort trägt keine Verwendungszahlen — die bisherigen
                    // bleiben stehen, sonst leerte jedes Umbenennen die Spalten.
                    if (unit.id === saved.id) return { ...saved, usage: saved.usage ?? unit.usage };
                    // Die Vorgabe gibt es genau einmal — der Server hat sie der
                    // bisherigen schon abgenommen, die Liste zieht mit.
                    return saved.isDefault && unit.isDefault ? { ...unit, isDefault: false } : unit;
                }),
            }));
            return saved;
        },

        remove: async (id) => {
            await unitsApi.remove(id);
            set((state) => ({ units: state.units.filter((unit) => unit.id !== id) }));
        },
    };
});

/** Nur die wählbaren Einheiten — stillgelegte gehören nicht ins Auswahlfeld. */
export const selectableUnits = (units: MeasurementUnit[]) => units.filter((unit) => unit.isActive);

/** Der ausgeschriebene Name zu einem Code, sonst der Code selbst. */
export const unitLabel = (units: MeasurementUnit[], code: string | null | undefined): string => {
    const text = String(code ?? '').trim();
    if (!text) return '';
    const match = units.find((unit) => unit.code.toLowerCase() === text.toLowerCase());
    return match ? match.name : text;
};
