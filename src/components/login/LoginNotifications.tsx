import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuArrowRight, LuBell, LuX } from '@/components/icons/lucideLocal';
import { LOGIN_NOTICES, type LoginNotice } from './loginNotices';

/**
 * ── MITTEILUNGSLEISTE (unten links) ─────────────────────────────────────────
 *
 * Eine Glocke unten links; daneben gleitet auf Klick eine Karte von links
 * herein, die die Mitteilungen aus `loginNotices.ts` zeigt (Update-Notizen,
 * Weblinks). Ungelesene Mitteilungen markieren die Glocke mit einem roten
 * Punkt; beim ersten Besuch mit ungelesenen Mitteilungen gleitet kurz nach
 * dem Laden ein schmaler Hinweis (Datum + Titel) neben der Glocke heraus —
 * NICHT die ganze Karte, die würde das Formular verdecken. Ein Klick auf den
 * Hinweis oder die Glocke öffnet die Karte.
 *
 * Gelesen = die Karte war einmal offen. Die ids gelesener Mitteilungen liegen
 * unter `SEEN_KEY` im localStorage; eine neue Mitteilung (neue id) wird so
 * genau einmal automatisch gezeigt. Speicherzugriffe sind gekapselt, weil sie
 * im privaten Modus werfen können.
 *
 * KEIN MODAL: nur Glocke und Karte fangen Klicks ab, das Formular dahinter
 * bleibt bedienbar. ESC schliesst.
 *
 * SCHRIFT: die ganze Leiste läuft in der Programmschrift Open Sans. Die drei
 * Titel (Kartenkopf, Mitteilung, Hinweis neben der Glocke) trugen bis
 * 17.08.2026 `.ofi-serif` und damit Times New Roman (siehe styles/login.css);
 * die Datumszeilen standen schon immer in Open Sans. Jetzt ist es eine
 * Schrift auf dem Schirm.
 */

const SEEN_KEY = 'offitec-login-notices-seen';
const AUTO_OPEN_DELAY_MS = 1100;
/** Wie lange der Hinweis neben der Glocke von selbst sichtbar bleibt. */
const TEASER_VISIBLE_MS = 8000;

const readSeen = (): Set<string> => {
    try {
        const raw = window.localStorage.getItem(SEEN_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
    } catch {
        return new Set();
    }
};

const writeSeen = (ids: Set<string>) => {
    try {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
    } catch {
        /* Speicher nicht verfügbar — dann eben nicht dauerhaft. */
    }
};

const NoticeCard = ({ notice }: { notice: LoginNotice }) => {
    const { t } = useTranslation();
    return (
        <li className="ofi-login__notice">
            <span className="ofi-login__notice-date">{notice.date}</span>
            <h3>{notice.title}</h3>
            {notice.body && <p>{notice.body}</p>}
            {notice.lines && (
                <ul className="ofi-login__notice-lines">
                    {notice.lines.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            )}
            {notice.link && (
                <a className="ofi-login__notice-link" href={notice.link.href} target="_blank" rel="noreferrer">
                    {notice.link.label}
                    <LuArrowRight size={14} aria-hidden="true" />
                    <span className="sr-only">{t('auth.openLink')}</span>
                </a>
            )}
        </li>
    );
};

export const LoginNotifications = () => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [seen, setSeen] = useState<Set<string>>(() => readSeen());
    const [teaser, setTeaser] = useState(false);

    const unread = useMemo(() => LOGIN_NOTICES.filter((n) => !seen.has(n.id)).length, [seen]);

    /** Öffnen = alles gelesen (Punkt an der Glocke verschwindet). */
    const openPanel = useCallback(() => {
        setOpen(true);
        setTeaser(false);
        setSeen((prev) => {
            if (LOGIN_NOTICES.every((n) => prev.has(n.id))) return prev;
            const next = new Set(prev);
            LOGIN_NOTICES.forEach((n) => next.add(n.id));
            writeSeen(next);
            return next;
        });
    }, []);

    // Erstes Herausgleiten: nur wenn beim Laden etwas Ungelesenes da ist,
    // und nur als schmaler Hinweis neben der Glocke (die volle Karte würde
    // das Formular verdecken). Klick auf den Hinweis öffnet die Karte.
    const hadUnreadOnMount = useRef(unread > 0);
    useEffect(() => {
        if (!hadUnreadOnMount.current) return;
        const show = window.setTimeout(() => setTeaser(true), AUTO_OPEN_DELAY_MS);
        const hide = window.setTimeout(() => setTeaser(false), AUTO_OPEN_DELAY_MS + TEASER_VISIBLE_MS);
        return () => {
            window.clearTimeout(show);
            window.clearTimeout(hide);
        };
    }, []);
    const newest = LOGIN_NOTICES.find((n) => !seen.has(n.id)) ?? LOGIN_NOTICES[0];

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open]);

    return (
        <div className={`ofi-login__notif${open ? ' is-open' : ''}`}>
            <button
                type="button"
                className="ofi-login__bell"
                onClick={() => (open ? setOpen(false) : openPanel())}
                aria-expanded={open}
                aria-controls="ofi-login-notif-panel"
                aria-label={t('auth.notifications')}
            >
                <LuBell size={18} />
                {unread > 0 && <span className="ofi-login__bell-dot" aria-hidden="true" />}
            </button>

            {newest && (
                <button
                    type="button"
                    className={`ofi-login__teaser${teaser && !open ? ' is-visible' : ''}`}
                    onClick={openPanel}
                    tabIndex={teaser && !open ? 0 : -1}
                    aria-hidden={!(teaser && !open)}
                >
                    <span className="ofi-login__teaser-date">{newest.date}</span>
                    <span className="ofi-login__teaser-title">{newest.title}</span>
                    <LuArrowRight size={14} aria-hidden="true" />
                </button>
            )}

            <section id="ofi-login-notif-panel" className="ofi-login__notif-panel" aria-hidden={!open} aria-label={t('auth.notifications')}>
                <header className="ofi-login__notif-head">
                    <h2>{t('auth.notifications')}</h2>
                    <button
                        type="button"
                        className="ofi-login__icon-btn"
                        onClick={() => setOpen(false)}
                        aria-label={t('common.close')}
                        tabIndex={open ? 0 : -1}
                    >
                        <LuX size={16} />
                    </button>
                </header>
                {LOGIN_NOTICES.length === 0 ? (
                    <p className="ofi-login__notif-empty">{t('auth.notificationsEmpty')}</p>
                ) : (
                    <ul className="ofi-login__notif-list">
                        {LOGIN_NOTICES.map((n) => (
                            <NoticeCard key={n.id} notice={n} />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
};
