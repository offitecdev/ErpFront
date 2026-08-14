import { memo } from 'react';

import { Mail01, MarkerPin01, Phone } from '@/components/icons/antIconCompat';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

/**
 * Adresse UND Kontakt als ERSTE Zeile der Übersicht (Benutzerwunsch).
 *
 * SPALTEN OHNE SPALTENKÖPFE (Benutzerwunsch 2026-08-07, ersetzt die frühere
 * Aufteilung Strasse · PLZ/Ort · Telefon): drei Angaben nebeneinander —
 * ADRESSE (Strasse UND PLZ/Ort zusammen) · Telefon · E-Mail. Jede Zelle trägt
 * nur ihr Symbol, keine Kopfzeile und keine Beschriftung darüber. Auf schmalen
 * Schirmen stapeln die Spalten.
 *
 * Die Adresse kommt aus dem Angebot (Montageadresse); fehlt sie dort, wird die
 * Kundenadresse gezeigt. Ihre Zeilen werden mit Komma zu EINER Zelle
 * zusammengezogen, damit die Zeile flach bleibt. Leere Angaben fallen weg, das
 * Raster zählt nur, was da ist.
 */
export const ProjectAddressLine = memo(({ project, order }: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
}) => {
    const raw = (
        order?.tender?.installationAddress
        || project.tender?.installationAddress
        || project.customer?.address
        || ''
    ).trim();
    const addressLines = raw.split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
    // Some imported customer records carry the next source-column label at the
    // end of the phone value (for example "+41 ... E-Mail:"). It is not part of
    // the phone number; the actual address is rendered in its own cell below.
    const phone = (project.customer?.mainPhone || '').replace(/\s*e-?mail\s*:?\s*$/i, '').trim();
    const email = (project.customer?.mainEmail || '').trim();

    const columns: Array<{ key: string; icon: 'pin' | 'phone' | 'mail'; text: string; href?: string }> = [];
    if (addressLines.length) columns.push({ key: 'address', icon: 'pin', text: addressLines.join(', ') });
    if (phone) columns.push({ key: 'phone', icon: 'phone', text: phone, href: `tel:${phone.replace(/\s+/g, '')}` });
    if (email) columns.push({ key: 'mail', icon: 'mail', text: email, href: `mailto:${email}` });
    if (!columns.length) return null;

    const iconClass = 'mt-px shrink-0 text-slate-400 dark:text-white/50';
    const textClass = 'min-w-0 truncate text-[13px] font-medium text-slate-800 dark:text-white/90';

    return (
        <div
            className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:divide-x sm:divide-y-0 dark:divide-white/10 dark:border-white/15 dark:bg-white/5 dark:shadow-none"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
            {columns.map((column) => (
                <div key={column.key} className="flex min-w-0 items-center gap-2 px-4 py-2.5">
                    {column.icon === 'pin' && <MarkerPin01 size={14} className={iconClass} />}
                    {column.icon === 'phone' && <Phone size={13} className={iconClass} />}
                    {column.icon === 'mail' && <Mail01 size={13} className={iconClass} />}
                    {column.href ? (
                        <a href={column.href} className={`${textClass} transition-colors hover:text-[#272f67] dark:hover:text-white`} title={column.text}>
                            {column.text}
                        </a>
                    ) : (
                        <span className={textClass} title={column.text}>{column.text}</span>
                    )}
                </div>
            ))}
        </div>
    );
});
