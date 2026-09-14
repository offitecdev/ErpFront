import type { MouseEvent, ReactNode } from 'react';
import {
    LuAlignCenter,
    LuAlignLeft,
    LuAlignRight,
    LuBold,
    LuItalic,
    LuLink,
    LuPlus,
    LuRemoveFormatting,
    LuUnderline,
} from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { TaskButton, TaskIconButton } from '../shared/TaskButton';
import type { SaveStatus } from './useContentSave';
import type { FormatState } from './useFormatState';

export type InlineCommand = 'bold' | 'italic' | 'underline' | 'removeFormat';
export type BlockAlign = 'left' | 'center' | 'right';

/** Die Auswahl im Text darf beim Klick auf die Leiste nicht verloren gehen. */
const keepSelection = (event: MouseEvent) => event.preventDefault();

const Separator = () => <span className="ofi-gv-editor-toolbar__sep" aria-hidden />;

const ToolButton = ({ label, active = false, disabled = false, onClick, children }: {
    label: string;
    active?: boolean;
    disabled?: boolean;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    children: ReactNode;
}) => (
    <TaskIconButton label={label} active={active} disabled={disabled} onMouseDown={keepSelection} onClick={onClick}>
        {children}
    </TaskIconButton>
);

/**
 * Werkzeugleiste über den Blöcken (Görevly `ed-toolbar`), klebt beim Scrollen
 * oben. Fett/Kursiv/Unterstrichen zeigen ihren Zustand an der Schreibmarke
 * (`is-on`), die Ausrichtung den des zuletzt bearbeiteten Blocks.
 */
export const EditorToolbar = ({
    format,
    align,
    alignEnabled,
    status,
    onInsert,
    onCommand,
    onLink,
    onAlign,
}: {
    format: FormatState;
    align: BlockAlign;
    alignEnabled: boolean;
    status: SaveStatus;
    onInsert: (anchor: HTMLElement) => void;
    onCommand: (command: InlineCommand) => void;
    onLink: (anchor: HTMLElement) => void;
    onAlign: (align: BlockAlign) => void;
}) => {
    const statusText = status === 'pending' || status === 'saving'
        ? t('tasksModule.editor.saving')
        : status === 'saved'
            ? t('tasksModule.editor.saved')
            : status === 'error'
                ? t('tasksModule.editor.saveFailed')
                : '';

    return (
        <div className="ofi-gv-editor-toolbar" role="toolbar" aria-label={t('tasksModule.editor.toolbar')}>
            <TaskButton icon={<LuPlus size={14} />} onMouseDown={keepSelection} onClick={(event) => onInsert(event.currentTarget)}>
                {t('tasksModule.editor.insert')}
            </TaskButton>
            <Separator />
            <ToolButton label={t('tasksModule.editor.bold')} active={format.bold} onClick={() => onCommand('bold')}>
                <LuBold size={15} />
            </ToolButton>
            <ToolButton label={t('tasksModule.editor.italic')} active={format.italic} onClick={() => onCommand('italic')}>
                <LuItalic size={15} />
            </ToolButton>
            <ToolButton label={t('tasksModule.editor.underline')} active={format.underline} onClick={() => onCommand('underline')}>
                <LuUnderline size={15} />
            </ToolButton>
            <ToolButton label={t('tasksModule.editor.link')} onClick={(event) => onLink(event.currentTarget)}>
                <LuLink size={15} />
            </ToolButton>
            <ToolButton label={t('tasksModule.editor.clearFormat')} onClick={() => onCommand('removeFormat')}>
                <LuRemoveFormatting size={15} />
            </ToolButton>
            <Separator />
            <ToolButton label={t('tasksModule.editor.alignLeft')} active={alignEnabled && align === 'left'} disabled={!alignEnabled} onClick={() => onAlign('left')}>
                <LuAlignLeft size={15} />
            </ToolButton>
            <ToolButton label={t('tasksModule.editor.alignCenter')} active={alignEnabled && align === 'center'} disabled={!alignEnabled} onClick={() => onAlign('center')}>
                <LuAlignCenter size={15} />
            </ToolButton>
            <ToolButton label={t('tasksModule.editor.alignRight')} active={alignEnabled && align === 'right'} disabled={!alignEnabled} onClick={() => onAlign('right')}>
                <LuAlignRight size={15} />
            </ToolButton>
            <span className="ofi-gv-editor-toolbar__spacer" />
            <span className="ofi-gv-caption ofi-gv-editor-toolbar__status" aria-live="polite">{statusText}</span>
        </div>
    );
};
