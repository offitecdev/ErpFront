import { useState } from 'react';
import type { ReactNode } from 'react';
import { Lock01 as Lock } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { apiClient } from '@/lib/axios';
import { readItGateTicket, storeItGateTicket } from '@/lib/itGate';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';



/* Ob die Schleuse offen steht, entscheidet der AUSWEIS des Servers (siehe
   lib/itGate.ts) — nicht mehr ein eigenes Häkchen daneben. So kann die Anzeige
   nicht behaupten, offen zu sein, während der Server den nächsten Aufruf
   abweist: läuft der Ausweis ab, schliesst sich auch die Fläche. */
export const ItGate = ({ children }: { children: ReactNode }) => {
    const [open, setOpen] = useState(() => Boolean(readItGateTicket()));
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    if (open) return <>{children}</>;

    const verify = async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (!password) return;
        try {
            setChecking(true);
            setError(null);
            const { data } = await apiClient.post<{ ticket?: string; expiresAt?: number }>(
                '/settings/it-gate/verify',
                { password },
            );
            if (data?.ticket && data?.expiresAt) storeItGateTicket(data.ticket, data.expiresAt);
            setOpen(true);
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(status === 429 ? t('settings.itGate.tooMany') : t('settings.itGate.wrong'));
            setPassword('');
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="flex w-full justify-center pt-16">
            <form onSubmit={verify} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-white/15 dark:bg-slate-900">
                <div className="mb-4 flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-md bg-[#272f67]/10 text-[#272f67] dark:bg-white/10 dark:text-white">
                        <Lock size={16} />
                    </span>
                    <div>
                        <div className="text-[14px] font-bold text-slate-900 dark:text-white">{t('settings.itGate.title')}</div>
                        <div className="text-[12px] text-slate-500 dark:text-white/60">{t('settings.itGate.note')}</div>
                    </div>
                </div>

                <Field label={t('settings.itGate.password')} error={error}>
                    <Input
                        type="password"
                        autoFocus
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                </Field>

                <div className="mt-4 flex justify-end">
                    <Button variant="primary" loading={checking} onClick={() => void verify()}>
                        {t('settings.itGate.unlock')}
                    </Button>
                </div>
            </form>
        </div>
    );
};
