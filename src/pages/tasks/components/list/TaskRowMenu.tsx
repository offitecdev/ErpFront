import type { ReactNode } from 'react';
import { LuCheck, LuCopy, LuExternalLink, LuFlag, LuFlagOff, LuPause, LuPencil, LuPlay, LuSend, LuTrash2 } from 'react-icons/lu';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import type { ManualTaskStatus, TaskRow } from '@/types/tasksModule';
import { useIsTasksAdmin, useIsTasksManager, useTasksActorId, useTasksModuleStore } from '../../store/tasksModuleStore';
import { MANUAL_STATUSES, statusLabel } from '../../utils/taskFormat';
import { canRequestRowCompletion, rowRights } from './taskListRules';

/**
 * Das ⋯-Menü einer Zeile (Görevly `V.taskMenu`) als Mac-Menü am Knopf. Was
 * erscheint, folgt den Rechten der Zeile: «Durum», «Kopyala» nur für die
 * Leitung, «Sil» nur mit Löschrecht. Ein Klick schliesst das Menü ZUERST —
 * Fenster, die danach aufgehen (Grund, Löschen), stehen nie unter ihm.
 */

export interface TaskRowMenuActions {
    open: (row: TaskRow) => void;
    edit: (row: TaskRow) => void;
    toggleTimer: (row: TaskRow) => void;
    requestCompletion: (row: TaskRow) => void;
    toggleFlag: (row: TaskRow) => void;
    setStatus: (row: TaskRow, status: ManualTaskStatus) => void;
    duplicate: (row: TaskRow) => void;
    remove: (row: TaskRow) => void;
    /** Nicht-Admins: Löschen beantragen. */
    requestDelete: (row: TaskRow) => void;
}

const MenuItem = ({
    icon,
    label,
    onSelect,
    danger = false,
    checked,
}: {
    icon?: ReactNode;
    label: string;
    onSelect: () => void;
    danger?: boolean;
    /** Gesetzt = Auswahlpunkt (Durum): Haken statt Symbol. */
    checked?: boolean;
}) => (
    <button
        type="button"
        role={checked === undefined ? 'menuitem' : 'menuitemradio'}
        aria-checked={checked}
        className={`ofi-option-row ofi-btn-plain ofi-gv-list-menu__item ${danger ? 'is-danger' : ''}`}
        onClick={onSelect}
    >
        {/* `<i>` statt `<span>`: die Hausregel dimmt auf der Füllung jedes zweite `span`. */}
        <i className="ofi-gv-list-menu__icon" aria-hidden>
            {checked === undefined ? icon : checked ? <LuCheck size={14} /> : null}
        </i>
        <span className="ofi-gv-list-menu__label">{label}</span>
    </button>
);

export const TaskRowMenu = ({
    row,
    anchorEl,
    onClose,
    actions,
}: {
    row: TaskRow | null;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    actions: TaskRowMenuActions;
}) => {
    const isManager = useIsTasksManager();
    const isAdmin = useIsTasksAdmin();
    const me = useTasksActorId();
    const canDelete = useTasksModuleStore((state) => Boolean(state.bootstrap?.actor.canDelete));

    if (!row || !anchorEl) return null;
    const rights = rowRights(row, me, isManager);
    const run = (action: (target: TaskRow) => void) => () => {
        onClose();
        action(row);
    };
    const canRequest = canRequestRowCompletion(row, rights, isManager, isAdmin);
    // Nicht-Admins, die beteiligt sind, beantragen das Löschen (einmal je Aufgabe).
    const involved = row.createdById === me || row.assigneeIds.includes(me);
    const canRequestDelete = !canDelete && involved && !row.deleteRequestedById;

    return (
        <AnchoredPicker anchorEl={anchorEl} onClose={onClose} width={230} maxHeight={440} panelClassName="ofi-gv-list-menu">
            <div role="menu" aria-label={row.title} className="ofi-gv-list-menu__list">
                <MenuItem icon={<LuExternalLink size={14} />} label={t('tasksModule.list.menu.open')} onSelect={run(actions.open)} />
                {rights.canEdit && (
                    <MenuItem icon={<LuPencil size={14} />} label={t('tasksModule.list.menu.edit')} onSelect={run(actions.edit)} />
                )}
                {rights.canTrack && (
                    <MenuItem
                        icon={row.timer.runningForMe ? <LuPause size={14} /> : <LuPlay size={14} />}
                        label={row.timer.runningForMe ? t('tasksModule.timer.pause') : t('tasksModule.timer.start')}
                        onSelect={run(actions.toggleTimer)}
                    />
                )}
                {canRequest && (
                    <MenuItem icon={<LuSend size={14} />} label={t('tasksModule.list.menu.requestCompletion')} onSelect={run(actions.requestCompletion)} />
                )}
                {canRequestDelete && (
                    <MenuItem icon={<LuTrash2 size={14} />} label={t('tasksModule.deleteRequest.action')} danger onSelect={run(actions.requestDelete)} />
                )}

                {rights.canFlag && (
                    <>
                        <div className="ofi-gv-list-menu__sep" role="separator" />
                        <MenuItem
                            icon={row.flagged ? <LuFlagOff size={14} /> : <LuFlag size={14} />}
                            label={row.flagged ? t('tasksModule.list.menu.unflag') : t('tasksModule.list.menu.flag')}
                            onSelect={run(actions.toggleFlag)}
                        />
                    </>
                )}

                {isManager && (
                    <>
                        <div className="ofi-gv-list-menu__sep" role="separator" />
                        <div className="ofi-gv-list-menu__caption">{t('tasksModule.list.menu.status')}</div>
                        {/* «Tamamlandı» setzt nur die Administratorrolle — alle anderen beantragen. */}
                        {MANUAL_STATUSES.filter((status) => isAdmin || status !== 'COMPLETED').map((status) => (
                            <MenuItem
                                key={status}
                                label={statusLabel(status)}
                                checked={row.status === status}
                                onSelect={run((target) => actions.setStatus(target, status))}
                            />
                        ))}
                        <div className="ofi-gv-list-menu__sep" role="separator" />
                        <MenuItem icon={<LuCopy size={14} />} label={t('tasksModule.list.menu.duplicate')} onSelect={run(actions.duplicate)} />
                        {/* Löschrecht (Stufe 3) gibt es nur zusammen mit der Leitung. */}
                        {canDelete && (
                            <MenuItem icon={<LuTrash2 size={14} />} label={t('common.delete')} danger onSelect={run(actions.remove)} />
                        )}
                    </>
                )}
            </div>
        </AnchoredPicker>
    );
};
