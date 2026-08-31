import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Building03, Check, Mail01, Trash01, User01 } from '@/components/icons/antIconCompat';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { PopupActions, PopupButton, PopupCard } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import i18n from '@/i18n';
import { enquiriesApi, type EnquiryRow, type EnquiryStatus } from '@/lib/api/enquiries';
import { useStaffDirectory } from '../hooks/useStaffDirectory';

import { ENQUIRY_STATUSES, enquiryError, fullWhen, sourceLabel, statusDot, statusLabel } from './enquiryShared';

/**
 * ── EINE ANFRAGE LESEN UND BEARBEITEN ────────────────────────────────────────
 *
 * Ein FloatingCard (kein Vorhang): die Liste dahinter bleibt lesbar, das
 * Fenster lässt sich am Kopf zur Seite ziehen — dieselbe Form wie im Kalender
 * und im Angebot.
 *
 * DER AUFBAU FOLGT DER FRAGE, DIE MAN BEIM ÖFFNEN HAT:
 *   1. Wer ist das und wie erreiche ich ihn (Firma, Name, Mail, Telefon).
 *   2. Was will er (die Nachricht, wörtlich).
 *   3. Was mache ich damit (Stand, verantwortliche Person, interne Notiz).
 *
 * STAND UND VERANTWORTUNG SPEICHERN SOFORT. Das sind Ein-Klick-Entscheidungen;
 * ein «Speichern» dazwischen wäre ein zweiter Handgriff für nichts. Die Texte
 * (Kontaktdaten, Notiz) speichern dagegen erst auf Knopfdruck — sonst schriebe
 * jeder Tastendruck zum Server.
 *
 * «ZUM KUNDEN MACHEN» ist die eigentliche Handlung dieser Seite: aus der
 * Anfrage wird ein Kundendatensatz, die Anfrage bleibt als Beleg stehen und
 * verweist darauf.
 */

type Props = {
    /** Null = geschlossen. Die Zeile wird beim Öffnen frisch geholt. */
    id: string | null;
    onClose: () => void;
    onChanged: () => void;
    onDeleted: () => void;
};

export const EnquiryPopup = ({ id, onClose, onChanged, onDeleted }: Props) => {
    const navigate = useNavigate();
    const locale = i18n.resolvedLanguage || 'de';
    const { staff } = useStaffDirectory();

    const [row, setRow] = useState<EnquiryRow | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [converting, setConverting] = useState(false);
    const [askDelete, setAskDelete] = useState(false);

    /* Der bearbeitbare Teil. Er wird beim Laden gefüllt und ist danach die
       Wahrheit des Formulars — `row` bleibt der Stand des Servers, damit
       «Verworfen?» überhaupt beantwortbar ist. */
    const [draft, setDraft] = useState({
        companyName: '', contactName: '', email: '', phone: '',
        address: '', postalCode: '', city: '', country: '',
        internalNote: '',
    });

    const fillDraft = useCallback((value: EnquiryRow) => {
        setDraft({
            companyName: value.companyName || '',
            contactName: value.contactName || '',
            email: value.email || '',
            phone: value.phone || '',
            address: value.address || '',
            postalCode: value.postalCode || '',
            city: value.city || '',
            country: value.country || '',
            internalNote: value.internalNote || '',
        });
    }, []);

    useEffect(() => {
        if (!id) { setRow(null); return; }
        let cancelled = false;
        setLoading(true);
        enquiriesApi.get(id)
            .then((value) => {
                if (cancelled) return;
                setRow(value);
                fillDraft(value);
            })
            .catch(() => { if (!cancelled) toast.error(t('crm.enquiry.loadError')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id, fillDraft]);

    /* Ein Feld sofort schreiben (Stand, verantwortliche Person). Die Antwort
       ist die ganze Zeile — sie ersetzt den örtlichen Stand, damit abgeleitete
       Zeitpunkte (beantwortet am …) gleich richtig dastehen. */
    const patchNow = async (body: Parameters<typeof enquiriesApi.update>[1]) => {
        if (!row) return;
        try {
            const updated = await enquiriesApi.update(row.id, body);
            setRow(updated);
            onChanged();
        } catch (error) {
            toast.error(enquiryError(error, 'crm.enquiry.saveError'));
        }
    };

    const dirty = useMemo(() => {
        if (!row) return false;
        return draft.companyName !== (row.companyName || '')
            || draft.contactName !== (row.contactName || '')
            || draft.email !== (row.email || '')
            || draft.phone !== (row.phone || '')
            || draft.address !== (row.address || '')
            || draft.postalCode !== (row.postalCode || '')
            || draft.city !== (row.city || '')
            || draft.country !== (row.country || '')
            || draft.internalNote !== (row.internalNote || '');
    }, [draft, row]);

    const save = async () => {
        if (!row) return;
        setSaving(true);
        try {
            const updated = await enquiriesApi.update(row.id, {
                companyName: draft.companyName || null,
                contactName: draft.contactName || null,
                email: draft.email || null,
                phone: draft.phone || null,
                address: draft.address || null,
                postalCode: draft.postalCode || null,
                city: draft.city || null,
                country: draft.country || null,
                internalNote: draft.internalNote || null,
            });
            setRow(updated);
            fillDraft(updated);
            onChanged();
            toast.success(t('crm.enquiry.saved'));
        } catch (error) {
            toast.error(enquiryError(error, 'crm.enquiry.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const convert = async () => {
        if (!row) return;
        setConverting(true);
        try {
            const result = await enquiriesApi.convert(row.id);
            setRow(result.enquiry);
            onChanged();
            toast.success(t('crm.enquiry.convertedTo', { name: result.customer.companyName }));
            navigate(`/crm/customers/${result.customer.id}`);
        } catch (error) {
            toast.error(enquiryError(error, 'crm.enquiry.convertError'));
        } finally {
            setConverting(false);
        }
    };

    const remove = async () => {
        if (!row) return;
        try {
            await enquiriesApi.remove(row.id);
            setAskDelete(false);
            onDeleted();
        } catch (error) {
            toast.error(enquiryError(error, 'crm.enquiry.deleteError'));
        }
    };

    return (
        <>
            <PopupCard
                open={Boolean(id)}
                onClose={onClose}
                width={720}
                title={row?.subject || t('crm.enquiry.one')}
                subtitle={row ? (
                    <span className="ofi-crm-state" style={{ ['--dot' as string]: statusDot[row.status] }}>
                        {statusLabel(row.status)}
                        {' · '}
                        {sourceLabel(row.source)}
                        {' · '}
                        {fullWhen(row.createdAt, locale)}
                    </span>
                ) : undefined}
                footer={row ? (
                    <PopupActions
                        start={
                            <button type="button" className="ofi-crm-btn is-quiet is-danger" onClick={() => setAskDelete(true)}>
                                <Trash01 size={14} />
                                {t('common.delete')}
                            </button>
                        }
                    >
                        {/* Steht schon ein Kunde daran, ist die Umwandlung
                            erledigt — dann führt der Knopf zu ihm. */}
                        {row.customer ? (
                            <PopupButton icon={<Building03 size={15} />} onClick={() => navigate(`/crm/customers/${row.customer!.id}`)}>
                                {t('crm.enquiry.openCustomer')}
                            </PopupButton>
                        ) : (
                            <PopupButton icon={<Building03 size={15} />} loading={converting} onClick={() => void convert()}>
                                {t('crm.enquiry.convert')}
                            </PopupButton>
                        )}
                        <PopupButton variant="primary" icon={<Check size={15} />} loading={saving} disabled={!dirty} onClick={() => void save()}>
                            {t('common.save')}
                        </PopupButton>
                    </PopupActions>
                ) : undefined}
            >
                {loading && <InlineLoading label={t('common.loading')} />}

                {!loading && row && (
                    <>
                        {/* ── 1. Wer ist das ── */}
                        <div className="ofi-crm-sectiontitle">{t('crm.enquiry.sectionWho')}</div>
                        <div className="ofi-crm-fields is-two">
                            <label className="ofi-crm-field">
                                <span>{t('crm.enquiry.companyName')}</span>
                                <input
                                    className="ofi-crm-input"
                                    value={draft.companyName}
                                    onChange={(event) => setDraft((d) => ({ ...d, companyName: event.target.value }))}
                                />
                            </label>
                            <label className="ofi-crm-field">
                                <span>{t('crm.enquiry.contactName')}</span>
                                <input
                                    className="ofi-crm-input"
                                    value={draft.contactName}
                                    onChange={(event) => setDraft((d) => ({ ...d, contactName: event.target.value }))}
                                />
                            </label>
                            <label className="ofi-crm-field">
                                <span>{t('crm.enquiry.email')}</span>
                                <input
                                    type="email"
                                    className="ofi-crm-input"
                                    value={draft.email}
                                    onChange={(event) => setDraft((d) => ({ ...d, email: event.target.value }))}
                                />
                            </label>
                            <label className="ofi-crm-field">
                                <span>{t('crm.enquiry.phone')}</span>
                                <input
                                    className="ofi-crm-input"
                                    value={draft.phone}
                                    onChange={(event) => setDraft((d) => ({ ...d, phone: event.target.value }))}
                                />
                            </label>
                            <label className="ofi-crm-field">
                                <span>{t('address.street')}</span>
                                <input
                                    className="ofi-crm-input"
                                    value={draft.address}
                                    onChange={(event) => setDraft((d) => ({ ...d, address: event.target.value }))}
                                />
                            </label>
                            <div className="ofi-crm-fields is-two" style={{ gap: 8 }}>
                                <label className="ofi-crm-field">
                                    <span>{t('address.postalCode')}</span>
                                    <input
                                        className="ofi-crm-input"
                                        value={draft.postalCode}
                                        onChange={(event) => setDraft((d) => ({ ...d, postalCode: event.target.value }))}
                                    />
                                </label>
                                <label className="ofi-crm-field">
                                    <span>{t('address.city')}</span>
                                    <input
                                        className="ofi-crm-input"
                                        value={draft.city}
                                        onChange={(event) => setDraft((d) => ({ ...d, city: event.target.value }))}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Der Kunde dahinter ist die AUSNAHME — er steht darum
                            nur da, wenn es ihn gibt. */}
                        {row.customer && (
                            <p className="ofi-crm-row__sub" style={{ marginTop: 10 }}>
                                <Building03 size={13} />
                                <b>{row.customer.companyName}</b>
                                <span className="ofi-crm-row__dot">·</span>
                                {t('crm.enquiry.linkedCustomer')}
                            </p>
                        )}

                        {/* ── 2. Was will er ── */}
                        <div className="ofi-crm-sectiontitle">{t('crm.enquiry.sectionMessage')}</div>
                        <div className="ofi-crm-message">
                            {row.message || t('crm.enquiry.noMessage')}
                        </div>

                        {/* ── 3. Was mache ich damit ── */}
                        <div className="ofi-crm-sectiontitle">{t('crm.enquiry.sectionHandling')}</div>
                        <div className="ofi-crm-fields is-two">
                            <label className="ofi-crm-field">
                                <span>{t('crm.enquiry.statusLabel')}</span>
                                <select
                                    className="ofi-crm-input"
                                    value={row.status}
                                    onChange={(event) => void patchNow({ status: event.target.value as EnquiryStatus })}
                                >
                                    {ENQUIRY_STATUSES.map((value) => (
                                        <option key={value} value={value}>{statusLabel(value)}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="ofi-crm-field">
                                <span>{t('crm.enquiry.assignee')}</span>
                                <select
                                    className="ofi-crm-input"
                                    value={row.assignee?.id || ''}
                                    onChange={(event) => void patchNow({ assignedEmployeeId: event.target.value || null })}
                                >
                                    <option value="">{t('crm.enquiry.noAssignee')}</option>
                                    {staff.map((person) => (
                                        <option key={person.id} value={person.id}>
                                            {`${person.firstName} ${person.lastName}`.trim()}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label className="ofi-crm-field" style={{ marginTop: 12 }}>
                            <span>{t('crm.enquiry.internalNote')}</span>
                            <textarea
                                className="ofi-crm-input"
                                value={draft.internalNote}
                                placeholder={t('crm.enquiry.internalNoteHint')}
                                onChange={(event) => setDraft((d) => ({ ...d, internalNote: event.target.value }))}
                            />
                        </label>

                        {/* Antworten heisst: das Mailprogramm mit der Adresse
                            der Anfrage öffnen. Ein eigenes Sendefenster wäre
                            ein zweites Postfach neben dem, das es schon gibt. */}
                        {row.email && (
                            <p style={{ marginTop: 14 }}>
                                <a
                                    className="ofi-crm-btn"
                                    href={`mailto:${row.email}?subject=${encodeURIComponent(`AW: ${row.subject}`)}`}
                                >
                                    <Mail01 size={14} />
                                    {t('crm.enquiry.reply')}
                                </a>
                            </p>
                        )}

                        <p className="ofi-crm-row__sub" style={{ marginTop: 14 }}>
                            <User01 size={13} />
                            {row.createdBy
                                ? t('crm.enquiry.createdByLine', {
                                    name: `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim(),
                                    when: fullWhen(row.createdAt, locale),
                                })
                                : t('crm.enquiry.receivedLine', { when: fullWhen(row.createdAt, locale) })}
                        </p>
                    </>
                )}
            </PopupCard>

            <ConfirmDialog
                open={askDelete}
                title={t('crm.enquiry.deleteTitle')}
                message={row?.subject}
                tone="danger"
                confirmLabel={t('common.delete')}
                onConfirm={() => void remove()}
                onCancel={() => setAskDelete(false)}
            />
        </>
    );
};
