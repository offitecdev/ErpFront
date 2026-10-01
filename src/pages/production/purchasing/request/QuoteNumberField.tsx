import { useState } from 'react';
import { Check, Hash } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';

const P = 'productionBom.purchasing.orderList';

/**
 * Die Angebotsnummer des Lieferanten direkt in der Zeile (30.09.2026, Samet:
 * «orada tedarikçi numarası ekleyebilelim, tek yerde») — ohne sie geht keine
 * Bestellung hinaus. Gespeichert beim Verlassen des Feldes oder mit Enter;
 * das Feld zeigt den Wert sofort, der Server folgt im Hintergrund.
 */
export const QuoteNumberField = ({ purchaseOrderId, value, disabled, onSaved }: {
    purchaseOrderId: string;
    value: string | null;
    disabled: boolean;
    onSaved: () => void;
}) => {
    const [text, setText] = useState(value ?? '');
    const [saved, setSaved] = useState(value ?? '');
    const [busy, setBusy] = useState(false);
    const missing = !saved.trim();

    const save = async () => {
        const next = text.replace(/\s+/g, ' ').trim();
        if (busy || next === saved.trim()) return;
        setBusy(true);
        try {
            await productionBomApi.setQuoteNumber(purchaseOrderId, next);
            setSaved(next);
            toast.success(t(`${P}.quoteSaved`));
            onSaved();
        } catch (failure) {
            setText(saved);
            toast.error(productionBomErrorText(failure));
        } finally {
            setBusy(false);
        }
    };

    return (
        <label className={`ofi-buy-quotefield${missing ? ' is-missing' : ''}`} title={missing ? t(`${P}.quoteMissing`) : undefined}>
            <Hash aria-hidden />
            <input
                value={text}
                maxLength={120}
                spellCheck={false}
                autoComplete="off"
                disabled={disabled || busy}
                placeholder={t(`${P}.quotePlaceholder`)}
                aria-label={t(`${P}.quoteLabel`)}
                onChange={(event) => setText(event.target.value)}
                onBlur={() => void save()}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        void save();
                    }
                    if (event.key === 'Escape') setText(saved);
                }}
            />
            {busy ? <span className="ofi-buy-spinner" /> : !missing && text.trim() === saved.trim() ? <Check className="is-ok" aria-hidden /> : null}
        </label>
    );
};
