import type { ReactNode } from 'react';
import { Check, CircleDashed, Info, TriangleAlert } from 'lucide-react';

import { MacLoading, MacWheel } from '@/components/ui-shared/MacLoading';
import { t } from '@/i18n/translate';
import type { BomCompletion, BomStatus, BomUnit } from '@/types/productionBom';

import { fmtQty, unitLabel } from './bomFormat';

/**
 * ── KLEINE BAUTEILE DER BOM (27.09.2026) ─────────────────────────────────────
 * Zustandsschilder, Zahlen mit Einheit, die drei Bedingungen von «BOM
 * tamamla», Hinweise und leere Zustände — überall dieselben.
 */

export const QtyUnit = ({ value, unit, muted }: { value: number; unit: BomUnit | string | null | undefined; muted?: boolean }) => (
    <span className={`ofi-bom-qty${muted ? ' is-muted' : ''}`}>
        {fmtQty(value)}
        <small>{unitLabel(unit)}</small>
    </span>
);

export const StatusPill = ({ status, consumed }: { status: BomStatus; consumed?: boolean }) => {
    const key = consumed ? 'CONSUMED' : status;
    return <span className={`ofi-bom-pill is-${key.toLowerCase()}`}>{t(`productionBom.status.${key}`)}</span>;
};

/**
 * «Rev.1» — die geltende Revision (27.09.2026: «bom onaylanırsa geri dönüş
 * yok, revize olması lazım»); steht eine im Entwurf, daneben «Rev.2 taslak».
 */
export const RevisionPill = ({ revision, draft }: { revision: number; draft?: number | null }) => (
    <>
        <span className="ofi-bom-revpill" title={t('productionBom.revision.currentTitle', { revision })}>
            {t('productionBom.revision.label', { revision })}
        </span>
        {draft !== undefined && draft !== null && (
            <span className="ofi-bom-revpill is-draft">{t('productionBom.revision.draftPill', { revision: draft })}</span>
        )}
    </>
);

/** «Sipariş · Onay · Rezerve» — die drei Bedingungen, als ruhige Schritte. */
export const CompletionChecks = ({ completion, compact }: { completion: BomCompletion; compact?: boolean }) => {
    const subs = completion.subs ?? { total: 0, completed: 0 };
    const steps: Array<{ done: boolean; label: string }> = [
        { done: completion.ordered, label: t('productionBom.detail.checkOrdered') },
        { done: completion.confirmed, label: t('productionBom.detail.checkConfirmed') },
        { done: completion.reserved, label: t('productionBom.detail.checkReserved') },
        // Die Haupt-BOM: erst wenn jede Alt-BOM abgeschlossen ist.
        ...(subs.total > 0
            ? [{ done: subs.completed === subs.total, label: t('productionBom.detail.checkSubs', { done: subs.completed, total: subs.total }) }]
            : []),
    ];
    return (
        <ol className={`ofi-bom-checks${compact ? ' is-compact' : ''}`} aria-label={t('productionBom.detail.checksTitle')}>
            {steps.map((step, index) => (
                <li key={step.label} className={step.done ? 'is-done' : undefined}>
                    <span className="ofi-bom-checks__mark" aria-hidden>
                        {step.done ? <Check /> : compact ? <CircleDashed /> : index + 1}
                    </span>
                    {!compact && <span>{step.label}</span>}
                </li>
            ))}
        </ol>
    );
};

export const Note = ({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) => (
    <div className={`ofi-bom-note is-${tone}`}>
        {tone === 'info' ? <Info aria-hidden /> : <TriangleAlert aria-hidden />}
        <span>{children}</span>
    </div>
);

export const EmptyState = ({ icon, title, hint, children }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; children?: ReactNode }) => (
    <div className="ofi-bom-state">
        {icon && <span className="ofi-bom-state__icon">{icon}</span>}
        <b>{title}</b>
        {hint && <span>{hint}</span>}
        {children}
    </div>
);

/**
 * Der Ladekreisel der BOM ist der von macOS — dasselbe Rad wie beim Laden einer
 * Bestellung (Satın alma): zwölf Speichen, die reihum aufleuchten. Vorgabe
 * Samet, 01.10.2026. `small` für Knöpfe und Suchfelder; die Farbe kommt aus
 * der Umgebung, auf blauen Knöpfen ist das Rad also weiss.
 */
export const BomSpinner = ({ small }: { small?: boolean }) => <MacWheel small={small} />;

export const LoadingState = () => <MacLoading label={t('common.loadingData')} />;

/** Eine Zahl, die fehlt, ist ein ruhiger Strich — kein «0». */
export const Dash = () => <span className="ofi-bom-dash">—</span>;
