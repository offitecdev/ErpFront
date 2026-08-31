import { useEffect } from 'react';

import { whenBootSplashGone } from '@/lib/bootSplash';
import { useAuthStore } from '@/store/authStore';

import { WhatsNewPopup } from './WhatsNewPopup';
import { selectUnseenIds, useWhatsNewStore } from './whatsNewStore';

/**
 * ── DER WÄCHTER: EINMAL VON SELBST, DANN NIE WIEDER ─────────────────────────
 *
 * Er hängt am Rahmen der Anwendung (MainLayout), nicht an einer Seite — eine
 * Ankündigung soll erscheinen, gleich auf welcher Seite man landet.
 *
 * Er öffnet das Blatt GENAU DANN, wenn diese Person eine Mitteilungs-id noch
 * nie gesehen hat. Danach steht die id im Browser und es bleibt zu, bis das
 * nächste Update eine neue id mitbringt (`updateNotes.ts`). Wer es wiedersehen
 * will, holt es über das Zeichen im Kopf zurück.
 *
 * ES KOMMT SOFORT (Vorgabe Samet, 29.08.2026: «es muss sofort kommen»). Hier
 * stand zuerst eine Uhr von 1400 ms, damit die Startseite ihre Zahlen fertig
 * aufbaut — das war eine Ankündigung, die man verpasst, während man schon
 * klickt.
 *
 * Es wartet nur noch auf EINE Sache, und die ist keine Uhr: dass der
 * Startvorhang das Bild freigibt (`whenBootSplashGone`, lib/bootSplash.ts).
 * Der liegt beim vollen Laden noch mindestens 1,2 Sekunden über allem — führe
 * das Blatt darunter herauf, sähe man von der Bewegung nichts und fände beim
 * Aufziehen des Vorhangs ein Fenster vor, das einfach da ist. Kam man dagegen
 * über einen Wechsel innerhalb der Anwendung, ist der Vorhang längst weg und
 * das Versprechen wird beim Wort genommen: das Blatt fährt augenblicklich
 * herauf.
 */

export const WhatsNewHost = () => {
    const userId = useAuthStore((state) => state.user?.id ?? null);
    const bind = useWhatsNewStore((state) => state.bind);

    /* Der Speicher gehört der angemeldeten Person: beim Wechsel wird neu
       gelesen, sonst gälte die Mitteilung für die zweite Person am selben
       Rechner als längst gelesen. */
    useEffect(() => { bind(userId); }, [userId, bind]);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        void whenBootSplashGone().then(() => {
            if (cancelled) return;
            const state = useWhatsNewStore.getState();
            // In der Zwischenzeit von Hand geöffnet, schon gezeigt oder die
            // Person gewechselt? Dann nicht.
            if (state.open || state.autoShown || state.userId !== userId) return;
            if (selectUnseenIds(state).length === 0) return;
            state.markAutoShown();
            state.openPanel();
        });
        return () => { cancelled = true; };
    }, [userId]);

    return <WhatsNewPopup />;
};
