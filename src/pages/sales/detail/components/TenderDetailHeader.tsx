import { useEffect, useRef, useState } from 'react';

import {
    Briefcase01 as BriefcaseBusiness,
    FileCheck02 as FileCheck2,
    FileDownload02 as FileDown,
    GitBranch01 as GitBranch,
    Save01 as Save,
    User01 as User,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { StatusChip } from '../../../../components/ui-shared/StatusBadge';
import type { TenderListItem } from '../../../../types/tender';
import { PlainButton as Button } from './common/PlainUi';
import { TenderSettingsMenu } from './TenderSettingsMenu';
import '@/styles/tenderHeader.css';

type StatusChipVariant = 'active' | 'approved' | 'passive' | 'info' | 'warning' | 'danger' | 'neutral' | 'order';

type TenderDetailHeaderProps = {
    tender: Pick<TenderListItem, 'id' | 'tenderNumber' | 'version'>;
    tenderStatusVariant: StatusChipVariant;
    tenderStatusLabel: React.ReactNode;
    isDraft: boolean;
    canManage: boolean;
    canExport: boolean;
    canApprove: boolean;
    projectId?: string | null;
    /** Bu tekliften doğmuş sipariş — varsa ana düğme "Zum Auftrag" olur. */
    salesOrderId?: string | null;
    projectCreateLoading: boolean;
    onCreateVersion: () => void;
    onExport: () => void;
    onCreateProject: () => void;
    /**
     * Var olan hedefi DOĞRUDAN açar: proje düzeyinde seçim yapılmışsa projeyi,
     * teslimat siparişiyse siparişi (kullanıcı isteği — soru yok).
     */
    onOpenOrder: () => void;
    /** İki seçenekli karar popup'ını açar (proje siparişi / teslimat siparişi). */
    onCreateOrder: () => void;
    onApprove: () => void;
    /** Copies the quote into a new one, from the settings gear menu. */
    onCopyOffer: () => void;
    /** Opens the "delete offer" confirmation, from the settings gear menu. */
    onDeleteOffer: () => void;
    /** Storno der Offerte setzen oder aufheben (Zahnradmenü, 06.09.2026). */
    onCancelOffer: () => void;
    /** Die Offerte ist storniert — sie bleibt als Beleg stehen. */
    cancelled?: boolean;
    canSave: boolean;
    saving: boolean;
    isDirty: boolean;
    onSave: () => void;
    creatorName: string;
};

/**
 * The quote's single header bar.
 *
 * The log / save / settings controls used to live in a separate strip stacked
 * above the title, which cost a whole row of vertical space and — because only
 * that strip was sticky — detached from the title the moment the page scrolled.
 * Everything now sits on one line inside one block, so the quote number, its
 * status, the log button and the primary actions stay together at every scroll
 * position.
 *
 * The bar is viewport-`fixed`, not `sticky`: sticky depended on the layout's
 * scroll chain (the content column being the real scrollport), and whenever the
 * body ended up scrolling instead the bar drifted with the page. Fixed pins it
 * unconditionally. MainLayout publishes `--app-shell-inset` (live sidebar
 * width; 0 below lg and in the split-pane shell) and `--app-header-height`
 * (the fixed app header; unset in the pane shell) so the bar sits flush
 * against the content column, level with the sidebar's search icon. In split
 * view pages run inside per-pane iframes, so `fixed` stays confined to its own
 * pane. `transition-[left]` keeps the left edge in step with the sidebar's
 * pin/collapse animation.
 *
 * Because the bar is out of flow, a spacer holds its place: measured bar
 * height, minus the scrollport's own top padding (`--page-pad-y`, already
 * above the content), plus the 12px gap the old `mb-3` provided. The bar can
 * wrap to two rows at narrow pane widths, hence the ResizeObserver instead of
 * a hard-coded height.
 *
 * The translucent surface is scoped to the quote page's appearance tokens.
 */
export const TenderDetailHeader = ({
    tender,
    tenderStatusVariant,
    tenderStatusLabel,
    isDraft,
    canManage,
    canExport,
    canApprove,
    projectId,
    salesOrderId,
    projectCreateLoading,
    onCreateVersion,
    onExport,
    onCreateProject,
    onOpenOrder,
    onCreateOrder,
    onApprove,
    onCopyOffer,
    onDeleteOffer,
    onCancelOffer,
    cancelled = false,
    canSave,
    saving,
    isDirty,
    onSave,
    creatorName,
}: TenderDetailHeaderProps) => {
    const barRef = useRef<HTMLDivElement>(null);
    // Seed the spacer close to the desktop/two-row toolbar height. The
    // observer also handles wrapping in split panes and translated labels.
    const [barHeight, setBarHeight] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth < 1100 ? 112 : 66);

    useEffect(() => {
        const bar = barRef.current;
        if (!bar) return;
        // `offsetHeight` here ran synchronously after React's DOM writes and
        // forced layout for the entire quote. ResizeObserver already carries
        // the calculated border-box size, so no geometry read is needed.
        const observer = new ResizeObserver(([entry]) => {
            const measured = entry.borderBoxSize[0]?.blockSize;
            // Legacy ResizeObserver only exposes the content box. Match the
            // toolbar's 14px vertical padding and single bottom hairline.
            const height = measured || entry.contentRect.height + 29;
            setBarHeight((current) => current === height ? current : height);
        });
        observer.observe(bar);
        return () => observer.disconnect();
    }, []);

    return (
        <>
        <div
            ref={barRef}
            className="ofi-quote-topbar fixed left-[var(--app-shell-inset,0px)] right-0 top-[var(--app-header-height,0px)] z-40 px-[var(--page-gutter,1rem)] transition-[left] duration-300 ease-in-out"
        >
        <div className="ofi-quote-topbar__inner">
            {/* Hier stand der Zurück-Pfeil vor der Angebotsnummer. Der
                Rückweg in die Angebotsliste sitzt jetzt im Blitz ganz vorn in
                der Kopfleiste (QuickBackButton) — samt der Nachfrage nach
                ungespeicherten Änderungen, die er dort ebenso durchläuft. */}
            {/* Quote identity — number, version, status. */}
            <div className="ofi-quote-topbar__identity">
                <h1 className="ofi-quote-topbar__title" title={tender.tenderNumber}>
                    {tender.tenderNumber}
                </h1>
                <span className="ofi-quote-topbar__version">v{tender.version}</span>
                <span className="ofi-quote-topbar__status" data-status={tenderStatusVariant}>
                    <StatusChip variant={tenderStatusVariant}>{tenderStatusLabel}</StatusChip>
                </span>
            </div>

            {/* Log storage / save / settings, on the same line as the quote. */}
            <div className="ofi-quote-topbar__editing">
                {canSave && (
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={!isDirty || saving}
                        title={t('common.save')}
                        aria-label={t('common.save')}
                        aria-busy={saving}
                        className={`ofi-quote-btn ofi-quote-topbar__save flex items-center gap-1.5 rounded-full font-medium transition-colors ${saving ? 'is-saving cursor-wait' : isDirty ? 'is-dirty' : ''}`}
                    >
                        {saving ? (
                            <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        ) : (
                            <Save size={13} />
                        )}
                        {t('common.save')}
                    </button>
                )}
                {/* Sipariş türü sorusu artık ANA düğmenin popup'ında sorulur —
                    ayarlar menüsünde saklanmaz (kullanıcı isteği). */}
                <TenderSettingsMenu
                    onCopyOffer={onCopyOffer}
                    onDeleteOffer={onDeleteOffer}
                    onCancelOffer={onCancelOffer}
                    cancelled={cancelled}
                    /* Auftrag oder Projekt an der Offerte = kein Loeschen mehr,
                       nur noch Storno (Vorgabe Samet 06.09.2026). */
                    linked={Boolean(salesOrderId || projectId)}
                    tenderId={tender.id}
                    tenderNumber={tender.tenderNumber}
                />
            </div>

            {/* Primary actions, right-aligned on the same line. */}
            <div className="ofi-quote-topbar__actions">
                {/* "Neue Version" steht auf JEDER Offerte im Verkauf
                    (Benutzerwunsch 31.08.2026). Vorher war der Knopf an
                    Entwuerfen und an Auftraegen ohne Projekt versteckt, sodass
                    genau die Faelle, in denen man nachbessert, keinen Weg zu
                    einer neuen Version hatten. */}
                {canManage && (
                    <Button size="sm" variant="secondary" icon={<GitBranch size={14} />} onClick={onCreateVersion}>
                        {t('tenders.new_versiyon')}
                    </Button>
                )}
                {canExport && (
                    <Button size="sm" variant="secondary" icon={<FileDown size={14} />} onClick={onExport}>
                        {t('tenders.pdf_export')}
                    </Button>
                )}
                {!isDraft && canManage && (
                    /* Sipariş/proje zaten varsa düğme hedefi DOĞRUDAN açar:
                       proje düzeyinde seçim → "Zum Projekt", teslimat siparişi
                       → "Zum Auftrag" (kullanıcı isteği). Henüz yoksa iki
                       seçenekli karar popup'ı açılır. */
                    <Button
                        size="sm"
                       
                        variant="primary"
                        icon={<BriefcaseBusiness size={14} />}
                        loading={projectCreateLoading}
                        onClick={salesOrderId ? onOpenOrder : projectId ? onCreateProject : onCreateOrder}
                    >
                        {salesOrderId || projectId
                            ? (projectId ? t('tenders.project_go_to') : t('tenders.siparise_git'))
                            : t('tenders.order_create')}
                    </Button>
                )}
                {isDraft && canApprove && (
                    <Button size="sm" variant="primary" icon={<FileCheck2 size={14} />} onClick={onApprove}>
                        {t('common.confirm')}
                    </Button>
                )}
                <span
                    className="ofi-quote-topbar__creator"
                    title={creatorName}
                >
                    <User size={14} aria-hidden="true" />
                    <span>{creatorName}</span>
                </span>
            </div>
        </div>
        </div>
        <div aria-hidden style={{ height: `calc(${barHeight}px - var(--page-pad-y, 1.25rem) + 0.75rem)` }} />
        </>
    );
};
