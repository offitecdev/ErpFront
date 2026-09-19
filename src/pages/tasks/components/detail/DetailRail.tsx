import type { TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useIsTasksManager } from '../../store/tasksModuleStore';
import { isOnboardingTaskId } from '../../utils/taskFormat';
import { RailChatCard } from './RailChatCard';
import { RailForecastCard } from './RailForecastCard';
import { RailInfoCard } from './RailInfoCard';
import { RailWorkCard } from './RailWorkCard';

/** Rechte Spalte der Detailseite; unter 1024px rutscht sie unter den Inhalt. */
export const DetailRail = ({ ctl, data }: { ctl: TaskDetailController; data: TaskDetailResult }) => {
    const isManager = useIsTasksManager();
    return (
        <aside className="ofi-gv-detail-rail">
            <RailInfoCard ctl={ctl} data={data} />
            {/* Teammitglieder bekommen vom Server nur ihre eigenen Messungen. */}
            {data.work && (
                <RailWorkCard
                    taskId={data.task.id}
                    work={data.work}
                    myStartedAt={data.task.timer.myStartedAt}
                    people={data.people}
                    serverNow={data.serverNow}
                />
            )}
            <RailForecastCard forecast={data.forecast} />
            <RailChatCard taskId={data.task.id} rooms={data.chatRooms} canCreate={isManager && !isOnboardingTaskId(data.task.id)} />
        </aside>
    );
};
