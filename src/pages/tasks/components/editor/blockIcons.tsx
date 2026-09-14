import type { ReactNode } from 'react';
import {
    LuFile,
    LuHeading2,
    LuHeading3,
    LuImage,
    LuList,
    LuListChecks,
    LuListOrdered,
    LuMinus,
    LuQuote,
    LuTable,
    LuType,
} from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { BlockType } from '@/types/tasksModule';

const ICONS: Record<BlockType, (size: number) => ReactNode> = {
    p: (size) => <LuType size={size} />,
    h2: (size) => <LuHeading2 size={size} />,
    h3: (size) => <LuHeading3 size={size} />,
    bullet: (size) => <LuList size={size} />,
    number: (size) => <LuListOrdered size={size} />,
    quote: (size) => <LuQuote size={size} />,
    divider: (size) => <LuMinus size={size} />,
    table: (size) => <LuTable size={size} />,
    checklist: (size) => <LuListChecks size={size} />,
    image: (size) => <LuImage size={size} />,
    file: (size) => <LuFile size={size} />,
};

export const blockIcon = (type: BlockType, size = 15): ReactNode => ICONS[type](size);

/** Name des Blocktyps (Görevly BLOCKS[…].label). */
export const blockLabel = (type: BlockType): string => t(`tasksModule.editor.blocks.${type}`);
