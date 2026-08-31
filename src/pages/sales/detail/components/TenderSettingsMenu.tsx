import { useEffect, useRef, useState } from 'react';
import {
    Copy01 as Copy,
    Settings01 as Settings,
    Trash01 as Trash2,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

type TenderSettingsMenuProps = {
    /** Copies the quote into a new one (own number, version 1, draft). */
    onCopyOffer: () => void;
    /** Opens the destructive "delete offer" confirmation popup. */
    onDeleteOffer: () => void;
};

/**
 * Settings gear on the quote top bar. Clicking it opens a small dropdown menu
 * anchored to the button — same interaction as the header profile menu (avatar →
 * "My Profile / Settings / Log Out"). The menu holds the offer-level actions
 * "Angebot kopieren" and "Angebot loeschen"; more can be added as sibling rows.
 * Kopieren steht UEBER dem Papierkorb (Benutzerwunsch 31.08.2026) — die
 * harmlose Aktion zuerst, die zerstoerende zuletzt.
 */
export const TenderSettingsMenu: React.FC<TenderSettingsMenuProps> = ({ onCopyOffer, onDeleteOffer }) => {
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
                        ? 'bg-slate-100 text-[#1f2654]'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-[#1f2654]'
                }`}
            >
                <Settings size={16} />
            </button>

            {open && (
                <div
                    role="menu"
                    className="ofi-tp-menu absolute left-0 top-11 z-50 w-56 py-1 animate-in fade-in slide-in-from-top-2"
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
                            onDeleteOffer();
                        }}
                        className="ofi-tp-menu__item is-danger"
                    >
                        <Trash2 size={14} /> {t('tenders.delete_offer')}
                    </button>
                </div>
            )}
        </div>
    );
};
