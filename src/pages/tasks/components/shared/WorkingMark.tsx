import { t } from '@/i18n/translate';

/**
 * «Çalışılıyor» — die laufende Messung ohne Uhr (14.09.2026, Samet: «kronometre
 * olmayacak, sadece animasyonlu çalışılıyor yazacak»). Ein atmender Punkt und
 * das Wort; die Zeit sieht man erst nach dem Pausieren.
 *
 * `tone="others"`: jemand anderes misst an dieser Aufgabe (Leitung sieht das) —
 * derselbe Punkt, leisere Schrift.
 */
export const WorkingMark = ({ tone = 'own', label, className = '' }: {
    tone?: 'own' | 'others';
    label?: string;
    className?: string;
}) => (
    <span className={`ofi-gv-working ${tone === 'others' ? 'is-others' : ''} ${className}`.trim()} role="status">
        <i className="ofi-gv-working__dot" aria-hidden />
        <span className="ofi-gv-working__text">{label ?? t('tasksModule.working.mark')}</span>
    </span>
);
