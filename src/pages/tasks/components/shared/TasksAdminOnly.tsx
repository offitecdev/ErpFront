import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { LoadingPanel } from '@/components/ui-shared/Loader';
import { useIsTasksAdmin, useTasksModuleStore } from '../../store/tasksModuleStore';

/**
 * Seiten nur für die Administratorrolle (13.09.2026, Samet: «Administrator'da
 * bütün menüler açık, diğer rollerde sadece Görevler ve Sohbet»): Canlı,
 * Onaylar, Kişiler, Raporlar. Wer sie über die Adresszeile öffnet, landet in
 * der Liste; der Server verweigert die Daten ohnehin (ADMIN_ONLY). Die Seite
 * selbst wird erst gebaut, wenn feststeht, dass die Person Admin ist — so geht
 * keine Anfrage los, die sicher abgelehnt würde.
 */
export const TasksAdminOnly = ({ children }: { children: ReactNode }) => {
    const ready = useTasksModuleStore((state) => Boolean(state.bootstrap));
    const ensure = useTasksModuleStore((state) => state.ensure);
    const isAdmin = useIsTasksAdmin();
    useEffect(() => { void ensure(); }, [ensure]);
    if (!ready) return <LoadingPanel />;
    if (!isAdmin) return <Navigate to="/tasks" replace />;
    return <>{children}</>;
};
