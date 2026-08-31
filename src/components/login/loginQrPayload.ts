/**
 * ── ANMELDE-QR: NUTZLAST LESEN ──────────────────────────────────────────────
 *
 * Es gibt ZWEI Arten von Anmelde-QR-Codes:
 *
 *  1. PERSONAL-AUSWEIS (seit dem Personalmodul-Neubau, 16.08.2026) — der Code
 *     trägt nur einen Schlüssel, `OFITEC-STAFF:…`. Der Server tauscht ihn über
 *     `POST /auth/qr-login` gegen eine Sitzung. Das ist der bevorzugte Weg:
 *     derselbe Ausweis stempelt am Tablet ein und aus, und ein verlorener
 *     Ausweis wird neu ausgegeben, ohne dass jemand sein Kennwort ändern muss.
 *
 *  2. ALTFORM — der Code trägt die Zugangsdaten SELBST. Sie wird weiterhin
 *     gelesen, damit bereits gedruckte Codes nicht über Nacht ungültig werden;
 *     der Scanner füllt damit das normale Formular und schickt es über
 *     `POST /auth/login`. Akzeptierte Schreibweisen:
 *
 *       • JSON        {"email":"a@b.ch","password":"…"}   (auch e/p, username/pass)
 *       • URL         https://…/login?email=a@b.ch&password=…   (auch e/p)
 *       • Zwei Zeilen a@b.ch⏎…   oder   a@b.ch|…
 *       • Doppelpunkt a@b.ch:…   (nur der ERSTE Doppelpunkt trennt — Passwörter
 *                                 dürfen selbst Doppelpunkte enthalten)
 *
 * Alles andere ergibt `null` → „QR-Code nicht erkannt".
 */

export interface LoginQrCredentials {
    email: string;
    password: string;
}

/** Ein Personal-Ausweis: nur der Schlüssel, kein Kennwort. */
export interface LoginQrToken {
    token: string;
}

export type LoginQrPayload =
    | ({ kind: 'credentials' } & LoginQrCredentials)
    | ({ kind: 'token' } & LoginQrToken);

/** Präfix des Personal-Ausweises — muss zu `QR_PREFIX` im Backend passen. */
export const STAFF_QR_PREFIX = 'OFITEC-STAFF:';

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const pick = (obj: Record<string, unknown>, keys: string[]): string | null => {
    for (const key of keys) {
        const v = obj[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
};

const fromObject = (obj: Record<string, unknown>): LoginQrPayload | null => {
    // Auch in JSON/URL-Form darf ein Personal-Schlüssel stecken.
    const token = pick(obj, ['token', 't', 'staff', 'staffToken']);
    if (token && token.startsWith(STAFF_QR_PREFIX)) return { kind: 'token', token };

    const email = pick(obj, ['email', 'e', 'username', 'user', 'mail']);
    const password = pick(obj, ['password', 'p', 'pass', 'pw', 'pwd']);
    if (!email || !password || !looksLikeEmail(email)) return null;
    return { kind: 'credentials', email, password };
};

export const parseLoginQr = (raw: string): LoginQrPayload | null => {
    const text = raw.trim();
    if (!text) return null;

    // 1. Personal-Ausweis — steht ganz vorn, weil er die einfachste Form ist
    //    und sonst gleich der Doppelpunkt-Zweig weiter unten zugreifen würde.
    if (text.startsWith(STAFF_QR_PREFIX)) {
        return text.length > STAFF_QR_PREFIX.length ? { kind: 'token', token: text } : null;
    }

    // JSON
    if (text.startsWith('{')) {
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') return fromObject(parsed as Record<string, unknown>);
        } catch {
            /* kein JSON – weiter */
        }
        return null;
    }

    // URL mit Query-Parametern
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
        try {
            const url = new URL(text);
            const params: Record<string, unknown> = {};
            url.searchParams.forEach((value, key) => {
                params[key] = value;
            });
            return fromObject(params);
        } catch {
            return null;
        }
    }

    // Zwei Zeilen / senkrechter Strich
    const lines = text.split(/\r?\n|\|/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 2 && looksLikeEmail(lines[0]!)) {
        return { kind: 'credentials', email: lines[0]!, password: lines[1]! };
    }

    // email:password
    const colon = text.indexOf(':');
    if (colon > 0) {
        const email = text.slice(0, colon).trim();
        const password = text.slice(colon + 1).trim();
        if (looksLikeEmail(email) && password) return { kind: 'credentials', email, password };
    }

    return null;
};
