import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, FolderTree, Hash, Lock, Pencil, Plus, Trash2, TriangleAlert, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { readWarehouseCatalog, refreshWarehouseCatalog, warehouseApi, warehouseErrorText } from '@/lib/api/warehouse';
import {
    WAREHOUSE_BOM_AREAS,
    type WarehouseBomArea,
    type WarehouseCatalog,
    type WarehouseCategory,
    type WarehouseGroup,
} from '@/types/warehouse';

import {
    ABBREVIATION_MAX,
    ABBREVIATION_MIN,
    isValidAbbreviation,
    normalizeAbbreviation,
    suggestAbbreviation,
} from '../warehouseCodes';

/** Löschen in zwei Schritten: erst wird der Knopf rot, ein zweiter Klick löscht. */
const DeleteButton = ({ onConfirm, disabled, title }: { onConfirm: () => void; disabled?: boolean; title: string }) => {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return undefined;
        const timer = window.setTimeout(() => setArmed(false), 3000);
        return () => window.clearTimeout(timer);
    }, [armed]);
    return (
        <button
            type="button"
            className={`ofi-wh-btn is-small ofi-nosize ${armed ? 'is-danger' : 'is-quiet is-icon'}`}
            disabled={disabled}
            title={title}
            aria-label={title}
            onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
        >
            {armed ? t('warehouse.actions.delete') : <Trash2 />}
        </button>
    );
};

/**
 * Name + Kürzel in einer Zeile, «Ekle» am Ende. Das Kürzel schlägt sich aus
 * dem Namen vor (Elektrik → ELK), bis man es selbst tippt. Nach dem Anlegen
 * ist die Zeile leer und der Name wieder im Fokus — «teker teker, ekledikçe».
 */
const AddRow = ({
    namePlaceholder,
    codePlaceholder,
    buttonLabel,
    onAdd,
    autoFocus,
}: {
    namePlaceholder: string;
    codePlaceholder: string;
    buttonLabel: string;
    onAdd: (name: string, code: string) => Promise<boolean>;
    autoFocus?: boolean;
}) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [codeTouched, setCodeTouched] = useState(false);
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);

    const shownCode = codeTouched ? code : suggestAbbreviation(name).slice(0, ABBREVIATION_MAX);
    const codeInvalid = tried && !isValidAbbreviation(shownCode);
    const nameInvalid = tried && !name.trim();

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setTried(true);
        if (!name.trim() || !isValidAbbreviation(shownCode) || busy) return;
        setBusy(true);
        try {
            if (await onAdd(name.trim(), shownCode)) {
                setName('');
                setCode('');
                setCodeTouched(false);
                setTried(false);
                window.setTimeout(() => nameRef.current?.focus(), 0);
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="ofi-wh-addrow" onSubmit={submit}>
            <Plus className="ofi-wh-addrow__lead" aria-hidden />
            <input
                ref={nameRef}
                className={`ofi-wh-input ${nameInvalid ? 'is-invalid' : ''}`}
                value={name}
                maxLength={120}
                autoFocus={autoFocus}
                placeholder={namePlaceholder}
                aria-label={namePlaceholder}
                onChange={(event) => setName(event.target.value)}
            />
            <input
                className={`ofi-wh-input is-abbr ${codeInvalid ? 'is-invalid' : ''}`}
                value={shownCode}
                maxLength={ABBREVIATION_MAX}
                spellCheck={false}
                autoCapitalize="characters"
                placeholder={codePlaceholder}
                aria-label={t('warehouse.settings.code')}
                title={t('warehouse.settings.codeRule', { min: ABBREVIATION_MIN, max: ABBREVIATION_MAX })}
                onChange={(event) => {
                    const next = normalizeAbbreviation(event.target.value);
                    setCode(next);
                    setCodeTouched(next.length > 0);
                }}
            />
            <button type="submit" className="ofi-wh-btn is-primary ofi-nosize" disabled={busy || !name.trim()}>
                {busy ? t('warehouse.actions.saving') : buttonLabel}
            </button>
            {(nameInvalid || codeInvalid) && (
                <span className="ofi-wh-addrow__error" role="alert">
                    {nameInvalid ? t('warehouse.settings.nameMissing') : t('warehouse.settings.codeRule', { min: ABBREVIATION_MIN, max: ABBREVIATION_MAX })}
                </span>
            )}
        </form>
    );
};

/** Ein älterer Server schickt keinen Bereich — dann gilt die Kategorie für beide. */
const areaOf = (category: WarehouseCategory): WarehouseBomArea => category.bomArea ?? 'BOTH';

/** Name + Kürzel bearbeiten (Kürzel gesperrt, sobald es Karten mit Code gibt). */
const EditRow = ({
    initialName,
    initialCode,
    codeLocked,
    onSave,
    onCancel,
}: {
    initialName: string;
    initialCode: string;
    codeLocked: boolean;
    onSave: (patch: { name?: string; code?: string }) => Promise<boolean>;
    onCancel: () => void;
}) => {
    const [name, setName] = useState(initialName);
    const [code, setCode] = useState(initialCode);
    const [busy, setBusy] = useState(false);
    const valid = Boolean(name.trim()) && (codeLocked || isValidAbbreviation(code));

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!valid || busy) return;
        const patch: { name?: string; code?: string } = {};
        if (name.trim() !== initialName) patch.name = name.trim();
        if (!codeLocked && code !== initialCode) patch.code = code;
        if (!Object.keys(patch).length) { onCancel(); return; }
        setBusy(true);
        try {
            if (await onSave(patch)) onCancel();
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            className="ofi-wh-editrow"
            onSubmit={submit}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onCancel(); } }}
        >
            <input
                className={`ofi-wh-input is-abbr ${!codeLocked && !isValidAbbreviation(code) ? 'is-invalid' : ''}`}
                value={code}
                maxLength={ABBREVIATION_MAX}
                disabled={codeLocked}
                title={codeLocked ? t('warehouse.settings.codeLocked') : t('warehouse.settings.codeRule', { min: ABBREVIATION_MIN, max: ABBREVIATION_MAX })}
                aria-label={t('warehouse.settings.code')}
                onChange={(event) => setCode(normalizeAbbreviation(event.target.value))}
            />
            <input
                className={`ofi-wh-input ${name.trim() ? '' : 'is-invalid'}`}
                value={name}
                maxLength={120}
                autoFocus
                aria-label={t('warehouse.settings.name')}
                onChange={(event) => setName(event.target.value)}
            />
            <button type="button" className="ofi-wh-btn is-small ofi-nosize" onClick={onCancel} disabled={busy}>{t('warehouse.actions.cancel')}</button>
            <button type="submit" className="ofi-wh-btn is-small is-primary ofi-nosize" disabled={!valid || busy}>{t('warehouse.actions.save')}</button>
        </form>
    );
};

/**
 * ── AYARLAR › MALZEME GRUPLARI (26.09.2026, Vorgabe Samet) ──────────────────
 *
 * «İlk başta ana kategori ekleme ve onun kısaltmasını ekleme — Elektrik ELK
 *  olarak tanımlanmalıdır. Onu seçince de alt bir tab olması lazım: malzeme
 *  grupları … o adı girdiğinde filtrelemelerde de olacak. Malzeme grupları
 *  teker teker olacak, ekledikçe eklenmesi gerekiyor, sonra da baştan sırayla
 *  ataması gerekiyor bu ERP kodu … ELK-PLC-00001 şeklinde.»
 *
 * Links die Hauptkategorien (Kürzel + Name), rechts die Gruppen der gewählten
 * Kategorie als eigener Reiter. Jede Gruppe zeigt, welcher ERP-Code als
 * nächster kommt. Kürzel und Kategorie stehen fest, sobald eine Karte einen
 * Code damit trägt; löschen lässt sich nur, was leer ist. «Kod ver» holt
 * Codes für Karten nach, die ihre Gruppe schon vor den Kürzeln hatten.
 */
export const MaterialGroupsTab = ({ canManage }: { canManage: boolean }) => {
    const [params, setParams] = useSearchParams();
    const [catalog, setCatalog] = useState<WarehouseCatalog | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ kind: 'category' | 'group'; id: string } | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => readWarehouseCatalog(
        (value) => { setCatalog(value); setFailed(null); },
        (error) => setFailed(warehouseErrorText(error, 'warehouse.err.loadFailed')),
    ), []);

    const reload = useCallback(async () => {
        try {
            setCatalog(await refreshWarehouseCatalog());
        } catch (error) {
            toast.error(warehouseErrorText(error, 'warehouse.err.loadFailed'));
        }
    }, []);

    const categories = catalog?.categories ?? [];
    const wanted = params.get('cat');
    const selected: WarehouseCategory | null = categories.find((category) => category.id === wanted) ?? categories[0] ?? null;

    const select = (id: string) => {
        setEditing(null);
        setParams((current) => {
            const next = new URLSearchParams(current);
            next.set('cat', id);
            return next;
        }, { replace: true });
    };

    /* ── Hauptkategorien ─────────────────────────────────────────────── */
    const addCategory = async (name: string, code: string) => {
        try {
            const created = await warehouseApi.createCategory({ name, code });
            toast.success(t('warehouse.settings.categoryCreated', { name: created.name, code: created.code }));
            await reload();
            select(created.id);
            return true;
        } catch (error) {
            toast.error(warehouseErrorText(error));
            return false;
        }
    };

    const saveCategory = async (category: WarehouseCategory, patch: { name?: string; code?: string }) => {
        try {
            await warehouseApi.updateCategory(category.id, patch);
            toast.success(t('warehouse.settings.saved'));
            await reload();
            return true;
        } catch (error) {
            toast.error(warehouseErrorText(error));
            return false;
        }
    };

    const removeCategory = async (category: WarehouseCategory) => {
        setBusyId(category.id);
        try {
            await warehouseApi.removeCategory(category.id);
            toast.success(t('warehouse.settings.categoryDeleted', { name: category.name }));
            setParams((current) => {
                const next = new URLSearchParams(current);
                next.delete('cat');
                return next;
            }, { replace: true });
            await reload();
        } catch (error) {
            toast.error(warehouseErrorText(error));
        } finally {
            setBusyId(null);
        }
    };

    /* ── BOM-Bereich (01.10.2026) ────────────────────────────────────── */
    /*
     * «Bomda mekanik olan sadece kendi MAK kodlarını görebilecek … her kod
     *  türü, bu kod türlerine de alan atama olacak: mekanik, elektrik ve ikisi
     *  de.» Das Segment schaltet sofort um; gespeichert wird der Reihe nach
     *  (schnelles Umklicken kommt in der geklickten Reihenfolge an), und erst
     *  die letzte Antwort holt den Stand des Servers — auch in den Zwischen-
     *  speicher, aus dem die BOM ihre Gruppen liest.
     */
    const areaQueue = useRef<Promise<unknown>>(Promise.resolve());
    const areaTicket = useRef(0);
    const saveBomArea = async (category: WarehouseCategory, bomArea: WarehouseBomArea) => {
        if (areaOf(category) === bomArea) return;
        const ticket = ++areaTicket.current;
        setCatalog((current) => current && {
            ...current,
            categories: current.categories.map((entry) => (entry.id === category.id ? { ...entry, bomArea } : entry)),
        });
        const run = areaQueue.current.then(() => warehouseApi.updateCategory(category.id, { bomArea }));
        areaQueue.current = run.catch(() => undefined);
        try {
            await run;
            if (ticket === areaTicket.current) {
                toast.success(t('warehouse.settings.bomArea.saved', {
                    code: category.code,
                    area: t(`warehouse.settings.bomArea.${bomArea}`),
                }));
            }
        } catch (error) {
            toast.error(warehouseErrorText(error));
        }
        if (ticket === areaTicket.current) await reload();
    };

    /* ── Materialgruppen ─────────────────────────────────────────────── */
    const addGroup = async (name: string, code: string) => {
        if (!selected) return false;
        try {
            const created = await warehouseApi.createGroup({ categoryId: selected.id, name, code });
            toast.success(t('warehouse.settings.groupCreated', { name: created.name, code: created.nextCode ?? '' }));
            await reload();
            return true;
        } catch (error) {
            toast.error(warehouseErrorText(error));
            return false;
        }
    };

    const saveGroup = async (group: WarehouseGroup, patch: { name?: string; code?: string }) => {
        try {
            await warehouseApi.updateGroup(group.id, patch);
            toast.success(t('warehouse.settings.saved'));
            await reload();
            return true;
        } catch (error) {
            toast.error(warehouseErrorText(error));
            return false;
        }
    };

    const removeGroup = async (group: WarehouseGroup) => {
        setBusyId(group.id);
        try {
            await warehouseApi.removeGroup(group.id);
            toast.success(t('warehouse.settings.groupDeleted', { name: group.name }));
            await reload();
        } catch (error) {
            toast.error(warehouseErrorText(error));
        } finally {
            setBusyId(null);
        }
    };

    const assignCodes = async (group: WarehouseGroup) => {
        setBusyId(group.id);
        try {
            const result = await warehouseApi.assignCodes(group.id);
            toast.success(t('warehouse.settings.codesAssigned', { count: result.assigned }));
            await reload();
        } catch (error) {
            toast.error(warehouseErrorText(error));
        } finally {
            setBusyId(null);
        }
    };

    if (failed && !catalog) {
        return (
            <div className="ofi-wh-state is-error">
                <TriangleAlert />
                <b>{failed}</b>
                <button type="button" className="ofi-wh-btn ofi-nosize" onClick={() => void reload()}>{t('warehouse.products.retry')}</button>
            </div>
        );
    }

    return (
        <div className="ofi-wh-cat">
            {/* ── links: Hauptkategorien ── */}
            <section className="ofi-wh-cat__side" aria-label={t('warehouse.settings.categories')}>
                <h2 className="ofi-wh-group__title">{t('warehouse.settings.categories')}</h2>
                <div className="ofi-wh-group__box ofi-wh-catlist">
                    {!catalog && <div className="ofi-wh-state is-small"><span className="ofi-wh-spinner" /></div>}
                    {catalog && !categories.length && (
                        <div className="ofi-wh-state is-small">
                            <FolderTree />
                            <b>{t('warehouse.settings.categoriesEmpty')}</b>
                        </div>
                    )}
                    {categories.map((category) => (
                        <button
                            key={category.id}
                            type="button"
                            className={`ofi-wh-catrow ofi-nosize ${selected?.id === category.id ? 'is-selected' : ''}`}
                            aria-current={selected?.id === category.id ? 'true' : undefined}
                            onClick={() => select(category.id)}
                        >
                            <span className="ofi-wh-abbr">{category.code}</span>
                            <span className="ofi-wh-catrow__text">
                                <span className="ofi-wh-catrow__name">{category.name}</span>
                                <small className="ofi-wh-catrow__area">{t(`warehouse.settings.bomArea.inList.${areaOf(category)}`)}</small>
                            </span>
                            <span className="ofi-wh-catrow__count">{t('warehouse.settings.groupCount', { count: category.groups.length })}</span>
                            <ChevronRight className="ofi-wh-catrow__chevron" />
                        </button>
                    ))}
                    {canManage && (
                        <AddRow
                            namePlaceholder={t('warehouse.settings.categoryName')}
                            codePlaceholder="ELK"
                            buttonLabel={t('warehouse.settings.add')}
                            onAdd={addCategory}
                            autoFocus={Boolean(catalog) && !categories.length}
                        />
                    )}
                </div>
                <p className="ofi-wh-row__hint ofi-wh-cat__hint">{t('warehouse.settings.categoriesHint')}</p>
            </section>

            {/* ── rechts: die Gruppen der gewählten Kategorie ── */}
            <section className="ofi-wh-cat__main" aria-label={t('warehouse.settings.groups')}>
                {!selected && catalog && (
                    <div className="ofi-wh-state">
                        <FolderTree />
                        <b>{t('warehouse.settings.pickCategory')}</b>
                        <span>{t('warehouse.settings.pickCategoryHint')}</span>
                    </div>
                )}
                {selected && (
                    <>
                        <div className="ofi-wh-cat__head">
                            {editing?.kind === 'category' && editing.id === selected.id ? (
                                <EditRow
                                    initialName={selected.name}
                                    initialCode={selected.code}
                                    codeLocked={selected.locked}
                                    onSave={(patch) => saveCategory(selected, patch)}
                                    onCancel={() => setEditing(null)}
                                />
                            ) : (
                                <>
                                    <span className="ofi-wh-abbr is-large">{selected.code}</span>
                                    <span className="ofi-wh-cat__title">
                                        <b>{selected.name}</b>
                                        <small>
                                            {t('warehouse.settings.categorySummary', { groups: selected.groups.length, cards: selected.productCount })}
                                            {selected.locked && (
                                                <span className="ofi-wh-lock" title={t('warehouse.settings.codeLocked')}>
                                                    <Lock />
                                                    {t('warehouse.settings.locked')}
                                                </span>
                                            )}
                                        </small>
                                    </span>
                                    {canManage && (
                                        <span className="ofi-wh-cat__actions">
                                            <button type="button" className="ofi-wh-btn is-small ofi-nosize" onClick={() => setEditing({ kind: 'category', id: selected.id })}>
                                                <Pencil />
                                                {t('warehouse.settings.edit')}
                                            </button>
                                            <DeleteButton
                                                title={selected.groups.length
                                                    ? t('warehouse.settings.categoryHasGroups')
                                                    : t('warehouse.settings.deleteCategory')}
                                                disabled={selected.groups.length > 0 || busyId === selected.id}
                                                onConfirm={() => void removeCategory(selected)}
                                            />
                                        </span>
                                    )}
                                </>
                            )}
                        </div>

                        {/* «Her kod türü, bu kod türlerine de alan atama olacak» (01.10.2026):
                            in welchen BOMs die Suche die Karten dieser Kategorie zeigt. */}
                        <div className="ofi-wh-group__box ofi-wh-cat__area">
                            <div className="ofi-wh-row">
                                <span className="ofi-wh-row__label" id="ofi-wh-bomarea-label">{t('warehouse.settings.bomArea.label')}</span>
                                <div className="ofi-wh-row__control">
                                    <div className="ofi-wh-seg" role="radiogroup" aria-labelledby="ofi-wh-bomarea-label">
                                        {WAREHOUSE_BOM_AREAS.map((area) => (
                                            <button
                                                key={area}
                                                type="button"
                                                role="radio"
                                                aria-checked={areaOf(selected) === area}
                                                className={`ofi-nosize ${areaOf(selected) === area ? 'is-on' : ''}`}
                                                disabled={!canManage}
                                                onClick={() => void saveBomArea(selected, area)}
                                            >
                                                {t(`warehouse.settings.bomArea.${area}`)}
                                            </button>
                                        ))}
                                    </div>
                                    <span className="ofi-wh-row__hint">
                                        {t(`warehouse.settings.bomArea.hint.${areaOf(selected)}`, { code: selected.code })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* «onu seçince de alt bir tab olması lazım: malzeme grupları» */}
                        <nav className="ofi-wh-tabs is-sub" role="tablist" aria-label={selected.name}>
                            <button type="button" role="tab" aria-selected className="ofi-nosize is-on">
                                {t('warehouse.settings.groups')}
                                <span>{selected.groups.length}</span>
                            </button>
                        </nav>

                        <div className="ofi-wh-tablewrap is-static">
                            <div className="ofi-wh-tablescroll">
                                <table className="ofi-wh-table is-groups" data-unstyled-table>
                                    <colgroup>
                                        <col style={{ width: 96 }} />
                                        <col />
                                        <col style={{ width: 170 }} />
                                        <col style={{ width: 80 }} />
                                        {canManage && <col style={{ width: 200 }} />}
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th><span className="ofi-wh-th is-static">{t('warehouse.settings.code')}</span></th>
                                            <th><span className="ofi-wh-th is-static">{t('warehouse.settings.groupName')}</span></th>
                                            <th><span className="ofi-wh-th is-static">{t('warehouse.settings.nextCode')}</span></th>
                                            <th className="is-num"><span className="ofi-wh-th is-static">{t('warehouse.settings.cards')}</span></th>
                                            {canManage && <th aria-label={t('warehouse.settings.edit')} />}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {!selected.groups.length && (
                                            <tr>
                                                <td colSpan={canManage ? 5 : 4} style={{ height: 'auto', padding: 0 }}>
                                                    <div className="ofi-wh-state is-small">
                                                        <Hash />
                                                        <b>{t('warehouse.settings.groupsEmpty')}</b>
                                                        {canManage && <span>{t('warehouse.settings.groupsEmptyHint', { code: selected.code })}</span>}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {selected.groups.map((group) => (
                                            editing?.kind === 'group' && editing.id === group.id ? (
                                                <tr key={group.id} className="is-editing">
                                                    <td colSpan={canManage ? 5 : 4}>
                                                        <EditRow
                                                            initialName={group.name}
                                                            initialCode={group.code ?? ''}
                                                            codeLocked={group.locked}
                                                            onSave={(patch) => saveGroup(group, patch)}
                                                            onCancel={() => setEditing(null)}
                                                        />
                                                    </td>
                                                </tr>
                                            ) : (
                                                <tr key={group.id}>
                                                    <td>
                                                        {group.code
                                                            ? <span className="ofi-wh-abbr">{group.code}</span>
                                                            : <span className="ofi-wh-abbr is-missing" title={t('warehouse.settings.groupNoCode')}>—</span>}
                                                    </td>
                                                    <td className="is-name" title={group.name}>{group.name}</td>
                                                    <td>
                                                        {group.nextCode
                                                            ? <span className="ofi-wh-code is-dim">{group.nextCode}</span>
                                                            : <span className="ofi-wh-cell-warn">{t('warehouse.settings.groupNoCode')}</span>}
                                                    </td>
                                                    <td className="is-num">{group.productCount}</td>
                                                    {canManage && (
                                                        <td className="is-tool">
                                                            {group.uncodedCount > 0 && group.code && (
                                                                <button
                                                                    type="button"
                                                                    className="ofi-wh-btn is-small ofi-nosize"
                                                                    disabled={busyId === group.id}
                                                                    title={t('warehouse.settings.assignHint')}
                                                                    onClick={() => void assignCodes(group)}
                                                                >
                                                                    <Wand2 />
                                                                    {t('warehouse.settings.assign', { count: group.uncodedCount })}
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="ofi-wh-btn is-small is-quiet is-icon ofi-nosize"
                                                                title={t('warehouse.settings.edit')}
                                                                aria-label={t('warehouse.settings.edit')}
                                                                onClick={() => setEditing({ kind: 'group', id: group.id })}
                                                            >
                                                                <Pencil />
                                                            </button>
                                                            <DeleteButton
                                                                title={group.productCount ? t('warehouse.settings.groupHasCards', { count: group.productCount }) : t('warehouse.settings.deleteGroup')}
                                                                disabled={group.productCount > 0 || busyId === group.id}
                                                                onConfirm={() => void removeGroup(group)}
                                                            />
                                                        </td>
                                                    )}
                                                </tr>
                                            )
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {canManage && (
                            <div className="ofi-wh-group__box ofi-wh-cat__add">
                                <AddRow
                                    key={selected.id}
                                    namePlaceholder={t('warehouse.settings.groupNamePlaceholder')}
                                    codePlaceholder="PLC"
                                    buttonLabel={t('warehouse.settings.addGroup')}
                                    onAdd={addGroup}
                                />
                            </div>
                        )}
                        <p className="ofi-wh-row__hint">{t('warehouse.settings.groupsHint', { example: `${selected.code}-${selected.groups.find((group) => group.code)?.code ?? 'PLC'}-00001` })}</p>
                    </>
                )}
            </section>
        </div>
    );
};
