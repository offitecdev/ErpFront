import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { InfoCircle, Trash01 } from '@/components/icons/antIconCompat';
import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';

/**
 * ── PRODUKTLISTE ZURÜCKSETZEN ────────────────────────────────────────────────
 *
 * Eine LÖSCHFLÄCHE, kein Teil des Uploads (Vorgabe 17.08.2026): sie steht als
 * eigener Eintrag neben den Uploadflächen, damit "alles weg" nicht als Fussnote
 * unter einem Einlesevorgang hängt.
 *
 * Die Schranke ist das IT-KENNWORT und sonst nichts. Es wird beim Betreten
 * dieser Seite einmal verlangt und gilt danach für die ganze Sitzung (der
 * Ausweis der Schleuse liegt im sessionStorage und reist bei jedem Aufruf mit) —
 * das persönliche Kennwort, das eine Löschung IN der Produktliste verlangt,
 * wird hier ausdrücklich nicht gefragt. Zum Auslösen genügt der abgetippte Satz.
 *
 * Gelöscht wird in den PAPIERKORB, wie bei jeder einzelnen Karte auch:
 * Bestandshistorie und Verweise bleiben stehen. Betroffen ist ausschliesslich
 * die Firma, die oben gewählt ist — deshalb steht ihr Name im Fenster.
 */
export const ProductResetSection = () => {
    const tenantName = useAuthStore((state) => {
        const tenant = state.tenants.find((entry) => entry.id === state.selectedTenantId);
        return tenant?.tenantName ?? '';
    });

    const [productCount, setProductCount] = useState<number | null>(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    // Wie viele Karten stehen gerade drin? Eine Seite mit einer Zeile genügt —
    // gebraucht wird nur die Gesamtzahl, und sie macht die Schaltfläche konkret.
    const loadCount = () => {
        inventoryApi
            .articlesSummaryPaged({ page: 1, pageSize: 1 })
            .then((page) => setProductCount(page.total))
            .catch(() => setProductCount(null));
    };
    useEffect(loadCount, []);

    const run = async () => {
        setBusy(true);
        try {
            const { deleted } = await inventoryApi.purgeArticles();
            toast.success(t('upload.reset.done', { count: deleted }));
            setOpen(false);
            setProductCount(0);
            loadCount();
        } catch (error: any) {
            // Abgelaufene Schleuse ist der einzige Fehler mit eigener Ansage:
            // dann muss das IT-Kennwort erneut eingegeben werden.
            toast.error(error?.response?.status === 403
                ? t('upload.gateExpired')
                : (error?.response?.data?.error || t('upload.reset.failed')));
            setOpen(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-[12.5px] text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-100">
                <InfoCircle size={15} className="mt-px shrink-0" />
                <span>{t('upload.reset.itNote')}</span>
            </div>

            <section>
                <h3 className="mb-2.5 text-[12.5px] font-semibold text-slate-800 dark:text-white">
                    {t('upload.reset.title')}
                </h3>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50/60 px-3.5 py-3 dark:border-red-400/25 dark:bg-red-500/10">
                    <div className="min-w-0">
                        <p className="text-[12.5px] leading-relaxed text-red-900 dark:text-red-100">
                            {t('upload.reset.description')}
                        </p>
                        <p className="mt-1 text-[11.5px] text-red-700/80 dark:text-red-200/70">
                            {productCount == null
                                ? tenantName
                                : `${tenantName} · ${t('upload.reset.count', { count: productCount })}`}
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={productCount === 0}
                        onClick={() => setOpen(true)}
                        className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Trash01 size={14} />
                        {t('upload.reset.button')}
                    </button>
                </div>
                {productCount === 0 && (
                    <p className="mt-2 text-[11.5px] text-slate-500 dark:text-white/60">{t('upload.reset.empty')}</p>
                )}
            </section>

            <DangerConfirmDialog
                open={open}
                title={t('upload.reset.title')}
                message={t('upload.reset.confirmText', { count: productCount ?? 0, tenant: tenantName })}
                confirmLabel={t('upload.reset.button')}
                busy={busy}
                // Kein Kennwortfeld: der abgetippte Satz löst unmittelbar aus.
                requirePassword={false}
                confirmPhrase={t('upload.reset.phrase')}
                onCancel={() => { if (!busy) setOpen(false); }}
                onConfirm={() => void run()}
            />
        </div>
    );
};
