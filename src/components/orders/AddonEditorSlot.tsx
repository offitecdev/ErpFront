import { lazy, Suspense, type ReactNode } from 'react';

import { DotRingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';

import { useAddonEditor, type AddonEditorParent } from './addonEditorRoute';

const LazyEditor = lazy(() => import('./AddonOrderEditor').then((module) => ({ default: module.AddonOrderEditor })));

/**
 * ── DIE STELLE, AN DER DER NACHTRAG ERFASST WIRD ─────────────────────────────
 *
 * Vorgabe Samet (05.09.2026): «Alles innerhalb dieses Rechtecks — keine eigene
 * Seite.» Diese Hülle steht darum IN der Fläche, die die Erfassung anbietet
 * (Zusatzauftrags-Bereich des Projekts, Registerkarte des Auftrags,
 * Nachtragsliste): ist der Vermerk in der Adresse gesetzt, zeigt sie die
 * Erfassung, sonst ihren gewohnten Inhalt. Der Rahmen ringsum — Projektkopf,
 * Reiter, Liste — bleibt stehen.
 *
 * Vorher hing dieselbe Entscheidung am `<Outlet/>` des Rahmens und tauschte die
 * GANZE Seite aus; das war die «eigene Seite», die nicht sein soll.
 */
export const AddonEditorSlot = ({ parent, onSaved, children }: {
    /** Hauptauftrag dieser Fläche — sie gibt ihn der Maske mit. */
    parent?: AddonEditorParent | null;
    /** Nach dem Speichern: die Fläche lädt ihre Zahlen neu. */
    onSaved?: () => void | Promise<void>;
    children: ReactNode;
}) => {
    const editor = useAddonEditor();
    const permissions = useAuthStore((state) => state.permissions);

    if (!editor.open) return <>{children}</>;
    if (!permissions.includes('projects.createAddonOrder')) {
        return <p className="ofi-inv-note is-warn">{t('auto.ek_siparis_olusturma_yetkiniz_yok')}</p>;
    }

    // Auch das Nachladen der Maske selbst zeigt denselben Kranz — sonst spränge
    // die Fläche zwischen zwei verschiedenen Ladebildern.
    return (
        <Suspense fallback={<DotRingPanel />}>
            <LazyEditor
                // Ein anderer Nachtrag ist eine andere Erfassung: der Schlüssel
                // baut sie neu auf, statt Felder des vorigen stehen zu lassen.
                key={editor.addonId || 'new'}
                addonId={editor.addonId}
                parent={editor.parent ?? parent ?? null}
                returnTo={editor.returnTo}
                onClose={editor.close}
                onSaved={onSaved}
            />
        </Suspense>
    );
};
