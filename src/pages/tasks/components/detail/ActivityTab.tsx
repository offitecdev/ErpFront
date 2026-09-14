import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SkeletonBar } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { PeopleMap, TaskActivity } from '@/types/tasksModule';
import { useNow } from '../../hooks/useNow';
import { personName, smartDate } from '../../utils/taskFormat';
import { activitySentence } from './activitySentence';

/**
 * Reiter «Geçmiş» — nur für die Leitung (die Seite zeigt ihn sonst nicht,
 * der Server verweigert ihn ohnehin). Neueste Einträge oben.
 */
export const ActivityTab = ({ taskId, people }: { taskId: string; people: PeopleMap }) => {
    const now = useNow(60_000);
    const [entries, setEntries] = useState<TaskActivity[] | null>(null);
    const [activityPeople, setActivityPeople] = useState<PeopleMap>({});

    useEffect(() => {
        let cancelled = false;
        setEntries(null);
        tasksApi.activity(taskId)
            .then((result) => {
                if (cancelled) return;
                setEntries([...result.data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
                setActivityPeople(result.people);
            })
            .catch((error) => {
                if (cancelled) return;
                setEntries([]);
                toast.error(tasksErrorMessage(error));
            });
        return () => { cancelled = true; };
    }, [taskId]);

    const allPeople = { ...people, ...activityPeople };

    return (
        <section className="ofi-gv-panel ofi-gv-activity">
            {entries === null && (
                <div className="ofi-gv-activity__loading">
                    <SkeletonBar width="70%" className="h-3" />
                    <SkeletonBar width="50%" className="h-3" delayMs={90} />
                    <SkeletonBar width="62%" className="h-3" delayMs={180} />
                </div>
            )}
            {entries !== null && !entries.length && <div className="ofi-gv-empty">{t('tasksModule.activity.empty')}</div>}
            {entries?.map((entry) => {
                const name = entry.actorId ? personName(allPeople, entry.actorId) : t('tasksModule.activity.system');
                return (
                    <div key={entry.id} className="ofi-gv-activity__row">
                        <div className="ofi-gv-activity__body">
                            <div className="ofi-gv-activity__text">
                                <b>{name}</b>
                                {' '}
                                {activitySentence(entry, allPeople)}
                            </div>
                            <div className="ofi-gv-caption">{smartDate(entry.createdAt, true, now)}</div>
                        </div>
                    </div>
                );
            })}
        </section>
    );
};
