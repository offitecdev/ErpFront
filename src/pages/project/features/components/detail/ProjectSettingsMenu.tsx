import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
    AlertTriangle,
    RefreshCcw01 as RefreshCw,
    Settings01 as Settings,
    Trash01,
    XClose,
} from '@/components/icons/antIconCompat';
import {
    PopupActions,
    PopupButton,
    PopupDialog,
    PopupField,
    PopupNote,
} from '@/components/ui-shared/PopupKit';
import { useGovernance } from '@/components/governance';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import { FullCancelDialog } from '@/components/orders/FullCancelDialog';
import '@/styles/modules/projectDetail.css';

/** Onay için birebir yazılması gereken sözcük — her dilde AYNI (kod gibi). */
const CONFIRM_WORD = 'DELETE';

/**
 * Proje başlığının yanındaki dişli — proje düzeyindeki tehlikeli işlemler
 * burada durur.
 *
 * ── LÖSCHEN, STORNO, ZURÜCK IN ENTWURF (Vorgabe Samet 06.09.2026) ────────────
 * Die drei Handlungen sind auseinandergezogen, und die wichtigste Regel steht
 * gleich im ersten Eintrag: ein AUFTRAG wird zurückgenommen, nicht das Projekt.
 * Der Eintrag «Auftrag zurücknehmen» fragt bei mehreren Aufträgen zuerst,
 * welcher gemeint ist (§5), und handelt dann an genau diesem.
 *
 *   · «Auftrag zurücknehmen» → Entwurf oder Storno, je nachdem, was schon
 *      geschehen ist. Mit dem LETZTEN aktiven Auftrag geht das Projekt mit.
 *   · «Projekt stornieren»   → nur, wenn kein aktiver Auftrag mehr darin steht;
 *      sonst weist der Server auf den Auftrag zurück.
 *   · «Projekt löschen»      → nur, wenn NICHTS mehr daran hängt, und mit
 *      "DELETE" bestätigt (kullanıcı isteği).
 *
 * Menü und Bestätigungsfenster benutzen das Popup-Set der Anwendung (PopupKit,
 * 18.08.2026): dieselbe Fläche, dieselbe Schrift, im Dunkelmodus dieselben
 * Variablen.
 */
export const ProjectSettingsMenu = ({
    projectId,
    projectCancelled,
    deleting,
    onDeleteProject,
    onOrderAction,
    onProjectChanged,
    initiallyOpen = false,
}: {
    projectId: string;
    projectCancelled: boolean;
    deleting: boolean;
    onDeleteProject: () => Promise<void> | void;
    onOrderAction?: () => void;
    onProjectChanged?: () => void | Promise<void>;
    initiallyOpen?: boolean;
}) => {
    const [open, setOpen] = useState(initiallyOpen);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [working, setWorking] = useState(false);
    const [typed, setTyped] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);
    // Stornieren = eigenes Recht, Storno aufheben = nur Systemverwaltung (16.09.2026).
    const { can, isSystemAdmin } = useGovernance();
    const cancelAllowed = projectCancelled ? isSystemAdmin : can('PROJECT_CANCEL');
    // «Gesamten Vorgang stornieren» (17.09.2026, Schritt 6).
    const [fullCancelOpen, setFullCancelOpen] = useState(false);

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

    const runProjectCancel = async () => {
        setWorking(true);
        try {
            if (projectCancelled) {
                await projectApi.uncancelProject(projectId);
                toast.success(t('projects.lifecycle.projectUncancelled'));
            } else {
                await projectApi.cancelProject(projectId, reason.trim() || null);
                toast.success(t('projects.lifecycle.projectCancelled'));
            }
            setCancelOpen(false);
            setReason('');
            await onProjectChanged?.();
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(message || t('projects.lifecycle.projectCancelFailed'));
        } finally {
            setWorking(false);
        }
    };

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
                <div role="menu" className="ofi-tp-menu absolute left-0 top-8 z-50 w-64">
                    {onOrderAction && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setOpen(false); onOrderAction(); }}
                            className="ofi-tp-menu__item"
                        >
                            <AlertTriangle size={14} /> {t('orders.lifecycle.buttonLabel')}
                        </button>
                    )}
                    {!projectCancelled && can('PROJECT_CANCEL') && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setOpen(false); setFullCancelOpen(true); }}
                            className="ofi-tp-menu__item is-danger"
                        >
                            <XClose size={14} /> {t('orders.fullCancel.menuLabel')}
                        </button>
                    )}
                    <button
                        type="button"
                        role="menuitem"
                        disabled={!cancelAllowed}
                        title={cancelAllowed ? undefined : (projectCancelled ? t('governance.uncancelAdminOnly') : t('governance.noPermissionCancel'))}
                        onClick={() => { setOpen(false); setReason(''); setCancelOpen(true); }}
                        className={`ofi-tp-menu__item ${projectCancelled ? '' : 'is-danger'} ${cancelAllowed ? '' : 'cursor-not-allowed opacity-45'}`}
                    >
                        {projectCancelled ? <RefreshCw size={14} /> : <XClose size={14} />}
                        {projectCancelled ? t('projects.lifecycle.uncancelProject') : t('projects.lifecycle.cancelProject')}
                    </button>
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

            {/* Projekt stornieren / Storno aufheben. */}
            <PopupDialog
                open={cancelOpen}
                title={projectCancelled ? t('projects.lifecycle.uncancelProject') : t('projects.lifecycle.cancelProject')}
                subtitle={projectCancelled
                    ? t('projects.lifecycle.uncancelProjectText')
                    : t('projects.lifecycle.cancelProjectText')}
                icon={projectCancelled ? <RefreshCw size={20} /> : <XClose size={20} />}
                tone={projectCancelled ? 'neutral' : 'danger'}
                width={460}
                onClose={() => { if (!working) setCancelOpen(false); }}
                closeOnBackdrop={!working}
                closeOnEscape={!working}
                footer={(
                    <PopupActions>
                        <PopupButton disabled={working} onClick={() => setCancelOpen(false)}>
                            {t('common.cancel')}
                        </PopupButton>
                        <PopupButton
                            variant={projectCancelled ? 'primary' : 'danger'}
                            loading={working}
                            onClick={() => void runProjectCancel()}
                        >
                            {projectCancelled ? t('orders.lifecycle.uncancelAction') : t('orders.lifecycle.cancelAction')}
                        </PopupButton>
                    </PopupActions>
                )}
            >
                {!projectCancelled && (
                    <>
                        <PopupNote tone="warning">{t('projects.lifecycle.cancelProjectHint')}</PopupNote>
                        <PopupField className="pt-3" label={t('orders.lifecycle.reasonLabel')} hint={t('common.optional')}>
                            <input
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                maxLength={500}
                                placeholder={t('orders.lifecycle.reasonPlaceholder')}
                                className="ofi-cal-input w-full"
                            />
                        </PopupField>
                    </>
                )}
            </PopupDialog>

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
            {fullCancelOpen && (
                <FullCancelDialog
                    scope="PROJECT"
                    id={projectId}
                    onClose={() => setFullCancelOpen(false)}
                    onDone={async () => {
                        setFullCancelOpen(false);
                        await onProjectChanged?.();
                    }}
                />
            )}
        </div>
    );
};
