import clsx from 'clsx';

import { t } from '@/i18n/translate';

import type { MontageStatusKey } from '../types/montage';
import { MONTAGE_STATUS_LABEL_KEY } from '../utils/montageStatus';

const TONES: Record<MontageStatusKey, string> = {
    pending: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
    startingSoon: 'bg-rose-50 text-[#d30f15] dark:bg-amber-500/15 dark:text-amber-300',
    inProgress: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    awaitingSignature: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    completed: 'bg-emerald-600 text-white dark:bg-emerald-500/25 dark:text-emerald-200',
};

/** Large, readable status label for the orders tables. */
export const StatusPill = ({ status, className }: { status: MontageStatusKey; className?: string }) => (
    <span className={clsx('inline-flex items-center rounded-full px-3.5 py-1.5 text-[13.5px] font-bold', TONES[status], className)}>
        {t(MONTAGE_STATUS_LABEL_KEY[status])}
    </span>
);
