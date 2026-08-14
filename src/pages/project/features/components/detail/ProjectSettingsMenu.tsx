import { useEffect, useRef, useState } from 'react';

import { Settings01 as Settings, Trash01 } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Modal } from '@/components/ui-shared/Modal';
import { inputClass } from '@/components/ui-shared/Field';
import { t } from '@/i18n/translate';

/** Onay için birebir yazılması gereken sözcük — her dilde AYNI (kod gibi). */
const CONFIRM_WORD = 'DELETE';

/**
 * Proje başlığının yanındaki dişli — proje düzeyindeki tehlikeli işlemler
 * burada durur. Şimdilik tek madde: projeyi silme. Silme, yanlışlıkla
 * tıklamayla tetiklenemesin diye "DELETE" yazılarak onaylanır
 * (kullanıcı isteği).
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
                className={`flex size-7 items-center justify-center rounded-md transition-colors ${
                    open ? 'bg-slate-100 text-[#272f67]' : 'text-slate-400 hover:bg-slate-100 hover:text-[#272f67]'
                }`}
            >
                <Settings size={16} />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute left-0 top-8 z-50 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setOpen(false);
                            setTyped('');
                            setConfirmOpen(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                        <Trash01 size={13} /> {t('projects.deleteProject')}
                    </button>
                </div>
            )}

            {confirmOpen && (
                <Modal
                    open
                    onClose={() => { if (!deleting) setConfirmOpen(false); }}
                    title={t('projects.deleteProject')}
                    width="sm"
                    footer={
                        <>
                            <Button variant="secondary" disabled={deleting} onClick={() => setConfirmOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button
                                variant="danger"
                                loading={deleting}
                                disabled={!armed}
                                onClick={() => void onDeleteProject()}
                            >
                                {t('common.delete')}
                            </Button>
                        </>
                    }
                >
                    <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-secondary">
                            {t('projects.deleteProjectConfirmText')}
                        </p>
                        <p className="text-[12.5px] font-semibold text-red-600">
                            {t('projects.deleteProjectTypeDelete')}
                        </p>
                        <input
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            placeholder={CONFIRM_WORD}
                            autoFocus
                            className={`${inputClass} h-10 w-full px-3 font-mono text-[14px] font-semibold tracking-widest`}
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
};
