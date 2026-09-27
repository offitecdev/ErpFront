import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ScanBarcode } from 'lucide-react';

import { t } from '@/i18n/translate';

import { BarcodeScannerDialog } from './BarcodeScannerDialog';

/**
 * Ein Barcodefeld: tippen oder mit dem Handscanner lesen — oder rechts die
 * Kamera öffnen. Der gelesene Code steht danach im Feld.
 */
export const BarcodeInput = ({
    value,
    onChange,
    ariaLabel,
    placeholder,
    disabled,
    invalid,
    large,
    onEnter,
    autoFocus,
    scanTitle,
    continuous,
    scanStatus,
    lead,
}: {
    value: string;
    onChange: (next: string) => void;
    ariaLabel: string;
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
    large?: boolean;
    /** Enter im Feld (Handscanner schliessen mit Enter ab). */
    onEnter?: (value: string) => void | boolean | Promise<boolean | void>;
    autoFocus?: boolean;
    scanTitle?: string;
    /** Die Kamera bleibt offen und gibt JEDEN gelesenen Code an `onEnter` (Seriennummern). */
    continuous?: boolean;
    /** Nur mit `continuous`: Zeile unter dem Kamerafeld (z. B. «3 seri numarası»). */
    scanStatus?: ReactNode;
    /** Zeichen vor dem Feld (z. B. das Scan-Symbol der Seriennummern). */
    lead?: ReactNode;
}) => {
    const [scanning, setScanning] = useState(false);

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        // Ein Scanner, der mit Enter abschliesst, soll kein Formular abschicken.
        // Gelesen wird, was im Feld STEHT — der Handscanner ist schneller als das Zeichnen.
        event.preventDefault();
        onEnter?.(event.currentTarget.value);
    };

    return (
        <>
            <div className={`ofi-wh-field ${large ? 'is-large' : ''} ${invalid ? 'is-invalid' : ''} ${disabled ? 'is-disabled' : ''} ${continuous ? 'is-serial' : ''}`}>
                {lead}
                <input
                    value={value}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={onKeyDown}
                />
                <button
                    type="button"
                    className="ofi-wh-field__tool ofi-nosize"
                    disabled={disabled}
                    title={t('warehouse.scan.openCamera')}
                    aria-label={t('warehouse.scan.openCamera')}
                    onClick={() => setScanning(true)}
                >
                    <ScanBarcode />
                </button>
            </div>
            {scanning && (
                <BarcodeScannerDialog
                    title={scanTitle}
                    initialValue={value}
                    continuous={continuous}
                    status={scanStatus}
                    onClose={() => setScanning(false)}
                    onCode={(code) => {
                        if (continuous) return onEnter?.(code);
                        onChange(code);
                        return onEnter?.(code);
                    }}
                />
            )}
        </>
    );
};
