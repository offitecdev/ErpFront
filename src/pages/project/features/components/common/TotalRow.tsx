import { memo } from 'react';

import { t } from '@/i18n/translate';
import { money } from '../../utils/projectFormatters';

// Rendered many times per cost/total panel with purely primitive props — memo keeps it
// from re-rendering when an unrelated part of the parent updates.
export const TotalRow = memo(({ label, value, total }: { label: string; value: number; total?: boolean }) => (
    <div className={`flex items-center justify-between ${total ?"border-t border-slate-200 pt-2 font-semibold text-slate-900" : 'text-slate-900'}`}>
        <span>{label}</span>
        <span className={`font-mono ${total ?t('auto.rounded_full_bg_yellow_100_px_3_py_0_5_text_slat') : ''}`}>{money(value)}</span>
    </div>
));
