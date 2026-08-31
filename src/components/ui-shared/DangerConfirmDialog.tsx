import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { AlertTriangle, X } from '@/components/icons/antIconCompat';
import { Spinner } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';

/**
 * ── BESTÄTIGUNG EINER GEFÄHRLICHEN AKTION ────────────────────────────────────
 *
 * Ein Fenster für alles, was nicht "aus Versehen" passieren darf. Es kennt zwei
 * Hürden, die einzeln oder zusammen gelten:
 *
 *   • KENNWORT (`requirePassword`) — Vorgabe 17.08.2026: eine Löschung im
 *     Produktbereich verlangt von jedem Konto das eigene Kennwort; NUR die
 *     Administratorrolle kommt ohne durch. Das Feld hier ist die Anzeige davon,
 *     entschieden wird am Server (er prüft die Rolle erneut).
 *   • SATZ ZUM ABTIPPEN (`confirmPhrase`) — für das ganz grosse Besteck
 *     (Produktliste zurücksetzen). Der Satz steht in der Sprache des Anwenders
 *     da und wird wörtlich abgetippt.
 *
 * Kein antd: schlichtes Portal + CSS, wie die übrigen neuen Flächen. Der Fehler
 * vom Server (falsches Kennwort) steht IM Fenster, damit die Eingabe stehen
 * bleibt und nicht als Blase verschwindet.
 */

export const DangerConfirmDialog = ({
    open,
    title,
    message,
    confirmLabel,
    busy = false,
    error = null,
    requirePassword,
    confirmPhrase,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    title: string;
    message: ReactNode;
    /** Beschriftung der roten Schaltfläche (Vorgabe: "Löschen"). */
    confirmLabel?: string;
    busy?: boolean;
    /** Meldung des Servers unter den Feldern — das Fenster bleibt dabei offen. */
    error?: string | null;
    /** Kennwortfeld zeigen (alle Konten ausser der Administratorrolle). */
    requirePassword: boolean;
    /** Wörtlich abzutippender Satz; fehlt er, entfällt diese Hürde. */
    confirmPhrase?: string;
    onCancel: () => void;
    onConfirm: (password: string) => void;
}) => {
    const [password, setPassword] = useState('');
    const [typed, setTyped] = useState('');
    const firstFieldRef = useRef<HTMLInputElement>(null);

    // Jedes Öffnen fängt leer an — ein zurückgelassenes Kennwort im Feld wäre
    // genau die Bequemlichkeit, die diese Hürde verhindern soll.
    useEffect(() => {
        if (!open) return;
        setPassword('');
        setTyped('');
        const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 30);
        return () => window.clearTimeout(timer);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !busy) onCancel();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, busy, onCancel]);

    if (!open) return null;

    const phraseOk = !confirmPhrase || typed.trim().toLocaleLowerCase() === confirmPhrase.trim().toLocaleLowerCase();
    const passwordOk = !requirePassword || password.length > 0;
    const armed = phraseOk && passwordOk && !busy;

    const submit = () => {
        if (!armed) return;
        onConfirm(password);
    };

    const fieldClass = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#272f67] dark:border-white/20 dark:bg-white/5 dark:text-white dark:focus:border-white/60';

    return createPortal(
        <div className="fixed inset-0 flex items-center justify-center px-4 py-6" style={{ zIndex: 1200 }}>
            <div
                className="absolute inset-0 bg-slate-950/35 dark:bg-black/60"
                onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onCancel(); }}
            />
            <section
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="relative flex w-full max-w-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/15 dark:bg-[#151616]"
            >
                <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-white/10">
                    <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300">
                            <AlertTriangle size={16} />
                        </span>
                        <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-white">{title}</h3>
                    </div>
                    <button
                        type="button"
                        aria-label={t('common.close')}
                        disabled={busy}
                        onClick={onCancel}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        <X size={14} />
                    </button>
                </header>

                <form
                    className="flex flex-col gap-3 px-5 py-4"
                    onSubmit={(event) => { event.preventDefault(); submit(); }}
                >
                    <div className="text-[12.5px] leading-relaxed text-slate-600 dark:text-white/70">{message}</div>

                    {confirmPhrase && (
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[11.5px] font-semibold text-slate-700 dark:text-white/80">
                                {t('common.dangerConfirm.phraseHint', { phrase: confirmPhrase })}
                            </span>
                            <input
                                ref={firstFieldRef}
                                value={typed}
                                disabled={busy}
                                onChange={(event) => setTyped(event.target.value)}
                                placeholder={confirmPhrase}
                                autoComplete="off"
                                className={fieldClass}
                            />
                        </label>
                    )}

                    {requirePassword && (
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[11.5px] font-semibold text-slate-700 dark:text-white/80">
                                {t('common.dangerConfirm.passwordLabel')}
                            </span>
                            <input
                                ref={confirmPhrase ? undefined : firstFieldRef}
                                type="password"
                                value={password}
                                disabled={busy}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="current-password"
                                className={fieldClass}
                            />
                            <span className="text-[11px] text-slate-500 dark:text-white/50">
                                {t('common.dangerConfirm.passwordHint')}
                            </span>
                        </label>
                    )}

                    {error && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] font-medium text-red-700 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200">
                            {error}
                        </div>
                    )}

                    <div className="mt-1 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onCancel}
                            className="rounded-md border border-slate-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 disabled:opacity-40 dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={!armed}
                            className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {busy && <Spinner size="sm" />}
                            {confirmLabel || t('common.delete')}
                        </button>
                    </div>
                </form>
            </section>
        </div>,
        document.body,
    );
};
