import { useSearchParams } from 'react-router-dom';

import { t } from '@/i18n/translate';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { ProductResetSection } from './sections/ProductResetSection';
import { ProductUploadSection } from './sections/ProductUploadSection';

/**
 * Upload (Einstellungen) — LINKS die Module als schlichte Liste, RECHTS die
 * Uploadfläche des gewählten Moduls. Derselbe Aufbau wie die
 * Moduleinstellungen daneben, damit die beiden Einstellungsflächen sich nicht
 * gegenseitig widersprechen.
 *
 * Inhalt gibt es VORERST NUR für Produkte; die übrigen Module stehen schon in
 * der Liste (Kunden, Lieferanten, Personal) und zeigen den leeren Hinweis —
 * so ist die Fläche von Anfang an als Sammelstelle lesbar und ein weiteres
 * Modul ist später ein Eintrag plus ein Abschnitt, kein Umbau.
 *
 * UNTER den Uploadflächen steht abgesetzt die LÖSCHFLÄCHE (Vorgabe 17.08.2026):
 * "Produktliste zurücksetzen" ist kein Schritt eines Uploads und hängt deshalb
 * nicht als Fussnote darunter, sondern ist ein eigener Eintrag.
 *
 * Der Eintrag steht in der Adresse (?module=), damit ein Link direkt landet.
 *
 * Die ganze Seite hängt hinter der IT-Schleuse — das entscheidet die Route
 * (appPageRoutes), nicht diese Datei. Damit gilt das IT-Kennwort für alles
 * hier, Löschfläche eingeschlossen, und zwar für die ganze Sitzung.
 */

type ModuleKey = 'products' | 'customers' | 'suppliers' | 'personnel' | 'reset';

const MODULES: ReadonlyArray<{ key: ModuleKey; labelKey: string }> = [
    { key: 'products', labelKey: 'upload.modules.products' },
    { key: 'customers', labelKey: 'upload.modules.customers' },
    { key: 'suppliers', labelKey: 'upload.modules.suppliers' },
    { key: 'personnel', labelKey: 'upload.modules.personnel' },
];

/** Zweite Gruppe: löschen statt hochladen — bewusst abgesetzt und rot. */
const TOOLS: ReadonlyArray<{ key: ModuleKey; labelKey: string }> = [
    { key: 'reset', labelKey: 'upload.modules.reset' },
];

/** Welche Module heute eine Uploadfläche haben — alles andere ist der Hinweis. */
const HAS_CONTENT: ReadonlySet<ModuleKey> = new Set<ModuleKey>(['products']);

const isModule = (value: string | null): value is ModuleKey =>
    [...MODULES, ...TOOLS].some((entry) => entry.key === value);

export const UploadSettingsPage = () => {
    useLanguageTick();
    const [params, setParams] = useSearchParams();
    const rawModule = params.get('module');
    const module: ModuleKey = isModule(rawModule) ? rawModule : 'products';

    const select = (next: ModuleKey) => {
        const search = new URLSearchParams(params);
        search.set('module', next);
        setParams(search, { replace: true });
    };

    return (
        <div className="flex w-full flex-col gap-3">
            <InventoryListHeader title={t('upload.title')} />

            <div className="grid min-w-0 gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
                {/* Links: die Module — eine schlichte Liste, kein Schmuck. */}
                <nav aria-label={t('upload.modulesLabel')} className="md:pt-1">
                    <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                        {MODULES.map(({ key, labelKey }) => {
                            const active = key === module;
                            const uploadable = HAS_CONTENT.has(key);
                            return (
                                <li key={key} className="shrink-0">
                                    <button
                                        type="button"
                                        aria-current={active ? 'page' : undefined}
                                        onClick={() => select(key)}
                                        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${active
                                            ? 'bg-[#eef2fb] font-bold text-[#1f2654] dark:bg-white/10 dark:text-white'
                                            : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white'}`}
                                    >
                                        <span className="truncate">{t(labelKey)}</span>
                                        {/* Kleiner Punkt: hier lässt sich etwas hochladen. */}
                                        {uploadable && (
                                            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[#1f2654] dark:bg-white/70" />
                                        )}
                                    </button>
                                </li>
                            );
                        })}

                        {/* Trennlinie: was darunter steht, LÖSCHT. */}
                        <li aria-hidden className="mx-1 my-1.5 hidden border-t border-slate-200 md:block dark:border-white/10" />

                        {TOOLS.map(({ key, labelKey }) => {
                            const active = key === module;
                            return (
                                <li key={key} className="shrink-0">
                                    <button
                                        type="button"
                                        aria-current={active ? 'page' : undefined}
                                        onClick={() => select(key)}
                                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${active
                                            ? 'bg-red-50 font-bold text-red-700 dark:bg-red-500/15 dark:text-red-200'
                                            : 'font-medium text-red-600/90 hover:bg-red-50/70 hover:text-red-700 dark:text-red-300/80 dark:hover:bg-red-500/10 dark:hover:text-red-200'}`}
                                    >
                                        <span className="truncate">{t(labelKey)}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Rechts: die Uploadfläche des gewählten Moduls. */}
                <section
                    aria-label={t([...MODULES, ...TOOLS].find((entry) => entry.key === module)?.labelKey ?? '')}
                    className="min-w-0 rounded-xl border border-slate-200/70 bg-white p-4 shadow-xs md:p-6 dark:border-white/10 dark:bg-slate-900"
                >
                    {module === 'products' ? (
                        <ProductUploadSection />
                    ) : module === 'reset' ? (
                        <ProductResetSection />
                    ) : (
                        <p className="py-8 text-center text-[13px] text-slate-400 dark:text-white/40">
                            {t('upload.nothingHere')}
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
};
