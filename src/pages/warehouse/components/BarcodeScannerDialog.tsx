import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Keyboard } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { useBackDismiss } from '@/lib/backDismiss';

import { cleanScan } from '../hooks/scanRules';
import { CameraView } from './CameraView';

/**
 * ── BARCODE LESEN: KAMERA ODER TASTATUR ─────────────────────────────────────
 * «barkod yerleri için direkt barkod tarayıcı kamera olmalı veya elle
 *  yazılabilmeli.» Ein Fenster für jedes Barcodefeld und für die Suche per
 * Barcode: das Kamerabild oben, darunter das Feld für Handscanner und
 * Tastatur (Enter übernimmt). Der erste gelesene Code schliesst das Fenster.
 *
 * `continuous` (dritter Durchgang, Seriennummern unter dem Häkchen): das
 * Fenster bleibt offen, jeder gelesene Code geht hinaus, darunter stehen der
 * zuletzt gelesene Code und — über `status` — die Zahl bisher.
 *
 * Wird nur gezeichnet, solange es offen ist (`{open && <… />}`) — so beginnt
 * jedes Öffnen frisch und die Kamera geht beim Schliessen sicher aus.
 */
export const BarcodeScannerDialog = ({
    title,
    subtitle,
    initialValue = '',
    onClose,
    onCode,
    continuous = false,
    status,
}: {
    title?: string;
    subtitle?: string;
    initialValue?: string;
    onClose: () => void;
    /** Im Dauerbetrieb darf die Antwort sagen, ob der Code angenommen wurde (false = abgelehnt). */
    onCode: (code: string) => void | boolean | Promise<boolean | void>;
    continuous?: boolean;
    /** Nur im Dauerbetrieb: eine Zeile unter dem Feld (z. B. «3 seri numarası»). */
    status?: ReactNode;
}) => {
    useBackDismiss(true, onClose);
    const [typed, setTyped] = useState(continuous ? '' : initialValue);
    const [last, setLast] = useState<{ code: string; ok: boolean } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const deliver = async (code: string) => {
        const clean = cleanScan(code);
        if (!clean) return;
        if (!continuous) {
            void onCode(clean);
            onClose();
            return;
        }
        setTyped('');
        const accepted = await Promise.resolve(onCode(clean));
        setLast({ code: clean, ok: accepted !== false });
        window.setTimeout(() => inputRef.current?.focus(), 0);
    };

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // Was im Feld STEHT (der Handscanner ist schneller als das Zeichnen).
        const field = event.currentTarget.querySelector('input');
        void deliver(field?.value ?? typed);
    };

    return (
        <PopupDialog
            open
            onClose={onClose}
            title={title ?? t('warehouse.scan.title')}
            subtitle={subtitle ?? t('warehouse.scan.subtitle')}
            width={460}
            z={900}
            footer={(
                <PopupActions>
                    {continuous
                        ? <PopupButton variant="primary" onClick={onClose}>{t('warehouse.actions.done')}</PopupButton>
                        : <PopupButton onClick={onClose}>{t('warehouse.actions.cancel')}</PopupButton>}
                </PopupActions>
            )}
        >
            <div className="ofi-wh-pop ofi-wh-scan">
                {/* Ein Barcodefeld will den Code des Produkts; der Dauerbetrieb liest Seriennummern. */}
                <CameraView active prefer={continuous ? 'serial' : 'product'} onCode={(code) => void deliver(code)} />
                <form className="ofi-wh-scan__manual" onSubmit={submit}>
                    <div className={`ofi-wh-field is-large ${continuous ? 'is-serial' : ''}`}>
                        <Keyboard className="ofi-wh-field__lead" />
                        <input
                            ref={inputRef}
                            value={typed}
                            autoFocus
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            enterKeyHint={continuous ? 'send' : 'done'}
                            placeholder={continuous ? t('warehouse.serials.inputPlaceholder') : t('warehouse.scan.manual')}
                            aria-label={continuous ? t('warehouse.serials.inputPlaceholder') : t('warehouse.scan.manual')}
                            onChange={(event) => setTyped(event.target.value)}
                        />
                    </div>
                    <button type="submit" className="ofi-wh-btn is-primary is-large ofi-nosize" disabled={!typed.trim()}>
                        {continuous ? t('warehouse.serials.addOne') : t('warehouse.scan.apply')}
                    </button>
                </form>
                {continuous && (last || status) && (
                    <div className="ofi-wh-scan__status" role="status" aria-live="polite">
                        {last && (
                            <span className={`ofi-wh-scan__last ${last.ok ? '' : 'is-error'}`}>
                                {last.ok ? <CircleCheck /> : <CircleAlert />}
                                <b>{last.code}</b>
                            </span>
                        )}
                        {status && <span className="ofi-wh-scan__count">{status}</span>}
                    </div>
                )}
            </div>
        </PopupDialog>
    );
};
