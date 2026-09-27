import { Camera } from 'lucide-react';

import { t } from '@/i18n/translate';

import type { ScanPreference } from '../hooks/scanRules';
import { useBarcodeCamera, type CameraProblem } from '../hooks/useBarcodeCamera';

const problemText = (problem: CameraProblem, supported: boolean): string => {
    if (!supported || problem === 'unsupported') return t('warehouse.scan.cameraUnsupported');
    if (problem === 'denied') return t('warehouse.scan.cameraDenied');
    if (problem === 'failed') return t('warehouse.scan.cameraFailed');
    return t('warehouse.scan.cameraIdle');
};

/**
 * Das Kamerabild mit Rahmen und wandernder Linie (wie der iOS-Scanner).
 * Startet von selbst, sobald `active`; ohne Kamera oder ohne Erlaubnis steht
 * ein ruhiger Satz da — das Eingabefeld daneben bleibt der Weg des
 * Handscanners und der Tastatur.
 */
export const CameraView = ({
    active,
    paused = false,
    onCode,
    repeatMs,
    compact,
    prefer = 'product',
}: {
    active: boolean;
    paused?: boolean;
    onCode: (code: string) => void;
    /** Siehe useBarcodeCamera: so lange muss ein Code aus dem Bild sein, bis er wieder zählt. */
    repeatMs?: number;
    /** Flacheres Bild (Seriennummern-Reiter). */
    compact?: boolean;
    /** Welcher Code gilt, wenn das Etikett mehrere trägt: der des Produkts oder die Seriennummer. */
    prefer?: ScanPreference;
}) => {
    const { videoRef, running, starting, problem, supported, start, stop } = useBarcodeCamera({
        active,
        paused,
        onCode,
        prefer,
        ...(repeatMs !== undefined ? { repeatMs } : {}),
    });
    const readerMissing = running && problem === 'unsupported';

    return (
        <div className="ofi-wh-cam-block">
            <div className={`ofi-wh-cam ${paused ? 'is-paused' : ''} ${compact ? 'is-compact' : ''}`}>
                <video ref={videoRef} playsInline muted autoPlay />
                {!running && (
                    <div className="ofi-wh-cam__idle">
                        <Camera />
                        <span>{starting ? t('warehouse.scan.cameraStarting') : problemText(problem, supported)}</span>
                        {!starting && supported && problem !== 'denied' && (
                            <button type="button" className="ofi-wh-btn is-small ofi-nosize" onClick={() => void start()}>
                                {t('warehouse.scan.cameraStart')}
                            </button>
                        )}
                    </div>
                )}
                {running && <div className="ofi-wh-cam__reticle" aria-hidden />}
            </div>
            <div className="ofi-wh-cam__tools">
                <p className={`ofi-wh-cam__note ${readerMissing ? 'is-warn' : ''}`}>
                    {readerMissing ? t('warehouse.scan.cameraUnsupported') : running ? t('warehouse.scan.hint') : ''}
                </p>
                {running && (
                    <button type="button" className="ofi-wh-btn is-small is-quiet ofi-nosize" onClick={stop}>
                        {t('warehouse.scan.cameraStop')}
                    </button>
                )}
            </div>
        </div>
    );
};
