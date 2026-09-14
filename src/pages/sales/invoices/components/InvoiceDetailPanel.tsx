import { useState } from 'react';

import {
    Check,
    CheckCircle,
    Edit01,
    Eye,
    FileDownload02,
    Trash01,
    X,
} from '@/components/icons/antIconCompat';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import type { InvoiceDto } from '@/types/billing';

import {
    categoryLabel,
    categoryVariant,
    fmtDate,
    fmtMoney,
    invoiceCategory,
    invoiceRecipient,
    isoToday,
    statusLabel,
    statusVariant,
} from '../invoiceShared';
import '@/styles/modules/invoicePages.css';

/**
 * ── DAS RECHNUNGSBLATT ───────────────────────────────────────────────────────
 *
 * Vorgabe Samet (05.09.2026): „Zahlungsstatus und die übrigen Angaben gehören
 * NICHT in die Tabelle, sondern daneben — ruhig, Apple-artig; und eine Rechnung
 * als bezahlt zu markieren muss einfacher gehen und anders gelöst sein, damit
 * die Liste nicht zugestellt wird."
 *
 * Also: die Tabelle trägt nur noch, was man beim Suchen liest (Nummer, Typ,
 * Kunde, Beleg, Datum, Betrag). Alles andere — Status, Verkäufer, Fälligkeit,
 * Kommission, die Abschnitte des Belegs — steht hier, für die EINE angeklickte
 * Rechnung. Und das Bezahltmelden ist kein Häkchen mehr zwischen vier weiteren
 * Symbolen, sondern die grösste Fläche des Blattes: ein Knopf mit dem
 * Zahlungsdatum darunter.
 *
 * Ruhe heisst hier auch: eine Grösse, die trägt (der Betrag), eine Handlung,
 * die man sucht (bezahlt), und die selteneren Wege (Vorschau, PDF, stornieren,
 * löschen) klein und unten. Auf schmalen Geräten wird aus der Spalte ein Blatt
 * über der Liste — dafür sorgt die `.ofi-invd-*`-Lage, nicht eine zweite
 * Komponente.
 */
export const InvoiceDetailPanel = ({
    invoice,
    busy,
    onClose,
    onPreview,
    onDownload,
    onStatus,
    onDelete,
    onEdit,
}: {
    invoice: InvoiceDto;
    busy: boolean;
    onClose: () => void;
    onPreview: () => void;
    onDownload: () => void;
    /** Statuswechsel; `paidAt` gilt nur für PAID (Zahlungseingang). */
    onStatus: (next: 'ISSUED' | 'PAID' | 'CANCELLED', paidAt?: string | null) => void;
    onDelete: () => void;
    /** Nur die DIREKTRECHNUNG lässt sich noch einmal öffnen (Vorgabe 05.09.2026). */
    onEdit?: () => void;
}) => {
    /* Das Zahlungsdatum steht VOR dem Klick da und ist heute — der Regelfall
       ist „heute bezahlt", und wer ein anderes Datum braucht, sieht das Feld,
       ohne es suchen zu müssen.

       Beim Wechsel auf eine ANDERE Rechnung muss es zurückgesetzt werden,
       sonst trüge die nächste das Datum der vorigen. Das erledigt der
       `key={invoice.id}` der Liste: das Blatt wird neu aufgebaut statt in
       einem Effekt nachkorrigiert (ein `setState` im Effekt rendert denselben
       Zustand ein zweites Mal — die React-Compiler-Regel verbietet es zu
       Recht). Nach dem Bezahltmelden ist das Feld ohnehin weg: dort steht dann
       `invoice.paidAt` selbst. */
    const [paidAt, setPaidAt] = useState(() => invoice.paidAt?.slice(0, 10) || isoToday());

    const category = invoiceCategory(invoice);
    const paid = invoice.status === 'PAID';
    const cancelled = invoice.status === 'CANCELLED';

    const reference = invoice.project
        ? `${invoice.project.projectNumber || invoice.project.projectName}${invoice.salesOrder ? ` · ${invoice.salesOrder.orderNumber}` : ''}`
        : invoice.salesOrder?.orderNumber || '';

    const rows: Array<{ label: string; value: string }> = [
        { label: t('invoices.colCustomer'), value: invoiceRecipient(invoice) || '—' },
        { label: t('invoices.colReference'), value: reference || '—' },
        { label: t('billing.kindLabel'), value: t(`billing.kind_${invoice.kind}`) },
        { label: t('invoices.colSalesperson'), value: invoice.salespersonName || '—' },
        { label: t('billing.invoiceDate'), value: fmtDate(invoice.invoiceDate || invoice.createdAt) },
        { label: t('billing.dueDate'), value: fmtDate(invoice.dueDate) },
        { label: t('billing.commission'), value: invoice.commissionNumber || '—' },
    ];
    if (paid) rows.push({ label: t('invoices.paidOn'), value: fmtDate(invoice.paidAt) });

    return (
        <aside className="ofi-invd" aria-label={t('invoices.detailTitle')}>
            <header className="ofi-invd__head">
                <div className="ofi-invd__ident">
                    <span className="ofi-invd__number">{invoice.invoiceNumber}</span>
                    <StatusChip variant={categoryVariant(category)}>{categoryLabel(category)}</StatusChip>
                </div>
                <button
                    type="button"
                    className="ofi-invp-glyph"
                    title={t('invoices.detailClose')}
                    aria-label={t('invoices.detailClose')}
                    onClick={onClose}
                >
                    <X size={16} />
                </button>
            </header>

            {/* Der Betrag ist die Grösse des Blattes; darunter, klein, der
                Status als Wort — mehr sagt die Zahl selbst. */}
            <div className="ofi-invd__amount">
                <span className="ofi-invd__money">{fmtMoney(invoice.amount)}</span>
                <StatusChip variant={statusVariant(invoice.status)}>{statusLabel(invoice.status)}</StatusChip>
            </div>

            {/* ── DIE EINE HANDLUNG ───────────────────────────────────────
                Offen → ein grosser Knopf mit dem Zahlungsdatum darunter.
                Bezahlt → derselbe Platz bestätigt und bietet den Rückweg.
                Storniert → gar nichts; eine stornierte Rechnung wird nicht
                bezahlt, sie wird gelöscht (unten). */}
            {!cancelled && (
                <div className={`ofi-invd__pay ${paid ? 'is-paid' : ''}`}>
                    {paid ? (
                        <>
                            <div className="ofi-invd__paidmark">
                                <CheckCircle size={20} />
                                <span>{t('invoices.paidOnLong', { date: fmtDate(invoice.paidAt) })}</span>
                            </div>
                            <button
                                type="button"
                                className="ofi-invd__undo"
                                disabled={busy}
                                onClick={() => onStatus('ISSUED')}
                            >
                                {t('invoices.markOpen')}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="ofi-invd__paybtn"
                                disabled={busy}
                                onClick={() => onStatus('PAID', paidAt)}
                            >
                                <Check size={18} />
                                {t('billing.markPaid')}
                            </button>
                            <label className="ofi-invd__paydate">
                                <span>{t('invoices.paymentDate')}</span>
                                <input
                                    type="date"
                                    value={paidAt}
                                    onChange={(event) => setPaidAt(event.target.value)}
                                />
                            </label>
                        </>
                    )}
                </div>
            )}

            <dl className="ofi-invd__rows">
                {rows.map((row) => (
                    <div key={row.label} className="ofi-invd__row">
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                    </div>
                ))}
            </dl>

            {invoice.notes && (
                <p className="ofi-invd__note">{invoice.notes}</p>
            )}

            {/* Die selteneren Wege: klein, unten, in einer Reihe. */}
            <footer className="ofi-invd__foot">
                {/* Bearbeiten steht VORN: es ist der einzige Weg, der den Beleg
                    selbst noch ändert. Er gilt nur für die Direktrechnung und
                    nur, solange sie weder bezahlt noch storniert ist — der
                    Server besteht darauf. */}
                {onEdit && category === 'DIRECT' && !paid && !cancelled && (
                    <button type="button" className="ofi-invd__act" disabled={busy} onClick={onEdit}>
                        <Edit01 size={15} />
                        {t('common.edit')}
                    </button>
                )}
                <button type="button" className="ofi-invd__act" disabled={busy} onClick={onPreview}>
                    <Eye size={15} />
                    {t('billing.previewBtn')}
                </button>
                <button type="button" className="ofi-invd__act" disabled={busy} onClick={onDownload}>
                    <FileDownload02 size={15} />
                    {t('billing.downloadBtn')}
                </button>
                {!cancelled && (
                    <button
                        type="button"
                        className="ofi-invd__act is-danger"
                        disabled={busy}
                        onClick={() => onStatus('CANCELLED')}
                    >
                        <X size={15} />
                        {t('invoices.cancelInvoice')}
                    </button>
                )}
                {/* Endgültig löschen kann nur eine STORNIERTE Rechnung (der
                    Server besteht darauf): erst stornieren, dann entfernen —
                    die Nummernserie wird nie zurückgedreht. */}
                {cancelled && (
                    <button type="button" className="ofi-invd__act is-danger" disabled={busy} onClick={onDelete}>
                        <Trash01 size={15} />
                        {t('billing.deleteForever')}
                    </button>
                )}
            </footer>
        </aside>
    );
};
