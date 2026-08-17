import { useEffect, useRef, useState } from 'react';
import {
    Settings01 as Settings,
    Trash01 as Trash2,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

type TenderSettingsMenuProps = {
    /** Opens the destructive "delete offer" confirmation popup. */
    onDeleteOffer: () => void;
};

/**
 * Settings gear on the quote top bar. Clicking it opens a small dropdown menu
 * anchored to the button — same interaction as the header profile menu (avatar →
 * "My Profile / Settings / Log Out"). For now the menu holds a single option,
 * "Delete offer"; more offer-level actions can be added as sibling rows.
 */
export const TenderSettingsMenu: React.FC<TenderSettingsMenuProps> = ({ onDeleteOffer }) => {
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
                className={`inline-flex h-10 w-10 items-center justify-center rounded-[3px] border border-transparent transition-colors ${
                    open
                        ? 'bg-[#272f67]/15 text-[#1f2654]'
                        : 'text-slate-500 hover:bg-[#272f67]/15 hover:text-[#1f2654]'
                }`}
            >
                <Settings size={16} />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute left-0 top-11 z-50 w-56 rounded-[2px] bg-primary p-1.5 shadow-lg ring-1 ring-secondary_alt animate-in fade-in slide-in-from-top-2"
                >
                    <div className="border-b border-secondary px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                            {t('tenders.tender_settings')}
                        </p>
                    </div>
                    {/* Sipariş türü sorusu ARTIK BURADA DEĞİL: Onayla / Auftrag
                        erstellen düğmesi iki seçenekli popup'ı kendisi açar
                        (kullanıcı isteği). */}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setOpen(false);
                            onDeleteOffer();
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-[2px] px-3 py-2 text-sm font-medium text-error-primary transition-colors hover:bg-error-primary"
                    >
                        <Trash2 size={13} /> {t('tenders.delete_offer')}
                    </button>
                </div>
            )}
        </div>
    );
};
