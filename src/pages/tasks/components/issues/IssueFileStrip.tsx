import { LuX } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { formatBytes } from '../../utils/taskFormat';

/**
 * Die noch nicht abgeschickten Dateien einer Blase. Sie stehen ÜBER dem
 * Absenden, damit vor dem Klick sichtbar ist, was mitgeht — PDF und Bild
 * landen danach in derselben Sprechblase wie der Text.
 */
export const IssueFileStrip = ({
    files,
    onRemove,
}: {
    files: File[];
    onRemove: (index: number) => void;
}) => {
    if (!files.length) return null;
    return (
        <div className="ofi-gv-issue-pending">
            {files.map((file, index) => (
                <span key={`${file.name}-${index}`} className="ofi-gv-issue-pending__file" title={file.name}>
                    <span className="truncate">{file.name}</span>
                    <span className="ofi-gv-issue-pending__size">{formatBytes(file.size)}</span>
                    <button
                        type="button"
                        className="ofi-gv-issue-chip__x ofi-btn-plain"
                        aria-label={t('tasksModule.issues.removeFile', { name: file.name })}
                        onClick={() => onRemove(index)}
                    >
                        <LuX size={11} />
                    </button>
                </span>
            ))}
        </div>
    );
};
