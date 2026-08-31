import { useSearchParams } from 'react-router-dom';

import { t } from '@/i18n/translate';
import { SalesRemindersSection } from './sections/SalesRemindersSection';
import { InventoryUnitsSection } from './sections/InventoryUnitsSection';

/**
 * MODULEINSTELLUNGEN — LINKS die Module, OBEN ihre Einstellungsarten.
 *
 * Die linke Liste (CRM, Verkauf, Projekte, Lager, Personal, Kalender) STEHT
 * IMMER; sie ändert sich nie. Das Reiterband darüber gehört dem gewählten
 * Modul und wechselt mit ihm: Verkauf führt «Erinnerungen», Lager führt
 * «Einheiten» (Benutzervorgabe 19.08.2026). Ein Modul ohne Einstellungen zeigt
 * gar keine Reiter, sondern den leeren Hinweis — dort gibt es schlicht nichts.
 *
 * GESTALTUNG (Benutzerwunsch 19.08.2026: "näher an Googles Gestaltung, sauber
 * und viel moderner, wie der Projektkalender"): die Seite trägt die
 * `.ofi-mset-*`-Lage, die AUSSCHLIESSLICH aus den `--ofi-cal-*`-Tokens malt —
 * weisse Fläche, graue Haarlinien, ruhiges Grau, das Markenblau als einziger
 * Akzent. Reiter sind Googles Unterstrich, keine Kästen; die Module sind
 * Pillen. Der Dunkelmodus ist derselbe Variablentausch, keine zweite Kopie.
 *
 * Modul und Art stehen in der Adresse (?module=&category=), damit ein Link
 * direkt landet.
 */

type CategoryKey = 'reminders' | 'units';
type ModuleKey = 'crm' | 'sales' | 'projects' | 'inventory' | 'personnel' | 'calendar';

const CATEGORY_LABELS: Record<CategoryKey, string> = {
    reminders: 'settings.modules.catReminders',
    units: 'settings.modules.catUnits',
};

/**
 * Die linke Liste — unveränderlich. Jedes Modul bringt die Einstellungsarten
 * mit, die ES kennt; eine leere Liste heisst: hier gibt es (noch) nichts.
 */
const MODULES: ReadonlyArray<{ key: ModuleKey; labelKey: string; categories: ReadonlyArray<CategoryKey> }> = [
    { key: 'crm', labelKey: 'nav.crm', categories: [] },
    { key: 'sales', labelKey: 'nav.sales', categories: ['reminders'] },
    { key: 'projects', labelKey: 'nav.projects', categories: [] },
    { key: 'inventory', labelKey: 'nav.inventory', categories: ['units'] },
    { key: 'personnel', labelKey: 'nav.personnel', categories: [] },
    { key: 'calendar', labelKey: 'nav.calendar', categories: [] },
];

const moduleEntry = (key: ModuleKey) => MODULES.find((entry) => entry.key === key)!;
const isModule = (value: string | null): value is ModuleKey => MODULES.some((entry) => entry.key === value);

/** Das Modul, auf dem die Seite ohne Angabe aufschlägt — das erste mit Inhalt. */
const FIRST_MODULE: ModuleKey = MODULES.find((entry) => entry.categories.length)?.key ?? 'crm';

export const ModuleSettingsPage = () => {
    const [params, setParams] = useSearchParams();
    const module: ModuleKey = isModule(params.get('module')) ? (params.get('module') as ModuleKey) : FIRST_MODULE;

    const categories = moduleEntry(module).categories;
    const rawCategory = params.get('category');
    // Die Art muss zum Modul gehören: eine fremde (oder gar keine) Angabe
    // landet auf dem ersten Reiter des Moduls.
    const category: CategoryKey | null = categories.find((key) => key === rawCategory) ?? categories[0] ?? null;

    const select = (next: { module?: ModuleKey; category?: CategoryKey }) => {
        const nextModule = next.module ?? module;
        const nextCategories = moduleEntry(nextModule).categories;
        // Beim Modulwechsel schlägt das Reiterband auf seinem ersten Reiter auf.
        const nextCategory = next.category
            ?? (nextModule === module ? category : null)
            ?? nextCategories[0]
            ?? null;

        const search = new URLSearchParams(params);
        search.set('module', nextModule);
        if (nextCategory) search.set('category', nextCategory);
        else search.delete('category');
        setParams(search, { replace: true });
    };

    const moduleLabel = t(moduleEntry(module).labelKey);

    return (
        <div className="ofi-mset-page ofi-rise">
            <header className="ofi-mset-head">
                <h1 className="ofi-mset-head__title">{t('settings.modules.title')}</h1>
            </header>

            <div className="ofi-mset-body">
                {/* Links: die Module — diese Liste steht immer, sie wechselt nie. */}
                <nav aria-label={t('settings.modules.modulesLabel')} className="ofi-mset-rail">
                    {MODULES.map(({ key, labelKey, categories: own }) => {
                        const active = key === module;
                        return (
                            <button
                                key={key}
                                type="button"
                                aria-current={active ? 'page' : undefined}
                                onClick={() => select({ module: key })}
                                className={`ofi-mset-railrow ${active ? 'is-active' : ''}`}
                            >
                                <span className="ofi-mset-railrow__name">{t(labelKey)}</span>
                                {/* Der Punkt sagt: dieses Modul hat etwas einzustellen. */}
                                {own.length > 0 && <span aria-hidden className="ofi-mset-railrow__dot" />}
                            </button>
                        );
                    })}
                </nav>

                {/* Rechts: oben die Arten DIESES Moduls, darunter der Inhalt. */}
                <section aria-label={moduleLabel} className="ofi-mset-main">
                    {categories.length > 0 && (
                        <nav aria-label={t('settings.modules.categoriesLabel')} className="ofi-mset-tabs">
                            {categories.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    aria-current={key === category ? 'page' : undefined}
                                    onClick={() => select({ category: key })}
                                    className={`ofi-mset-tab ${key === category ? 'is-active' : ''}`}
                                >
                                    {t(CATEGORY_LABELS[key])}
                                </button>
                            ))}
                        </nav>
                    )}

                    {category === 'units' && <InventoryUnitsSection />}
                    {category === 'reminders' && <SalesRemindersSection />}
                    {!category && (
                        <div className="ofi-mset-card">
                            <p className="ofi-mset-empty">{t('settings.modules.nothingHere')}</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
