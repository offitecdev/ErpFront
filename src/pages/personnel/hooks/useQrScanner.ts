/**
 * ── DAUERHAFT AKTIVE QR-ERFASSUNG ────────────────────────────────────────────
 *
 * Der Tablet-Bildschirm hat eine Erfassungsfläche, die NIE anhält (Vorgabe).
 * Die vorhandene `components/QRScanner.tsx` hält nach jedem Fund an und startet
 * neu — das kostet bei jeder Person eine Kamera-Aufwärmzeit und lässt die
 * Fläche zwischendurch schwarz. Dieser Haken lässt den Leser durchlaufen und
 * SPERRT stattdessen nur die Auswertung:
 *
 *  • derselbe Code wird innerhalb von `repeatBlockMs` nicht erneut gemeldet
 *    (ein Code steht beim Vorhalten viele Male je Sekunde im Bild),
 *  • während eine Verarbeitung läuft, wird gar nichts gemeldet.
 *
 * Zusätzlich liest er Hand- und Tischleser mit Tastatur-Anschluss: die tippen
 * den Code ohne Eingabefeld direkt ins Fenster und schliessen mit Enter ab.
 * Auf einem Tablet ohne Kamera ist das oft der einzige Weg.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type ScannerState = 'starting' | 'running' | 'error';

interface Options {
    /** Wird mit dem erkannten Text aufgerufen; darf ein Promise liefern. */
    onScan: (text: string) => void | Promise<void>;
    /** Kamera an? Aus, solange ein anderes Fenster den Vordergrund hat. */
    active?: boolean;
    /** Sperrzeit gegen Mehrfachmeldung desselben Codes. */
    repeatBlockMs?: number;
    /** Tastaturleser mithören (Standard: ja). */
    listenKeyboard?: boolean;
}

export const useQrScanner = ({
    onScan,
    active = true,
    repeatBlockMs = 2500,
    listenKeyboard = true,
}: Options) => {
    const [state, setState] = useState<ScannerState>('starting');
    const [busy, setBusy] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // `onScan` ist an den Aufrufstellen eine Pfeilfunktion, also bei jedem
    // Zeichnen neu. Als Effekt-Abhängigkeit würde die Kamera bei jedem Zustand
    // neu starten — deshalb per ref.
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    const lastRef = useRef<{ text: string; at: number } | null>(null);
    const busyRef = useRef(false);

    const handle = useCallback(async (raw: string) => {
        const text = raw.trim();
        if (!text || busyRef.current) return;
        const last = lastRef.current;
        if (last && last.text === text && Date.now() - last.at < repeatBlockMs) return;

        lastRef.current = { text, at: Date.now() };
        busyRef.current = true;
        setBusy(true);
        try {
            await onScanRef.current(text);
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }, [repeatBlockMs]);

    // ── Kamera ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!active) return;
        const element = containerRef.current;
        if (!element) return;

        let alive = true;
        let instance: { stop: () => Promise<void>; clear: () => void; isScanning?: boolean } | null = null;

        // `html5-qrcode` wiegt einige hundert Kilobyte; erst hier nachladen,
        // damit es keine andere Seite des Bündels belastet.
        void (async () => {
            try {
                const { Html5Qrcode } = await import('html5-qrcode');
                if (!alive) return;
                const scanner = new Html5Qrcode(element.id, false);
                instance = scanner as unknown as typeof instance;
                await scanner.start(
                    { facingMode: 'environment' },
                    { fps: 12, aspectRatio: 1 },
                    (decoded) => { void handle(decoded); },
                    () => { /* kein Fund in diesem Einzelbild — normal */ },
                );
                if (alive) setState('running');
            } catch {
                if (alive) setState('error');
            }
        })();

        return () => {
            alive = false;
            const scanner = instance;
            if (!scanner) return;
            const stop = scanner.isScanning ? scanner.stop() : Promise.resolve();
            void stop.then(() => { try { scanner.clear(); } catch { /* schon abgeräumt */ } })
                .catch(() => { /* Kamera war nie offen */ });
        };
    }, [active, handle]);

    // ── Tastaturleser ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!active || !listenKeyboard) return;
        let buffer = '';
        let lastKeyAt = 0;

        const onKeyDown = (event: KeyboardEvent) => {
            // In einem Eingabefeld tippt ein Mensch — nicht mithören.
            const target = event.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

            const now = Date.now();
            // Leser tippen in Millisekunden; eine lange Pause beginnt einen
            // neuen Code, damit Tastendrücke von Menschen nichts anhäufen.
            if (now - lastKeyAt > 120) buffer = '';
            lastKeyAt = now;

            if (event.key === 'Enter') {
                const value = buffer;
                buffer = '';
                if (value.length >= 6) void handle(value);
                return;
            }
            if (event.key.length === 1) buffer += event.key;
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [active, listenKeyboard, handle]);

    return { containerRef, state, busy, submit: handle };
};
