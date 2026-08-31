import { memo } from 'react';

import { Mail01, MarkerPin01, Phone } from '@/components/icons/antIconCompat';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

/**
 * Adresse UND Kontakt als ERSTE Zeile der Übersicht (Benutzerwunsch).
 *
 * ANGABEN OHNE SPALTENKÖPFE (Benutzerwunsch 2026-08-07, ersetzt die frühere
 * Aufteilung Strasse · PLZ/Ort · Telefon): drei Angaben nebeneinander —
 * ADRESSE (Strasse UND PLZ/Ort zusammen) · Telefon · E-Mail. Jede trägt nur
 * ihr Symbol, keine Kopfzeile und keine Beschriftung darüber.
 *
 * OHNE RAHMEN seit 19.08.2026: die Zeile steht als ruhige Angabe direkt auf der
 * weissen Fläche, ein Kasten um drei zusammengehörende Werte wäre der dritte
 * Rahmen über den Karten. Reicht die Breite nicht, rückt die nächste Angabe
 * eine Zeile tiefer (`.ofi-prj-contact` in index.css) — es rollt nichts.
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

    return (
        <div className="ofi-prj-contact">
            {columns.map((column) => (
                <div key={column.key} className="ofi-prj-contact__cell">
                    {column.icon === 'pin' && <MarkerPin01 size={14} className="ofi-prj-contact__icon" />}
                    {column.icon === 'phone' && <Phone size={13} className="ofi-prj-contact__icon" />}
                    {column.icon === 'mail' && <Mail01 size={13} className="ofi-prj-contact__icon" />}
                    {column.href ? (
                        <a href={column.href} className="ofi-prj-contact__text" title={column.text}>
                            {column.text}
                        </a>
                    ) : (
                        <span className="ofi-prj-contact__text" title={column.text}>{column.text}</span>
                    )}
                </div>
            ))}
        </div>
    );
});
