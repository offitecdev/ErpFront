import { t } from '@/i18n/translate';
import type { ProcurementEvent } from '@/types/purchasing';

import { eventText, whenText } from '../purchasingModel';

/** Farbe eines Eintrags: angekommen (grün), beim Lieferanten (blau), geschlossen (grau), sonst neutral. */
const toneOf = (action: string): string => {
    if (action === 'GOODS_RECEIVED' || action === 'REPLY_ADDED' || action === 'SELECTION_SAVED' || action === 'REQUEST_CLOSED') return 'ok';
    if (action === 'ORDER_CONFIRMED' || action === 'PRICE_REQUESTS_SENT') return 'wait';
    if (action === 'REQUEST_CANCELLED' || action === 'REQUEST_WITHDRAWN') return 'off';
    return 'info';
};

/** «İşlem geçmişi» — jeder Handgriff am Talep, der neueste oben. */
export const History = ({ events }: { events: ProcurementEvent[] }) => (
    <section className="ofi-buy-box">
        <header className="ofi-buy-boxhead">
            <h3>{t('productionBom.purchasing.history')}</h3>
            <span className="ofi-buy-count">{events.length}</span>
        </header>
        <ol className="ofi-buy-hist">
            {events.map((event, index) => (
                <li key={`${event.at}-${index}`}>
                    <time>{whenText(event.at)}</time>
                    <i className={`ofi-buy-hist__dot is-${toneOf(event.action)}`} aria-hidden />
                    <span>
                        <b>{eventText(event)}</b>
                        {event.actorName && <small>{event.actorName}</small>}
                    </span>
                </li>
            ))}
        </ol>
    </section>
);
