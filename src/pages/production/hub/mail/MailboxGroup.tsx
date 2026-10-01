import { useState } from 'react';
import { CheckCircle2, ChevronDown, PlugZap, Save, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui-shared/Switch';
import { t } from '@/i18n/translate';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { productionMailboxApi } from '@/lib/api/purchasing';
import type { MailboxTestResult, ProductionMailbox, ProductionMailboxes } from '@/types/purchasing';

import { whenText } from '../../purchasing/purchasingModel';
import { bodyOf, draftOf, emailValid, isDirty, type MailboxDraft } from './mailboxForm';

const P = 'productionBom.mailbox';

/** «12/3/2» (gelesen/zugeordnet/PDF) aus dem letzten Durchgang. */
const summaryText = (summary: string | null): string | null => {
    const [examined, matched, attached] = String(summary ?? '').split('/').map(Number);
    if (!Number.isFinite(examined)) return null;
    return t(`${P}.summary`, { examined, matched: matched || 0, attached: attached || 0 });
};

/**
 * ── EIN POSTFACH DER PRODUKTION (30.09.2026) ───────────────────────────────
 * Adresse, Passwort, Absendername, «Etkin» — die Server stehen vor
 * (mail.cyon.ch, SMTP 465 SSL / IMAP 993 SSL) und klappen unter «Sunucu» auf.
 * Unten: «Bağlantıyı test et» (mit dem, was im Formular steht), «Kaydet»,
 * «Kaldır»; darüber der letzte Durchgang des Posteingangs.
 */
export const MailboxGroup = ({ purpose, box, defaults, canEdit, onSaved, onRemoved }: {
    purpose: 'RFQ' | 'ORDER';
    box: ProductionMailbox | null;
    defaults: ProductionMailboxes['defaults'];
    canEdit: boolean;
    onSaved: (box: ProductionMailbox) => void;
    onRemoved: () => void;
}) => {
    const [draft, setDraft] = useState<MailboxDraft>(() => draftOf(box, defaults));
    const [servers, setServers] = useState(false);
    const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
    const [test, setTest] = useState<MailboxTestResult | null>(null);
    const dirty = isDirty(draft, box, defaults);
    const invalid = !emailValid(draft.fromEmail) || (!box && !draft.password);
    const set = (patch: Partial<MailboxDraft>) => { setDraft((current) => ({ ...current, ...patch })); setTest(null); };

    const save = async () => {
        if (busy || invalid) return;
        setBusy('save');
        try {
            const saved = await productionMailboxApi.save(purpose, bodyOf(draft));
            setDraft(draftOf(saved, defaults));
            onSaved(saved);
            toast.success(t(`${P}.saved`));
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setBusy(null);
        }
    };

    const runTest = async () => {
        if (busy || !box) return;
        setBusy('test');
        setTest(null);
        try {
            setTest(await productionMailboxApi.test(purpose, dirty ? bodyOf(draft) : {}));
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        if (busy || !box) return;
        setBusy('remove');
        try {
            await productionMailboxApi.remove(purpose);
            setDraft(draftOf(null, defaults));
            onRemoved();
            toast.success(t(`${P}.removed`));
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setBusy(null);
        }
    };

    const summary = box?.lastCheckAt ? summaryText(box.lastSummary) : null;
    const field = (key: keyof MailboxDraft, props: { type?: string; placeholder?: string; mono?: boolean; auto?: string } = {}) => (
        <input
            className={`ofi-bom-input${props.mono ? ' is-mono' : ''}`}
            type={props.type ?? 'text'}
            value={String(draft[key])}
            placeholder={props.placeholder}
            autoComplete={props.auto ?? 'off'}
            spellCheck={false}
            disabled={!canEdit || busy !== null}
            onChange={(event) => set({ [key]: event.target.value } as Partial<MailboxDraft>)}
        />
    );

    return (
        <section className="ofi-bom-group ofi-pmail">
            <h3 className="ofi-bom-group__title">
                {t(`${P}.${purpose}.title`)}
                <span className={`ofi-pmail__pill is-${!box ? 'off' : box.lastError ? 'warn' : box.isActive ? 'on' : 'off'}`}>
                    {t(!box ? `${P}.state.missing` : box.lastError ? `${P}.state.error` : box.isActive ? `${P}.state.active` : `${P}.state.paused`)}
                </span>
            </h3>
            <div className="ofi-bom-group__box">
                <label className="ofi-bom-row">
                    <span className="ofi-bom-row__label">{t(`${P}.email`)}<small>{t(`${P}.${purpose}.emailSub`)}</small></span>
                    <span className="ofi-bom-row__control">{field('fromEmail', { type: 'email', placeholder: t(`${P}.${purpose}.placeholder`), auto: 'email' })}</span>
                </label>
                <label className="ofi-bom-row">
                    <span className="ofi-bom-row__label">{t(`${P}.password`)}<small>{t(box?.hasPassword ? `${P}.passwordKeep` : `${P}.passwordNew`)}</small></span>
                    <span className="ofi-bom-row__control">{field('password', { type: 'password', placeholder: box?.hasPassword ? '••••••••' : '', auto: 'new-password' })}</span>
                </label>
                <label className="ofi-bom-row">
                    <span className="ofi-bom-row__label">{t(`${P}.fromName`)}<small>{t(`${P}.fromNameSub`)}</small></span>
                    <span className="ofi-bom-row__control">{field('fromName', { placeholder: 'Offitec AG' })}</span>
                </label>
                <div className="ofi-bom-row">
                    <span className="ofi-bom-row__label">{t(`${P}.active`)}<small>{t(`${P}.${purpose}.activeSub`)}</small></span>
                    <span className="ofi-bom-row__control is-inline">
                        <Switch checked={draft.isActive} disabled={!canEdit || busy !== null} label={t(`${P}.active`)} onChange={(next) => set({ isActive: next })} />
                    </span>
                </div>
                <button type="button" className="ofi-bom-row is-link ofi-pmail__servers ofi-nosize" aria-expanded={servers} onClick={() => setServers((open) => !open)}>
                    <span className="ofi-bom-row__label">
                        {t(`${P}.servers`)}
                        <small>{t(`${P}.serversSub`, { smtp: `${draft.smtpHost}:${draft.smtpPort}`, imap: `${draft.imapHost}:${draft.imapPort}` })}</small>
                    </span>
                    <ChevronDown className={`ofi-bom-row__chev${servers ? ' is-open' : ''}`} aria-hidden />
                </button>
                {servers && (
                    <>
                        <div className="ofi-bom-row">
                            <span className="ofi-bom-row__label">{t(`${P}.smtp`)}<small>{t(`${P}.sslHint`)}</small></span>
                            <span className="ofi-bom-row__control is-inline ofi-pmail__hostport">{field('smtpHost', { mono: true })}{field('smtpPort', { mono: true })}</span>
                        </div>
                        <div className="ofi-bom-row">
                            <span className="ofi-bom-row__label">{t(`${P}.imap`)}<small>{t(`${P}.imapSub`)}</small></span>
                            <span className="ofi-bom-row__control is-inline ofi-pmail__hostport">{field('imapHost', { mono: true })}{field('imapPort', { mono: true })}</span>
                        </div>
                        <label className="ofi-bom-row">
                            <span className="ofi-bom-row__label">{t(`${P}.user`)}<small>{t(`${P}.userSub`)}</small></span>
                            <span className="ofi-bom-row__control">{field('smtpUser', { placeholder: draft.fromEmail || 'rfq@offitec.ch' })}</span>
                        </label>
                        <label className="ofi-bom-row">
                            <span className="ofi-bom-row__label">{t(`${P}.folder`)}</span>
                            <span className="ofi-bom-row__control">{field('imapFolder', { placeholder: 'INBOX', mono: true })}</span>
                        </label>
                    </>
                )}
            </div>

            {(box?.lastCheckAt || box?.lastError) && (
                <p className={`ofi-pmail__last${box.lastError ? ' is-warn' : ''}`}>
                    {box.lastError ? <TriangleAlert aria-hidden /> : <CheckCircle2 aria-hidden />}
                    {box.lastError
                        ? t(`${P}.lastError`, { error: box.lastError })
                        : t(`${P}.lastCheck`, { when: whenText(box.lastCheckAt!), summary: summary ?? '' })}
                </p>
            )}
            {test && (
                <p className="ofi-pmail__test">
                    {test.smtp && <span className={test.smtp.ok ? 'is-ok' : 'is-warn'}>{t(test.smtp.ok ? `${P}.smtpOk` : `${P}.smtpFail`, { error: test.smtp.error ?? '' })}</span>}
                    {test.imap && <span className={test.imap.ok ? 'is-ok' : 'is-warn'}>{t(test.imap.ok ? `${P}.imapOk` : `${P}.imapFail`, { error: test.imap.error ?? '', count: test.imap.messages ?? 0 })}</span>}
                </p>
            )}
            {canEdit && (
                <div className="ofi-pmail__acts">
                    {box && (
                        <button type="button" className="ofi-bom-btn is-quiet is-danger-hover ofi-nosize" disabled={busy !== null} onClick={() => void remove()}>
                            {busy === 'remove' ? <span className="ofi-bom-spinner is-small" /> : <Trash2 aria-hidden />}
                            {t(`${P}.remove`)}
                        </button>
                    )}
                    <span className="ofi-pmail__gap" />
                    {box && (
                        <button type="button" className="ofi-bom-btn ofi-nosize" disabled={busy !== null} onClick={() => void runTest()}>
                            {busy === 'test' ? <span className="ofi-bom-spinner is-small" /> : <PlugZap aria-hidden />}
                            {t(`${P}.test`)}
                        </button>
                    )}
                    <button type="button" className="ofi-bom-btn is-primary ofi-nosize" disabled={busy !== null || invalid || (!dirty && Boolean(box))} onClick={() => void save()}>
                        {busy === 'save' ? <span className="ofi-bom-spinner is-small" /> : <Save aria-hidden />}
                        {t(box ? `${P}.save` : `${P}.create`)}
                    </button>
                </div>
            )}
        </section>
    );
};
