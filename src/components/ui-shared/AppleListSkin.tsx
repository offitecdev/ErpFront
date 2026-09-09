import type { ReactNode } from 'react';
import '@fontsource-variable/inter/index.css';
import '@/styles/listApple.css';

/**
 * Das Kleid der Offerten-Detailseite für die Listenseiten (09.09.2026,
 * Vorgabe Samet: «so sauber wie die Offerte»). Es ist EINE Klasse an der
 * Route — `applePage` in routes/routeHelpers.tsx — und ein eigenes,
 * nachgeladenes Stück: Schrift (Inter Variable) und Stylesheet kommen erst
 * mit der ersten Seite, die es trägt, nicht mit dem Start der Anwendung.
 *
 * `display: contents`: die Hülle zeichnet keinen eigenen Kasten, die Seite
 * darunter bleibt das erste Kind von `main` — Variablen und Schrift erben
 * trotzdem durch.
 */
export const AppleListSkin = ({ children }: { children: ReactNode }) => (
    <div className="ofi-list-apple" style={{ display: 'contents' }}>
        {children}
    </div>
);

export default AppleListSkin;
