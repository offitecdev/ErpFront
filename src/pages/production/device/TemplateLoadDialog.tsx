import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, TriangleAlert } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { useBackDismiss } from '@/lib/backDismiss';
import { productionTaskErrorText, readTaskTemplates } from '@/lib/api/productionTasks';
import type { DeviceTaskPlan, TaskTemplateSummary } from '@/types/productionTasks';

import { formatPercent } from '../tasks/taskModel';

/**
 * ── ŞABLONDAN YÜKLE (26.09.2026, Vorgabe Samet) ─────────────────────────────
 *
 * «Üretimde görevlere eğer administrator isek görevleri yükleyebiliyoruz.»
 * Die Vorlagen der Firma zur Wahl — jede mit Aufgabenzahl und den Anteilen
 * der Bereiche. Eine Vorlage, deren Summen nicht aufgehen, steht ausgegraut
 * da (der Server nähme sie nicht). Liegen am Gerät schon Aufgaben, sagt das
 * Fenster, dass sie samt Personen ersetzt werden.
 */
export const TemplateLoadDialog = ({
    plan,
    onLoad,
    onClose,
}: {
    plan: DeviceTaskPlan | null;
    onLoad: (templateId: string, replace: boolean) => Promise<boolean>;
    onClose: () => void;
}) => {
    useBackDismiss(true, onClose);
    const [items, setItems] = useState<TaskTemplateSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [chosen, setChosen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => readTaskTemplates(
        (value) => {
            setItems(value);
            setError(null);
            // Die erste brauchbare Vorlage ist vorgewählt — bei einer einzigen ein Klick.
            setChosen((current) => current ?? value.find((item) => item.check.valid && item.id !== plan?.templateId)?.id
                ?? value.find((item) => item.check.valid)?.id ?? null);
        },
        (failure) => setError(productionTaskErrorText(failure, 'productionTasks.err.loadFailed')),
    ), [plan?.templateId]);

    const submit = async () => {
        if (!chosen || busy) return;
        setBusy(true);
        const ok = await onLoad(chosen, Boolean(plan));
        setBusy(false);
        if (ok) onClose();
    };

    return (
        <PopupDialog
            open
            onClose={() => { if (!busy) onClose(); }}
            title={plan ? t('productionTasks.device.replaceTitle') : t('productionTasks.device.loadTitle')}
            subtitle={plan
                ? t('productionTasks.device.replaceText', { name: plan.templateName })
                : t('productionTasks.device.loadText')}
            icon={plan ? <TriangleAlert size={18} /> : <ListChecks size={18} />}
            tone={plan ? 'warning' : 'neutral'}
            width={520}
            footer={(
                <PopupActions
                    start={(
                        <Link className="ofi-ptk-link" to="/production/task-templates" onClick={onClose}>
                            {t('productionTasks.device.manageTemplates')}
                        </Link>
                    )}
                >
                    <PopupButton onClick={onClose} disabled={busy}>{t('productionTasks.actions.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={busy} disabled={!chosen} onClick={() => void submit()}>
                        {plan ? t('productionTasks.device.replace') : t('productionTasks.device.load')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-ptk-pop ofi-ptk-loaddialog">
                {error && !items && (
                    <div className="ofi-ptk-note is-error">
                        <TriangleAlert aria-hidden />
                        <span>{error}</span>
                    </div>
                )}
                {!items && !error && (
                    <div className="ofi-ptk-state is-small" aria-busy="true"><span className="ofi-ptk-spinner" /></div>
                )}
                {items && !items.length && (
                    <div className="ofi-ptk-state is-small">
                        <ListChecks aria-hidden />
                        <b>{t('productionTasks.templates.empty')}</b>
                        <span>{t('productionTasks.device.noTemplatesHint')}</span>
                    </div>
                )}
                {items && items.length > 0 && (
                    <div className="ofi-ptk-choices" role="radiogroup" aria-label={t('productionTasks.device.loadTitle')}>
                        {items.map((item) => {
                            const usable = item.check.valid;
                            const selected = chosen === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    disabled={!usable || busy}
                                    className={`ofi-ptk-choice ofi-nosize ${selected ? 'is-selected' : ''}`}
                                    onClick={() => setChosen(item.id)}
                                    onDoubleClick={() => { if (usable) { setChosen(item.id); void onLoad(item.id, Boolean(plan)).then((ok) => { if (ok) onClose(); }); } }}
                                >
                                    <span className="ofi-ptk-choice__radio" aria-hidden />
                                    <span className="ofi-ptk-choice__text">
                                        <b>{item.name}</b>
                                        <small>
                                            {t('productionTasks.templates.taskCount', { count: item.taskCount })}
                                            <span className="ofi-ptk-dot" aria-hidden>·</span>
                                            {t('productionTasks.area.mechanical')} {formatPercent(item.areaShares.MECHANICAL)}
                                            <span className="ofi-ptk-dot" aria-hidden>·</span>
                                            {t('productionTasks.area.electrical')} {formatPercent(item.areaShares.ELECTRICAL)}
                                        </small>
                                    </span>
                                    {item.id === plan?.templateId && <span className="ofi-ptk-tag">{t('productionTasks.device.current')}</span>}
                                    {!usable && (
                                        <span className="ofi-ptk-choice__warn" title={t('productionTasks.check.incompleteHint')}>
                                            <TriangleAlert aria-hidden />
                                            {t('productionTasks.check.incomplete')}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </PopupDialog>
    );
};
