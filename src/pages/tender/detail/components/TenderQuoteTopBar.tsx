import {
    ClockRewind as History,
    Save01 as Save,
    User01 as User,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { TenderSettingsMenu } from './TenderSettingsMenu';

type TenderQuoteTopBarProps = {
    /** Opens the logs panel — the left area is the log-storage entry point. */
    onOpenLogs: () => void;
    /** Opens the "delete offer" confirmation, from the settings gear menu. */
    onDeleteOffer: () => void;
    canSave: boolean;
    saving: boolean;
    isDirty: boolean;
    onSave: () => void;
    creatorName: string;
};

/**
 * Bare horizontal line at the top of the quote detail — not a card. Its only
 * chrome is a bottom hairline that runs edge to edge; the icons sit directly on
 * that line: logs + Save on the left, the quote creator on the right.
 *
 * Pinned with `sticky`, scoped to the page's scroll container (MainLayout's
 * content column is the scrollport, not the window). Sticky keeps the Save and
 * logs actions reachable from the last row without scrolling back up, and —
 * unlike the viewport-`fixed` it replaces — it stays inside its own column: in
 * split view a fixed bar spanned the whole window and overlaid the second
 * screen, and in the pane iframe it hung 64px down over the content.
 *
 * The negative margins bleed the hairline through the scroll container's
 * horizontal padding so it still runs edge to edge; `#f6f8fb` matches the page
 * so it masks content scrolling underneath.
 */
export const TenderQuoteTopBar = ({
    onOpenLogs,
    onDeleteOffer,
    canSave,
    saving,
    isDirty,
    onSave,
    creatorName,
}: TenderQuoteTopBarProps) => (
    <div className="sticky top-0 z-30 mx-[calc(var(--page-gutter,1rem)*-1)] mb-1 flex items-center justify-between gap-3 border-b border-slate-200 bg-[#f6f8fb] px-[var(--page-gutter,1rem)] py-2">
        <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={onOpenLogs}
                title={t('tenders.loglar')}
                aria-label={t('tenders.loglar')}
                className="inline-flex items-center text-slate-500 transition-colors hover:text-[#1f2654]"
            >
                <History size={16} />
            </button>
            {canSave && (
                <button
                    type="button"
                    onClick={onSave}
                    disabled={!isDirty || saving}
                    title={t('common.save')}
                    aria-label={t('common.save')}
                    className={`inline-flex items-center rounded-md px-2.5 py-1 transition-colors ${
                        saving
                            ? 'cursor-wait bg-[#1f2654] text-white'
                            : isDirty
                                ? 'bg-[#1f2654] text-white hover:bg-[#171d40]'
                                : 'cursor-not-allowed bg-slate-100 text-slate-300'
                    }`}
                >
                    {saving ? (
                        // Spinning circle while the save round-trips (no count badge).
                        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                        <Save size={16} />
                    )}
                </button>
            )}
            <TenderSettingsMenu onDeleteOffer={onDeleteOffer} />
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-slate-600" title={creatorName}>
            <User size={14} className="text-slate-400" />
            <span className="max-w-[180px] truncate font-medium text-slate-700">{creatorName}</span>
        </div>
    </div>
);
