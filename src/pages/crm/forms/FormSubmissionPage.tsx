import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { FormFillView } from './components/FormFillView';
import { BTN_SECONDARY } from './ui';

/**
 * Ein Formular als eigene Seite (/crm/forms/:id) — für Deep-Links und
 * Benachrichtigungen; die Modulseite öffnet dasselbe im Untenfenster.
 */
export const FormSubmissionPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    if (!id) return null;
    return (
        <div className="flex w-full flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="ofi-serif text-[23px] font-semibold tracking-tight text-slate-900 dark:text-white">{t('forms.fill.title')}</h1>
                <button type="button" className={BTN_SECONDARY} onClick={() => navigate('/crm/forms')}>
                    <ArrowLeft size={14} />{t('forms.list.backToList')}
                </button>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-xs md:p-6 dark:border-white/10 dark:bg-transparent">
                <FormFillView submissionId={id} onDeleted={() => navigate('/crm/forms')} />
            </div>
        </div>
    );
};

export default FormSubmissionPage;
