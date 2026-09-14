import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { LuArrowRight, LuBookOpen, LuShieldCheck, LuUsers, LuX } from 'react-icons/lu';

import { useWhatsNewStore } from '@/components/updates/whatsNewStore';
import { t } from '@/i18n/translate';
import type { TaskOnboarding } from '@/types/tasksModule';

const dismissedKey = (onboarding: TaskOnboarding): string =>
    `offitec:tasks-onboarding-dismissed:${onboarding.version}:${onboarding.taskId}`;

export const TaskOnboardingWelcome = ({ onboarding }: { onboarding: TaskOnboarding | undefined }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [dismissedTaskId, setDismissedTaskId] = useState<string | null>(null);
    // Nie UNTER/über dem «Neu im OCC»-Blatt: erst wenn es zu ist, sonst wirkt das Schliessen wirkungslos.
    const updateSheetOpen = useWhatsNewStore((state) => state.open);
    const eligible = Boolean(onboarding
        && !onboarding.completed
        && !location.pathname.startsWith('/tasks/guide/')
        && location.pathname !== `/tasks/${onboarding.taskId}`);
    const dismissed = onboarding
        ? dismissedTaskId === onboarding.taskId || sessionStorage.getItem(dismissedKey(onboarding)) === '1'
        : true;

    if (!eligible || dismissed || updateSheetOpen || !onboarding) return null;
    const admin = onboarding.guide === 'admin';
    const guidePath = admin ? '/tasks/guide/admin' : '/tasks/guide/member';
    const close = () => {
        sessionStorage.setItem(dismissedKey(onboarding), '1');
        setDismissedTaskId(onboarding.taskId);
    };

    return createPortal(
        <div className="ofi-gv-onboard-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <section className="ofi-gv-onboard-welcome" role="dialog" aria-modal="true" aria-labelledby="task-onboarding-title">
                <button type="button" className="ofi-gv-onboard-close" onClick={close} aria-label={t('common.close')}>
                    <LuX size={18} />
                </button>
                <div className={`ofi-gv-onboard-mark ${admin ? 'is-admin' : ''}`} aria-hidden>
                    {admin ? <LuShieldCheck size={32} /> : <LuUsers size={32} />}
                </div>
                <div className="ofi-gv-onboard-eyebrow"><LuBookOpen size={14} />{t('tasksModule.onboarding.welcomeEyebrow')}</div>
                <h2 id="task-onboarding-title">{t('tasksModule.onboarding.welcomeTitle')}</h2>
                <p>{t('tasksModule.onboarding.welcomeText')}</p>
                <div className="ofi-gv-onboard-role">
                    {admin ? <LuShieldCheck size={18} /> : <LuUsers size={18} />}
                    <span>{t(`tasksModule.onboarding.${admin ? 'welcomeAdmin' : 'welcomeMember'}`)}</span>
                </div>
                <div className="ofi-gv-onboard-welcome__actions">
                    <button type="button" className="ofi-gv-onboard-later" onClick={close}>{t('tasksModule.onboarding.later')}</button>
                    <button type="button" className="ofi-gv-onboard-primary" onClick={() => navigate(guidePath)}>
                        {t('tasksModule.onboarding.start')}<LuArrowRight size={16} />
                    </button>
                </div>
            </section>
        </div>,
        document.body,
    );
};
