import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Camera01 as Camera, Hash01 as Hash, Keyboard01 as Keyboard, Scan } from '@untitledui/icons';
import { toast } from 'sonner';
import { CloseButton } from '../base/buttons/close-button';
import { Button } from './Button';
import { Input } from './Field';
import { cx } from '../../lib/utils/cx';

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
            setCameraError('Bu tarayıcı kamera erişimini desteklemiyor. HTTPS/localhost üzerinden açın veya manuel giriş kullanın.');
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
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });

            streamRef.current = stream;

            if (!videoRef.current) {
                throw new Error('Video alanı hazır değil.');
            }

            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setCameraActive(true);

            const Detector = getBarcodeDetector();
            if (Detector) {
                detectorRef.current = new Detector({ formats: barcodeFormats });
                frameRef.current = requestAnimationFrame(detectLoop);
                setScanHint('Kamera açık. Barkodu kutunun içine getirin.');
            } else {
                setScanHint('Kamera açık. Otomatik okuma desteklenmiyorsa kodu manuel yazabilirsiniz.');
            }
        } catch (err: any) {
            stopCamera();
            const name = String(err?.name || '');
            const message = String(err?.message || err || '');
            setCameraError(
                name === 'NotAllowedError' || name === 'PermissionDeniedError'
                    ? 'Kamera izni reddedildi. Tarayıcı adres çubuğundaki kamera iznini açın.'
                    : message.includes('secure') || message.includes('HTTPS')
                      ? 'Kamera için sayfa HTTPS veya localhost üzerinden açılmalı.'
                      : 'Kamera açılamadı. Başka bir uygulama kamerayı kullanıyorsa kapatıp tekrar deneyin.'
            );
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
            toast.error('Barkod kodu boş olamaz.');
            return;
        }

        stopCamera();
        onScan(code);
    };

    const scanner = (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-overlay/40 px-4 py-4 font-sans animate-in fade-in"
            onClick={onClose}
        >
            <div
                className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-secondary bg-primary text-primary shadow-xl animate-in slide-in-from-top-2 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-secondary px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className={cx('flex size-10 items-center justify-center rounded-lg text-white', isSerial ? 'bg-brand-solid' : 'bg-success-solid')}>
                            {isSerial ? <Scan size={19} /> : <Hash size={19} />}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold leading-none text-primary">
                                {isSerial ? 'Ürün Seri Kodu Tara' : 'Genel Ürün Kodu Tara'}
                            </h3>
                            <p className="mt-1.5 text-sm text-tertiary">
                                Açılınca kamera otomatik başlar.
                            </p>
                        </div>
                    </div>
                    <CloseButton size="sm" label="Kapat" onPress={onClose} />
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    <div className="relative min-h-[340px] overflow-hidden rounded-lg border border-secondary bg-black sm:min-h-[420px]">
                        <video ref={videoRef} className="h-full min-h-[340px] w-full bg-black object-cover sm:min-h-[420px]" playsInline muted autoPlay />
                        <canvas ref={canvasRef} className="hidden" />

                        {!cameraActive && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-fg-white/70">
                                <Camera size={46} strokeWidth={1.4} />
                                <span className="text-sm font-medium">
                                    {isStarting ? 'Kamera açılıyor...' : 'Kamera otomatik açılacak'}
                                </span>
                            </div>
                        )}

                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className={cx('h-[44%] w-[86%] rounded-lg border-2 shadow-[0_0_0_999px_rgba(2,6,23,0.30)]', isSerial ? 'border-brand-400' : 'border-success-solid')} />
                            <div className={cx('absolute h-0.5 w-[78%] opacity-90', isSerial ? 'bg-brand-300' : 'bg-success-solid')} />
                        </div>
                    </div>

                    {(cameraError || scanHint) && (
                        <div className={cx('mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', cameraError ? 'border-utility-yellow-200 bg-warning-primary text-warning-primary' : 'border-secondary bg-secondary text-tertiary')}>
                            {cameraError && <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                            <span>{cameraError || scanHint}</span>
                        </div>
                    )}

                    <div className="mt-3 flex gap-2">
                        <Button
                            type="button"
                            onClick={cameraActive ? stopCamera : startCamera}
                            disabled={isStarting}
                            variant={cameraActive ? 'secondary' : 'primary'}
                            className="flex-1"
                            icon={<Camera size={14} />}
                        >
                            {cameraActive ? 'Kamerayı Kapat' : isStarting ? 'Kamera Açılıyor' : 'Kamerayı Aç'}
                        </Button>
                    </div>

                    <div className="my-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border-secondary" />
                        <span className="text-xs font-medium uppercase text-tertiary">Manuel giriş</span>
                        <div className="h-px flex-1 bg-border-secondary" />
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Keyboard size={14} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-fg-quaternary" />
                            <Input
                                value={manualCode}
                                onChange={(e) => setManualCode(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleManualSubmit();
                                }}
                                placeholder={isSerial ? 'Seri kodu yazın veya okutun...' : 'Genel kodu yazın veya okutun...'}
                                className="pl-9"
                            />
                        </div>
                        <Button type="button" onClick={handleManualSubmit}>
                            Uygula
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(scanner, document.body);
};
