import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, Edit01, Lock01, Plus, RefreshCcw01, Trash01, XClose } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import {
    articleCodesApi,
    MAX_CODE_DIGITS,
    MAX_SCHEME_CELLS,
    MIN_CODE_DIGITS,
    type CodeCategory,
    type CodeScheme,
} from '@/lib/api/articleCodes';
import { readItGateTicket } from '@/lib/itGate';
import { useAuthStore } from '@/store/authStore';
import { TableStateRow } from '@/components/ui-shared/TableKit';
import { PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { ItGatePrompt } from '../../components/ItGatePrompt';
import '@/styles/modules/moduleSettings.css';

/**
 * LAGER → CODE-EINSTELLUNGEN (10.09.2026, auf ZELLEN umgestellt 22.09.2026)
 *
 * Der ERP-Code besteht aus ZELLEN und einem Zähler am Ende:
 *
 *      ELK-PLC-00001              (2 Zellen + Zähler)
 *      ELK-PANO-PLC-H-00400       (4 Zellen + Zähler)
 *
 * Die ERSTE Zelle stellt die KATEGORIE, die übrigen (1 bis 3) der
 * NUMMERNKREIS — «mindestens 2, höchstens 4 Zellen, die fünfte ist der
 * Zähler» (Samet, 22.09.2026).
 *
 * DREI REITER statt zweier Karten nebeneinander: nebeneinander passten die
 * sechs Spalten «Kürzel · Name · Startnummer · nächster Code · vergeben bis ·
 * Status» nicht in die halbe Breite (Samet: «bunlar sütunlar sığmıyor»). Jeder
 * Reiter hat jetzt die ganze Seite:
 *
 *   Kategorien       — die erste Zelle, ihre Kreise und ihre Artikel.
 *   Nummernkreise    — die Zellen 2…4 der gewählten Kategorie, im Zellen-
 *                      fenster bearbeitet (Vorschau, Zähler, Breite).
 *   Zurücksetzen     — Zähler an den Anfang, Zähler auf eine Nummer, oder die
 *                      Artikel des Kreises lückenlos neu durchnummerieren.
 *
 * LÖSCHEN geht jetzt immer: eine Kategorie nimmt ihre Nummernkreise mit, die
 * ARTIKEL behalten ihren Code («geçmişteki ürünler değişmesin»). Wer eine
 * Zelle TAUSCHT, entscheidet im Fenster, ob die bestehenden Artikel mitwandern
 * («ya da güncelle de olsun»). Beides rührt an vergebene Codes und fragt
 * deshalb das IT-Kennwort — derselbe Weg wie die Freigabe.
 */

type TabKey = 'categories' | 'schemes' | 'reset';

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

/** Eine Zelle so tippen, wie der Server sie speichert: Grossbuchstaben, höchstens vier. */
const cellCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

const padded = (value: number, digits: number) => String(value).padStart(digits, '0');
/** Die Nummer, die der Kreis als Nächstes vergäbe. */
const nextNumberOf = (scheme: Pick<CodeScheme, 'startNumber' | 'lastNumber'>) =>
    Math.max(scheme.startNumber, scheme.lastNumber + 1);
/** Der Kreis zum Anzeigen: «ELK-PANO-PLC-H», ohne den Bindestrich des Präfixes. */
const prefixLabel = (prefix: string) => prefix.replace(/-$/, '');
/** Der ganze Code aus Kategorie, Zellen, Nummer und Zählerbreite. */
const buildCode = (categoryCode: string, cells: string[], value: number, digits: number) =>
    [categoryCode, ...cells.filter(Boolean)].join('-') + '-' + padded(value, digits);

/* ── Die Zellenreihe ────────────────────────────────────────────────────────
   Die erste Zelle gehört der Kategorie und steht fest; danach kommen 1 bis 3
   eigene, dahinter der Zähler. So sieht man beim Tippen, was der Code wird. */
const CellsRow = ({ categoryCode, cells, digits, disabled, onChange }: {
    categoryCode: string;
    cells: string[];
    digits: number;
    disabled?: boolean;
    onChange: (next: string[]) => void;
}) => (
    <div className="ofi-codes-cells">
        <span className="ofi-codes-cell is-fixed" title={t('inv.codes.categoriesTitle')}>{categoryCode || '—'}</span>
        {cells.map((cell, index) => (
            // Die Stelle IST die Kennung: eine Zelle ohne Inhalt hat sonst keine.
            <span key={index} className="ofi-codes-cellbox">
                <span aria-hidden className="ofi-codes-cells__dash">-</span>
                <input
                    value={cell}
                    disabled={disabled}
                    maxLength={4}
                    autoFocus={index > 0 && !cell}
                    aria-label={`${t('inv.codes.cells')} ${index + 2}`}
                    placeholder={index === 0 ? 'PLC' : ''}
                    onChange={(event) => onChange(cells.map((item, at) => (at === index ? cellCode(event.target.value) : item)))}
                    className="ofi-codes-cell is-input"
                />
                {cells.length > 1 && !disabled && (
                    <button
                        type="button"
                        aria-label={t('inv.codes.removeCell')}
                        title={t('inv.codes.removeCell')}
                        onClick={() => onChange(cells.filter((_, at) => at !== index))}
                        className="ofi-codes-cellx"
                    >
                        <XClose size={10} />
                    </button>
                )}
            </span>
        ))}
        {cells.length < MAX_SCHEME_CELLS && !disabled && (
            <button type="button" onClick={() => onChange([...cells, ''])} className="ofi-codes-celladd">
                <Plus size={12} aria-hidden />
                {t('inv.codes.addCell')}
            </button>
        )}
        <span aria-hidden className="ofi-codes-cells__dash">-</span>
        <span className="ofi-codes-cell is-counter" title={t('inv.codes.counter')}>{'0'.repeat(Math.max(1, digits - 1))}1</span>
    </div>
);

/** Die Zellen einer Zeile als kleine Kästchen — dieselbe Sprache wie im Fenster. */
const CellsBadge = ({ categoryCode, cells, digits }: { categoryCode: string; cells: string[]; digits: number }) => (
    <span className="ofi-codes-chipline">
        <span className="ofi-codes-chip is-first">{categoryCode}</span>
        {cells.map((cell, index) => (
            <span key={index} className="ofi-codes-chip">{cell}</span>
        ))}
        <span className="ofi-codes-chip is-counter">{'0'.repeat(Math.max(1, digits))}</span>
    </span>
);

/* ── Fenster: Kategorie ─────────────────────────────────────────────────── */
const CategoryDialog = ({ category, articleCount, busy, onSubmit, onClose }: {
    category: CodeCategory | null;
    articleCount: number;
    busy: boolean;
    onSubmit: (input: { code: string; name: string; migrateArticles: boolean }) => void;
    onClose: () => void;
}) => {
    const [code, setCode] = useState(category?.code ?? '');
    const [name, setName] = useState(category?.name ?? '');
    const [migrate, setMigrate] = useState(false);
    const changed = Boolean(category) && code !== category?.code;

    return (
        <PopupDialog
            open
            onClose={onClose}
            title={t(category ? 'inv.codes.editCategory' : 'inv.codes.newCategory')}
            subtitle={t('inv.codes.format')}
            width={460}
            footer={(
                <div className="ofi-tp-actions">
                    <div className="ofi-tp-actions__start" />
                    <div className="ofi-tp-actions__end">
                        <PopupButton onClick={onClose} disabled={busy}>{t('common.cancel')}</PopupButton>
                        <PopupButton
                            variant="primary"
                            loading={busy}
                            disabled={!code}
                            onClick={() => onSubmit({ code, name: name.trim() || code, migrateArticles: migrate })}
                        >
                            {t('common.save')}
                        </PopupButton>
                    </div>
                </div>
            )}
        >
            <PopupField label={t('inv.codes.code')} hint={t('inv.codes.cellsHint')} required>
                <input
                    value={code}
                    autoFocus
                    maxLength={4}
                    placeholder={t('inv.codes.codePlaceholder')}
                    onChange={(event) => setCode(cellCode(event.target.value))}
                    className="ofi-cal-input w-full is-mono"
                />
            </PopupField>
            <PopupField label={t('inv.codes.name')}>
                <input
                    value={name}
                    placeholder={t('inv.codes.namePlaceholder')}
                    onChange={(event) => setName(event.target.value)}
                    className="ofi-cal-input w-full"
                />
            </PopupField>
            {changed && articleCount > 0 && (
                <>
                    <label className="ofi-codes-switch">
                        <input type="checkbox" checked={migrate} onChange={(event) => setMigrate(event.target.checked)} />
                        <span>{t('inv.codes.migrate')}</span>
                    </label>
                    <PopupNote tone={migrate ? 'warning' : 'neutral'}>
                        {t(migrate ? 'inv.codes.migrateOn' : 'inv.codes.migrateOff', { count: articleCount })}
                    </PopupNote>
                </>
            )}
        </PopupDialog>
    );
};

/* ── Fenster: Nummernkreis ──────────────────────────────────────────────── */
const SchemeDialog = ({ category, scheme, busy, onSubmit, onClose }: {
    category: CodeCategory;
    scheme: CodeScheme | null;
    busy: boolean;
    onSubmit: (input: { cells: string[]; name: string; startNumber: number; digits: number; migrateArticles: boolean }) => void;
    onClose: () => void;
}) => {
    const [cells, setCells] = useState<string[]>(scheme?.cells?.length ? [...scheme.cells] : ['']);
    const [name, setName] = useState(scheme?.name ?? '');
    const [start, setStart] = useState(String(scheme?.startNumber ?? 1));
    const [digits, setDigits] = useState(scheme?.digits ?? 5);
    const [migrate, setMigrate] = useState(false);

    const articleCount = scheme?.articleCount ?? 0;
    const filled = cells.filter(Boolean);
    const startNumber = Math.max(1, Math.floor(Number(start)) || 1);
    const preview = buildCode(
        category.code,
        filled,
        scheme ? Math.max(startNumber, scheme.lastNumber + 1) : startNumber,
        digits,
    );
    // Zellen ODER Zählerbreite geändert: beides schreibt künftige Codes anders
    // als die vorhandenen, also darf man hier die vorhandenen mitnehmen.
    const reshaped = Boolean(scheme) && (filled.join('-') !== scheme?.code || digits !== scheme?.digits);

    return (
        <PopupDialog
            open
            onClose={onClose}
            title={t(scheme ? 'inv.codes.editScheme' : 'inv.codes.newScheme')}
            subtitle={`${category.code} · ${category.name}`}
            width={560}
            footer={(
                <div className="ofi-tp-actions">
                    <div className="ofi-tp-actions__start" />
                    <div className="ofi-tp-actions__end">
                        <PopupButton onClick={onClose} disabled={busy}>{t('common.cancel')}</PopupButton>
                        <PopupButton
                            variant="primary"
                            loading={busy}
                            disabled={!filled.length}
                            onClick={() => onSubmit({
                                cells: filled,
                                name: name.trim() || filled.join('-'),
                                startNumber,
                                digits,
                                migrateArticles: migrate,
                            })}
                        >
                            {t('common.save')}
                        </PopupButton>
                    </div>
                </div>
            )}
        >
            {/* Die Vorschau steht oben: sie ist das Ergebnis, alles darunter die Stellschrauben. */}
            <div className="ofi-codes-preview">
                <span className="ofi-codes-preview__label">{t('inv.codes.preview')}</span>
                <span className="ofi-codes-preview__code">{preview}</span>
            </div>

            <PopupField label={t('inv.codes.cells')} hint={t('inv.codes.cellsHint')} required>
                <CellsRow categoryCode={category.code} cells={cells} digits={digits} onChange={setCells} />
            </PopupField>

            <PopupField label={t('inv.codes.name')}>
                <input
                    value={name}
                    placeholder={t('inv.codes.subNamePlaceholder')}
                    onChange={(event) => setName(event.target.value)}
                    className="ofi-cal-input w-full"
                />
            </PopupField>

            <div className="ofi-codes-two">
                <PopupField label={t('inv.codes.startNumber')}>
                    <input
                        value={start}
                        inputMode="numeric"
                        onChange={(event) => setStart(event.target.value.replace(/\D/g, ''))}
                        className="ofi-cal-input w-full is-mono"
                    />
                </PopupField>
                <PopupField label={t('inv.codes.digits')} hint={`${MIN_CODE_DIGITS}–${MAX_CODE_DIGITS}`}>
                    <input
                        value={String(digits)}
                        inputMode="numeric"
                        onChange={(event) => {
                            const next = Math.floor(Number(event.target.value.replace(/\D/g, '')));
                            setDigits(Math.min(Math.max(Number.isFinite(next) && next > 0 ? next : MIN_CODE_DIGITS, MIN_CODE_DIGITS), MAX_CODE_DIGITS));
                        }}
                        className="ofi-cal-input w-full is-mono"
                    />
                </PopupField>
            </div>

            {reshaped && articleCount > 0 && (
                <>
                    <label className="ofi-codes-switch">
                        <input type="checkbox" checked={migrate} onChange={(event) => setMigrate(event.target.checked)} />
                        <span>{t('inv.codes.migrate')}</span>
                    </label>
                    <PopupNote tone={migrate ? 'warning' : 'neutral'}>
                        {t(migrate ? 'inv.codes.migrateOn' : 'inv.codes.migrateOff', { count: articleCount })}
                    </PopupNote>
                </>
            )}
        </PopupDialog>
    );
};

/* ── Fenster: Löschen ───────────────────────────────────────────────────── */
const DeleteDialog = ({ kind, code, schemes, articles, busy, onConfirm, onClose }: {
    kind: 'category' | 'scheme';
    code: string;
    schemes: number;
    articles: number;
    busy: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) => (
    <PopupDialog
        open
        onClose={onClose}
        tone="danger"
        icon={<AlertTriangle size={16} />}
        title={t(kind === 'category' ? 'inv.codes.deleteCategory' : 'inv.codes.deleteScheme')}
        subtitle={code}
        width={470}
        footer={(
            <div className="ofi-tp-actions">
                <div className="ofi-tp-actions__start" />
                <div className="ofi-tp-actions__end">
                    <PopupButton onClick={onClose} disabled={busy}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="danger" loading={busy} onClick={onConfirm}>{t('common.delete')}</PopupButton>
                </div>
            </div>
        )}
    >
        <p className="ofi-codes-text">
            {kind === 'category'
                ? t('inv.codes.deleteCategoryMessage', { code, schemes })
                : t('inv.codes.deleteSchemeMessage', { code })}
        </p>
        {/* Die eine Zusage, die Samet ausdrücklich wollte: die Artikel bleiben. */}
        <PopupNote tone={articles > 0 ? 'warning' : 'neutral'}>
            {t(articles > 0 ? 'inv.codes.deleteKeepsCodes' : 'inv.codes.deleteNoArticles', { count: articles })}
        </PopupNote>
    </PopupDialog>
);

/* ══════════════════════════════════════════════════════════════════════════ */

export const InventoryCodesSection = () => {
    const permissions = useAuthStore((state) => state.permissions);
    const canManage = useMemo(
        () => MANAGE_PERMISSIONS.some((permission) => permissions.includes(permission)),
        [permissions],
    );

    const [tab, setTab] = useState<TabKey>('categories');
    const [categories, setCategories] = useState<CodeCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pickedId, setPickedId] = useState<string | null>(null);
    const [pickedSchemeId, setPickedSchemeId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

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
    /** Alle Kreise quer über die Kategorien — der Reiter «Zurücksetzen» listet sie zusammen. */
    const allSchemes = useMemo(
        () => categories.flatMap((category) => category.schemes.map((scheme) => ({ category, scheme }))),
        [categories],
    );
    const pickedScheme = useMemo(
        () => allSchemes.find((row) => row.scheme.id === pickedSchemeId) ?? allSchemes[0] ?? null,
        [allSchemes, pickedSchemeId],
    );

    /* ── IT-Schleuse: fehlt der Ausweis, fragt sie und wiederholt danach ──── */
    const [gateRetry, setGateRetry] = useState<{ run: () => Promise<void> } | null>(null);
    const [gateOpen, setGateOpen] = useState(false);
    const runGated = useCallback(async (run: () => Promise<void>) => {
        setBusy(true);
        try {
            await run();
        } catch (error) {
            if (errorStatus(error) === 403) {
                setGateRetry({ run });
                setGateOpen(true);
                return;
            }
            toast.error(errorText(error, t('inv.codes.saveError')));
        } finally {
            setBusy(false);
        }
    }, []);
    /** Braucht die Handlung ohnehin die Schleuse, wird das Kennwort gleich geholt. */
    const runGuarded = useCallback((run: () => Promise<void>, needsGate: boolean) => {
        if (needsGate && !readItGateTicket()) {
            setGateRetry({ run });
            setGateOpen(true);
            return;
        }
        void runGated(run);
    }, [runGated]);

    /* ── Fenster ──────────────────────────────────────────────────────────── */
    const [categoryDialog, setCategoryDialog] = useState<{ category: CodeCategory | null } | null>(null);
    const [schemeDialog, setSchemeDialog] = useState<{ category: CodeCategory; scheme: CodeScheme | null } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<
        { kind: 'category'; category: CodeCategory } | { kind: 'scheme'; category: CodeCategory; scheme: CodeScheme } | null
    >(null);

    /* ── Kategorie anlegen/ändern ─────────────────────────────────────────── */
    const submitCategory = (input: { code: string; name: string; migrateArticles: boolean }) => {
        const editing = categoryDialog?.category ?? null;
        const needsGate = Boolean(editing) && editing!.code !== input.code && (editing!.articleCount ?? 0) > 0;
        runGuarded(async () => {
            if (editing) {
                await articleCodesApi.updateCategory(editing.id, input);
                if (input.migrateArticles && (editing.articleCount ?? 0) > 0) {
                    toast.success(t('inv.codes.migrated', { count: editing.articleCount ?? 0 }));
                }
            } else {
                const created = await articleCodesApi.createCategory({ code: input.code, name: input.name });
                setPickedId(created.id);
            }
            setCategoryDialog(null);
            await load();
        }, needsGate);
    };

    /* ── Nummernkreis anlegen/ändern ──────────────────────────────────────── */
    const submitScheme = (input: { cells: string[]; name: string; startNumber: number; digits: number; migrateArticles: boolean }) => {
        const target = schemeDialog;
        if (!target) return;
        const editing = target.scheme;
        const reshaped = Boolean(editing)
            && (editing!.cells.join('-') !== input.cells.join('-') || editing!.digits !== input.digits);
        const needsGate = reshaped && (editing!.articleCount ?? 0) > 0;
        runGuarded(async () => {
            if (editing) {
                const saved = await articleCodesApi.updateScheme(editing.id, input);
                if (saved.migratedArticles) toast.success(t('inv.codes.migrated', { count: saved.migratedArticles }));
            } else {
                await articleCodesApi.createScheme({ ...input, categoryId: target.category.id });
            }
            setSchemeDialog(null);
            await load();
        }, needsGate);
    };

    /* ── Freigabe (IT) ────────────────────────────────────────────────────── */
    const requestActivation = (scheme: CodeScheme, active: boolean) => {
        runGuarded(async () => {
            const updated = await articleCodesApi.setActivation(scheme.id, active);
            toast.success(t(active ? 'inv.codes.activated' : 'inv.codes.deactivated', { prefix: updated.prefix }));
            await load();
        }, true);
    };

    /* ── Löschen: die Kreise fallen, die Artikelcodes bleiben ─────────────── */
    const confirmDelete = () => {
        const target = deleteTarget;
        if (!target) return;
        const articles = target.kind === 'category'
            ? (target.category.articleCount ?? 0)
            : (target.scheme.articleCount ?? 0);
        runGuarded(async () => {
            if (target.kind === 'category') await articleCodesApi.removeCategory(target.category.id);
            else await articleCodesApi.removeScheme(target.scheme.id);
            setDeleteTarget(null);
            toast.success(t('inv.codes.deleted'));
            await load();
        }, articles > 0);
    };

    /* ── Zurücksetzen ─────────────────────────────────────────────────────── */
    const [counterValue, setCounterValue] = useState('');
    const [confirmRenumber, setConfirmRenumber] = useState(false);
    const resetCounter = (scheme: CodeScheme, value?: number) => {
        runGuarded(async () => {
            const updated = await articleCodesApi.reset(scheme.id, { mode: 'counter', value });
            toast.success(t('inv.codes.counterReset', { code: updated.nextCode }));
            setCounterValue('');
            await load();
        }, true);
    };
    const renumber = (scheme: CodeScheme) => {
        runGuarded(async () => {
            const updated = await articleCodesApi.reset(scheme.id, { mode: 'renumber' });
            toast.success(t('inv.codes.renumbered', { count: updated.renumbered ?? 0 }));
            setConfirmRenumber(false);
            await load();
        }, true);
    };

    const TABS: ReadonlyArray<{ key: TabKey; labelKey: string }> = [
        { key: 'categories', labelKey: 'inv.codes.tabCategories' },
        { key: 'schemes', labelKey: 'inv.codes.tabSchemes' },
        { key: 'reset', labelKey: 'inv.codes.tabReset' },
    ];

    return (
        <div className="ofi-codes">
            {/* Die drei Reiter DIESER Einstellung — darunter hat jeder die ganze Breite. */}
            <nav aria-label={t('settings.modules.categoriesLabel')} className="ofi-codes-subtabs">
                {TABS.map(({ key, labelKey }) => (
                    <button
                        key={key}
                        type="button"
                        aria-current={key === tab ? 'page' : undefined}
                        onClick={() => setTab(key)}
                        className={`ofi-codes-subtab ${key === tab ? 'is-active' : ''}`}
                    >
                        {t(labelKey)}
                    </button>
                ))}
            </nav>

            {/* ── KATEGORIEN ─────────────────────────────────────────────── */}
            {tab === 'categories' && (
                <section className="ofi-mset-card">
                    <div className="ofi-mset-card__head">
                        <h2 className="ofi-mset-card__title">{t('inv.codes.categoriesTitle')}</h2>
                        <span className="ofi-mset-hint">{t('inv.codes.format')} · {t('inv.codes.example')}</span>
                    </div>
                    <div className="ofi-mset-card__body ofi-mset-card__scroll">
                        <table data-inv-table data-unstyled-table data-no-col-resize className="w-full min-w-[560px]">
                            <thead>
                                <tr>
                                    <th scope="col" className="w-28 text-left">{t('inv.codes.code')}</th>
                                    <th scope="col" className="text-left">{t('inv.codes.name')}</th>
                                    <th scope="col" className="w-32 text-right">{t('inv.codes.schemeCount')}</th>
                                    <th scope="col" className="w-28 text-right">{t('inv.codes.articles')}</th>
                                    <th scope="col" className="w-24" />
                                </tr>
                            </thead>
                            <tbody>
                                {(loading || !categories.length) && (
                                    <TableStateRow colSpan={5} loading={loading} emptyText={loadError || t('inv.codes.categoriesEmpty')} />
                                )}
                                {!loading && categories.map((category) => (
                                    <tr key={category.id}>
                                        <td className="font-mono text-[13px] font-semibold">{category.code}</td>
                                        <td>{category.name}</td>
                                        <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                            {category.schemes.filter((scheme) => scheme.isActive).length}/{category.schemes.length}
                                        </td>
                                        <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                            {category.articleCount ?? 0}
                                        </td>
                                        <td className="ofi-mset-actions">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    disabled={!canManage}
                                                    aria-label={t('common.edit')}
                                                    title={t('common.edit')}
                                                    onClick={() => setCategoryDialog({ category })}
                                                    className="ofi-mset-iconbtn"
                                                >
                                                    <Edit01 size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!canManage}
                                                    aria-label={t('inv.codes.deleteCategory')}
                                                    title={t('common.delete')}
                                                    onClick={() => setDeleteTarget({ kind: 'category', category })}
                                                    className="ofi-mset-iconbtn is-danger"
                                                >
                                                    <Trash01 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {canManage && (
                        <div className="ofi-mset-card__foot">
                            <button type="button" onClick={() => setCategoryDialog({ category: null })} className="ofi-mset-primary">
                                <Plus size={14} aria-hidden />
                                {t('inv.codes.addCategory')}
                            </button>
                        </div>
                    )}
                </section>
            )}

            {/* ── NUMMERNKREISE ──────────────────────────────────────────── */}
            {tab === 'schemes' && (
                <section className="ofi-mset-card">
                    <div className="ofi-mset-card__head">
                        <h2 className="ofi-mset-card__title">
                            {picked ? t('inv.codes.schemesTitle', { category: `${picked.code} · ${picked.name}` }) : t('inv.codes.pickCategoryHint')}
                        </h2>
                        <span className="ofi-mset-hint">{t('inv.codes.activateHint')}</span>
                    </div>

                    {/* Die Kategorie wählt man hier oben — sie ist die erste Zelle. */}
                    {categories.length > 0 && (
                        <div className="ofi-codes-chips">
                            {categories.map((category) => (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => setPickedId(category.id)}
                                    className={`ofi-codes-catchip ${picked?.id === category.id ? 'is-active' : ''}`}
                                >
                                    <span className="ofi-codes-catchip__code">{category.code}</span>
                                    <span className="ofi-codes-catchip__name">{category.name}</span>
                                    <span className="ofi-codes-catchip__n">{category.schemes.length}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="ofi-mset-card__body ofi-mset-card__scroll">
                        <table data-inv-table data-unstyled-table data-no-col-resize className="w-full min-w-[720px]">
                            <thead>
                                <tr>
                                    <th scope="col" className="w-64 text-left">{t('inv.codes.cells')}</th>
                                    <th scope="col" className="text-left">{t('inv.codes.name')}</th>
                                    <th scope="col" className="w-44 text-left">{t('inv.codes.nextCode')}</th>
                                    <th scope="col" className="w-24 text-right">{t('inv.codes.articles')}</th>
                                    <th scope="col" className="w-32 text-left">{t('inv.codes.status')}</th>
                                    <th scope="col" className="w-52" />
                                </tr>
                            </thead>
                            <tbody>
                                {!picked && <TableStateRow colSpan={6} loading={loading} emptyText={t('inv.codes.pickCategoryHint')} />}
                                {picked && !picked.schemes.length && (
                                    <TableStateRow colSpan={6} loading={false} emptyText={t('inv.codes.schemesEmpty')} />
                                )}
                                {picked?.schemes.map((scheme) => (
                                    <tr key={scheme.id} className={scheme.isActive ? '' : 'is-muted'}>
                                        <td>
                                            <CellsBadge categoryCode={picked.code} cells={scheme.cells} digits={scheme.digits} />
                                        </td>
                                        <td>{scheme.name}</td>
                                        <td>
                                            <span className="ofi-codes-next">{scheme.nextCode}</span>
                                            <span className="ofi-codes-sub">
                                                {t('inv.codes.startNumber')} {scheme.startNumber}
                                                {scheme.lastNumber > 0 ? ` · ${t('inv.codes.lastNumber')} ${scheme.lastNumber}` : ''}
                                            </span>
                                        </td>
                                        <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                            {scheme.articleCount ?? 0}
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
                                                    onClick={() => requestActivation(scheme, !scheme.isActive)}
                                                    className={`ofi-codes-gate ${scheme.isActive ? '' : 'is-primary'}`}
                                                    title={t('inv.codes.activateHint')}
                                                >
                                                    <Lock01 size={12} aria-hidden />
                                                    {t(scheme.isActive ? 'inv.codes.deactivate' : 'inv.codes.activate')}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!canManage}
                                                    aria-label={t('common.edit')}
                                                    title={t('common.edit')}
                                                    onClick={() => setSchemeDialog({ category: picked, scheme })}
                                                    className="ofi-mset-iconbtn"
                                                >
                                                    <Edit01 size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!canManage}
                                                    aria-label={t('inv.codes.deleteScheme')}
                                                    title={t('common.delete')}
                                                    onClick={() => setDeleteTarget({ kind: 'scheme', category: picked, scheme })}
                                                    className="ofi-mset-iconbtn is-danger"
                                                >
                                                    <Trash01 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {canManage && picked && (
                        <div className="ofi-mset-card__foot">
                            <button type="button" onClick={() => setSchemeDialog({ category: picked, scheme: null })} className="ofi-mset-primary">
                                <Plus size={14} aria-hidden />
                                {t('inv.codes.addScheme')}
                            </button>
                        </div>
                    )}
                </section>
            )}

            {/* ── ZURÜCKSETZEN ───────────────────────────────────────────── */}
            {tab === 'reset' && (
                <div className="ofi-codes-stack">
                    <section className="ofi-mset-card">
                        <div className="ofi-mset-card__head">
                            <h2 className="ofi-mset-card__title">{t('inv.codes.tabSchemes')}</h2>
                            <span className="ofi-mset-hint">{t('inv.codes.pickSchemeHint')}</span>
                        </div>
                        <div className="ofi-mset-card__body ofi-mset-card__scroll">
                            <table data-inv-table data-unstyled-table data-no-col-resize className="w-full min-w-[560px]">
                                <thead>
                                    <tr>
                                        <th scope="col" className="w-64 text-left">{t('inv.codes.cells')}</th>
                                        <th scope="col" className="text-left">{t('inv.codes.name')}</th>
                                        <th scope="col" className="w-44 text-left">{t('inv.codes.nextCode')}</th>
                                        <th scope="col" className="w-24 text-right">{t('inv.codes.articles')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(loading || !allSchemes.length) && (
                                        <TableStateRow colSpan={4} loading={loading} emptyText={t('inv.codes.noSchemes')} />
                                    )}
                                    {allSchemes.map(({ category, scheme }) => (
                                        <tr
                                            key={scheme.id}
                                            onClick={() => { setPickedSchemeId(scheme.id); setCounterValue(''); setConfirmRenumber(false); }}
                                            className={`is-pick ${pickedScheme?.scheme.id === scheme.id ? 'is-picked' : ''}`}
                                        >
                                            <td><CellsBadge categoryCode={category.code} cells={scheme.cells} digits={scheme.digits} /></td>
                                            <td>{scheme.name}</td>
                                            <td><span className="ofi-codes-next">{scheme.nextCode}</span></td>
                                            <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                                {scheme.articleCount ?? 0}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {pickedScheme && (
                        <section className="ofi-mset-card">
                            <div className="ofi-mset-card__head">
                                <h2 className="ofi-mset-card__title">
                                    {t('inv.codes.tabReset')} · {prefixLabel(pickedScheme.scheme.prefix)}
                                </h2>
                                <span className="ofi-mset-hint">{t('inv.codes.resetIntro')}</span>
                            </div>
                            <div className="ofi-mset-card__body ofi-codes-options">
                                {/* 1 — der Zähler fängt wieder am Anfang an. */}
                                <div className="ofi-codes-option">
                                    <div className="ofi-codes-option__text">
                                        <h3 className="ofi-codes-option__title">{t('inv.codes.resetCounter')}</h3>
                                        <p className="ofi-codes-option__hint">
                                            {t('inv.codes.resetCounterHint', {
                                                code: buildCode(
                                                    pickedScheme.category.code,
                                                    pickedScheme.scheme.cells,
                                                    pickedScheme.scheme.startNumber,
                                                    pickedScheme.scheme.digits,
                                                ),
                                            })}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={!canManage || busy}
                                        onClick={() => resetCounter(pickedScheme.scheme)}
                                        className="ofi-codes-gate"
                                    >
                                        <RefreshCcw01 size={12} aria-hidden />
                                        {t('inv.codes.resetCounter')}
                                    </button>
                                </div>

                                {/* 2 — der Zähler springt auf eine gewünschte Nummer. */}
                                <div className="ofi-codes-option">
                                    <div className="ofi-codes-option__text">
                                        <h3 className="ofi-codes-option__title">{t('inv.codes.setCounter')}</h3>
                                        <p className="ofi-codes-option__hint">{t('inv.codes.setCounterHint')}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={counterValue}
                                            inputMode="numeric"
                                            aria-label={t('inv.codes.setCounter')}
                                            placeholder={String(nextNumberOf(pickedScheme.scheme))}
                                            onChange={(event) => setCounterValue(event.target.value.replace(/\D/g, ''))}
                                            className="ofi-mset-newfield is-code w-24 text-right"
                                        />
                                        <button
                                            type="button"
                                            disabled={!canManage || busy || !counterValue}
                                            onClick={() => resetCounter(pickedScheme.scheme, Number(counterValue))}
                                            className="ofi-codes-gate"
                                        >
                                            {t('common.apply')}
                                        </button>
                                    </div>
                                </div>

                                {/* 3 — die Artikel selbst bekommen neue Codes. */}
                                <div className="ofi-codes-option is-danger">
                                    <div className="ofi-codes-option__text">
                                        <h3 className="ofi-codes-option__title">{t('inv.codes.renumber')}</h3>
                                        <p className="ofi-codes-option__hint">
                                            {t('inv.codes.renumberHint', { count: pickedScheme.scheme.articleCount ?? 0 })}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={!canManage || busy || !(pickedScheme.scheme.articleCount ?? 0)}
                                        onClick={() => setConfirmRenumber(true)}
                                        className="ofi-codes-gate is-danger"
                                    >
                                        <AlertTriangle size={12} aria-hidden />
                                        {t('inv.codes.renumber')}
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            )}

            {/* ── Fenster ────────────────────────────────────────────────── */}
            {categoryDialog && (
                <CategoryDialog
                    key={categoryDialog.category?.id ?? 'new-category'}
                    category={categoryDialog.category}
                    articleCount={categoryDialog.category?.articleCount ?? 0}
                    busy={busy}
                    onSubmit={submitCategory}
                    onClose={() => setCategoryDialog(null)}
                />
            )}

            {schemeDialog && (
                <SchemeDialog
                    key={schemeDialog.scheme?.id ?? 'new-scheme'}
                    category={schemeDialog.category}
                    scheme={schemeDialog.scheme}
                    busy={busy}
                    onSubmit={submitScheme}
                    onClose={() => setSchemeDialog(null)}
                />
            )}

            {deleteTarget && (
                <DeleteDialog
                    kind={deleteTarget.kind}
                    code={deleteTarget.kind === 'category' ? deleteTarget.category.code : prefixLabel(deleteTarget.scheme.prefix)}
                    schemes={deleteTarget.kind === 'category' ? deleteTarget.category.schemes.length : 0}
                    articles={deleteTarget.kind === 'category'
                        ? (deleteTarget.category.articleCount ?? 0)
                        : (deleteTarget.scheme.articleCount ?? 0)}
                    busy={busy}
                    onConfirm={confirmDelete}
                    onClose={() => setDeleteTarget(null)}
                />
            )}

            {confirmRenumber && pickedScheme && (
                <PopupDialog
                    open
                    onClose={() => setConfirmRenumber(false)}
                    tone="danger"
                    icon={<AlertTriangle size={16} />}
                    title={t('inv.codes.renumber')}
                    subtitle={prefixLabel(pickedScheme.scheme.prefix)}
                    width={470}
                    footer={(
                        <div className="ofi-tp-actions">
                            <div className="ofi-tp-actions__start" />
                            <div className="ofi-tp-actions__end">
                                <PopupButton onClick={() => setConfirmRenumber(false)} disabled={busy}>{t('common.cancel')}</PopupButton>
                                <PopupButton variant="danger" loading={busy} onClick={() => renumber(pickedScheme.scheme)}>
                                    {t('inv.codes.renumber')}
                                </PopupButton>
                            </div>
                        </div>
                    )}
                >
                    <p className="ofi-codes-text">{t('inv.codes.renumberHint', { count: pickedScheme.scheme.articleCount ?? 0 })}</p>
                    <PopupNote tone="warning">{t('inv.codes.renumberWarn')}</PopupNote>
                </PopupDialog>
            )}

            <ItGatePrompt
                open={gateOpen}
                onClose={() => { setGateOpen(false); setGateRetry(null); }}
                onUnlocked={() => {
                    setGateOpen(false);
                    const pending = gateRetry;
                    setGateRetry(null);
                    if (pending) void runGated(pending.run);
                }}
            />
        </div>
    );
};
