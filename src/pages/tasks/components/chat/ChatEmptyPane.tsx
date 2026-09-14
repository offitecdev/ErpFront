import { LuMessagesSquare, LuPlus } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { TaskButton } from '../shared/TaskButton';

/** Rechte Spalte ohne gewählten Raum (breiter Schirm). */
export const ChatEmptyPane = ({
    hasRooms,
    loading,
    canCreate,
    onCreate,
}: {
    hasRooms: boolean;
    loading: boolean;
    canCreate: boolean;
    onCreate: () => void;
}) => (
    <section className="ofi-gv-chat__pane">
        {!loading && (
            <div className="ofi-gv-chat-notice">
                <div className="ofi-gv-empty">
                    <LuMessagesSquare size={28} className="ofi-gv-chat-notice__icon" aria-hidden />
                    <div className="ofi-gv-empty__title">
                        {hasRooms ? t('tasksModule.chat.empty.select') : t('tasksModule.chat.empty.noRooms')}
                    </div>
                    <div>{canCreate ? t('tasksModule.chat.empty.hintManager') : t('tasksModule.chat.empty.hintMember')}</div>
                    {canCreate && !hasRooms && (
                        <div className="mt-3">
                            <TaskButton icon={<LuPlus size={14} />} onClick={onCreate}>{t('tasksModule.chat.newRoom.action')}</TaskButton>
                        </div>
                    )}
                </div>
            </div>
        )}
    </section>
);
