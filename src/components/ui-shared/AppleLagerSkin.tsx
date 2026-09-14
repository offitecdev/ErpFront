import type { ReactNode } from 'react';
import '@fontsource-variable/inter/index.css';
import '@/styles/listApple.css';
import '@/styles/lagerApple.css';

/**
 * Das Kleid der Offerte für das LAGER (10.09.2026, Vorgabe Samet: «stok
 * modülü de aynı şekilde» — nach der Projektseite). Es ist die Listen-Hülle
 * (`.ofi-list-apple`, styles/listApple.css) plus eine zweite Klasse
 * (`.ofi-lager`), an der styles/lagerApple.css hängt: die Stücke, die nur das
 * Lager hat — Werkzeugzeilen ausserhalb des Kopfes, das Ein/Aus-Segment,
 * die Stufen der Lieferantenbestellung, Bestellmaske und Wareneingang, das
 * Produktformular. Wie die Listen-Hülle nachgeladen, `display: contents`.
 */
export const AppleLagerSkin = ({ children }: { children: ReactNode }) => (
    <div className="ofi-list-apple ofi-lager" style={{ display: 'contents' }}>
        {children}
    </div>
);

export default AppleLagerSkin;
