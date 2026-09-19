/**
 * ── ÇALIŞAN GÖREV AUF DEM DESKTOP ───────────────────────────────────────────
 *
 * 15.09.2026 (Samet): «sadece uygulama değil masaüstünde de» — das kleine
 * Fenster soll auch dann zu sehen sein, wenn der Browser bzw. die installierte
 * App hinter anderen Programmen liegt oder minimiert ist. Später am selben Tag:
 * «işarete basınca açılsın, direkt değil; o kadar büyük açılmasın».
 *
 * Mittel: Document Picture-in-Picture (Chrome/Edge ab 116, auch in der
 * installierten App). Das Fenster bleibt über ALLEN Programmen, schliesst sich
 * aber mit dem Tab. Es geht NUR über den Knopf ⧉ im Fenster unten auf (ein
 * Klick ist Pflicht und wird vom Öffnen verbraucht). Fehlt die Schnittstelle
 * (Firefox, Safari, Telefon, Electron), gibt es auf dem Telefon die Mitteilung
 * (phoneNotification.ts), sonst bleibt es beim Fenster in der App.
 */

export interface DesktopWindowApi {
    readonly window: Window | null;
    requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
}

/** Innenmass; der Browser setzt seine Titelleiste darüber und hebt zu kleine Masse auf sein Minimum. */
export const DESKTOP_WINDOW_SIZE = { width: 360, height: 72 } as const;

export const desktopWindowApi = (): DesktopWindowApi | null => {
    if (typeof window === 'undefined') return null;
    const api = (window as Window & { documentPictureInPicture?: DesktopWindowApi }).documentPictureInPicture;
    return api && typeof api.requestWindow === 'function' ? api : null;
};

/** Alle Stylesheets der App ins Fenster — das Fenster sieht dort genauso aus. */
export const copyStylesInto = (target: Document): void => {
    document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        const clone = node.cloneNode(true) as HTMLElement;
        if (node instanceof HTMLLinkElement) (clone as HTMLLinkElement).href = node.href;
        target.head.append(clone);
    });
};

/** Hell/Dunkel folgt der App, auch wenn sie später umschaltet. */
export const mirrorRootClass = (target: Document): (() => void) => {
    const apply = () => {
        target.documentElement.className = document.documentElement.className;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
};

/**
 * Öffnet ein Browser das Fenster deutlich grösser als erbeten (manche Fassungen
 * übergehen das Mass), zieht es der nächste Klick — im Fenster oder in der App —
 * auf das kleine Mass zusammen. Das Öffnen selbst hat den Klick schon
 * verbraucht, `resizeTo` braucht einen neuen. Ein Minimum des Browsers bleibt
 * unangetastet: dann ist nichts zu tun.
 */
const clearlyTooLarge = (win: Window): boolean =>
    win.innerWidth > DESKTOP_WINDOW_SIZE.width + 160 || win.innerHeight > 220;

export const shrinkOnNextClick = (win: Window): (() => void) => {
    let done = false;
    const detach = () => {
        done = true;
        document.removeEventListener('pointerdown', onApp, true);
        document.removeEventListener('keydown', onApp, true);
        win.document.removeEventListener('click', onWindow, true);
        win.document.removeEventListener('keydown', onWindow, true);
    };
    const fit = () => {
        if (done || win.closed) return detach();
        if (!clearlyTooLarge(win)) return detach();
        const frameWidth = Math.max(0, win.outerWidth - win.innerWidth);
        const frameHeight = Math.max(0, win.outerHeight - win.innerHeight);
        try {
            win.resizeTo(DESKTOP_WINDOW_SIZE.width + frameWidth, DESKTOP_WINDOW_SIZE.height + frameHeight);
            detach();
        } catch {
            /* noch kein frischer Klick — beim nächsten */
        }
    };
    // In der App sofort; im Fenster erst nach dem Klick, damit der Knopf unter dem Finger bleibt.
    function onApp() {
        fit();
    }
    function onWindow() {
        window.setTimeout(fit, 0);
    }
    document.addEventListener('pointerdown', onApp, true);
    document.addEventListener('keydown', onApp, true);
    win.document.addEventListener('click', onWindow, true);
    win.document.addEventListener('keydown', onWindow, true);
    return detach;
};

/* EIN Desktop-Fenster pro Gerät: der Tab, der es geöffnet hat, hält eine
   Sperre mit Herzschlag. Grosszügige Frist, weil ein minimierter Tab seine
   Zeitgeber nur noch einmal pro Minute ausführen darf. */
export const DESKTOP_LOCK_KEY = 'ofi:tasks-timer-dock:desktop';
export const DESKTOP_LOCK_TTL_MS = 75_000;
export const DESKTOP_HEARTBEAT_MS = 20_000;

const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const readLock = (): { tab: string; at: number } | null => {
    try {
        const value = JSON.parse(localStorage.getItem(DESKTOP_LOCK_KEY) ?? 'null') as { tab?: unknown; at?: unknown } | null;
        return value && typeof value.tab === 'string' && typeof value.at === 'number' ? { tab: value.tab, at: value.at } : null;
    } catch {
        return null;
    }
};

export const writeDesktopLock = (): void => {
    try {
        localStorage.setItem(DESKTOP_LOCK_KEY, JSON.stringify({ tab: TAB_ID, at: Date.now() }));
    } catch {
        /* ohne Speicher gibt es keine Absprache zwischen Tabs */
    }
};

export const clearDesktopLock = (): void => {
    try {
        if (readLock()?.tab === TAB_ID) localStorage.removeItem(DESKTOP_LOCK_KEY);
    } catch {
        /* nichts zu tun */
    }
};

/** Steht das Desktop-Fenster schon — geöffnet von einem ANDEREN Tab? */
export const desktopOpenInOtherTab = (now = Date.now()): boolean => {
    const lock = readLock();
    return Boolean(lock && lock.tab !== TAB_ID && now - lock.at < DESKTOP_LOCK_TTL_MS);
};
