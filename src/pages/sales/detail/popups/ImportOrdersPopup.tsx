import type { ChangeEvent } from 'react';

import { UploadCloud02 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { PopupActions, PopupButton, PopupField, PopupNote, TenderDialog } from './shell/TenderPopupShell';

type ImportOrdersPopupProps = {
    open: boolean;
    onClose: () => void;
    importing: boolean;
    /** Name of the picked file, once one was read. */
    fileName: string;
    /** True after a submit attempt without a file — shows the required note. */
    missing: boolean;
    onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onImport: () => void;
};

/**
 * "Import from Excel" on the quote list — the Odoo sales-order CSV. Centred
 * dialog: one file field, the picked name read back underneath.
 */
export const ImportOrdersPopup = ({ open, onClose, importing, fileName, missing, onFileChange, onImport }: ImportOrdersPopupProps) => (
    <TenderDialog
        open={open}
        onClose={onClose}
        title={t('tenders.import_from_excel')}
        subtitle={t('tenders.odoo_sales_order_csv_dosyasindaki_customer_uru')}
        icon={<UploadCloud02 size={19} />}
        width={520}
        footer={(
            <PopupActions>
                <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                <PopupButton variant="primary" loading={importing} onClick={onImport}>{t('tenders.import_from_excel')}</PopupButton>
            </PopupActions>
        )}
    >
        {missing && (
            <PopupNote tone="warning" className="mb-2">
                <b>{t('common.required')}</b> · {t('tenders.cannot_import_without_csv_file')}
            </PopupNote>
        )}
        <PopupField label={t('tenders.csv_file')} required hint={t('tenders.csv_uzantili_sales_order_dosyasini_select')}>
            <input
                type="file"
                accept=".csv,text/csv"
                onChange={onFileChange}
                className="ofi-tp-file"
            />
        </PopupField>
        {fileName && <PopupNote>{fileName}</PopupNote>}
    </TenderDialog>
);
