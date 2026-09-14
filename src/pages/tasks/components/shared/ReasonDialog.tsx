import { useEffect, useState, type ReactNode } from 'react';

import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';

/**
 * Ein Fenster mit EINEM Textfeld und einer Bestätigung — für alles, was einen
 * Satz braucht: Grund einer Ablehnung, «Yapılamadı», Notiz zur
 * Abschlussanfrage. `required` sperrt die Bestätigung, solange das Feld leer
 * ist (der Server verlangt den Grund ohnehin: NOTE_REQUIRED/REASON_REQUIRED).
 */
export const ReasonDialog = ({
    open,
    onClose,
    onConfirm,
    title,
    subtitle,
    label,
    confirmLabel,
    initialValue = '',
    required = false,
    danger = false,
    busy = false,
    note,
    maxLength = 2000,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: (value: string) => void;
    title: string;
    subtitle?: ReactNode;
    label: string;
    confirmLabel: string;
    initialValue?: string;
    required?: boolean;
    danger?: boolean;
    busy?: boolean;
    /** Neutraler Hinweis über dem Feld (z. B. «3 Punkte sind noch offen»). */
    note?: ReactNode;
    maxLength?: number;
}) => {
    const [value, setValue] = useState(initialValue);

    useEffect(() => { if (open) setValue(initialValue); }, [open, initialValue]);

    const trimmed = value.trim();
    const blocked = busy || (required && !trimmed);

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            width={440}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton
                        variant={danger ? 'danger' : 'primary'}
                        loading={busy}
                        disabled={blocked}
                        onClick={() => onConfirm(trimmed)}
                    >
                        {confirmLabel}
                    </PopupButton>
                </PopupActions>
            )}
        >
            {note && <PopupNote tone="warning" className="mb-3">{note}</PopupNote>}
            <PopupField label={label} required={required}>
                <textarea
                    autoFocus
                    rows={4}
                    value={value}
                    maxLength={maxLength}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !blocked) {
                            event.preventDefault();
                            onConfirm(trimmed);
                        }
                    }}
                    className="ofi-cal-input w-full resize-y py-2"
                    style={{ minHeight: 96 }}
                />
            </PopupField>
        </PopupDialog>
    );
};
