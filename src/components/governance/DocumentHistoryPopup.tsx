import { useEffect, useMemo, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';

import {
    AlertTriangle,
    CheckCircle,
    Edit01,
    File02,
    GitBranch01,
    Send01,
    Lock01,
    RefreshCcw01,
    Trash01,
    XClose,
} from '@/components/icons/antIconCompat';
import { PopupCard } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { documentEventsApi, type DocumentEventDto } from '@/lib/api/documentEvents';

import { blockerText } from './blockerText';
import type { DocumentEntityType } from './governance';
import './governance.css';

/**
 * ── DER VERLAUF EINES BELEGS (16.09.2026, Schritt 4 / D1) ────────────────────
 *
 * Ein Fenster wie eine macOS-Einstellungsseite: nach Tagen gruppierte Listen,
 * jede Zeile mit Zeichen, Handlung, Beleg, Person, Uhrzeit und — wenn es einen
 * gibt — dem Grund im Wortlaut. Eingriffe der Systemverwaltung tragen ein
 * rotes Schild mit den überschrittenen Sperren. Nur lesen: der Verlauf lässt
 * sich weder ändern noch löschen.
 *
 * Oben ein Segmentschalter «Alle / Eingriffe», damit die seltenen, wichtigen
 * Einträge nicht in den gewöhnlichen untergehen.
 */

type Filter = 'all' | 'overrides';

const ACTION_ICON: Record<string, { icon: ReactNode; tone?: 'danger' | 'accent' }> = {
    DELETED: { icon: <Trash01 size={14} />, tone: 'danger' },
    CANCELLED: { icon: <XClose size={14} />, tone: 'danger' },
    UNCANCELLED: { icon: <RefreshCcw01 size={14} />, tone: 'accent' },
    REVERTED_TO_DRAFT: { icon: <GitBranch01 size={14} /> },
    TEXT_CORRECTED: { icon: <Edit01 size={14} /> },
    STATUS_CHANGED: { icon: <CheckCircle size={14} />, tone: 'accent' },
    // Buchhaltung (Schritt 5)
    DRAFT_CREATED: { icon: <File02 size={14} /> },
    ISSUED: { icon: <Send01 size={14} />, tone: 'accent' },
    DRAFT_DISCARDED: { icon: <Trash01 size={14} /> },
    // Schritt 6: Gegenbeleg, ganzer Vorgang storniert.
    CREDIT_ISSUED: { icon: <RefreshCcw01 size={14} />, tone: 'danger' },
    FULL_CANCELLED: { icon: <XClose size={14} />, tone: 'danger' },
};

const actionTitle = (event: DocumentEventDto): string => {
    if (event.action === 'STATUS_CHANGED') {
        const to = String(event.snapshot?.to ?? '');
        if (to === 'PAID') return t('governance.action.markedPaid');
        if (to === 'ISSUED') return t('governance.action.reopened');
    }
    return t(`governance.action.${event.action}`);
};

const entityLabel = (type: DocumentEntityType): string => t(`governance.entity.${type}`);

const dayTitle = (value: string): string => {
    const day = dayjs(value);
    if (day.isSame(dayjs(), 'day')) return t('governance.today');
    if (day.isSame(dayjs().subtract(1, 'day'), 'day')) return t('governance.yesterday');
    return day.format('DD.MM.YYYY');
};

export const DocumentHistoryPopup = ({
    open,
    entityType,
    entityId,
    documentNumber,
    onClose,
}: {
    open: boolean;
    entityType: DocumentEntityType;
    entityId: string;
    documentNumber?: string | null;
    onClose: () => void;
}) => {
    const [events, setEvents] = useState<DocumentEventDto[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [filter, setFilter] = useState<Filter>('all');

    // Das Fenster wird nur geöffnet eingehängt — der Anfangszustand ist also
    // immer «lädt»; hier wird nur geholt.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        documentEventsApi.list(entityType, entityId)
            .then((rows) => { if (!cancelled) setEvents(rows); })
            .catch(() => { if (!cancelled) { setEvents([]); setFailed(true); } });
        return () => { cancelled = true; };
    }, [open, entityType, entityId]);

    const overrides = events?.filter((event) => event.override).length ?? 0;
    const groups = useMemo(() => {
        const rows = (events ?? []).filter((event) => filter === 'all' || event.override);
        const byDay = new Map<string, DocumentEventDto[]>();
        for (const event of rows) {
            const key = dayjs(event.createdAt).format('YYYY-MM-DD');
            const bucket = byDay.get(key);
            if (bucket) bucket.push(event); else byDay.set(key, [event]);
        }
        return [...byDay.values()];
    }, [events, filter]);

    return (
        <PopupCard
            open={open}
            onClose={onClose}
            title={t('governance.historyTitle')}
            subtitle={documentNumber || undefined}
            width={560}
            closeOnOutside
        >
            <div className="gov gov-history">
                {overrides > 0 && (
                    <div className="gov-filter" role="tablist">
                        <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>
                            {t('governance.filterAll')}
                        </button>
                        <button type="button" role="tab" aria-selected={filter === 'overrides'} className={filter === 'overrides' ? 'is-on' : ''} onClick={() => setFilter('overrides')}>
                            {t('governance.filterOverrides', { count: overrides })}
                        </button>
                    </div>
                )}

                {events === null ? (
                    <p className="gov-empty">{t('common.loading')}</p>
                ) : groups.length === 0 ? (
                    <p className="gov-empty">{failed ? t('governance.loadFailed') : t('governance.empty')}</p>
                ) : groups.map((rows) => (
                    <section key={rows[0].createdAt} className="gov-section">
                        <h4 className="gov-section__title">{dayTitle(rows[0].createdAt)}</h4>
                        <div className="gov-group">
                            {rows.map((event) => {
                                const look = event.override
                                    ? { icon: <AlertTriangle size={14} />, tone: 'danger' as const }
                                    : ACTION_ICON[event.action] ?? { icon: <Lock01 size={14} /> };
                                return (
                                    <div key={event.id} className="gov-row">
                                        <span className={`gov-icon ${look.tone ? `is-${look.tone}` : ''}`} aria-hidden>{look.icon}</span>
                                        <div className="min-w-0">
                                            <div className="gov-row__title">
                                                <span>{actionTitle(event)}</span>
                                                {(event.related || !documentNumber) && event.documentNumber && (
                                                    <span className="gov-doc" title={entityLabel(event.entityType)}>{event.documentNumber}</span>
                                                )}
                                            </div>
                                            <div className="gov-row__meta">
                                                {[event.related ? entityLabel(event.entityType) : null, event.actorName || t('governance.unknownActor')]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </div>
                                            {event.override && (
                                                <div className="gov-override">
                                                    <AlertTriangle size={12} />
                                                    {t('governance.overrideBadge')}
                                                    {event.overriddenBlockers.length > 0 && ` · ${event.overriddenBlockers.map(blockerText).join(', ')}`}
                                                </div>
                                            )}
                                            {event.reason && <div className="gov-row__reason">{event.reason}</div>}
                                        </div>
                                        <time className="gov-row__time" dateTime={event.createdAt}>
                                            {dayjs(event.createdAt).format('HH:mm')}
                                        </time>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </PopupCard>
    );
};
