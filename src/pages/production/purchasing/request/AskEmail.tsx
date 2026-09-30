import { useState } from 'react';
import { Mail, Send } from 'lucide-react';

import { t } from '@/i18n/translate';

import { IconAction } from './IconAction';

const P = 'productionBom.purchasing.requests';
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

/**
 * Die Adresse, die einer Preisanfrage fehlt (30.09.2026): eintippen,
 * «Kaydet ve gönder» — sie wird die E-Mail des Lieferanten (auch in der
 * Lieferantenliste) und die Anfrage geht gleich an sie.
 */
export const AskEmail = ({ busy, onSend }: { busy: boolean; onSend: (email: string) => void }) => {
    const [email, setEmail] = useState('');
    const [tried, setTried] = useState(false);
    const valid = EMAIL.test(email.trim());
    const submit = () => {
        setTried(true);
        if (valid && !busy) onSend(email.trim());
    };
    return (
        <span className="ofi-buy-askemail" title={t(`${P}.emailMissing`)}>
            <label className={`ofi-buy-askemail__field${tried && !valid ? ' is-invalid' : ''}`}>
                <Mail aria-hidden />
                <input
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={email}
                    placeholder={t(`${P}.emailPlaceholder`)}
                    aria-label={t(`${P}.emailPlaceholder`)}
                    disabled={busy}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        submit();
                    }}
                />
            </label>
            <IconAction tone="blue" icon={<Send />} label={t(`${P}.saveAndSend`)} busy={busy} disabled={!email.trim()} onClick={submit} />
            {tried && !valid && <small className="ofi-buy-askemail__err">{t(`${P}.emailInvalid`)}</small>}
        </span>
    );
};
