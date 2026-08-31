import { Outlet } from 'react-router-dom';

import { AlertTriangle } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';

/**
 * Montage shell INSIDE the panel: the app header comes from MainLayout (which
 * also hides the sidebar on /montage paths), so this wrapper only constrains
 * the content width. The former standalone technician header/bottom bar are
 * intentionally gone.
 *
 * ── Rolle ohne jedes Recht ───────────────────────────────────────────────────
 * `canOpenMontage` (lib/access.ts) lässt eine Rolle herein, die GAR NICHTS
 * vergibt: die Person heisst nach einem Monteur, also gehört sie hierher, und
 * die Schranke griffe ohnehin ins Leere. Bisher öffnete sich dann der rote
 * Arbeitsplatz und JEDE Abfrage lief in ein 403 — die Monteurin las als
 * Erklärung eine Aufzählung von Rechtenamen aus dem Server ("... projects.view,
 * projects.report, maintenance.tasks.manage"), die ihr nichts sagt und in ihrer
 * Sprache gar nicht steht.
 *
 * Darum hier EINE Schranke vor dem ganzen Arbeitsplatz: keine Rechte heisst
 * keine Abfragen, sondern ein Satz, der sagt, was fehlt und wer es setzt. Die
 * eigentliche Schranke bleibt der Server; das hier ist die Erklärung.
 */
export const MontageLayout = () => {
    // `user` und `permissions` schreibt der Profilabruf GEMEINSAM (authStore),
    // darum ist eine leere Rechteliste bei vorhandenem Konto keine Ladephase,
    // sondern die Aussage «diese Rolle vergibt nichts».
    const isLoading = useAuthStore((state) => state.isLoading);
    const userId = useAuthStore((state) => state.user?.id);
    const permissions = useAuthStore((state) => state.permissions);
    const roleGrantsNothing = !isLoading && Boolean(userId) && permissions.length === 0;

    return (
        <div className="mx-auto h-full min-h-0 w-full max-w-[1280px]">
            {roleGrantsNothing ? (
                <section className="mx-auto mt-6 max-w-[560px] rounded-[3px] border border-slate-300 bg-white px-6 py-8 text-center dark:border-white/15 dark:bg-[#17191c]">
                    <span className="mx-auto grid size-11 place-items-center rounded-[3px] bg-[#d30f15] text-white dark:bg-amber-500">
                        <AlertTriangle size={22} />
                    </span>
                    <h2 className="mt-4 text-[16px] font-semibold text-slate-800 dark:text-slate-100">
                        {t('montage.noAccess.title')}
                    </h2>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                        {t('montage.noAccess.body')}
                    </p>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {t('montage.noAccess.hint')}
                    </p>
                </section>
            ) : (
                <Outlet />
            )}
        </div>
    );
};
