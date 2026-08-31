import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { t } from '@/i18n/translate';
import { FormFillView } from '@/pages/crm/forms/components/FormFillView';
import { MontageHeader } from './components/MontageHeader';

/**
 * Checkliste / Formular auf dem Technikerbildschirm (/montage/forms/:id).
 * DERSELBE Editor wie im Büro (FormFillView) im Vollbild des Tablets — die
 * beim Angebot erfassten Masse, Fotos, Zeichnungen und Unterschriften stehen
 * hier, der Techniker füllt weiter aus oder schliesst ab. `?back=` führt zum
 * Termin zurück, von dem aus geöffnet wurde.
 */
export const MontageFormPage = () => {
    const { submissionId } = useParams<{ submissionId: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const back = searchParams.get('back') || '/montage/orders/active';
    if (!submissionId) return null;
    return (
        <div className="space-y-4">
            <MontageHeader title={t('forms.fill.title')} backTo={back} />
            <div className="rounded-[3px] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#17191c]">
                <FormFillView submissionId={submissionId} variant="montage" allowDelete={false} onDeleted={() => navigate(back)} />
            </div>
        </div>
    );
};

export default MontageFormPage;
