import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { t } from '@/i18n/translate';
import { FormFillView } from '@/pages/crm/forms/components/FormFillView';
import { MontageHeader } from './components/MontageHeader';
import '@/styles/modules/checklists.css';

/**
 * Checkliste / Formular auf dem Technikerbildschirm (/montage/forms/:id).
 * DERSELBE Editor wie im Büro (FormFillView) im Vollbild des Tablets — die
 * beim Angebot erfassten Masse, Fotos, Zeichnungen und Unterschriften stehen
 * hier, der Techniker füllt weiter aus oder schliesst ab. `?back=` führt zum
 * Termin zurück, von dem aus geöffnet wurde.
 *
 * Techniker füllen nur aus (Vorgabe 02.09.2026): weder löschen noch die
 * Verknüpfung ändern — das bleibt dem Büro.
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
            <div className="ofi-chk-page">
                <FormFillView submissionId={submissionId} variant="montage" allowDelete={false} canEditLinks={false} onDeleted={() => navigate(back)} />
            </div>
        </div>
    );
};

export default MontageFormPage;
