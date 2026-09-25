import type { KeyboardEvent } from 'react';

import { t } from '@/i18n/translate';
import { ARTICLE_KINDS, type ArticleKind } from '@/types/inventory';
import { articleKindLabel } from '../utils/articleKind';
// Segmentin kendisi (.ofi-ows-tabs) — içinde durduğu sayfa bunu yüklemese de.
import '@/styles/modules/orderWorkspace.css';

/**
 * ÜRÜN TÜRÜ — üçlü macOS segmenti: Üretilecek / Satın Alınacak / Ek Hizmet
 * (Samet, 23.09.2026). Sipariş sayfasının segmentiyle aynı dil
 * (`.ofi-ows-tabs`): gri oluk, seçilende beyaz kutu. Radyo grubu gibi
 * davranır — ok tuşları seçimi kaydırır, Tab grubu tek durak sayar. Tür
 * zorunlu değilse (üretim şirketi) seçili segmente yeniden basmak seçimi
 * kaldırır.
 */
export const ArticleKindSegment = ({ value, onChange, invalid = false, disabled = false, allowClear = false }: {
    value: ArticleKind | null;
    onChange: (next: ArticleKind | null) => void;
    /** Zorunlu olup boş bırakıldı — kırmızı halka. */
    invalid?: boolean;
    disabled?: boolean;
    /** Tür zorunlu değil: seçili segment yeniden basılınca boşa döner. */
    allowClear?: boolean;
}) => {
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
        if (!step || disabled) return;
        event.preventDefault();
        const index = value ? ARTICLE_KINDS.indexOf(value) : -1;
        const next = ARTICLE_KINDS[(index + step + ARTICLE_KINDS.length) % ARTICLE_KINDS.length];
        onChange(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-kind="${next}"]`)?.focus();
    };

    return (
        <div
            role="radiogroup"
            aria-label={t('inv.newProduct.kind')}
            aria-invalid={invalid || undefined}
            onKeyDown={onKeyDown}
            className={`ofi-ows-tabs ofi-kind-seg${invalid ? ' is-invalid' : ''}`}
        >
            {ARTICLE_KINDS.map((kind) => {
                const on = value === kind;
                return (
                    <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        data-kind={kind}
                        tabIndex={on || (!value && kind === ARTICLE_KINDS[0]) ? 0 : -1}
                        disabled={disabled}
                        onClick={() => onChange(on && allowClear ? null : kind)}
                        className={`ofi-ows-tab${on ? ' is-on' : ''}`}
                    >
                        {articleKindLabel(kind)}
                    </button>
                );
            })}
        </div>
    );
};
