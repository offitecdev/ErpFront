import { useEffect, useRef, useState } from 'react';

import { AlertTriangle } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { OverrideInput } from '@/lib/api/documentEvents';

import { blockerText } from './blockerText';
import './governance.css';

/**
 * ── DIE AUSNAHMETÜR (16.09.2026, Schritt 4 / D4) ─────────────────────────────
 *
 * Ein Warnfenster in drei ruhigen Schritten, von oben nach unten:
 *
 *   1. WAS überschritten wird — jede Sperre als rote Zeile;
 *   2. WARUM — der Grund, mindestens zehn Zeichen, landet wörtlich im Verlauf;
 *   3. BESTÄTIGEN — die Belegnummer abtippen und das eigene Kennwort.
 *
 * Der rote Knopf bleibt aus, bis alles steht. Lehnt der Server ab (falsches
 * Kennwort, falsche Nummer), bleibt das Fenster offen und sagt es — die
 * Eingaben gehen nicht verloren. Nur die Systemverwaltung sieht dieses Fenster;
 * der Server prüft das trotzdem noch einmal.
 */

const ERROR_KEYS: Record<string, string> = {
    OVERRIDE_NOT_ADMIN: 'governance.override.errNotAdmin',
    OVERRIDE_NOT_ALLOWED: 'governance.override.errNotAllowed',
    OVERRIDE_REASON_REQUIRED: 'governance.override.errReason',
    OVERRIDE_NUMBER_MISMATCH: 'governance.override.errNumber',
    OVERRIDE_PASSWORD_REQUIRED: 'governance.override.errPasswordRequired',
    OVERRIDE_PASSWORD_WRONG: 'governance.override.errPasswordWrong',
};

export const OverrideDialog = ({
    open,
    title,
    actionLabel,
    documentNumber,
    blockers,
    consequence,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    title: string;
    /** Beschriftung des roten Knopfs, z. B. «Trotzdem zurücksetzen». */
    actionLabel: string;
    documentNumber: string;
    blockers: readonly string[];
    /** Was die Handlung auslöst — ein Satz unter den Sperren. */
    consequence?: string;
    onCancel: () => void;
    /** Führt die Handlung aus; wirft bei Ablehnung (das Fenster bleibt offen). */
    onConfirm: (override: OverrideInput) => Promise<void>;
}) => {
    const [reason, setReason] = useState('');
    const [typed, setTyped] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reasonRef = useRef<HTMLTextAreaElement>(null);

    // Das Fenster wird für jede Ausnahme neu eingehängt, die Felder beginnen
    // also leer; hier wird nur der Fokus gesetzt.
    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => reasonRef.current?.focus(), 40);
        return () => window.clearTimeout(timer);
    }, [open]);

    const numberOk = typed.trim().replace(/\s+/g, '').toUpperCase() === documentNumber.trim().replace(/\s+/g, '').toUpperCase();
    const ready = reason.trim().length >= 10 && numberOk && password.length > 0 && !busy;

    const submit = async () => {
        if (!ready) return;
        setBusy(true);
        setError(null);
        try {
            await onConfirm({ reason: reason.trim(), confirmNumber: typed.trim(), password });
        } catch (failure) {
            const data = (failure as { response?: { data?: { code?: string; error?: string } } })?.response?.data;
            const key = data?.code ? ERROR_KEYS[data.code] : undefined;
            setError(key ? t(key) : data?.error || t('governance.override.errGeneric'));
            if (data?.code === 'OVERRIDE_PASSWORD_WRONG') setPassword('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={() => { if (!busy) onCancel(); }}
            title={title}
            subtitle={t('governance.override.subtitle')}
            icon={<AlertTriangle size={20} />}
            tone="danger"
            width={500}
            z={800}
            closeOnBackdrop={false}
            closeOnEscape={!busy}
            footer={(
                <PopupActions>
                    <PopupButton disabled={busy} onClick={onCancel}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="danger" loading={busy} disabled={!ready} onClick={() => void submit()}>
                        {actionLabel}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="gov gov-steps">
                <div>
                    <div className="gov-blockers">
                        {blockers.map((blocker) => (
                            <div key={blocker} className="gov-blocker">
                                <AlertTriangle size={14} />
                                <span>{blockerText(blocker)}</span>
                            </div>
                        ))}
                    </div>
                    {consequence && <PopupNote>{consequence}</PopupNote>}
                </div>

                <PopupField label={t('governance.override.reason')} hint={t('governance.override.reasonHint')} required>
                    <textarea
                        ref={reasonRef}
                        className="ofi-cal-input w-full"
                        rows={3}
                        maxLength={2000}
                        value={reason}
                        placeholder={t('governance.override.reasonPlaceholder')}
                        onChange={(event) => setReason(event.target.value)}
                    />
                </PopupField>

                <PopupField
                    label={<>{t('governance.override.typeNumber')} <span className="gov-code">{documentNumber}</span></>}
                    required
                >
                    <input
                        className="ofi-cal-input w-full"
                        value={typed}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => setTyped(event.target.value)}
                    />
                </PopupField>

                <PopupField label={t('governance.override.password')} required>
                    <input
                        className="ofi-cal-input w-full"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
                    />
                </PopupField>

                <PopupNote>{t('governance.override.recordNote')}</PopupNote>
                {error && <PopupNote tone="danger">{error}</PopupNote>}
            </div>
        </PopupDialog>
    );
};
