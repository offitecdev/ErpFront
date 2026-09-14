import { LuCircleCheck, LuClock3, LuListChecks, LuPanelTopOpen } from 'react-icons/lu';

import { TaskGuidePage, type TaskGuideStep } from './components/onboarding/TaskGuidePage';

const MEMBER_STEPS: TaskGuideStep[] = [
    { key: 'open', icon: LuPanelTopOpen },
    { key: 'track', icon: LuClock3 },
    { key: 'work', icon: LuListChecks },
    { key: 'complete', icon: LuCircleCheck },
];

export const MemberTaskGuidePage = () => <TaskGuidePage guide="member" steps={MEMBER_STEPS} />;
