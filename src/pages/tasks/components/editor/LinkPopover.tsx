import { useEffect, useState } from 'react';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import { TaskButton } from '../shared/TaskButton';
import { normalizeHref } from './blockModel';

/**
 * Kleines Fenster «Bağlantı ekle»: EIN Feld für die Adresse. Erlaubt sind nur
 * http(s) und mailto — «beispiel.ch» wird zu https://beispiel.ch, alles andere
 * (javascript: …) wird abgewiesen, bevor es den Text erreicht.
 */
export const LinkPopover = ({
    anchorEl,
    onClose,
    onApply,
}: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    onApply: (href: string) => void;
}) => {
    const [value, setValue] = useState('');
    const [invalid, setInvalid] = useState(false);

    useEffect(() => {
        if (!anchorEl) return;
        setValue('');
        setInvalid(false);
    }, [anchorEl]);

    const submit = () => {
        const href = normalizeHref(value);
        if (!href) {
            setInvalid(true);
            return;
        }
        onApply(href);
    };

    return (
        <AnchoredPicker anchorEl={anchorEl} onClose={onClose} width={320} maxHeight={200} panelClassName="ofi-gv-picker ofi-gv-editor-linkpop">
            <form
                className="ofi-gv-editor-linkpop__form"
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <label className="ofi-gv-editor-linkpop__label" htmlFor="ofi-gv-editor-link-input">{t('tasksModule.editor.linkAddress')}</label>
                <div className="ofi-gv-editor-linkpop__row">
                    <input
                        id="ofi-gv-editor-link-input"
                        autoFocus
                        value={value}
                        inputMode="url"
                        placeholder={t('tasksModule.editor.linkPlaceholder')}
                        className="ofi-cal-input w-full"
                        onChange={(event) => {
                            setValue(event.target.value);
                            setInvalid(false);
                        }}
                    />
                    <TaskButton type="submit" variant="primary" disabled={!value.trim()}>
                        {t('tasksModule.editor.linkApply')}
                    </TaskButton>
                </div>
                {invalid && <div className="ofi-gv-editor-linkpop__error">{t('tasksModule.editor.linkInvalid')}</div>}
            </form>
        </AnchoredPicker>
    );
};
