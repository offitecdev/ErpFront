import { useState } from 'react';
import { Lock01 } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { apiClient } from '@/lib/axios';
import { storeItGateTicket } from '@/lib/itGate';
import { PopupButton, PopupDialog, PopupField } from '@/components/ui-shared/PopupKit';

/**
 * IT-KENNWORT ALS FENSTER (10.09.2026) — für Handlungen, die die IT INNERHALB
 * einer normalen Seite freigibt (Freigabe eines Nummernkreises in den
 * Code-Einstellungen). `ItGate` daneben sperrt eine ganze Seite; hier steht
 * die Seite offen, nur der eine Knopf holt sich den Ausweis der Schleuse
 * (`/settings/it-gate/verify` → Ticket im sessionStorage, siehe lib/itGate.ts)
 * und ruft danach `onUnlocked`.
 */
export const ItGatePrompt = ({ open, onClose, onUnlocked, title, subtitle }: {
    open: boolean;
    /** Eigene Überschrift/Hinweis, z. B. für das Einstellungsmenü. */
    title?: string;
    subtitle?: string;
    onClose: () => void;
    /** Wird nach richtigem Kennwort gerufen — der Ausweis liegt dann schon ab. */
    onUnlocked: () => void;
}) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    const verify = async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (!password || checking) return;
        try {
            setChecking(true);
            setError(null);
            const { data } = await apiClient.post<{ ticket?: string; expiresAt?: number }>(
                '/settings/it-gate/verify',
                { password },
            );
            if (data?.ticket && data?.expiresAt) storeItGateTicket(data.ticket, data.expiresAt);
            setPassword('');
            onUnlocked();
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(status === 429 ? t('settings.itGate.tooMany') : t('settings.itGate.wrong'));
            setPassword('');
        } finally {
            setChecking(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={title ?? t('settings.itGate.title')}
            subtitle={subtitle ?? t('inv.codes.itNote')}
            icon={<Lock01 size={16} />}
            width={400}
            footer={(
                <div className="ofi-tp-actions">
                    <div className="ofi-tp-actions__start" />
                    <div className="ofi-tp-actions__end">
                        <PopupButton onClick={onClose} disabled={checking}>{t('common.cancel')}</PopupButton>
                        <PopupButton variant="primary" loading={checking} disabled={!password} onClick={() => void verify()}>
                            {t('settings.itGate.unlock')}
                        </PopupButton>
                    </div>
                </div>
            )}
        >
            <form onSubmit={verify}>
                <PopupField label={t('settings.itGate.password')}>
                    <input
                        type="password"
                        autoFocus
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="ofi-cal-input w-full"
                    />
                </PopupField>
                {error && <p className="mt-2 text-[12.5px] text-[#d70015]">{error}</p>}
            </form>
        </PopupDialog>
    );
};
