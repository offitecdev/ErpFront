import React, { useEffect, useRef, useState, useId } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
    onScan: (text: string) => void | Promise<void>;
}


export const QRScanner: React.FC<Props> = ({ onScan }) => {
    const [error, setError] = useState('');
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    const reactId = useId().replace(/:/g, '');
    const elementId = `qr-reader-${reactId}`;
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const aliveRef = useRef(true);

    useEffect(() => {
        aliveRef.current = true;
        const html5QrCode = new Html5Qrcode(elementId, false);
        scannerRef.current = html5QrCode;

        const restart = async () => {
            if (!aliveRef.current) return;
            setError('');
            try {
                await html5QrCode.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: { width: 240, height: 240 },
                        aspectRatio: 1,
                    },
                    async (decodedText) => {
                        if (!aliveRef.current) return;
                        try {
                            await html5QrCode.stop();
                        } catch {
                            /* ignore */
                        }
                        try {
                            html5QrCode.clear();
                        } catch {
                            /* ignore */
                        }
                        await Promise.resolve(onScanRef.current(decodedText));
                        await restart();
                    },
                    () => {}
                );
            } catch {
                if (aliveRef.current) {
                    setError('Kamera başlatılamadı. Lütfen tarayıcı izinlerini kontrol edin.');
                }
            }
        };

        restart();

        return () => {
            aliveRef.current = false;
            const s = scannerRef.current;
            if (!s) return;
            if (s.isScanning) {
                s.stop()
                    .then(() => s.clear())
                    .catch(() => {});
            } else {
                try {
                    s.clear();
                } catch {
                    /* ignore */
                }
            }
            scannerRef.current = null;
        };
    }, [elementId]);

    return (
        <div style={{ width: '100%', maxWidth: '350px', margin: '0 auto', textAlign: 'center' }}>
            <div
                id={elementId}
                style={{
                    width: '100%',
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '3px solid #1677ff',
                    backgroundColor: '#000',
                    minHeight: 200,
                }}
            />
            {error && <div style={{ color: '#ff4d4f', marginTop: 16, fontSize: 13 }}>{error}</div>}
        </div>
    );
};
