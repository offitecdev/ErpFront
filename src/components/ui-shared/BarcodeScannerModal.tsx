import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle as WarningOutlined, Camera01 as CameraOutlined, Hash01 as NumberOutlined, Scan as ScanOutlined, XClose as CloseOutlined } from '../icons/antIconCompat';
import { LuKeyRound as MdVpnKey } from '@/components/icons/lucideLocal';
import { toast } from 'sonner';
import { Button } from './Button';
import { Input } from './Field';

import { t } from '@/i18n/translate';
import { formatCameraError } from '@/lib/cameraError';

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorInstance = {
    detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = {
    new (options?: { formats?: string[] }): BarcodeDetectorInstance;
};

const barcodeFormats = [
    'code_128',
    'code_39',
    'code_93',
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
    'itf',
    'codabar',
    'qr_code',
    'data_matrix',
];

const getBarcodeDetector = () =>
    (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;

export const BarcodeScannerModal: React.FC<{
    mode: 'serial' | 'general';
    onClose: () => void;
    onScan: (code: string) => void;
}> = ({ mode, onClose, onScan }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
    const frameRef = useRef<number | null>(null);
    const scannedRef = useRef(false);
    const startingRef = useRef(false);
    const onScanRef = useRef(onScan);

    const [manualCode, setManualCode] = useState('');
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    const [scanHint, setScanHint] = useState('');

    onScanRef.current = onScan;
    const isSerial = mode === 'serial';

    const stopCamera = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }

        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        detectorRef.current = null;

        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.srcObject = null;
        }

        setCameraActive(false);
    }, []);

    const detectLoop = useCallback(async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const detector = detectorRef.current;

        if (!video || !canvas || !detector || scannedRef.current || !streamRef.current) return;

        try {
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

                const results = await detector.detect(canvas);
                const code = results[0]?.rawValue?.trim();
                if (code) {
                    scannedRef.current = true;
                    stopCamera();
                    onScanRef.current(code);
                    return;
                }
            }
        } catch {
            /* Failed frames are normal while autofocus settles. */
        }

        frameRef.current = requestAnimationFrame(detectLoop);
    }, [stopCamera]);

    const startCamera = useCallback(async () => {
        if (startingRef.current || streamRef.current) return;

        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError(t('auto.bu_tarayici_kamera_erisimini_desteklemiyor_https'));
            return;
        }

        startingRef.current = true;
        scannedRef.current = false;
        setIsStarting(true);
        setCameraError('');
        setScanHint('');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { exact: 'user' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });

            streamRef.current = stream;

            if (!videoRef.current) {
                throw new Error(t('auto.video_alani_hazir_degil'));
            }

            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setCameraActive(true);

            const Detector = getBarcodeDetector();
            if (Detector) {
                detectorRef.current = new Detector({ formats: barcodeFormats });
                frameRef.current = requestAnimationFrame(detectLoop);
                setScanHint(t('auto.kamera_acik_barkodu_kutunun_icine_getirin'));
            } else {
                setScanHint(t('auto.kamera_acik_otomatik_okuma_desteklenmiyorsa_kodu'));
            }
        } catch (err: any) {
            stopCamera();
            const name = String(err?.name || '');
            const message = String(err?.message || err || '');
            const friendlyMessage =
                name === "NotAllowedError" || name === "PermissionDeniedError"
                    ?t('auto.kamera_izni_reddedildi_tarayici_adres_cubugundak')
                    : message.includes('secure') || message.includes('HTTPS')
                      ?t('auto.kamera_icin_sayfa_https_veya_localhost_uzerinden')
                      :t('auto.kamera_acilamadi_baska_bir_uygulama_kamerayi_kul');
            setCameraError(`${friendlyMessage}\n\n${formatCameraError(err)}`);
        } finally {
            startingRef.current = false;
            setIsStarting(false);
        }
    }, [detectLoop, stopCamera]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void startCamera();
        }, 100);

        return () => {
            window.clearTimeout(timer);
            stopCamera();
        };
    }, [startCamera, stopCamera]);

    const handleManualSubmit = () => {
        const code = manualCode.trim();
        if (!code) {
            toast.error(t('auto.barkod_kodu_bos_olamaz'));
            return;
        }

        stopCamera();
        onScan(code);
    };

    const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

    const scanner = (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-overlay/40 px-4 py-4 font-sans animate-in fade-in"
            onClick={onClose}
        >
            <div
                /* `.ofi-pop` = die gemeinsame Fensteroberfläche (index.css,
                   "FENSTER-OBERFLÄCHE"). Das Fenster malte sich vorher aus einer
                   fremden Token-Familie (`bg-primary` / `border-secondary`) und
                   kam mit `rounded-xl` bei 8px an. */
                className="ofi-pop flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden animate-in slide-in-from-top-2 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ofi-pop__rule flex items-start justify-between gap-4 border-b px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className={cx("flex size-10 items-center justify-center rounded-lg text-white", isSerial ? 'bg-brand-solid' : 'bg-success-solid')}>
                            {isSerial ? <ScanOutlined style={{ fontSize: 19 }} /> : <NumberOutlined style={{ fontSize: 19 }} />}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold leading-none text-primary">
                                {isSerial ?t('auto.urun_seri_kodu_tara') :t('auto.genel_urun_kodu_tara')}
                            </h3>
                            <p className="mt-1.5 text-sm text-tertiary">{t('auto.acilinca_kamera_otomatik_baslar')}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="ofi-float-card__iconbtn shrink-0"
                        aria-label={t('common.close')}
                    >
                        <CloseOutlined style={{ fontSize: 16 }} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    <div className="relative min-h-[340px] overflow-hidden rounded-lg border border-secondary bg-black sm:min-h-[420px]">
                        <video ref={videoRef} className="h-full min-h-[340px] w-full bg-black object-cover sm:min-h-[420px]" playsInline muted autoPlay />
                        <canvas ref={canvasRef} className="hidden" />

                        {!cameraActive && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-fg-white/70">
                                <CameraOutlined style={{ fontSize: 46 }} />
                                <span className="text-sm font-medium">
                                    {isStarting ?t('auto.kamera_aciliyor') :t('auto.kamera_otomatik_acilacak')}
                                </span>
                            </div>
                        )}

                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className={cx("h-[44%] w-[86%] rounded-lg border-2 shadow-[0_0_0_999px_rgba(2,6,23,0.30)]", isSerial ? 'border-brand-400' : 'border-success-solid')} />
                            <div className={cx("absolute h-0.5 w-[78%] opacity-90", isSerial ? 'bg-brand-300' : 'bg-success-solid')} />
                        </div>
                    </div>

                    {(cameraError || scanHint) && (
                        <div className={cx("mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm", cameraError ?"border-utility-yellow-200 bg-warning-primary text-warning-primary" :"border-secondary bg-secondary text-tertiary")}>
                            {cameraError && <WarningOutlined style={{ fontSize: 14, marginTop: 2 }} />}
                            <span className="whitespace-pre-wrap break-words">{cameraError || scanHint}</span>
                        </div>
                    )}

                    <div className="mt-3 flex gap-2">
                        <Button
                            onClick={cameraActive ? stopCamera : startCamera}
                            disabled={isStarting}
                            variant={cameraActive ? 'secondary' : 'primary'}
                            className="flex-1"
                            icon={<CameraOutlined style={{ fontSize: 14 }} />}
                        >
                            {cameraActive ?t('auto.kamerayi_kapat') : isStarting ?t('auto.kamera_aciliyor') :t('auto.kamerayi_ac')}
                        </Button>
                    </div>

                    <div className="my-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border-secondary" />
                        <span className="text-xs font-medium uppercase text-tertiary">{t('auto.manuel_giris')}</span>
                        <div className="h-px flex-1 bg-border-secondary" />
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <MdVpnKey className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-fg-quaternary" size={14} />
                            <Input
                                value={manualCode}
                                onChange={(e) => setManualCode(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleManualSubmit();
                                }}
                                placeholder={isSerial ?t('auto.seri_kodu_yazin_veya_okutun') :t('auto.genel_kodu_yazin_veya_okutun')}
                                className="pl-9"
                            />
                        </div>
                        <Button onClick={handleManualSubmit}>{t('auto.uygula')}</Button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(scanner, document.body);
};
