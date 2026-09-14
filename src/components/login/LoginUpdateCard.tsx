import { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import { OffitecMark } from '@/components/icons/OffitecMark';
import { LuListChecks, LuShoppingCart, LuX, LuZap, type LocalIconProps } from '@/components/icons/lucideLocal';
import { UPDATE_NOTES, type UpdateAccent } from '@/components/updates/updateNotes';

/**
 * ── DIE KLEINE UPDATE-KARTE AUF DER ANMELDESEITE (13.09.2026) ───────────────
 *
 * Vorgabe Samet: «13.09.2026 güncellemesi hem logine hem login sonrasına —
 * küçük ve büyük pop up, temiz macOS/Apple; önceki pop up'ı kaldır». Die
 * GROSSE Fassung ist das Blatt nach der Anmeldung (updates/UpdateWindow); das
 * hier ist die KLEINE: eine Mitteilungskarte unten rechts, wie macOS sie
 * einblendet — App-Kachel, Datum, Titel, die Neuerungen als zwei Zeilen, ein
 * Schliessen-Knopf. Sie verdeckt das Formular nicht und geht nach dem
 * Schliessen für diese Mitteilung nicht wieder auf.
 *
 * Inhalt aus `updateNotes.ts` (neueste Mitteilung) — dieselbe Quelle wie das
 * grosse Blatt. Ersetzt die frühere Glocke mit Mitteilungsliste.
 */

const STORAGE_KEY = 'offitec-login-update-dismissed';
const SHOW_DELAY_MS = 700;

const ICONS: Partial<Record<UpdateAccent, ComponentType<LocalIconProps>>> = {
    tasks: LuListChecks,
    orders: LuShoppingCart,
};

const readDismissed = (): string => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
};

export const LoginUpdateCard = () => {
    const { t } = useTranslation();
    const note = UPDATE_NOTES[0];
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!note || readDismissed() === note.id) return undefined;
        const id = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
        return () => window.clearTimeout(id);
    }, [note]);

    if (!note) return null;

    const dismiss = () => {
        setVisible(false);
        try { localStorage.setItem(STORAGE_KEY, note.id); } catch { /* nur Bequemlichkeit */ }
    };

    return (
        <aside
            className={`ofi-login-upd${visible ? ' is-visible' : ''}`}
            role="status"
            aria-hidden={!visible}
            aria-labelledby="ofi-login-upd-title"
        >
            <header className="ofi-login-upd__head">
                <span className="ofi-login-upd__app" aria-hidden="true"><OffitecMark size={20} /></span>
                <span className="ofi-login-upd__meta">
                    <span className="ofi-login-upd__eyebrow">{note.badge ?? t('updates.badgeNew')} · {note.date}</span>
                    <span id="ofi-login-upd-title" className="ofi-login-upd__title">{note.title}</span>
                </span>
                <button
                    type="button"
                    className="ofi-login-upd__close"
                    onClick={dismiss}
                    aria-label={t('common.close')}
                    tabIndex={visible ? 0 : -1}
                >
                    <LuX size={14} />
                </button>
            </header>
            <ul className="ofi-login-upd__list">
                {(note.highlights ?? []).map((item) => {
                    const Icon = ICONS[item.accent] ?? LuZap;
                    return (
                        <li key={item.title} className="ofi-login-upd__row">
                            <span className="ofi-login-upd__icon" aria-hidden="true"><Icon size={16} /></span>
                            <span className="ofi-login-upd__name">{item.title}</span>
                        </li>
                    );
                })}
            </ul>
            {note.intro && <p className="ofi-login-upd__intro">{note.intro}</p>}
        </aside>
    );
};
