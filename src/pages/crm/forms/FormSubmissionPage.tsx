import { useNavigate, useParams } from 'react-router-dom';
import { t } from '@/i18n/translate';
import { FormFillView } from './components/FormFillView';
import '@/styles/modules/checklists.css';

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
            {/* Kein Zurück-Knopf: den Weg in die Checklisten trägt der Blitz
                ganz vorn in der Kopfleiste (QuickBackButton). */}
            <h1 className="ofi-serif text-[23px] font-semibold tracking-tight text-slate-900 dark:text-white">{t('forms.fill.title')}</h1>
            <div className="ofi-chk-page">
                <FormFillView submissionId={id} onDeleted={() => navigate('/crm/forms')} />
            </div>
        </div>
    );
};

export default FormSubmissionPage;
