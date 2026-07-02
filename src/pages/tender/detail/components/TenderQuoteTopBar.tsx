import {
    ClockRewind as History,
    Save01 as Save,
    User01 as User,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

type TenderQuoteTopBarProps = {
    /** Opens the logs panel — the left area is the log-storage entry point. */
    onOpenLogs: () => void;
    /** Preview count (or a loading label) shown in the logs pill. */
    logCountLabel: string;
    canSave: boolean;
    saving: boolean;
    isDirty: boolean;
    pendingChangeCount: number;
    onSave: () => void;
    creatorName: string;
};

/**
 * Thin, icon-driven bar pinned to the top of the quote detail. It stays fixed
 * while the page scrolls (sticky), overlaying the content as a slim line:
 * logs + Save icons on the left, the quote creator on the right.
 */
export const TenderQuoteTopBar = ({
    onOpenLogs,
    logCountLabel,
    canSave,
    saving,
    isDirty,
    pendingChangeCount,
    onSave,
    creatorName,
}: TenderQuoteTopBarProps) => (
    <div className="sticky top-0 z-30 mb-4 flex w-full items-center justify-between gap-3 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur">
        <div className="flex items-center gap-1.5">
            <button
                type="button"
                onClick={onOpenLogs}
                title={t('tenders.loglar')}
                aria-label={t('tenders.loglar')}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654]"
            >
                <History size={15} />
                <span className="rounded-full bg-slate-100 px-1.5 text-[10.5px] font-semibold leading-[18px] text-slate-600">{logCountLabel}</span>
            </button>
            {canSave && (
                <button
                    type="button"
                    onClick={onSave}
                    disabled={!isDirty || saving}
                    title={`${t('common.save')}${isDirty ? ` (${pendingChangeCount})` : ''}`}
                    aria-label={t('common.save')}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors ${
                        isDirty && !saving
                            ? 'bg-[#1f2654] text-white hover:bg-[#171d40]'
                            : 'cursor-not-allowed bg-slate-100 text-slate-400'
                    }`}
                >
                    <Save size={15} className={saving ? 'animate-pulse' : undefined} />
                    {isDirty && (
                        <span className="min-w-[16px] rounded-full bg-white/25 px-1 text-center text-[10.5px] font-semibold leading-[16px]">{pendingChangeCount}</span>
                    )}
                </button>
            )}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-slate-600" title={creatorName}>
            <User size={14} className="text-slate-400" />
            <span className="max-w-[180px] truncate font-medium text-slate-700">{creatorName}</span>
        </div>
    </div>
);
