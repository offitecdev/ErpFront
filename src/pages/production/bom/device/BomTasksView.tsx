import { ListChecks } from 'lucide-react';

import { t } from '@/i18n/translate';

import { EmptyState } from '../bomUi';
import { NavBar } from '../NavStack';
import type { BomViewContext } from './DeviceBomArea';

/**
 * ── DIE AUFGABEN DER STUFE BOM — ALS ANSICHT (27.09.2026, Vorgabe Samet) ────
 *
 * «Görevler artık bir buton halinde bulunsun … BOM liste diyor ya, orada
 *  olabilir; ona tıklayınca orada görevlere, yine aynı yerde ileri geri olmak
 *  üzere, BOM listenin görevi açılmalı.» Statt der Glaskarte über der Fläche:
 * ein Knopf in der Leiste der BOM-Liste, dahinter diese Ansicht im selben
 * Stapel — ‹ zurück zur Liste, › wieder hierher.
 */
export const BomTasksView = ({ context }: { context: BomViewContext }) => {
    const { nav, tasks } = context;
    return (
        <>
            <NavBar
                nav={nav}
                backTitle={context.backTitle}
                title={t('productionBom.tasks.title')}
                subtitle={t('productionBom.tasks.subtitle', { count: tasks?.count ?? 0 })}
            />
            <div className="ofi-bom-body">
                {tasks ? (
                    <div className="ofi-ptk ofi-bom-tasks">{tasks.card}</div>
                ) : (
                    <EmptyState icon={<ListChecks />} title={t('productionBom.tasks.none')} />
                )}
            </div>
        </>
    );
};
