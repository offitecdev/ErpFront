import { memo } from 'react';

import { RichTextMarkdownEditor } from './RichTextMarkdownEditor';

export const InlineDescriptionEditor = memo(({
    positionId,
    value,
    minHeight,
    commit,
}: {
    positionId: string;
    value: string;
    minHeight: number;
    commit: (positionId: string, value: string) => void;
}) => (
    <RichTextMarkdownEditor
        value={value}
        onChange={(next) => commit(positionId, next)}
        commitOnBlur
        minHeight={minHeight}
        variant="inline"
        placeholder=""
        className="w-full"
    />
));
InlineDescriptionEditor.displayName = 'InlineDescriptionEditor';
