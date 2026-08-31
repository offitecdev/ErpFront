import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle, Plus, Trash01 } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import type { MeasurementUnit } from '@/lib/api/units';
import { useUnitStore } from '@/store/unitStore';
import { useAuthStore } from '@/store/authStore';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { Switch } from '@/components/ui-shared/Switch';
import { TableStateRow } from '@/components/ui-shared/TableKit';

/**
 * LAGER → EINHEITEN: die Mengeneinheiten des Mandanten — Stück, Meter,
 * Kilogramm, Liter, Set, Packung … Genau diese Einträge stehen überall dort zur
 * Auswahl, wo ein Artikel seine Einheit bekommt.
 *
 * ZWEI KARTEN nebeneinander (Benutzervorgabe 19.08.2026):
 *   links  — die Liste selbst, die STANDARDTABELLE der Anwendung
 *            (`data-inv-table`), damit sie sich wie jede andere Liste anfühlt.
 *   rechts — «Verwendung», eine Zusammenfassung im Schnitt der
 *            Projektübersicht: Beschriftung links, Zahl rechts, kein
 *            Kopfstreifen. Sie redet über die Zeile, auf der man steht, und
 *            beantwortet die einzige Frage, die man vor dem Umbenennen oder
 *            Stilllegen hat: Wen trifft das?
 *
 * Eine Einheit sind ZWEI Angaben: das kurze Zeichen ("Stk"), das neben der
 * Menge in Listen und Belegen steht, und der ausgeschriebene Name ("Stück"),
 * den das Auswahlfeld zeigt. Beide werden direkt in der Zeile geändert und
 * beim Verlassen des Feldes gespeichert — es gibt kein Sammel-Speichern.
 *
 * Zwei Schalter je Zeile: die Vorgabe (die Einheit, die ein neuer Artikel ohne
 * eigene Angabe bekommt — genau eine) und die Verfügbarkeit (stillgelegte
 * Einheiten verschwinden aus der Auswahl, bleiben auf bestehenden Artikeln aber
 * lesbar). Gelöscht wird nur, was kein Artikel trägt.
 */

const MANAGE_PERMISSIONS = [
    'inventory.manage',
    'inventory.articles.update',
    'inventory.articles.create',
    'roles.manage',
    'tenants.update',
];

const errorText = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

/** Menge ohne unnötige Nachkommastellen — 12 statt 12.00, 0.5 bleibt 0.5. */
const fmtQuantity = (value: number): string =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

/** Eine Zeile der Liste — Zeichen, Name, Vorgabe, Verfügbarkeit, Löschen. */
const UnitRow = ({
    unit,
    canManage,
    picked,
    onPick,
    onDelete,
}: {
    unit: MeasurementUnit;
    canManage: boolean;
    picked: boolean;
    onPick: () => void;
    onDelete: () => void;
}) => {
    const update = useUnitStore((state) => state.update);
    const [code, setCode] = useState(unit.code);
    const [name, setName] = useState(unit.name);
    const [busy, setBusy] = useState(false);

    // Der Server ist die Wahrheit: nach einem Speichern (oder einem Zurückrollen
    // wegen eines Fehlers) übernehmen die Felder wieder den gespeicherten Stand.
    useEffect(() => { setCode(unit.code); }, [unit.code]);
    useEffect(() => { setName(unit.name); }, [unit.name]);

    const patch = async (changes: { code?: string; name?: string; isActive?: boolean; isDefault?: boolean }) => {
        setBusy(true);
        try {
            await update(unit.id, changes);
        } catch (error: unknown) {
            toast.error(errorText(error, t('inv.units.saveError')));
            setCode(unit.code);
            setName(unit.name);
        } finally {
            setBusy(false);
        }
    };

    const commitCode = () => {
        const next = code.trim();
        if (!next) { setCode(unit.code); return; }
        if (next === unit.code) return;
        void patch({ code: next });
    };

    const commitName = () => {
        const next = name.trim();
        if (!next) { setName(unit.name); return; }
        if (next === unit.name) return;
        void patch({ name: next });
    };

    return (
        <tr
            // Ein Klick auf die Zeile sagt der Karte daneben, worüber sie reden
            // soll. Die Felder darin fangen ihre eigenen Klicks selbst ab.
            onClick={onPick}
            className={`is-pick ${picked ? 'is-picked' : ''} ${unit.isActive ? '' : 'is-muted'}`}
        >
            <td>
                <input
                    value={code}
                    disabled={!canManage || busy}
                    aria-label={t('inv.units.code')}
                    onChange={(event) => setCode(event.target.value)}
                    onBlur={commitCode}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                    className="ofi-mset-inline is-code"
                />
            </td>
            <td>
                <input
                    value={name}
                    disabled={!canManage || busy}
                    aria-label={t('inv.units.name')}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                    className="ofi-mset-inline"
                />
            </td>
            <td className="text-center">
                {/* Vorgabe: genau eine Einheit trägt sie — ein Häkchen, das man setzt. */}
                <button
                    type="button"
                    disabled={!canManage || busy || unit.isDefault}
                    aria-pressed={unit.isDefault}
                    aria-label={t('inv.units.defaultFor', { code: unit.code })}
                    title={t('inv.units.default')}
                    onClick={() => void patch({ isDefault: true })}
                    className={`ofi-mset-mark ${unit.isDefault ? 'is-on' : ''}`}
                >
                    <CheckCircle size={16} />
                </button>
            </td>
            <td className="text-center">
                <div className="flex justify-center">
                    <Switch
                        checked={unit.isActive}
                        disabled={!canManage || busy || unit.isDefault}
                        label={t('inv.units.availableFor', { code: unit.code })}
                        onChange={(next) => void patch({ isActive: next })}
                    />
                </div>
            </td>
            <td className="ofi-mset-actions">
                <button
                    type="button"
                    disabled={!canManage || busy || unit.isDefault}
                    aria-label={t('inv.units.deleteFor', { code: unit.code })}
                    title={t('common.delete')}
                    onClick={onDelete}
                    className="ofi-mset-iconbtn is-danger"
                >
                    <Trash01 size={14} />
                </button>
            </td>
        </tr>
    );
};

/**
 * «Verwendung» — der Schnitt der Projektübersicht: Beschriftung links, Zahl
 * rechts, eine Zeile je Angabe, kein Kopfstreifen und keine senkrechten Linien.
 * Sie sagt für EINE Einheit, wo sie heute steckt.
 */
const UnitUsageCard = ({ unit }: { unit: MeasurementUnit | null }) => {
    const usage = unit?.usage;
    const rows: ReadonlyArray<{ label: string; value: number; unitLabel?: string }> = unit && usage
        ? [
            { label: t('inv.units.usageSales'), value: usage.salesPositions, unitLabel: t('inv.units.usagePositions') },
            { label: t('inv.units.usageStock'), value: usage.articles, unitLabel: t('inv.units.usageArticles') },
            { label: t('inv.units.usageQuantity'), value: usage.stockQuantity, unitLabel: unit.code },
        ]
        : [];

    return (
        <section className="ofi-mset-card">
            <div className="ofi-mset-card__head">
                <h3 className="ofi-mset-card__title">{t('inv.units.usageTitle')}</h3>
                {unit && (
                    <div className="ofi-mset-sum__head">
                        <span className="ofi-mset-sum__code">{unit.code}</span>
                        <span className="ofi-mset-sum__name">{unit.name}</span>
                    </div>
                )}
            </div>

            <div className="ofi-mset-card__body">
                {rows.length ? (
                    <table data-inv-table data-unstyled-table data-no-col-resize className="w-full">
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.label}>
                                    <td className="ofi-mset-key">{row.label}</td>
                                    <td className={`ofi-mset-sum ${row.value ? '' : 'is-zero'}`}>
                                        {fmtQuantity(row.value)}
                                        {row.unitLabel && <span className="ofi-mset-sum__unit">{row.unitLabel}</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="ofi-mset-empty">{t('inv.units.usageEmpty')}</p>
                )}
            </div>
        </section>
    );
};

export const InventoryUnitsSection = () => {
    const units = useUnitStore((state) => state.units);
    const loading = useUnitStore((state) => state.loading);
    const usageLoadedFor = useUnitStore((state) => state.usageLoadedFor);
    const loadError = useUnitStore((state) => state.error);
    const ensureUsage = useUnitStore((state) => state.ensureUsage);
    const create = useUnitStore((state) => state.create);
    const remove = useUnitStore((state) => state.remove);

    const permissions = useAuthStore((state) => state.permissions);
    const canManage = useMemo(
        () => MANAGE_PERMISSIONS.some((permission) => permissions.includes(permission)),
        [permissions],
    );

    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [adding, setAdding] = useState(false);
    const [pickedId, setPickedId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<MeasurementUnit | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => { void ensureUsage(); }, [ensureUsage]);

    // Ohne eigene Wahl redet die Karte über die Vorgabe — die Einheit, die die
    // meisten Artikel tragen; eine gelöschte Wahl fällt auf sie zurück.
    const picked = useMemo(
        () => units.find((unit) => unit.id === pickedId) ?? units.find((unit) => unit.isDefault) ?? units[0] ?? null,
        [units, pickedId],
    );

    const add = async () => {
        const nextCode = code.trim();
        if (!nextCode) return;
        setAdding(true);
        try {
            const created = await create({ code: nextCode, name: name.trim() || nextCode });
            setCode('');
            setName('');
            setPickedId(created.id);
            toast.success(t('inv.units.added', { code: created.code }));
        } catch (error: unknown) {
            toast.error(errorText(error, t('inv.units.addError')));
        } finally {
            setAdding(false);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await remove(pendingDelete.id);
            toast.success(t('inv.units.deleted', { code: pendingDelete.code }));
            setPendingDelete(null);
        } catch (error: unknown) {
            toast.error(errorText(error, t('inv.units.deleteError')));
        } finally {
            setDeleting(false);
        }
    };

    const firstLoad = !usageLoadedFor && loading;

    return (
        <div className="ofi-mset-split">
            <div className="ofi-mset-card">
                <div className="ofi-mset-card__head">
                    <h2 className="ofi-mset-card__title">{t('inv.units.title')}</h2>
                </div>

                <div className="ofi-mset-card__body ofi-mset-card__scroll">
                    {/* `data-unstyled-table` haelt die app-weite Tabellenhuelle
                        (dunkelblauer Kopfstreifen) draussen — dasselbe Attribut
                        tragen die Uebersichtstabellen der Projektseite.
                        `data-no-col-resize`: eine Einstellungsliste zieht man
                        nicht in der Breite. */}
                    <table data-inv-table data-unstyled-table data-no-col-resize className="w-full min-w-[420px]">
                        <thead>
                            <tr>
                                <th scope="col" className="w-32 text-left">{t('inv.units.code')}</th>
                                <th scope="col" className="text-left">{t('inv.units.name')}</th>
                                <th scope="col" className="w-24 text-center">{t('inv.units.default')}</th>
                                <th scope="col" className="w-24 text-center">{t('inv.units.available')}</th>
                                <th scope="col" className="w-16" />
                            </tr>
                        </thead>
                        <tbody>
                            {(firstLoad || !units.length) && (
                                <TableStateRow
                                    colSpan={5}
                                    loading={firstLoad}
                                    emptyText={loadError || t('inv.units.empty')}
                                />
                            )}
                            {units.map((unit) => (
                                <UnitRow
                                    key={unit.id}
                                    unit={unit}
                                    canManage={canManage}
                                    picked={picked?.id === unit.id}
                                    onPick={() => setPickedId(unit.id)}
                                    onDelete={() => setPendingDelete(unit)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Rechts: erst die Auswertung zur gewaehlten Zeile, darunter die
                Stelle, an der eine eigene Einheit entsteht (Benutzervorgabe
                19.08.2026: "bitte nach rechts, dorthin wo die Menge steht"). */}
            <div className="ofi-mset-side">
                <UnitUsageCard unit={picked} />

                {canManage ? (
                    <section className="ofi-mset-card">
                        <div className="ofi-mset-card__head">
                            <h3 className="ofi-mset-card__title">{t('inv.units.addTitle')}</h3>
                        </div>
                        <div className="ofi-mset-newform">
                            <input
                                value={code}
                                aria-label={t('inv.units.code')}
                                placeholder={t('inv.units.codePlaceholder')}
                                onChange={(event) => setCode(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') void add(); }}
                                className="ofi-mset-newfield is-code"
                            />
                            <input
                                value={name}
                                aria-label={t('inv.units.name')}
                                placeholder={t('inv.units.namePlaceholder')}
                                onChange={(event) => setName(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') void add(); }}
                                className="ofi-mset-newfield is-name"
                            />
                            <button
                                type="button"
                                disabled={!code.trim() || adding}
                                onClick={() => void add()}
                                className="ofi-mset-primary"
                            >
                                <Plus size={14} aria-hidden />
                                {t('inv.units.add')}
                            </button>
                            <span className="ofi-mset-hint">{t('inv.units.addHint')}</span>
                        </div>
                    </section>
                ) : (
                    <p className="ofi-mset-hint px-1">{t('inv.units.readOnly')}</p>
                )}
            </div>

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t('inv.units.deleteTitle')}
                message={t('inv.units.deleteMessage', { code: pendingDelete?.code ?? '' })}
                confirmLabel={t('common.delete')}
                cancelLabel={t('common.cancel')}
                tone="danger"
                busy={deleting}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => void confirmDelete()}
            />
        </div>
    );
};
