import { lazy, Suspense, useEffect, useState } from 'react';

import { setComposeListener, type ComposeRequest } from './mailComposeBus';

// The host must always be present so calls from any page can be queued, but the
// full composer (mail APIs, recipient picker, FloatingCard, icons and Sonner)
// is only useful once somebody actually asks to write a message.
const LazyMailComposeCard = lazy(() =>
    import('./MailComposeCard').then((mod) => ({ default: mod.MailComposeCard })),
);

/* Hängt EINMAL im Layout: hört auf `openMailCompose()` und zeigt das
   Schreiben-Fenster — egal von welcher Seite aus es geöffnet wurde. Wird im
   Split-View-Pane nicht montiert (das Fenster soll nicht doppelt aufgehen). */
export const MailComposeHost = () => {
    const [request, setRequest] = useState<ComposeRequest | null>(null);
    useEffect(() => {
        setComposeListener((next) => setRequest({ ...next }));
        return () => setComposeListener(null);
    }, []);
    if (!request) return null;

    return (
        <Suspense fallback={null}>
            <LazyMailComposeCard request={request} onClose={() => setRequest(null)} />
        </Suspense>
    );
};
