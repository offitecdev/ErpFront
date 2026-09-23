import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowUp, CheckCircle } from '@/components/icons/antIconCompat';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { productionErrorText } from '@/lib/api/production';
import type { PurchaseOrderRow } from '@/types/inventory';
import { SectionCard } from '../components/primitives';
import { fmtQty, parseNum } from '../utils/format';
import { importedRowMatches } from '../utils/orderImport';
import type { DraftOrderRow } from '../types';

const errorText = (err: unknown): string =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    || (err as Error)?.message
    || 'error';

const CELL = 'h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-[12.5px] text-slate-700 outline-none focus:border-[#0a7aff] dark:border-white/20 dark:bg-transparent dark:text-white';

/**
 * ══ MAL KABUL — SİPARİŞİN İÇİNDE, KENDİ SEKMESİNDE (22.09.2026) ═══════════
 *
 * Vorgabe Samet: «Mal kabul de siparişin içine dahil olacak, onay butonları da
 * olmayacak, tek tıkla açılabilecek … mal kabulü de aynı şekilde tablar
 * hâlinde olacak, stoğa gidenler ayrı bir tab.»
 *
 * Darum ist dieser Reiter KEIN zweiter Positionseditor mehr (das war die alte
 * Wareneingangsseite): die Zeilen werden im Reiter «Satırlar» geschrieben,
 * HIER werden sie nur EINGEBUCHT. Die Tabelle zeigt die noch offenen Zeilen
 * mit Bestellmenge, schon Eingelagertem und der Menge, die jetzt ins Lager
 * geht; gebuchte Zeilen wandern in den Reiter «Stoğa gidenler».
 *
 * Was hier gebucht wird, schreibt der Server in EINEM Zug (Bewegung, Bestand,
 * Partie, Zeilenstempel) — dieselbe `/receive`-Schnittstelle wie bisher.
 */
export const ReceivePanel = ({ order, canTransfer, codeScheme, onRequestScheme, importTick, importRows, onOrderChanged }: {
    order: PurchaseOrderRow;
    canTransfer: boolean;
    /* DER NUMMERNKREIS WIRD IN «AYARLAR» GEWÄHLT (Vorgabe Samet, 22.09.2026) —
       gebraucht wird er hier, wo codelose Zeilen ihren ERP-Code bekommen. Die
       Seite hält ihn; dieser Reiter zeigt ihn und ruft nach ihm, wenn er fehlt. */
    codeScheme: { id: string; label: string; next: string } | null;
    onRequestScheme: () => void;
    /** Zählt hoch, sobald ein Beleg eingelesen wurde (Werkzeugzeile der Seite). */
    importTick: number;
    importRows: DraftOrderRow[];
    onOrderChanged: (next: PurchaseOrderRow) => void;
}) => {
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    /** Menge je Zeilenindex, die JETZT eingebucht werden soll. */
    const [amounts, setAmounts] = useState<Record<number, string>>({});

    const open = useMemo(
        () => order.items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => Math.max(0, (Number(item.quantity) || 0) - (Number(item.receivedQuantity) || 0)) > 0),
        [order.items],
    );
    const remainingOf = (index: number) => {
        const item = order.items[index];
        return Math.max(0, (Number(item?.quantity) || 0) - (Number(item?.receivedQuantity) || 0));
    };
    const amountOf = (index: number) => {
        const typed = amounts[index];
        if (typed === undefined || typed === '') return remainingOf(index);
        return Math.min(remainingOf(index), Math.max(0, parseNum(typed) ?? 0));
    };

    /* ── EIN GELESENER LIEFERSCHEIN FÜLLT DIE MENGEN ────────────────────────
       «Belge içe aktar» steht auch über diesem Reiter. Weil hier nicht mehr
       geschrieben, sondern gebucht wird, ERSETZT der Beleg die Liste nicht —
       er trägt seine Mengen in die Zeilen ein, die er wiederfindet (Code,
       ersatzweise Name) und kreuzt genau diese an. Was er nicht wiederfindet,
       bleibt unangetastet: eine Lieferung erfindet keine Bestellzeile. */
    useEffect(() => {
        if (!importTick || !importRows.length) return;
        const next: Record<number, string> = {};
        const hits = new Set<number>();
        importRows.forEach((incoming) => {
            const found = open.find(({ item, index }) => !hits.has(index) && importedRowMatches({
                code: item.code ?? '',
                name: item.name ?? '',
            } as DraftOrderRow, incoming));
            if (!found) return;
            hits.add(found.index);
            const wanted = parseNum(incoming.quantity) ?? 0;
            next[found.index] = String(Math.min(remainingOf(found.index), Math.max(0, wanted)) || remainingOf(found.index));
        });
        if (!hits.size) { toast.error(t('inv.orders.receive.importNoMatch')); return; }
        // Die Übernahme geschieht NACH dem Rendern: der Effekt reagiert auf einen
        // Zähler von aussen, er soll sich nicht selbst nachrendern.
        queueMicrotask(() => {
            setAmounts((current) => ({ ...current, ...next }));
            setSelected(hits);
            toast.success(t('inv.orders.receive.importMatched', { count: hits.size }));
        });
    }, [importTick]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = (index: number) => {
        setSelected((current) => {
            const nextSet = new Set(current);
            if (nextSet.has(index)) nextSet.delete(index); else nextSet.add(index);
            return nextSet;
        });
    };

    const needsCode = (indexes: number[]) => indexes.some((index) => {
        const item = order.items[index];
        return !item?.articleId && !String(item?.code || '').trim();
    });

    const run = async (indexes: number[] | null) => {
        const targets = indexes ?? open.map(({ index }) => index);
        if (!targets.length) return;
        /* Zeilen ohne Produktcode bekommen ihren ERP-Code HIER — also wird hier
           gefragt, aus welchem Kreis. Ohne Wahl vergibt der Server den
           vorläufigen AA-BB-NNNNNN. */
        if (needsCode(targets) && !codeScheme) { onRequestScheme(); return; }
        setBusy(true);
        try {
            const result = await purchaseOrdersApi.receive(order.id, {
                lines: targets.map((index) => ({ index, quantity: amountOf(index) })),
                ...(codeScheme ? { codeSchemeId: codeScheme.id } : {}),
            });
            onOrderChanged(result.order);
            setSelected(new Set());
            setAmounts({});
            if (result.errors.length) toast.error(result.errors.map((entry) => entry.error).join(' · '));
            else toast.success(t('inv.orders.receive.batchSent', { count: result.processedCount }));
        } catch (err) {
            toast.error(productionErrorText(err, errorText(err)));
        } finally {
            setBusy(false);
        }
    };

    if (!open.length) {
        return (
            <SectionCard>
                <div className="ofi-ows-empty">
                    <CheckCircle size={26} className="text-emerald-500" />
                    <span>{t('inv.orders.receive.allDone')}</span>
                </div>
            </SectionCard>
        );
    }

    return (
        <SectionCard
                title={t('inv.orders.receive.sectionTitle', { count: open.length })}
                action={canTransfer ? (
                    <div className="flex flex-wrap items-center gap-2">
                        {/* WELCHE CODES DIESER WARENEINGANG VERGIBT — sichtbar,
                            bevor gebucht wird, und mit einem Klick wechselbar. */}
                        <button
                            type="button"
                            onClick={onRequestScheme}
                            title={t('inv.orders.receive.codeRangePick')}
                            className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[12px] text-slate-600 transition-colors hover:border-slate-300 dark:border-white/15 dark:text-white/70"
                        >
                            <span className="text-slate-400 dark:text-white/40">{t('inv.orders.receive.codeRange')}</span>
                            <span className="font-mono font-semibold">{codeScheme ? codeScheme.next : t('inv.orders.receive.codeRangeNone')}</span>
                        </button>
                        <button
                            type="button"
                            disabled={busy || selected.size === 0}
                            onClick={() => void run([...selected])}
                            className="flex h-8 items-center gap-1.5 rounded-md border border-[#0a7aff]/30 px-3 text-[12px] font-semibold text-[#0a7aff] transition-colors hover:bg-[#0a7aff] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/30 dark:text-white"
                        >
                            {busy ? <LoadingDots label={t('common.loadingData')} /> : <ArrowUp size={14} />}
                            {t('inv.orders.receive.sendSelected', { count: selected.size })}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void run(null)}
                            className="flex h-8 items-center gap-1.5 rounded-md bg-[#0a7aff] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#0066e0] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <CheckCircle size={14} />
                            {t('inv.orders.receive.completeButton')}
                        </button>
                    </div>
                ) : undefined}
            >
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full min-w-[760px]">
                        <colgroup>
                            {canTransfer && <col style={{ width: 40 }} />}
                            <col style={{ width: 150 }} />
                            <col />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 130 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                {canTransfer && (
                                    <th className="text-center">
                                        <input
                                            type="checkbox"
                                            checked={selected.size > 0 && selected.size === open.length}
                                            onChange={(event) => setSelected(event.target.checked ? new Set(open.map(({ index }) => index)) : new Set())}
                                            aria-label={t('inv.orders.receive.selectAll')}
                                            className="size-3.5 cursor-pointer accent-[#0a7aff]"
                                        />
                                    </th>
                                )}
                                <th className="text-left">{t('inv.columns.serialCode')}</th>
                                <th className="text-left">{t('inv.columns.productName')}</th>
                                <th className="text-right">{t('inv.columns.quantity')}</th>
                                <th className="text-right">{t('inv.orders.receive.receivedColumn')}</th>
                                <th className="text-right">{t('inv.orders.receive.bookColumn')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {open.map(({ item, index }) => (
                                <tr
                                    key={`${index}-${item.code || item.name}`}
                                    className={selected.has(index) ? 'bg-[#0a7aff]/[0.05] dark:bg-white/[0.06]' : undefined}
                                >
                                    {canTransfer && (
                                        <td className="text-center">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(index)}
                                                onChange={() => toggle(index)}
                                                aria-label={item.name || item.code || String(index + 1)}
                                                className="size-3.5 cursor-pointer accent-[#0a7aff]"
                                            />
                                        </td>
                                    )}
                                    <td className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                        {item.code || <span className="italic text-slate-400 dark:text-white/40">{t('inv.orders.receive.codeAuto')}</span>}
                                    </td>
                                    <td className="text-slate-800 dark:text-white">{item.name}</td>
                                    <td className="text-right font-mono text-[12.5px]">{fmtQty(Number(item.quantity) || 0)}</td>
                                    <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                        {fmtQty(Number(item.receivedQuantity) || 0)}
                                    </td>
                                    <td>
                                        {canTransfer ? (
                                            <input
                                                value={amounts[index] ?? ''}
                                                onChange={(event) => setAmounts((current) => ({ ...current, [index]: event.target.value }))}
                                                onFocus={(event) => event.currentTarget.select()}
                                                inputMode="decimal"
                                                placeholder={fmtQty(remainingOf(index))}
                                                className={CELL}
                                            />
                                        ) : (
                                            <span className="block text-right font-mono text-[12.5px]">{fmtQty(remainingOf(index))}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
        </SectionCard>
    );
};
