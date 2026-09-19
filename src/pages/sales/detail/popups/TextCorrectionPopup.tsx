import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ChevronDown } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { tenderApi, type TenderTextCorrectionInput } from '@/lib/api/tender';
import type { PositionDto, TenderListItem } from '@/types/tender';

import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';

/**
 * ── TEXTKORREKTUR AN EINER GESPERRTEN OFFERTE (16.09.2026, B3) ───────────────
 *
 * Eine freigegebene oder beauftragte Offerte ist gesperrt — Menge und Preis
 * ändert nur eine neue Version (Offerte) oder ein Nachtrag (Auftrag). Ein
 * Tippfehler aber soll nicht einen ganzen Nachtrag kosten: hier berichtigt die
 * Leitung Bezeichnung, Beschreibung und Einheit der Positionen sowie Adressen,
 * Kommission und Referenz. Zahlen gibt es in diesem Fenster nicht. Der Grund
 * ist Pflicht; jede Änderung steht danach im Verlauf der Offerte.
 */

type RowDraft = { shortDescription: string; unit: string; longDescription: string };
const META_KEYS = ['billingAddress', 'installationAddress', 'deliveryAddress', 'commissionNumber', 'customerReference'] as const;
type MetaKey = (typeof META_KEYS)[number];
const MULTILINE: MetaKey[] = ['billingAddress', 'installationAddress', 'deliveryAddress'];

const META_LABEL: Record<MetaKey, () => string> = {
    billingAddress: () => t('tenders.correction.billingAddress'),
    installationAddress: () => t('tenders.correction.installationAddress'),
    deliveryAddress: () => t('tenders.correction.deliveryAddress'),
    commissionNumber: () => t('tenders.correction.commission'),
    customerReference: () => t('tenders.correction.reference'),
};

export const TextCorrectionPopup = ({
    open,
    tender,
    positions,
    onClose,
    onSaved,
}: {
    open: boolean;
    tender: TenderListItem;
    positions: PositionDto[];
    onClose: () => void;
    onSaved: () => void | Promise<void>;
}) => {
    const initialRows = useMemo(() => Object.fromEntries(positions.map((row) => [row.id, {
        shortDescription: row.shortDescription || '',
        unit: row.unit || '',
        longDescription: row.longDescription || '',
    }])) as Record<string, RowDraft>, [positions]);
    const initialMeta = useMemo(() => Object.fromEntries(META_KEYS.map((key) => [
        key, String((tender as unknown as Record<string, unknown>)[key] ?? ''),
    ])) as Record<MetaKey, string>, [tender]);

    const [rows, setRows] = useState<Record<string, RowDraft>>(initialRows);
    const [meta, setMeta] = useState<Record<MetaKey, string>>(initialMeta);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    const changedRows = positions.filter((row) => {
        const draft = rows[row.id];
        const base = initialRows[row.id];
        return draft && base && (draft.shortDescription !== base.shortDescription
            || draft.unit !== base.unit
            || draft.longDescription !== base.longDescription);
    });
    const changedMeta = META_KEYS.filter((key) => meta[key] !== initialMeta[key]);
    const hasChanges = changedRows.length > 0 || changedMeta.length > 0;
    const titleMissing = changedRows.some((row) => !rows[row.id]?.shortDescription.trim());
    const canSave = hasChanges && reason.trim().length >= 5 && !titleMissing && !saving;

    const patchRow = (id: string, next: Partial<RowDraft>) =>
        setRows((current) => ({ ...current, [id]: { ...current[id], ...next } }));
    const toggle = (id: string) => setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const save = async () => {
        if (!canSave) return;
        const input: TenderTextCorrectionInput = {
            reason: reason.trim(),
            positions: changedRows.map((row) => {
                const draft = rows[row.id];
                const base = initialRows[row.id];
                return {
                    id: row.id,
                    ...(draft.shortDescription !== base.shortDescription ? { shortDescription: draft.shortDescription.trim() } : {}),
                    ...(draft.unit !== base.unit ? { unit: draft.unit.trim() || null } : {}),
                    ...(draft.longDescription !== base.longDescription ? { longDescription: draft.longDescription || null } : {}),
                };
            }),
            meta: Object.fromEntries(changedMeta.map((key) => [key, meta[key].trim() || null])),
        };
        setSaving(true);
        try {
            await tenderApi.correctTexts(tender.id, input);
            toast.success(t('tenders.correction.saved'));
            await onSaved();
            onClose();
        } catch (error) {
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(message || t('tenders.correction.failed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={() => { if (!saving) onClose(); }}
            title={t('tenders.correction.title')}
            subtitle={t('tenders.correction.subtitle', { number: tender.tenderNumber })}
            width={760}
            closeOnBackdrop={false}
            closeOnEscape={!saving}
            footer={(
                <PopupActions>
                    <PopupButton disabled={saving} onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={saving} disabled={!canSave} onClick={() => void save()}>
                        {t('tenders.correction.save')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <PopupNote>{t('tenders.correction.explain')}</PopupNote>

            <div className="mt-3 flex max-h-[42vh] flex-col gap-1.5 overflow-y-auto pr-1">
                {positions.map((row) => {
                    const draft = rows[row.id];
                    if (!draft) return null;
                    const isOpen = expanded.has(row.id);
                    return (
                        <div key={row.id} className="rounded-lg border border-[#eceef1] px-2.5 py-2 dark:border-white/10">
                            <div className="flex items-center gap-2">
                                <span className="w-12 shrink-0 font-mono text-[12px] text-slate-400 dark:text-white/50">{row.positionNumber}</span>
                                <input
                                    className="ofi-cal-input min-w-0 flex-1"
                                    aria-label={t('tenders.correction.title_field')}
                                    value={draft.shortDescription}
                                    onChange={(event) => patchRow(row.id, { shortDescription: event.target.value })}
                                />
                                <input
                                    className="ofi-cal-input w-[88px] shrink-0"
                                    aria-label={t('tenders.correction.unit')}
                                    placeholder={t('tenders.correction.unit')}
                                    value={draft.unit}
                                    onChange={(event) => patchRow(row.id, { unit: event.target.value })}
                                />
                                <button
                                    type="button"
                                    className="ofi-cal-btn shrink-0"
                                    aria-expanded={isOpen}
                                    title={t('tenders.correction.description')}
                                    aria-label={t('tenders.correction.description')}
                                    onClick={() => toggle(row.id)}
                                >
                                    <ChevronDown size={15} style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
                                </button>
                            </div>
                            {isOpen && (
                                <textarea
                                    className="ofi-cal-input mt-2 w-full"
                                    rows={4}
                                    aria-label={t('tenders.correction.description')}
                                    value={draft.longDescription}
                                    onChange={(event) => patchRow(row.id, { longDescription: event.target.value })}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {META_KEYS.map((key) => (
                    <PopupField key={key} label={META_LABEL[key]()}>
                        {MULTILINE.includes(key) ? (
                            <textarea
                                className="ofi-cal-input w-full"
                                rows={3}
                                value={meta[key]}
                                onChange={(event) => setMeta((current) => ({ ...current, [key]: event.target.value }))}
                            />
                        ) : (
                            <input
                                className="ofi-cal-input w-full"
                                value={meta[key]}
                                onChange={(event) => setMeta((current) => ({ ...current, [key]: event.target.value }))}
                            />
                        )}
                    </PopupField>
                ))}
            </div>

            <PopupField className="mt-4" label={t('tenders.correction.reason')} required>
                <textarea
                    className="ofi-cal-input w-full"
                    rows={2}
                    placeholder={t('tenders.correction.reasonPlaceholder')}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                />
            </PopupField>
            {titleMissing && <PopupNote tone="warning" className="mt-2">{t('tenders.correction.titleRequired')}</PopupNote>}
        </PopupDialog>
    );
};
