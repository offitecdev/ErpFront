import { useEffect, useState } from 'react';
import { LuCheck } from 'react-icons/lu';

import { PopupActions, PopupButton, PopupDialog, PopupField } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { LabelColor } from '@/types/tasksModule';
import { LABEL_COLORS, labelColorName } from '../../utils/taskFormat';

/**
 * Fenster für ein Etikett: Name und eine der sechs Farben. Dasselbe Fenster
 * legt an («Yeni etiket») und benennt um («Etiketi düzenle»).
 */

const NAME_MAX = 40;

export const LabelEditDialog = ({
    open,
    mode,
    initialName = '',
    initialColor = 'blue',
    busy,
    onClose,
    onSubmit,
}: {
    open: boolean;
    mode: 'create' | 'edit';
    initialName?: string;
    initialColor?: LabelColor;
    busy: boolean;
    onClose: () => void;
    onSubmit: (name: string, color: LabelColor) => void;
}) => {
    const [name, setName] = useState(initialName);
    const [color, setColor] = useState<LabelColor>(initialColor);

    useEffect(() => {
        if (!open) return;
        setName(initialName);
        setColor(initialColor);
    }, [open, initialName, initialColor]);

    const trimmed = name.trim();
    const submit = () => { if (trimmed && !busy) onSubmit(trimmed, color); };

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            width={400}
            title={mode === 'create' ? t('tasksModule.people.labels.createTitle') : t('tasksModule.people.labels.editTitle')}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={busy} disabled={!trimmed} onClick={submit}>
                        {mode === 'create' ? t('tasksModule.people.labels.create') : t('common.save')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <PopupField label={t('tasksModule.people.labels.name')} required>
                <input
                    autoFocus
                    value={name}
                    maxLength={NAME_MAX}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            submit();
                        }
                    }}
                    placeholder={t('tasksModule.people.labels.namePlaceholder')}
                    className="ofi-cal-input w-full"
                />
            </PopupField>
            <PopupField label={t('tasksModule.people.labels.color')} className="mt-3">
                <div className="ofi-gv-people-swatches" role="radiogroup" aria-label={t('tasksModule.people.labels.color')}>
                    {LABEL_COLORS.map((option) => {
                        const selected = option === color;
                        return (
                            <button
                                key={option}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                aria-label={labelColorName(option)}
                                title={labelColorName(option)}
                                onClick={() => setColor(option)}
                                className={`ofi-gv-people-swatch ofi-btn-plain is-${option} ${selected ? 'is-selected' : ''}`}
                            >
                                {selected && <LuCheck size={12} aria-hidden />}
                            </button>
                        );
                    })}
                </div>
            </PopupField>
        </PopupDialog>
    );
};
