import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Check, Send01 } from '@/components/icons/antIconCompat';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { publicEnquiryApi, type PublicEnquiryForm } from '@/lib/api/enquiries';

/**
 * ── DAS ÖFFENTLICHE ANFRAGEFORMULAR (`/anfrage/:token`) ──────────────────────
 *
 *   «Es gibt ein Anfrageformular mit einem Link — den Link findet man auf der
 *    Seite, man kann ihn kopieren und per Mail verschicken.»
 *
 * Diese Seite steht AUSSERHALB der Anmeldung: sie hängt weder am Menü noch am
 * App-Rahmen, sie kennt keine Rollen und lädt nichts, was sie nicht selbst
 * braucht. Wer sie öffnet, ist meistens noch kein Kunde — der ganze Sinn der
 * Anfragen.
 *
 * SIE FRAGT WENIG. Adresse, Betreff, Nachricht sind Pflicht; Firma, Name und
 * Telefon sind angeboten, aber nicht verlangt. Jedes Pflichtfeld mehr kostet
 * Anfragen — und was fehlt, erfragt man in der Antwort.
 *
 * DER HONIGTOPF (`website`) ist ein Feld, das kein Mensch sieht und jeder
 * Fluter ausfüllt. Es ist absichtlich unauffällig benannt und wird vom Server
 * still ausgewertet.
 *
 * GESTALTUNG: dieselbe ruhige Schicht wie das CRM (`.ofi-crm-*`), damit die
 * Seite zum Rest gehört — nur ohne Rahmen, mittig, mit viel Luft.
 */

const EMPTY = {
    companyName: '', contactName: '', email: '', phone: '',
    subject: '', message: '', website: '',
};

export const PublicEnquiryPage = () => {
    const { token = '' } = useParams();
    const [form, setForm] = useState<PublicEnquiryForm | null>(null);
    const [loading, setLoading] = useState(true);
    const [gone, setGone] = useState(false);
    const [draft, setDraft] = useState(EMPTY);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        publicEnquiryApi.describe(token)
            .then((value) => { if (!cancelled) setForm(value); })
            .catch(() => { if (!cancelled) setGone(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [token]);

    const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
        setDraft((current) => ({ ...current, [key]: event.target.value }));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setSending(true);
        try {
            const result = await publicEnquiryApi.submit(token, {
                companyName: draft.companyName.trim() || undefined,
                contactName: draft.contactName.trim() || undefined,
                email: draft.email.trim(),
                phone: draft.phone.trim() || undefined,
                subject: draft.subject.trim(),
                message: draft.message.trim(),
                website: draft.website,
            });
            setDone(result.thanks || t('publicEnquiry.thanksDefault'));
        } catch (caught) {
            const message = (caught as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setError(message || t('publicEnquiry.sendError'));
        } finally {
            setSending(false);
        }
    };

    return (
        <main className="ofi-pubenq">
            <div className="ofi-pubenq__card">
                {loading && <InlineLoading label={t('common.loading')} />}

                {!loading && gone && (
                    <div className="ofi-crm-empty">
                        <span className="ofi-crm-empty__title">{t('publicEnquiry.goneTitle')}</span>
                        <span className="ofi-crm-empty__hint">{t('publicEnquiry.goneHint')}</span>
                    </div>
                )}

                {!loading && !gone && done && (
                    <div className="ofi-crm-empty">
                        <span className="ofi-pubenq__ok" aria-hidden><Check size={22} /></span>
                        <span className="ofi-crm-empty__title">{t('publicEnquiry.sentTitle')}</span>
                        <span className="ofi-crm-empty__hint">{done}</span>
                    </div>
                )}

                {!loading && !gone && !done && form && (
                    <>
                        <header className="ofi-pubenq__head">
                            {form.companyName && <span className="ofi-pubenq__brand">{form.companyName}</span>}
                            <h1>{form.title || t('publicEnquiry.titleDefault')}</h1>
                            <p>{form.intro || t('publicEnquiry.introDefault')}</p>
                        </header>

                        <form onSubmit={submit} noValidate={false}>
                            <div className="ofi-crm-fields is-two">
                                <label className="ofi-crm-field">
                                    <span>{t('crm.enquiry.companyName')}</span>
                                    <input className="ofi-crm-input" value={draft.companyName} onChange={set('companyName')} autoComplete="organization" />
                                </label>
                                <label className="ofi-crm-field">
                                    <span>{t('crm.enquiry.contactName')}</span>
                                    <input className="ofi-crm-input" value={draft.contactName} onChange={set('contactName')} autoComplete="name" />
                                </label>
                                <label className="ofi-crm-field">
                                    <span>{`${t('crm.enquiry.email')} *`}</span>
                                    <input
                                        type="email"
                                        required
                                        className="ofi-crm-input"
                                        value={draft.email}
                                        onChange={set('email')}
                                        autoComplete="email"
                                    />
                                </label>
                                <label className="ofi-crm-field">
                                    <span>{t('crm.enquiry.phone')}</span>
                                    <input className="ofi-crm-input" value={draft.phone} onChange={set('phone')} autoComplete="tel" />
                                </label>
                            </div>

                            <label className="ofi-crm-field" style={{ marginTop: 14 }}>
                                <span>{`${t('crm.enquiry.subject')} *`}</span>
                                <input required className="ofi-crm-input" value={draft.subject} onChange={set('subject')} />
                            </label>

                            <label className="ofi-crm-field" style={{ marginTop: 14 }}>
                                <span>{`${t('crm.enquiry.message')} *`}</span>
                                <textarea required className="ofi-crm-input" value={draft.message} onChange={set('message')} rows={6} />
                            </label>

                            {/* Honigtopf — für Menschen unsichtbar, für Fluter
                                unwiderstehlich. `aria-hidden` + tabIndex halten
                                ihn auch von Vorleseprogrammen fern. */}
                            <div className="ofi-pubenq__trap" aria-hidden>
                                <label>
                                    Website
                                    <input tabIndex={-1} autoComplete="off" value={draft.website} onChange={set('website')} />
                                </label>
                            </div>

                            {error && <p className="ofi-pubenq__error">{error}</p>}

                            <button type="submit" className="ofi-crm-btn is-primary ofi-pubenq__send" disabled={sending}>
                                <Send01 size={15} />
                                {sending ? t('publicEnquiry.sending') : t('publicEnquiry.send')}
                            </button>

                            <p className="ofi-pubenq__legal">{t('publicEnquiry.legal')}</p>
                        </form>
                    </>
                )}
            </div>
        </main>
    );
};

export default PublicEnquiryPage;
