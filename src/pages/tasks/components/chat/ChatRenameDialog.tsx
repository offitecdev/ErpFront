import { useEffect, useState } from 'react';

import { PopupActions, PopupButton, PopupDialog, PopupField } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';

const NAME_MAX = 80;

/** Raum umbenennen (Leitung): ein Feld, Enter speichert. */
export const ChatRenameDialog = ({
    open,
    name,
    busy,
    onClose,
    onSave,
}: {
    open: boolean;
    name: string;
    busy: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
}) => {
    const [value, setValue] = useState(name);

    useEffect(() => { if (open) setValue(name); }, [open, name]);

    const trimmed = value.trim();
    const blocked = busy || !trimmed || trimmed === name.trim();
    const save = () => { if (!blocked) onSave(trimmed); };

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={t('tasksModule.chat.rename.title')}
            width={420}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={busy} disabled={blocked} onClick={save}>
                        {t('common.save')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <PopupField label={t('tasksModule.chat.rename.label')} required>
                <input
                    autoFocus
                    value={value}
                    maxLength={NAME_MAX}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            save();
                        }
                    }}
                    className="ofi-cal-input w-full"
                />
            </PopupField>
        </PopupDialog>
    );
};
