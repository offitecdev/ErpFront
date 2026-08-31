import { Camera01 } from '@/components/icons/antIconCompat';

import { LoginWave } from '@/components/login/LoginWave';
import { t } from '@/i18n/translate';
import type { PersonHeader } from '../types/personnel';
import { fullName } from '../utils/format';
import { Chip } from '../components/primitives';

/**
 * ── DER KOPF DER PERSONENSEITE ───────────────────────────────────────────────
 *
 * Die Anmeldewelle, zweimal: OBEN als Kopfband (gespiegelt, hoch genug, um als
 * Welle gelesen zu werden — nicht als Streifen) und unten aufrecht. Dazwischen
 * die Bildfläche — Foto oder Initialen — mit Namen, Personalnummer und Rolle;
 * ganz unten das Reiterband (Vorgabe 17.08.2026).
 *
 * Die Wellen sind zwei EIGENE Instanzen von `LoginWave`, keine gedrehte Kopie
 * derselben: das Bauteil vergibt seinem Farbverlauf je Instanz eine eigene id,
 * zwei gleiche ids im Dokument wären ungültig.
 *
 * Auf der Bildfläche sitzt der Knopf für das Profilbild — aber nur, wenn diese
 * Person es auch ändern darf; sonst wäre es ein Versprechen, das der Server
 * gleich wieder zurücknimmt.
 */

export interface PersonTab {
    key: string;
    label: string;
    badge?: number;
}

export const PersonHero = ({
    person,
    tabs,
    activeKey,
    onTab,
    canEditPhoto = false,
    onEditPhoto,
}: {
    person: PersonHeader;
    tabs: PersonTab[];
    activeKey: string;
    onTab: (key: string) => void;
    canEditPhoto?: boolean;
    onEditPhoto?: () => void;
}) => {
    const name = fullName(person) || person.email;
    const initials = `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase();
    const photoLabel = person.profilePictureUrl
        ? t('personnel.person.photoChange')
        : t('personnel.person.photoAdd');

    const avatar = (
        <>
            {person.profilePictureUrl
                ? <img src={person.profilePictureUrl} alt={name} />
                : <span>{initials}</span>}
        </>
    );

    return (
        <section className="ofi-person-hero">
            <LoginWave className="ofi-person-hero__wave ofi-person-hero__wave--top" />

            <div className="ofi-person-hero__body">
                {canEditPhoto ? (
                    <button
                        type="button"
                        onClick={onEditPhoto}
                        title={photoLabel}
                        aria-label={photoLabel}
                        // `rounded-full` MUSS mit: index.css zwingt jedem Knopf
                        // ohne diese Klasse den eckigen Knopfradius auf (!important)
                        // — der Kreis wäre sonst ein Quadrat mit runden Ecken.
                        className="ofi-person-hero__avatar ofi-person-hero__avatar--editable rounded-full"
                    >
                        {avatar}
                        <span className="ofi-person-hero__avatar-veil">
                            <Camera01 size={18} />
                        </span>
                        <span className="ofi-person-hero__avatar-badge" aria-hidden>
                            <Camera01 size={13} />
                        </span>
                    </button>
                ) : (
                    <div className="ofi-person-hero__avatar">{avatar}</div>
                )}

                <div className="min-w-0 flex-1">
                    <h1 className="ofi-serif truncate text-[19px] font-bold text-slate-900 dark:text-white">{name}</h1>
                    <p className="mt-0.5 truncate text-[12.5px] text-slate-500 dark:text-white/60">
                        {person.title || person.email}
                    </p>
                    {/* NUR die Rolle (Vorgabe 18.08.2026). Personalnummer,
                        Personalrolle und Arbeitsort standen hier als drei
                        weitere Merkzettel — sie sagten über die Person weniger
                        aus, als sie Platz brauchten, und drängten die Rolle,
                        auf die es ankommt, an den Rand. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {person.roleName && (
                            <Chip className="bg-[#272f67] text-white ring-[#272f67] dark:bg-[#e6cf9e] dark:text-[#140f05] dark:ring-[#e6cf9e]">
                                {person.roleName}
                            </Chip>
                        )}
                        {!person.isActive && (
                            <Chip className="bg-slate-100 text-slate-500 ring-slate-200 dark:bg-white/10 dark:text-white/50 dark:ring-white/15">
                                {t('personnel.list.inactive')}
                            </Chip>
                        )}
                    </div>
                </div>
            </div>

            <LoginWave className="ofi-person-hero__wave ofi-person-hero__wave--bottom" />

            <nav className="ofi-person-hero__tabs" aria-label={name}>
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        className="ofi-person-tab"
                        aria-current={tab.key === activeKey ? 'page' : undefined}
                        onClick={() => onTab(tab.key)}
                    >
                        {tab.label}
                        {Boolean(tab.badge) && <span className="ofi-person-tab__badge">{tab.badge}</span>}
                    </button>
                ))}
            </nav>
        </section>
    );
};
