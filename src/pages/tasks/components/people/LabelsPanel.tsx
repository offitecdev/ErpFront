import { useState } from 'react';
import { LuPlus } from 'react-icons/lu';

import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { SkeletonBar } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import type { LabelDto } from '@/types/tasksModule';
import { TaskButton } from '../shared/TaskButton';
import { LabelEditDialog } from './LabelEditDialog';
import { LabelMenu } from './LabelMenu';
import { useLabelsAdmin } from './useLabelsAdmin';

/**
 * Die Tafel «Etiketler» der Kişiler-Seite: alle Etiketten der Firma mit der
 * Zahl ihrer Aufgaben; ein Klick öffnet das Menü, «+ Etiket» das Fenster.
 */
export const LabelsPanel = ({ enabled }: { enabled: boolean }) => {
    const admin = useLabelsAdmin({ enabled });
    const [menu, setMenu] = useState<{ label: LabelDto; anchor: HTMLElement } | null>(null);
    const [editing, setEditing] = useState<{ mode: 'create' } | { mode: 'edit'; label: LabelDto } | null>(null);
    const [deleting, setDeleting] = useState<LabelDto | null>(null);

    const labels = admin.labels ?? [];

    return (
        <section className="ofi-gv-panel" aria-labelledby="ofi-gv-people-labels-title">
            <header className="ofi-gv-panel__head">
                <span id="ofi-gv-people-labels-title">{t('tasksModule.people.labels.title')}</span>
                {admin.loaded && <span className="ofi-gv-count">{labels.length}</span>}
                <span className="flex-1" />
                <TaskButton icon={<LuPlus size={14} />} onClick={() => setEditing({ mode: 'create' })}>
                    {t('tasksModule.people.labels.add')}
                </TaskButton>
            </header>
            <div className="ofi-gv-panel__body">
                {!admin.labels && <SkeletonBar width="40%" className="h-5" />}
                {admin.labels && labels.length === 0 && (
                    <div className="ofi-gv-caption">{t('tasksModule.people.labels.empty')}</div>
                )}
                {labels.length > 0 && (
                    <div className="ofi-gv-people-labels">
                        {labels.map((label) => (
                            <button
                                key={label.id}
                                type="button"
                                aria-haspopup="menu"
                                onClick={(event) => setMenu({ label, anchor: event.currentTarget })}
                                className={`ofi-gv-label is-${label.color} ofi-btn-plain ofi-gv-people-label`}
                                title={t('tasksModule.people.labels.usage', { count: label.usageCount ?? 0 })}
                            >
                                <i className="ofi-gv-label__dot" aria-hidden />
                                <span>{label.name}</span>
                                {typeof label.usageCount === 'number' && label.usageCount > 0 && (
                                    <span className="ofi-gv-people-label__count">{label.usageCount}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <LabelMenu
                label={menu?.label ?? null}
                anchorEl={menu?.anchor ?? null}
                onClose={() => setMenu(null)}
                onRename={(label) => setEditing({ mode: 'edit', label })}
                onColor={(label, color) => void admin.update(label.id, { color })}
                onDelete={(label) => setDeleting(label)}
            />

            <LabelEditDialog
                open={Boolean(editing)}
                mode={editing?.mode ?? 'create'}
                initialName={editing?.mode === 'edit' ? editing.label.name : ''}
                initialColor={editing?.mode === 'edit' ? editing.label.color : 'blue'}
                busy={admin.busy}
                onClose={() => setEditing(null)}
                onSubmit={async (name, color) => {
                    if (!editing) return;
                    if (editing.mode === 'create') {
                        if (await admin.create(name, color)) setEditing(null);
                        return;
                    }
                    const patch = {
                        ...(name !== editing.label.name ? { name } : {}),
                        ...(color !== editing.label.color ? { color } : {}),
                    };
                    // Nichts geändert → nichts zu senden.
                    if (!Object.keys(patch).length || await admin.update(editing.label.id, patch)) setEditing(null);
                }}
            />

            <DangerConfirmDialog
                open={Boolean(deleting)}
                title={t('tasksModule.people.labels.deleteTitle')}
                message={(
                    <>
                        <strong>{deleting?.name}</strong>
                        <br />
                        {t('tasksModule.people.labels.deleteMessage')}
                    </>
                )}
                confirmLabel={t('common.delete')}
                busy={admin.busy}
                requirePassword={false}
                onCancel={() => setDeleting(null)}
                onConfirm={async () => {
                    if (!deleting) return;
                    const ok = await admin.remove(deleting.id);
                    if (ok) setDeleting(null);
                }}
            />
        </section>
    );
};
