import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle, Lock01, Plus, Trash01 } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { articleCodesApi, type CodeCategory, type CodeScheme } from '@/lib/api/articleCodes';
import { readItGateTicket } from '@/lib/itGate';
import { useAuthStore } from '@/store/authStore';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { TableStateRow } from '@/components/ui-shared/TableKit';
import { ItGatePrompt } from '../../components/ItGatePrompt';
import '@/styles/modules/moduleSettings.css';

/**
 * LAGER → CODE-EINSTELLUNGEN (10.09.2026)
 *
 * Der ERP-Code eines Artikels ist `KAT-UNTER-NNNNN`: links die KATEGORIE
 * («Elektro» = ELK, «Klima» = KLI), rechts ihre NUMMERNKREISE — die
 * Unterkategorien («PLC», «TCL», «VIDA»), aus denen die Laufnummer kommt:
 * ELK-PLC-00001, ELK-PLC-00002 …
 *
 * Zwei Karten wie bei den Einheiten: links die Kategorien (Klick wählt),
 * rechts die Kreise der gewählten Kategorie mit Startnummer, nächstem Code und
 * dem Stand «Vorbereitet» / «Freigegeben». Vorbereiten darf, wer die
 * Lagerstammdaten pflegt; FREIGEBEN darf nur die IT — der Knopf holt sich das
 * IT-Kennwort (ItGatePrompt), und der Server prüft den Ausweis der Schleuse.
 * Nicht freigegebene Kreise sieht die Schnellerfassung nicht.
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
const errorStatus = (error: unknown): number | undefined =>
    (error as { response?: { status?: number } })?.response?.status;

/** Kürzel so tippen, wie der Server es speichert: Grossbuchstaben, höchstens vier. */
const shortCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

/** Eine Zeile der Kategorienliste — Kürzel und Name direkt in der Zeile. */
const CategoryRow = ({ category, canManage, picked, onPick, onSaved, onDelete }: {
    category: CodeCategory;
    canManage: boolean;
    picked: boolean;
    onPick: () => void;
    onSaved: (next: CodeCategory) => void;
    onDelete: () => void;
}) => {
    const [name, setName] = useState(category.name);
    const [busy, setBusy] = useState(false);
    useEffect(() => { setName(category.name); }, [category.name]);

    const commitName = async () => {
        const next = name.trim();
        if (!next) { setName(category.name); return; }
        if (next === category.name) return;
        setBusy(true);
        try {
            onSaved(await articleCodesApi.updateCategory(category.id, { name: next }));
        } catch (error) {
            toast.error(errorText(error, t('inv.codes.saveError')));
            setName(category.name);
        } finally {
            setBusy(false);
        }
    };

    const active = category.schemes.filter((scheme) => scheme.isActive).length;
    return (
        <tr onClick={onPick} className={`is-pick ${picked ? 'is-picked' : ''}`}>
            <td className="font-mono text-[13px] font-semibold">{category.code}</td>
            <td>
                <input
                    value={name}
                    disabled={!canManage || busy}
                    aria-label={t('inv.codes.name')}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={() => void commitName()}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                    className="ofi-mset-inline"
                />
            </td>
            <td className="text-center font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                {active}/{category.schemes.length}
            </td>
            <td className="ofi-mset-actions">
                <button
                    type="button"
                    disabled={!canManage || busy}
                    aria-label={t('inv.codes.deleteCategory')}
                    title={t('common.delete')}
                    onClick={(event) => { event.stopPropagation(); onDelete(); }}
                    className="ofi-mset-iconbtn is-danger"
                >
                    <Trash01 size={14} />
                </button>
            </td>
        </tr>
    );
};

/** Eine Zeile der Nummernkreise: Kürzel, Name, Startnummer, nächster Code, Stand, Freigabe. */
const SchemeRow = ({ scheme, canManage, onSaved, onActivation, onDelete }: {
    scheme: CodeScheme;
    canManage: boolean;
    onSaved: (next: CodeScheme) => void;
    onActivation: (scheme: CodeScheme, active: boolean) => void;
    onDelete: () => void;
}) => {
    const [name, setName] = useState(scheme.name);
    const [start, setStart] = useState(String(scheme.startNumber));
    const [busy, setBusy] = useState(false);
    useEffect(() => { setName(scheme.name); }, [scheme.name]);
    useEffect(() => { setStart(String(scheme.startNumber)); }, [scheme.startNumber]);

    const patch = async (changes: { name?: string; startNumber?: number }) => {
        setBusy(true);
        try {
            onSaved(await articleCodesApi.updateScheme(scheme.id, changes));
        } catch (error) {
            toast.error(errorText(error, t('inv.codes.saveError')));
            setName(scheme.name);
            setStart(String(scheme.startNumber));
        } finally {
            setBusy(false);
        }
    };

    const commitName = () => {
        const next = name.trim();
        if (!next) { setName(scheme.name); return; }
        if (next !== scheme.name) void patch({ name: next });
    };
    const commitStart = () => {
        const next = Math.max(1, Math.floor(Number(start)) || 1);
        if (next === scheme.startNumber) { setStart(String(next)); return; }
        void patch({ startNumber: next });
    };

    // Die Startnummer ist nur beweglich, solange der Kreis noch nichts vergeben hat.
    const issued = scheme.lastNumber > 0;
    return (
        <tr className={scheme.isActive ? '' : 'is-muted'}>
            <td className="font-mono text-[13px] font-semibold">{scheme.code}</td>
            <td>
                <input
                    value={name}
                    disabled={!canManage || busy}
                    aria-label={t('inv.codes.name')}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                    className="ofi-mset-inline"
                />
            </td>
            <td>
                <input
                    value={start}
                    inputMode="numeric"
                    disabled={!canManage || busy || issued}
                    aria-label={t('inv.codes.startNumber')}
                    onChange={(event) => setStart(event.target.value.replace(/\D/g, ''))}
                    onBlur={commitStart}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                    className="ofi-mset-inline is-code w-20 text-right"
                />
            </td>
            <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">{scheme.nextCode}</td>
            <td className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                {issued ? scheme.lastNumber : '—'}
            </td>
            <td>
                <span className={`ofi-codes-status ${scheme.isActive ? 'is-active' : ''}`}>
                    {scheme.isActive ? <CheckCircle size={12} aria-hidden /> : <Lock01 size={12} aria-hidden />}
                    {t(scheme.isActive ? 'inv.codes.statusActive' : 'inv.codes.statusPrepared')}
                </span>
            </td>
            <td className="ofi-mset-actions">
                <div className="flex items-center justify-end gap-1.5">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => onActivation(scheme, !scheme.isActive)}
                        className={`ofi-codes-gate ${scheme.isActive ? '' : 'is-primary'}`}
                        title={t('inv.codes.activateHint')}
                    >
                        <Lock01 size={12} aria-hidden />
                        {t(scheme.isActive ? 'inv.codes.deactivate' : 'inv.codes.activate')}
                    </button>
                    <button
                        type="button"
                        disabled={!canManage || busy || issued}
                        aria-label={t('inv.codes.deleteScheme')}
                        title={t('common.delete')}
                        onClick={onDelete}
                        className="ofi-mset-iconbtn is-danger"
                    >
                        <Trash01 size={14} />
                    </button>
                </div>
            </td>
        </tr>
    );
};

export const InventoryCodesSection = () => {
    const permissions = useAuthStore((state) => state.permissions);
    const canManage = useMemo(
        () => MANAGE_PERMISSIONS.some((permission) => permissions.includes(permission)),
        [permissions],
    );

    const [categories, setCategories] = useState<CodeCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pickedId, setPickedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            setCategories(await articleCodesApi.list());
        } catch (error) {
            setLoadError(errorText(error, t('inv.codes.saveError')));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const picked = useMemo(
        () => categories.find((category) => category.id === pickedId) ?? categories[0] ?? null,
        [categories, pickedId],
    );

    const replaceCategory = (next: CodeCategory) =>
        setCategories((current) => current.map((category) => (category.id === next.id ? { ...category, ...next, schemes: next.schemes ?? category.schemes } : category)));
    const replaceScheme = (next: CodeScheme) =>
        setCategories((current) => current.map((category) => (
            category.id === next.categoryId
                ? { ...category, schemes: category.schemes.map((scheme) => (scheme.id === next.id ? next : scheme)) }
                : category
        )));

    /* ── Kategorie anlegen ─────────────────────────────────────────────── */
    const [catCode, setCatCode] = useState('');
    const [catName, setCatName] = useState('');
    const [addingCategory, setAddingCategory] = useState(false);
    const addCategory = async () => {
        const code = shortCode(catCode);
        if (!code) return;
        setAddingCategory(true);
        try {
            const created = await articleCodesApi.createCategory({ code, name: catName.trim() || code });
            setCategories((current) => [...current, created]);
            setPickedId(created.id);
            setCatCode('');
            setCatName('');
        } catch (error) {
            toast.error(errorText(error, t('inv.codes.saveError')));
        } finally {
            setAddingCategory(false);
        }
    };

    /* ── Nummernkreis vorbereiten ──────────────────────────────────────── */
    const [subCode, setSubCode] = useState('');
    const [subName, setSubName] = useState('');
    const [subStart, setSubStart] = useState('1');
    const [addingScheme, setAddingScheme] = useState(false);
    const addScheme = async () => {
        if (!picked) return;
        const code = shortCode(subCode);
        if (!code) return;
        setAddingScheme(true);
        try {
            const created = await articleCodesApi.createScheme({
                categoryId: picked.id,
                code,
                name: subName.trim() || code,
                startNumber: Math.max(1, Math.floor(Number(subStart)) || 1),
            });
            setCategories((current) => current.map((category) => (
                category.id === picked.id ? { ...category, schemes: [...category.schemes, created] } : category
            )));
            setSubCode('');
            setSubName('');
            setSubStart('1');
        } catch (error) {
            toast.error(errorText(error, t('inv.codes.saveError')));
        } finally {
            setAddingScheme(false);
        }
    };

    /* ── Freigabe (IT) ─────────────────────────────────────────────────── */
    const [gate, setGate] = useState<{ scheme: CodeScheme; active: boolean } | null>(null);
    const [gatePromptOpen, setGatePromptOpen] = useState(false);
    const applyActivation = async (scheme: CodeScheme, active: boolean) => {
        try {
            const updated = await articleCodesApi.setActivation(scheme.id, active);
            replaceScheme(updated);
            toast.success(t(active ? 'inv.codes.activated' : 'inv.codes.deactivated', { prefix: updated.prefix }));
            setGate(null);
        } catch (error) {
            // Kein oder abgelaufener Ausweis: das Kennwort holen und noch einmal.
            if (errorStatus(error) === 403) {
                setGate({ scheme, active });
                setGatePromptOpen(true);
                return;
            }
            toast.error(errorText(error, t('inv.codes.saveError')));
        }
    };
    const requestActivation = (scheme: CodeScheme, active: boolean) => {
        if (!readItGateTicket()) {
            setGate({ scheme, active });
            setGatePromptOpen(true);
            return;
        }
        void applyActivation(scheme, active);
    };

    /* ── Löschen ───────────────────────────────────────────────────────── */
    const [pendingDelete, setPendingDelete] = useState<{ kind: 'category' | 'scheme'; id: string; code: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            if (pendingDelete.kind === 'category') {
                await articleCodesApi.removeCategory(pendingDelete.id);
                setCategories((current) => current.filter((category) => category.id !== pendingDelete.id));
            } else {
                await articleCodesApi.removeScheme(pendingDelete.id);
                setCategories((current) => current.map((category) => ({
                    ...category,
                    schemes: category.schemes.filter((scheme) => scheme.id !== pendingDelete.id),
                })));
            }
            setPendingDelete(null);
        } catch (error) {
            toast.error(errorText(error, t('inv.codes.saveError')));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="ofi-codes ofi-mset-split">
            {/* Links: die Kategorien. */}
            <div className="ofi-mset-card">
                <div className="ofi-mset-card__head">
                    <h2 className="ofi-mset-card__title">{t('inv.codes.categoriesTitle')}</h2>
                    <span className="ofi-mset-hint">{t('inv.codes.format')} · {t('inv.codes.example')}</span>
                </div>
                <div className="ofi-mset-card__body ofi-mset-card__scroll">
                    <table data-inv-table data-unstyled-table data-no-col-resize className="w-full min-w-[420px]">
                        <thead>
                            <tr>
                                <th scope="col" className="w-24 text-left">{t('inv.codes.code')}</th>
                                <th scope="col" className="text-left">{t('inv.codes.name')}</th>
                                <th scope="col" className="w-28 text-center">{t('inv.codes.statusActive')}</th>
                                <th scope="col" className="w-14" />
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || !categories.length) && (
                                <TableStateRow colSpan={4} loading={loading} emptyText={loadError || t('inv.codes.categoriesEmpty')} />
                            )}
                            {!loading && categories.map((category) => (
                                <CategoryRow
                                    key={category.id}
                                    category={category}
                                    canManage={canManage}
                                    picked={picked?.id === category.id}
                                    onPick={() => setPickedId(category.id)}
                                    onSaved={replaceCategory}
                                    onDelete={() => setPendingDelete({ kind: 'category', id: category.id, code: category.code })}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
                {canManage && (
                    <div className="ofi-mset-card__foot">
                        <input
                            value={catCode}
                            aria-label={t('inv.codes.code')}
                            placeholder={t('inv.codes.codePlaceholder')}
                            onChange={(event) => setCatCode(shortCode(event.target.value))}
                            onKeyDown={(event) => { if (event.key === 'Enter') void addCategory(); }}
                            className="ofi-mset-newfield is-code"
                        />
                        <input
                            value={catName}
                            aria-label={t('inv.codes.name')}
                            placeholder={t('inv.codes.namePlaceholder')}
                            onChange={(event) => setCatName(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') void addCategory(); }}
                            className="ofi-mset-newfield is-name"
                        />
                        <button type="button" disabled={!catCode || addingCategory} onClick={() => void addCategory()} className="ofi-mset-primary">
                            <Plus size={14} aria-hidden />
                            {t('inv.codes.addCategory')}
                        </button>
                    </div>
                )}
            </div>

            {/* Rechts: die Nummernkreise der gewählten Kategorie. */}
            <div className="ofi-mset-side ofi-codes__side">
                <section className="ofi-mset-card">
                    <div className="ofi-mset-card__head">
                        <h3 className="ofi-mset-card__title">
                            {picked ? t('inv.codes.schemesTitle', { category: `${picked.code} · ${picked.name}` }) : t('inv.codes.pickCategoryHint')}
                        </h3>
                        <span className="ofi-mset-hint">{t('inv.codes.activateHint')}</span>
                    </div>
                    <div className="ofi-mset-card__body ofi-mset-card__scroll">
                        <table data-inv-table data-unstyled-table data-no-col-resize className="w-full min-w-[640px]">
                            <thead>
                                <tr>
                                    <th scope="col" className="w-20 text-left">{t('inv.codes.code')}</th>
                                    <th scope="col" className="text-left">{t('inv.codes.name')}</th>
                                    <th scope="col" className="w-24 text-left">{t('inv.codes.startNumber')}</th>
                                    <th scope="col" className="w-36 text-left">{t('inv.codes.nextCode')}</th>
                                    <th scope="col" className="w-24 text-left">{t('inv.codes.lastNumber')}</th>
                                    <th scope="col" className="w-32 text-left">{t('inv.codes.status')}</th>
                                    <th scope="col" className="w-44" />
                                </tr>
                            </thead>
                            <tbody>
                                {picked && !picked.schemes.length && (
                                    <TableStateRow colSpan={7} loading={false} emptyText={t('inv.codes.schemesEmpty')} />
                                )}
                                {!picked && (
                                    <TableStateRow colSpan={7} loading={loading} emptyText={t('inv.codes.pickCategoryHint')} />
                                )}
                                {picked?.schemes.map((scheme) => (
                                    <SchemeRow
                                        key={scheme.id}
                                        scheme={scheme}
                                        canManage={canManage}
                                        onSaved={replaceScheme}
                                        onActivation={requestActivation}
                                        onDelete={() => setPendingDelete({ kind: 'scheme', id: scheme.id, code: scheme.prefix })}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {canManage && picked && (
                        <div className="ofi-mset-card__foot">
                            <span className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">{picked.code}-</span>
                            <input
                                value={subCode}
                                aria-label={t('inv.codes.code')}
                                placeholder={t('inv.codes.subPlaceholder')}
                                onChange={(event) => setSubCode(shortCode(event.target.value))}
                                onKeyDown={(event) => { if (event.key === 'Enter') void addScheme(); }}
                                className="ofi-mset-newfield is-code"
                            />
                            <input
                                value={subName}
                                aria-label={t('inv.codes.name')}
                                placeholder={t('inv.codes.subNamePlaceholder')}
                                onChange={(event) => setSubName(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') void addScheme(); }}
                                className="ofi-mset-newfield is-name"
                            />
                            <input
                                value={subStart}
                                inputMode="numeric"
                                aria-label={t('inv.codes.startNumber')}
                                title={t('inv.codes.startNumber')}
                                onChange={(event) => setSubStart(event.target.value.replace(/\D/g, ''))}
                                onKeyDown={(event) => { if (event.key === 'Enter') void addScheme(); }}
                                className="ofi-mset-newfield is-code w-20 text-right"
                            />
                            <button type="button" disabled={!subCode || addingScheme} onClick={() => void addScheme()} className="ofi-mset-primary">
                                <Plus size={14} aria-hidden />
                                {t('inv.codes.addScheme')}
                            </button>
                        </div>
                    )}
                </section>
            </div>

            <ItGatePrompt
                open={gatePromptOpen}
                onClose={() => { setGatePromptOpen(false); setGate(null); }}
                onUnlocked={() => {
                    setGatePromptOpen(false);
                    if (gate) void applyActivation(gate.scheme, gate.active);
                }}
            />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t(pendingDelete?.kind === 'category' ? 'inv.codes.deleteCategory' : 'inv.codes.deleteScheme')}
                message={t('inv.codes.deleteMessage', { code: pendingDelete?.code ?? '' })}
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
