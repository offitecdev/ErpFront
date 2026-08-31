import { useEffect, useRef, useState } from 'react';

import { AlertTriangle, Settings01 as Settings, Trash01 } from '@/components/icons/antIconCompat';
import {
    PopupActions,
    PopupButton,
    PopupDialog,
    PopupField,
    PopupNote,
} from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';

/** Onay için birebir yazılması gereken sözcük — her dilde AYNI (kod gibi). */
const CONFIRM_WORD = 'DELETE';

/**
 * Proje başlığının yanındaki dişli — proje düzeyindeki tehlikeli işlemler
 * burada durur. Şimdilik tek madde: projeyi silme. Silme, yanlışlıkla
 * tıklamayla tetiklenemesin diye "DELETE" yazılarak onaylanır
 * (kullanıcı isteği).
 *
 * Menü ve onay penceresi, uygulamanın açılır pencere takımını (PopupKit,
 * 18.08.2026) kullanır: aynı yüzey, aynı yazı tipi, karanlık modda aynı
 * değişkenler.
 */
export const ProjectSettingsMenu = ({ deleting, onDeleteProject, initiallyOpen = false }: {
    deleting: boolean;
    onDeleteProject: () => Promise<void> | void;
    initiallyOpen?: boolean;
}) => {
    const [open, setOpen] = useState(initiallyOpen);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [typed, setTyped] = useState('');
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

    const armed = typed.trim() === CONFIRM_WORD;

    return (
        <div ref={menuRef} className="relative">
            <button
                type="button"
                aria-label={t('nav.settings')}
                title={t('nav.settings')}
                onClick={() => setOpen((value) => !value)}
                /* Dieselbe runde Form wie das Info-Symbol daneben (Kopf,
                   19.08.2026) — sonst springt der Knopf, sobald das Menü
                   nachgeladen wird und diese Fassung die Attrappe ablöst. */
                className={`ofi-prj-glyph ${open ? 'is-active' : ''}`}
            >
                <Settings size={16} />
            </button>

            {open && (
                <div role="menu" className="ofi-tp-menu absolute left-0 top-8 z-50 w-56">
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setOpen(false);
                            setTyped('');
                            setConfirmOpen(true);
                        }}
                        className="ofi-tp-menu__item is-danger"
                    >
                        <Trash01 size={14} /> {t('projects.deleteProject')}
                    </button>
                </div>
            )}

            <PopupDialog
                open={confirmOpen}
                title={t('projects.deleteProject')}
                subtitle={t('projects.deleteProjectConfirmText')}
                icon={<AlertTriangle size={20} />}
                tone="danger"
                width={460}
                onClose={() => { if (!deleting) setConfirmOpen(false); }}
                closeOnBackdrop={!deleting}
                closeOnEscape={!deleting}
                footer={(
                    <PopupActions>
                        <PopupButton disabled={deleting} onClick={() => setConfirmOpen(false)}>
                            {t('common.cancel')}
                        </PopupButton>
                        <PopupButton
                            variant="danger"
                            loading={deleting}
                            disabled={!armed}
                            onClick={() => void onDeleteProject()}
                        >
                            {t('common.delete')}
                        </PopupButton>
                    </PopupActions>
                )}
            >
                <PopupNote tone="danger">{t('projects.deleteProjectTypeDelete')}</PopupNote>
                <PopupField className="pt-3" label={CONFIRM_WORD} required>
                    <input
                        value={typed}
                        onChange={(event) => setTyped(event.target.value)}
                        placeholder={CONFIRM_WORD}
                        autoFocus
                        spellCheck={false}
                        autoCapitalize="characters"
                        className="ofi-cal-input ofi-tp-keyword w-full"
                    />
                </PopupField>
            </PopupDialog>
        </div>
    );
};
