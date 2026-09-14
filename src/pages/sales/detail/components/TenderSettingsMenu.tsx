import { useEffect, useRef, useState } from 'react';
import {
    Copy01 as Copy,
    RefreshCcw01 as RefreshCw,
    Settings01 as Settings,
    Trash01 as Trash2,
    XClose,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

type TenderSettingsMenuProps = {
    /** Copies the quote into a new one (own number, version 1, draft). */
    onCopyOffer: () => void;
    /** Opens the destructive "delete offer" confirmation popup. */
    onDeleteOffer: () => void;
    /** Öffnet die Storno-Nachfrage — bzw. hebt das Storno auf. */
    onCancelOffer: () => void;
    /** Die Offerte ist bereits storniert: der Eintrag heisst dann «aufheben». */
    cancelled?: boolean;
    /**
     * An der Offerte hängt ein Auftrag oder ein Projekt: gelöscht wird sie dann
     * nicht mehr (Vorgabe Samet 06.09.2026). Der Eintrag bleibt sichtbar und
     * gesperrt — dass der Weg zu ist, ist die halbe Auskunft.
     */
    linked?: boolean;
};

/**
 * Settings gear on the quote top bar. Clicking it opens a small dropdown menu
 * anchored to the button — same interaction as the header profile menu (avatar →
 * "My Profile / Settings / Log Out").
 *
 * ── LÖSCHEN ODER STORNO (Vorgabe Samet 06.09.2026) ──────────────────────────
 * Die harmlose Handlung steht oben, die zerstörende unten (Benutzerwunsch
 * 31.08.2026). Dazwischen sitzt das STORNO: eine Offerte, aus der ein Auftrag
 * geworden ist, wird nicht mehr gelöscht — sie bleibt als Beleg stehen. Der
 * Papierkorb ist darum gesperrt, sobald etwas an ihr hängt, und sagt es auch.
 */
export const TenderSettingsMenu: React.FC<TenderSettingsMenuProps> = ({
    onCopyOffer,
    onDeleteOffer,
    onCancelOffer,
    cancelled = false,
    linked = false,
}) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const deleteBlocked = linked || cancelled;

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                title={t('tenders.tender_settings')}
                aria-label={t('tenders.tender_settings')}
                aria-haspopup="menu"
                aria-expanded={open}
                className={`ofi-quote-iconbtn inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent transition-colors ${
                    open
                        ? 'bg-slate-100 text-[#0066e0]'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-[#0066e0]'
                }`}
            >
                <Settings size={16} />
            </button>

            {open && (
                <div
                    role="menu"
                    className="ofi-tp-menu absolute left-0 top-11 z-50 w-64 py-1 animate-in fade-in slide-in-from-top-2"
                >
                    <div className="ofi-tp-menu__title">{t('tenders.tender_settings')}</div>
                    {/* Sipariş türü sorusu ARTIK BURADA DEĞİL: Onayla / Auftrag
                        erstellen düğmesi iki seçenekli popup'ı kendisi açar
                        (kullanıcı isteği). */}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setOpen(false);
                            onCopyOffer();
                        }}
                        className="ofi-tp-menu__item"
                    >
                        <Copy size={14} /> {t('tenders.copy_offer')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setOpen(false);
                            onCancelOffer();
                        }}
                        className={`ofi-tp-menu__item ${cancelled ? '' : 'is-danger'}`}
                    >
                        {cancelled ? <RefreshCw size={14} /> : <XClose size={14} />}
                        {cancelled ? t('tenders.lifecycle.uncancelOffer') : t('tenders.lifecycle.cancelOffer')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={deleteBlocked}
                        title={deleteBlocked ? t('tenders.lifecycle.deleteBlocked') : undefined}
                        onClick={() => {
                            setOpen(false);
                            onDeleteOffer();
                        }}
                        className={`ofi-tp-menu__item is-danger ${deleteBlocked ? 'cursor-not-allowed opacity-45' : ''}`}
                    >
                        <Trash2 size={14} /> {t('tenders.delete_offer')}
                    </button>
                    {deleteBlocked && (
                        <div className="px-3 pb-2 pt-1 text-[11.5px] leading-snug text-slate-500 dark:text-white/55">
                            {t('tenders.lifecycle.deleteBlocked')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
