import { useState } from 'react';
import { LuChevronDown, LuFileText, LuPlus } from 'react-icons/lu';
import { Check } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import type { TenderListItem } from '@/types/tender';
import { fmtDate } from '../ui';
import '@/styles/modules/checklists.css';

/**
 * Die AUFKLAPPLISTE der Angebote eines Kunden (Vorgabe Samet, 02.09.2026):
 * «Bestehende Angebote sollen in einer wählbaren Aufklappliste stehen, nicht
 * als blosser Text» — und darüber der zweite Weg: «ein neues Angebot erstellen
 * und so hinzufügen».
 *
 * Das Feld zeigt die gewählten Nummern (oder «Kein Angebot»); geöffnet stehen
 * oben «Neues Angebot erstellen» und darunter die bestehenden Angebote zum
 * Ankreuzen. Mehrere sind erlaubt, keines auch — das Angebot ist seit dem
 * 02.09.2026 OPTIONAL: ohne Angebot hängt die Checkliste nur am Kunden.
 *
 * Geladen wird von der aufrufenden Zeile (`loaded`/`tenders`), damit die
 * Nummern auch dann bekannt sind, wenn die Liste nie aufgeklappt wurde
 * (Vorbelegung beim Ändern einer bestehenden Verknüpfung).
 */
export const OfferDropdown = ({
    disabled = false,
    tenders,
    loaded,
    selectedIds,
    labels,
    creating = false,
    onOpen,
    onToggle,
    onCreate,
}: {
    disabled?: boolean;
    tenders: TenderListItem[];
    loaded: boolean;
    selectedIds: string[];
    /** Nummern gewählter Angebote, die (noch) nicht in `tenders` stehen. */
    labels: Record<string, string>;
    creating?: boolean;
    /** Wird beim Aufklappen gerufen — die Zeile lädt dann ihre Angebote. */
    onOpen: () => void;
    onToggle: (tenderId: string) => void;
    onCreate: () => void;
}) => {
    const [open, setOpen] = useState(false);
    const [buttonEl, setButtonEl] = useState<HTMLButtonElement | null>(null);

    const chosen = selectedIds
        .map((id) => tenders.find((tender) => tender.id === id)?.tenderNumber || labels[id])
        .filter(Boolean) as string[];

    const openList = () => {
        if (disabled) return;
        onOpen();
        setOpen(true);
    };

    return (
        <>
            <button
                ref={setButtonEl}
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => (open ? setOpen(false) : openList())}
                className={`ofi-chk-select ${chosen.length ? 'has-value' : ''}`}
            >
                <LuFileText size={14} aria-hidden className="ofi-chk-select__icon" />
                <span className="ofi-chk-select__value">
                    {chosen.length ? chosen.join(', ') : t('forms.link.noOffer')}
                </span>
                {selectedIds.length > 1 && <span className="ofi-chk-count">{selectedIds.length}</span>}
                <LuChevronDown size={14} aria-hidden className={`ofi-chk-select__caret ${open ? 'is-open' : ''}`} />
            </button>

            <AnchoredPicker
                anchorEl={open && !disabled ? buttonEl : null}
                onClose={() => setOpen(false)}
                width={380}
                maxHeight={360}
                footer={(
                    <div className="ofi-chk-menu__foot">
                        <span className="ofi-chk-menu__hint">
                            {selectedIds.length ? t('forms.link.tenderCount', { count: selectedIds.length }) : t('forms.link.offerOptional')}
                        </span>
                        <button type="button" className="ofi-cal-btn is-primary" onPointerDown={(event) => { event.preventDefault(); setOpen(false); }}>
                            {t('common.done')}
                        </button>
                    </div>
                )}
            >
                <div role="listbox" aria-multiselectable="true" className="min-h-0 flex-1 overflow-y-auto py-1">
                    {/* Der zweite Weg: ein neues Angebot, sofort verknüpft. */}
                    <button
                        type="button"
                        disabled={creating}
                        className="ofi-option-action ofi-chk-menu__create"
                        onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); onCreate(); }}
                    >
                        <span className="ofi-chk-menu__ring"><LuPlus size={13} /></span>
                        <span className="min-w-0 flex-1">
                            <span className="ofi-chk-menu__title">{creating ? t('forms.link.creatingOffer') : t('forms.link.newOffer')}</span>
                            <span className="ofi-chk-menu__meta">{t('forms.link.newOfferHint')}</span>
                        </span>
                    </button>

                    <div className="ofi-chk-menu__caption">{t('forms.link.existingOffers')}</div>

                    {!loaded && <div className="ofi-chk-menu__empty">{t('common.loading')}</div>}
                    {loaded && tenders.length === 0 && <div className="ofi-chk-menu__empty">{t('forms.link.tenderEmpty')}</div>}
                    {loaded && tenders.map((tender) => {
                        const active = selectedIds.includes(tender.id);
                        const meta = [tender.salesOrder?.orderNumber, tender.commissionNumber, tender.customerReference].filter(Boolean).join(' · ');
                        return (
                            <button
                                key={tender.id}
                                type="button"
                                role="option"
                                aria-selected={active}
                                className="ofi-option-row ofi-chk-menu__row is-check"
                                onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); onToggle(tender.id); }}
                            >
                                <span className={`ofi-chk-check ${active ? 'is-on' : ''}`} aria-hidden>{active && <Check size={12} />}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="ofi-chk-menu__title">{tender.tenderNumber}</span>
                                    <span className="ofi-chk-menu__meta">{[meta, fmtDate(tender.createdAt)].filter(Boolean).join(' · ')}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </AnchoredPicker>
        </>
    );
};
