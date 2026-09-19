import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import {
    AlertTriangle,
    GitBranch01 as GitBranch,
    RefreshCcw01 as RefreshCw,
    Trash01,
    XClose,
} from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupCaption, PopupDialog, PopupEmpty, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { myOrdersApi } from '@/lib/api/billing';
import { documentEventsApi } from '@/lib/api/documentEvents';
import { isOverridable, OverrideDialog, useGovernance } from '@/components/governance';
import { FullCancelDialog } from './FullCancelDialog';
import type { LifecycleBlocker, OrderCancelResultDto, OrderLifecycleDto, OrderRevertResultDto } from '@/types/billing';

/**
 * ── EINEN AUFTRAG ZURÜCKNEHMEN — ÜBERALL DERSELBE WEG ────────────────────────
 *
 * Vorgabe Samet (06.09.2026): «Löschen», «Storno» und «zurück in den Entwurf»
 * sind DREI verschiedene Handlungen, und welche offensteht, hängt davon ab, was
 * schon geschehen ist. Genau das entscheidet der Server; die Oberfläche fragt
 * ihn beim Öffnen dieses Fensters und zeigt danach nur die Wege, die auch
 * durchgehen — mit dem Grund daneben, warum der andere versperrt ist.
 *
 *   • ZURÜCK IN ENTWURF — nur ganz am Anfang: keine Rechnung, keine
 *     Lagerbewegung, kein Rapport, keine begonnene Montage, keine Nachträge.
 *     Der Auftrag verschwindet, die Offerte wird wieder ein Entwurf; war es der
 *     letzte Auftrag des Projekts, fällt das Projekt in die PLANUNG zurück —
 *     es wird nicht gelöscht.
 *   • STORNO — sobald etwas daran hängt. Nichts verschwindet: der Auftrag und
 *     seine Nachträge gelten als zurückgenommen, künftige Termine werden
 *     abgesagt, und die Offerte trägt das Storno mit. Andere Aufträge des
 *     Projekts bleiben unberührt; nur mit dem LETZTEN aktiven Auftrag geht auch
 *     das Projekt.
 *   • NACHTRAG LÖSCHEN — ein Nachtrag hat keine eigene Offerte, in die er
 *     zurückfiele: solange keine Rechnung an ihm hängt, verschwindet er ganz
 *     und seine Sätze kehren zum Hauptauftrag zurück.
 *
 * Das Fenster steht EINMAL hier und wird von der Auftragsansicht, der
 * Projektseite und dem Nachtragsbereich benutzt, damit die drei nie
 * verschiedene Folgen versprechen.
 */

export interface LifecycleOrderRef {
    id: string;
    orderNumber: string;
    /** Ein Nachtrag — er lässt den Hauptauftrag stehen. */
    isAddon?: boolean;
    /** Schon storniert: dann steht nur noch «Storno aufheben» offen. */
    cancelled?: boolean;
}

export type OrderLifecycleAction = 'REVERT' | 'CANCEL' | 'DELETE_ADDON' | 'UNCANCEL';

export interface OrderLifecycleOutcome {
    action: OrderLifecycleAction;
    /** Die Offerte, die wieder ein Entwurf ist (nur bei REVERT). */
    tenderId?: string | null;
    projectId?: string | null;
    /** Das Projekt steht noch, ist aber zurück in der Planung. */
    projectReverted?: boolean;
    /** Das Projekt ging mit ins Storno. */
    projectCancelled?: boolean;
}

/** Ein Satz je Sperrgrund — warum dieser Weg nicht (mehr) offensteht. */
const blockerLabel = (blocker: LifecycleBlocker): string => {
    switch (blocker) {
        case 'INVOICE': return t('orders.lifecycle.blockerInvoice');
        case 'REPORT': return t('orders.lifecycle.blockerReport');
        case 'DELIVERY_REPORT': return t('orders.lifecycle.blockerDeliveryReport');
        case 'STOCK_MOVEMENT': return t('orders.lifecycle.blockerStock');
        case 'EXPENSE': return t('orders.lifecycle.blockerExpense');
        case 'MONTAGE_STARTED': return t('orders.lifecycle.blockerMontage');
        case 'ADDON': return t('orders.lifecycle.blockerAddon');
        case 'CANCELLED': return t('orders.lifecycle.blockerCancelled');
        case 'SALES_ORDER': return t('orders.lifecycle.blockerSalesOrder');
        case 'PROJECT': return t('orders.lifecycle.blockerProject');
        default: return blocker;
    }
};

/* Eine wählbare Handlung im Fenster — Titel, Erklärung, und wenn versperrt,
   die Gründe darunter. Gesperrte Zeilen verschwinden NICHT: dass ein Weg zu
   ist und warum, ist die halbe Auskunft. */
const ActionRow = ({ icon, title, description, blockers, lockedText, selected, danger, onSelect, extra }: {
    icon: ReactNode;
    title: string;
    description: string;
    blockers: LifecycleBlocker[];
    /** Gesperrt, weil der Rolle das Recht fehlt (16.09.2026) — ein eigener Satz. */
    lockedText?: string | null;
    selected: boolean;
    danger?: boolean;
    onSelect: () => void;
    /** Unter der Zeile, z. B. der Weg der Systemverwaltung durch die Sperre. */
    extra?: ReactNode;
}) => {
    const blocked = blockers.length > 0 || Boolean(lockedText);
    return (
        <>
        <button
            type="button"
            disabled={blocked}
            onClick={onSelect}
            aria-pressed={selected}
            className={`ofi-option-row flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                blocked
                    ? 'cursor-not-allowed border-slate-200 opacity-60 dark:border-white/10'
                    : selected
                        ? 'border-[#0066e0] bg-[#eef2fb] dark:border-white/40 dark:bg-white/10'
                        : 'border-slate-200 dark:border-white/10'
            }`}
        >
            <span className={`mt-0.5 shrink-0 ${danger ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-white/60'}`}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-slate-900 dark:text-white">{title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-slate-500 dark:text-white/60">{description}</span>
                {blocked && (
                    <span className="mt-1.5 block text-[12px] leading-snug text-rose-600 dark:text-rose-300">
                        {lockedText || blockers.map((blocker) => blockerLabel(blocker)).join(' · ')}
                    </span>
                )}
            </span>
        </button>
        {extra}
        </>
    );
};

export const useOrderLifecycle = (
    onDone: (order: LifecycleOrderRef, outcome: OrderLifecycleOutcome) => void | Promise<void>,
) => {
    const [target, setTarget] = useState<LifecycleOrderRef | null>(null);
    const [lifecycle, setLifecycle] = useState<OrderLifecycleDto | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [choice, setChoice] = useState<OrderLifecycleAction | null>(null);
    const [reason, setReason] = useState('');
    // Rechte je Rücknahme und die Ausnahmetür (16.09.2026, Schritt 4).
    const { can, isSystemAdmin } = useGovernance();
    const [overrideOpen, setOverrideOpen] = useState(false);
    // Storno MIT ausgestellten Rechnungen läuft über die Übersicht (Schritt 6).
    const [fullCancel, setFullCancel] = useState<{ order: LifecycleOrderRef; reason: string } | null>(null);
    const mayRevert = can('ORDER_REVERT');
    const mayCancel = can('ORDER_CANCEL');

    const close = useCallback(() => {
        setTarget(null);
        setLifecycle(null);
        setChoice(null);
        setReason('');
        setOverrideOpen(false);
    }, []);

    const requestAction = useCallback((order: LifecycleOrderRef) => {
        setTarget(order);
        setLifecycle(null);
        setChoice(null);
        setReason('');
    }, []);

    /* Erst beim Öffnen fragen: die Auskunft kostet ein halbes Dutzend Zählungen
       auf einer entfernten Datenbank und würde jede Auftragsseite verlangsamen,
       obwohl sie fast nie gebraucht wird. */
    useEffect(() => {
        if (!target) return;
        let cancelled = false;
        setLoading(true);
        myOrdersApi.lifecycle(target.id)
            .then((data) => {
                if (cancelled) return;
                setLifecycle(data);
                // Der offene Weg ist vorgewählt; ist der Auftrag storniert,
                // bleibt nur die Rücknahme des Stornos.
                // Vorgewählt wird nur, was die Rolle auch darf.
                if (data.cancelled) setChoice(isSystemAdmin ? 'UNCANCEL' : null);
                else if (data.isAddon) setChoice(data.counts.invoices > 0 ? (mayCancel ? 'CANCEL' : null) : 'DELETE_ADDON');
                else if (data.canRevertToDraft && mayRevert) setChoice('REVERT');
                else setChoice(mayCancel && data.canCancel ? 'CANCEL' : null);
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
                toast.error(message || t('orders.lifecycle.loadFailed'));
                setTarget(null);
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // Die Rechte stehen fest, solange das Fenster offen ist.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    const confirm = useCallback(async () => {
        if (!target || !choice) return;
        setBusy(true);
        try {
            if (choice === 'REVERT') {
                const result: OrderRevertResultDto = await myOrdersApi.revertToDraft(target.id);
                toast.success(t('orders.lifecycle.revertDone', { orderNumber: target.orderNumber }));
                close();
                await onDone(target, {
                    action: 'REVERT',
                    tenderId: result.tenderId,
                    projectId: result.projectId,
                    projectReverted: result.projectReverted,
                });
                return;
            }
            if (choice === 'CANCEL' && (lifecycle?.invoicesToSettle ?? 0) > 0) {
                // Rechnungen müssen mitgeregelt werden: weiter zur Übersicht.
                setFullCancel({ order: target, reason: reason.trim() });
                close();
                return;
            }
            if (choice === 'CANCEL') {
                const result: OrderCancelResultDto = await myOrdersApi.cancel(target.id, reason.trim() || null);
                toast.success(t('orders.lifecycle.cancelDone', { orderNumber: target.orderNumber }));
                close();
                await onDone(target, {
                    action: 'CANCEL',
                    projectId: result.projectId,
                    projectCancelled: result.projectCancelled,
                });
                return;
            }
            if (choice === 'UNCANCEL') {
                await myOrdersApi.uncancel(target.id);
                toast.success(t('orders.lifecycle.uncancelDone', { orderNumber: target.orderNumber }));
                close();
                await onDone(target, { action: 'UNCANCEL' });
                return;
            }
            const result = await myOrdersApi.remove(target.id);
            toast.success(t('orders.lifecycle.addonDeleted', { orderNumber: target.orderNumber }));
            close();
            await onDone(target, { action: 'DELETE_ADDON', projectId: result.projectId });
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(message || t('orders.lifecycle.actionFailed'));
        } finally {
            setBusy(false);
        }
    }, [target, choice, reason, lifecycle, close, onDone]);

    /* AUSNAHMETÜR: derselbe Abschluss wie das normale Zurücksetzen, nur über
       den Weg mit Grund, Nummer und Kennwort. Ein Fehler wirft — das Fenster
       der Ausnahme bleibt dann offen und zeigt ihn. */
    const confirmOverride = useCallback(async (override: Parameters<typeof documentEventsApi.revertOrderWithOverride>[1]) => {
        if (!target) return;
        const result = await documentEventsApi.revertOrderWithOverride(target.id, override);
        toast.success(t('orders.lifecycle.revertDone', { orderNumber: target.orderNumber }));
        const current = target;
        close();
        await onDone(current, {
            action: 'REVERT',
            tenderId: result.tenderId,
            projectId: result.projectId,
            projectReverted: result.projectReverted,
        });
    }, [target, close, onDone]);

    const uncancelLocked = Boolean(lifecycle?.uncancelBlockers?.length);
    const settleCount = lifecycle?.invoicesToSettle ?? 0;
    const choiceAllowed = choice === 'REVERT' ? mayRevert
        : choice === 'CANCEL' ? mayCancel
            : choice === 'UNCANCEL' ? isSystemAdmin && !uncancelLocked
                : Boolean(choice);
    const overrideOffered = Boolean(lifecycle && !lifecycle.isAddon && !lifecycle.cancelled
        && !lifecycle.canRevertToDraft && isSystemAdmin
        && isOverridable('ORDER_REVERT', lifecycle.revertBlockers));

    const confirmLabel = choice === 'CANCEL'
        ? (settleCount > 0 ? t('orders.fullCancel.continue') : t('orders.lifecycle.cancelAction'))
        : choice === 'UNCANCEL'
            ? t('orders.lifecycle.uncancelAction')
            : choice === 'DELETE_ADDON'
                ? t('common.delete')
                : t('orders.lifecycle.revertAction');

    const dialog: ReactNode = target ? (
        <PopupDialog
            open
            title={t('orders.lifecycle.title', { orderNumber: target.orderNumber })}
            subtitle={t('orders.lifecycle.subtitle')}
            icon={<AlertTriangle size={20} />}
            tone="danger"
            width={520}
            onClose={() => { if (!busy) close(); }}
            closeOnBackdrop={!busy}
            closeOnEscape={!busy}
            footer={(
                <PopupActions>
                    <PopupButton disabled={busy} onClick={close}>{t('common.cancel')}</PopupButton>
                    <PopupButton
                        variant={choice === 'UNCANCEL' ? 'primary' : 'danger'}
                        loading={busy}
                        disabled={!choice || loading || !choiceAllowed}
                        onClick={() => { void confirm(); }}
                    >
                        {confirmLabel}
                    </PopupButton>
                </PopupActions>
            )}
        >
            {loading || !lifecycle ? (
                <PopupEmpty>{t('common.loading')}</PopupEmpty>
            ) : lifecycle.cancelled ? (
                <div className="space-y-3">
                    <PopupNote tone="warning">{t('orders.lifecycle.alreadyCancelled')}</PopupNote>
                    {lifecycle.cancelReason && (
                        <div className="text-[12.5px] text-slate-600 dark:text-white/70">
                            {t('orders.lifecycle.reasonLabel')}: {lifecycle.cancelReason}
                        </div>
                    )}
                    {uncancelLocked
                        ? <PopupNote tone="warning">{t('orders.fullCancel.uncancelLocked')}</PopupNote>
                        : <PopupNote>{t('orders.lifecycle.uncancelExplain')}</PopupNote>}
                    {!isSystemAdmin && !uncancelLocked && <PopupNote tone="warning">{t('governance.uncancelAdminOnly')}</PopupNote>}
                </div>
            ) : (
                <div className="space-y-2.5">
                    {lifecycle.isAddon ? (
                        <ActionRow
                            icon={<Trash01 size={16} />}
                            title={t('orders.lifecycle.addonDeleteTitle')}
                            description={t('orders.lifecycle.addonDeleteText')}
                            blockers={lifecycle.counts.invoices > 0 ? ['INVOICE'] : []}
                            selected={choice === 'DELETE_ADDON'}
                            danger
                            onSelect={() => setChoice('DELETE_ADDON')}
                        />
                    ) : (
                        <ActionRow
                            icon={<GitBranch size={16} />}
                            title={t('orders.lifecycle.revertTitle')}
                            description={lifecycle.lastOfProject && lifecycle.projectId
                                ? t('orders.lifecycle.revertTextLast')
                                : t('orders.lifecycle.revertText')}
                            blockers={lifecycle.revertBlockers}
                            lockedText={mayRevert ? null : t('governance.noPermissionRevert')}
                            selected={choice === 'REVERT'}
                            onSelect={() => setChoice('REVERT')}
                            extra={overrideOffered ? (
                                <div className="flex justify-end">
                                    <button type="button" className="ofi-cal-btn is-danger" onClick={() => setOverrideOpen(true)}>
                                        {t('governance.override.revertOpen')}
                                    </button>
                                </div>
                            ) : null}
                        />
                    )}

                    <ActionRow
                        icon={<XClose size={16} />}
                        title={t('orders.lifecycle.cancelTitle')}
                        description={lifecycle.lastOfProject && lifecycle.projectId
                            ? t('orders.lifecycle.cancelTextLast')
                            : lifecycle.counts.addons > 0
                                /* NICHT `count`: daraus machte i18next einen
                                   Pluralschlüssel (_one/_other) und fände den
                                   flachen Schlüssel nicht mehr. */
                                ? t('orders.lifecycle.cancelTextAddons', { addonCount: lifecycle.counts.addons })
                                : t('orders.lifecycle.cancelText')}
                        blockers={lifecycle.cancelBlockers}
                        lockedText={mayCancel ? null : t('governance.noPermissionCancel')}
                        selected={choice === 'CANCEL'}
                        danger
                        onSelect={() => setChoice('CANCEL')}
                    />

                    {choice === 'CANCEL' && (
                        <PopupField className="pt-1" label={t('orders.lifecycle.reasonLabel')} hint={t('common.optional')}>
                            <input
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                maxLength={500}
                                placeholder={t('orders.lifecycle.reasonPlaceholder')}
                                className="ofi-cal-input w-full"
                            />
                        </PopupField>
                    )}

                    {choice === 'REVERT' && lifecycle.projectId && lifecycle.lastOfProject && (
                        <PopupNote tone="warning">{t('orders.lifecycle.revertProjectNote')}</PopupNote>
                    )}
                    {choice === 'CANCEL' && settleCount > 0 && (
                        <PopupNote tone="warning">
                            {t('orders.fullCancel.settleNote', { invoiceCount: settleCount })}
                        </PopupNote>
                    )}
                    {choice === 'CANCEL' && (
                        <PopupCaption>{t('orders.lifecycle.cancelAppointmentsNote')}</PopupCaption>
                    )}
                    {/* Zurueck in den Entwurf laesst die angesetzten Termine
                        STEHEN (16.09.2026): sie warten im Projekt und gehen an
                        den neuen Auftrag ueber. Gut zu wissen, keine Warnung. */}
                    {choice === 'REVERT' && lifecycle.counts.upcomingAppointments > 0 && (
                        <PopupNote>
                            {t('orders.lifecycle.revertAppointmentsNote', {
                                count: lifecycle.counts.upcomingAppointments,
                                appointmentCount: lifecycle.counts.upcomingAppointments,
                            })}
                        </PopupNote>
                    )}
                </div>
            )}
            {overrideOpen && lifecycle && (
                <OverrideDialog
                    open
                    title={t('governance.override.revertTitle', { orderNumber: target.orderNumber })}
                    actionLabel={t('governance.override.revertAction')}
                    documentNumber={target.orderNumber}
                    blockers={lifecycle.revertBlockers}
                    consequence={t('governance.override.revertConsequence')}
                    onCancel={() => setOverrideOpen(false)}
                    onConfirm={confirmOverride}
                />
            )}
        </PopupDialog>
    ) : null;

    const fullCancelDialog: ReactNode = fullCancel ? (
        <FullCancelDialog
            scope="ORDER"
            id={fullCancel.order.id}
            initialReason={fullCancel.reason}
            onClose={() => setFullCancel(null)}
            onDone={async (result) => {
                const order = fullCancel.order;
                setFullCancel(null);
                await onDone(order, {
                    action: 'CANCEL',
                    projectId: null,
                    projectCancelled: result.projectCancelled,
                });
            }}
        />
    ) : null;

    return { requestAction, dialog: <>{dialog}{fullCancelDialog}</>, busy };
};

/** Der einheitliche rote Knopf, der dieses Fenster öffnet. */
export const OrderLifecycleButton = ({ cancelled, onClick, className }: {
    cancelled?: boolean;
    onClick: () => void;
    className?: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors ${
            cancelled
                ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-white/70 dark:hover:bg-white/10'
                : 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10'
        } ${className || ''}`}
    >
        {cancelled ? <RefreshCw size={14} /> : <AlertTriangle size={14} />}
        {cancelled ? t('orders.lifecycle.uncancelAction') : t('orders.lifecycle.buttonLabel')}
    </button>
);
