import { LuChartNoAxesCombined, LuCircleCheck, LuListPlus, LuRadioTower } from 'react-icons/lu';

import { TaskGuidePage, type TaskGuideStep } from './components/onboarding/TaskGuidePage';

const ADMIN_STEPS: TaskGuideStep[] = [
    { key: 'create', icon: LuListPlus },
    { key: 'follow', icon: LuRadioTower },
    { key: 'approve', icon: LuCircleCheck },
    { key: 'people', icon: LuChartNoAxesCombined },
];

export const AdminTaskGuidePage = () => <TaskGuidePage guide="admin" steps={ADMIN_STEPS} />;
