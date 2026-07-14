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
 * Pinned with CSS `fixed` (not `sticky`) on purpose. The app shell scrolls the
 * window/body, not the content container, so a `sticky` bar would scroll away
 * with the page — the Save action must stay reachable from the last row without
 * scrolling back up. Fixed keeps it glued below the header as the page moves.
 *
 * `lg:left-[var(--app-shell-inset,72px)]` tracks the live sidebar width that
 * MainLayout publishes (72px collapsed, 256px pinned open) so the bar's left
 * edge always lines up with the content column. Hardcoding 72px hid the Save
 * and Logs buttons behind the pinned-open sidebar (which is z-40, above this
 * bar's z-30); the 72px fallback keeps the bar sane if the var is ever absent.
 * The `#f8fafd` background matches the page so it reads as a line while masking
 * content scrolling underneath.
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
    <div className="fixed left-0 right-0 top-16 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-[#f8fafd] px-4 py-2 transition-[left] duration-200 sm:px-6 lg:left-[var(--app-shell-inset,72px)] lg:px-8">
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
