import { LuArrowUpRight, LuCheck, LuPaperclip } from 'react-icons/lu';

import { SkeletonBar } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import type { MailCategoryDto, MailMessageRow } from '@/lib/api/mail';
import { avatarColor, counterpartOf, initialOf, partyLabel, shortDate, type MailFolderKey } from './mailShared';

/* Die Nachrichtenliste — eine Zeile je Mail wie in der Referenz: Initiale in
   Farbe, Absender (fett = ungelesen), Betreff – Vorschau, rechts Uhrzeit/Datum;
   darunter Kategorie- und Kunden-Chip. Kein Tabellenraster: Hairlines zwischen
   den Zeilen, Auswahl als Tönung.

   ZIEHEN (08.09.2026): jede Zeile lässt sich auf eine Kategorie in der Leiste
   fallen (Datentyp `application/x-ofi-mail`) — bei «Anfragen» entsteht dabei
   eine Anfrage (MailPage → Server).

   WARUM DIE ZEILE KEIN `<button>` IST: ein Formularsteuerelement beginnt trotz
   `draggable` in mehreren Browsern (Firefox seit je, WebKit je nach Fassung)
   gar kein Ziehen — der Zug endete dann stumm, und «hineinziehen» war schlicht
   nicht möglich. Ein `div` mit `role="button"` zieht überall; Tastatur
   (Enter/Leertaste) und Vorlesen bleiben durch Rolle und `tabIndex` erhalten.
   Neben dem eigenen Datentyp wandert die Kennung zusätzlich als `text/plain`
   mit: manche Browser starten einen Zug erst, wenn ein Standardtyp anliegt.

   SAMMELMODUS: solange eine Kategorie «sammelt», schaltet der Klick auf eine
   Zeile die Zuordnung um statt zu öffnen — zugeordnete Zeilen tragen den Rand
   in der Farbe der Kategorie, bis «Hinzufügen abschliessen» gedrückt wird. */

const MAIL_DRAG_TYPE = 'application/x-ofi-mail';

const Row = ({
    row,
    active,
    assignCategory,
    onSelect,
    onToggleAssign,
}: {
    row: MailMessageRow;
    active: boolean;
    assignCategory: MailCategoryDto | null;
    onSelect: (id: string) => void;
    onToggleAssign: (row: MailMessageRow) => void;
}) => {
    const party = counterpartOf(row);
    const label = partyLabel(party) || t('mail.page.unknownSender');
    const unread = !row.isRead && row.direction === 'IN';
    const inAssignCategory = Boolean(assignCategory && row.category?.id === assignCategory.id);
    const open = () => (assignCategory ? onToggleAssign(row) : onSelect(row.id));
    return (
        <div
            role="button"
            tabIndex={0}
            aria-pressed={assignCategory ? inAssignCategory : undefined}
            className={`ofi-mail-row ${active ? 'is-active' : ''} ${unread ? 'is-unread' : ''} ${assignCategory ? 'is-picking' : ''} ${inAssignCategory ? 'is-assigned' : ''}`}
            style={inAssignCategory && assignCategory ? { ['--ofi-cat-color' as string]: assignCategory.color } : undefined}
            draggable={!assignCategory}
            onDragStart={(event) => {
                event.dataTransfer.setData(MAIL_DRAG_TYPE, row.id);
                event.dataTransfer.setData('text/plain', row.subject || label);
                event.dataTransfer.effectAllowed = 'move';
            }}
            onClick={open}
            onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open();
            }}
        >
            <span className="ofi-mail-row__avatar" style={{ background: avatarColor(party.address || label) }}>
                {inAssignCategory ? <LuCheck size={14} /> : row.direction === 'OUT' ? <LuArrowUpRight size={14} /> : initialOf(label)}
            </span>
            <span className="ofi-mail-row__main">
                <span className="ofi-mail-row__top">
                    <span className="ofi-mail-row__from" title={party.address}>
                        {row.direction === 'OUT' && <span className="ofi-mail-row__dir">{t('mail.page.toPrefix')}</span>}
                        {label}
                    </span>
                    <span className="ofi-mail-row__meta">
                        {row.hasAttachments && <LuPaperclip size={12} className="ofi-mail-row__clip" />}
                        <span className="ofi-mail-row__date">{shortDate(row.sentAt)}</span>
                    </span>
                </span>
                <span className="ofi-mail-row__subject" title={row.subject || ''}>
                    <span className="ofi-mail-row__subject-text">{row.subject || t('mail.page.noSubject')}</span>
                    {row.bodyPreview && <span className="ofi-mail-row__preview"> – {row.bodyPreview}</span>}
                </span>
                <span className="ofi-mail-row__tags">
                    {row.category && (
                        <span className="ofi-mail-tag is-category" style={{ ['--ofi-cat-color' as string]: row.category.color }} title={row.category.name}>
                            <span className="ofi-mail-tag__catdot" style={{ background: row.category.color }} />
                            {row.category.name}
                        </span>
                    )}
                    {row.customer ? (
                        <span className={`ofi-mail-tag is-customer ${row.matchSource === 'MANUAL' ? 'is-manual' : ''}`} title={row.customer.companyName}>
                            {row.customer.companyName}
                            {row.contact && <span className="ofi-mail-tag__sub"> · {row.contact.firstName} {row.contact.lastName}</span>}
                        </span>
                    ) : row.matchSource === 'AUTO_EMPLOYEE' ? (
                        <span className="ofi-mail-tag is-internal">
                            {row.owner ? `${row.owner.firstName} ${row.owner.lastName}` : t('mail.page.internal')}
                        </span>
                    ) : row.matchSource === 'CALENDAR' ? (
                        /* Die automatische Termin- bzw. Besprechungsmeldung ans
                           eigene Team: sie trägt keinen Kunden, ist aber sehr
                           wohl zugeordnet — «nicht zugeordnet» wäre gelogen. */
                        <span className="ofi-mail-tag is-internal">{t('mail.page.calendarTag')}</span>
                    ) : null}
                    {row.entity?.label && <span className="ofi-mail-tag is-entity">{row.entity.label}</span>}
                    {row.origin === 'ERP' && <span className="ofi-mail-tag is-erp">ERP</span>}
                </span>
            </span>
        </div>
    );
};

export const MailList = ({
    rows,
    loading,
    folder,
    selectedId,
    connected,
    configured,
    assignCategory,
    onSelect,
    onToggleAssign,
}: {
    rows: MailMessageRow[];
    loading: boolean;
    folder: MailFolderKey | 'category';
    selectedId: string | null;
    connected: boolean;
    configured: boolean;
    /** Die Kategorie im SAMMELMODUS — null = gewöhnliche Liste. */
    assignCategory: MailCategoryDto | null;
    onSelect: (id: string) => void;
    onToggleAssign: (row: MailMessageRow) => void;
}) => (
    <div className="ofi-mail-list">
        {loading && rows.length === 0 ? (
            <div className="ofi-mail-list__skeleton">
                {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="ofi-mail-row is-skeleton">
                        <span className="ofi-mail-row__avatar is-skeleton" />
                        <span className="ofi-mail-row__main">
                            <SkeletonBar width="40%" />
                            <SkeletonBar width="85%" />
                        </span>
                    </div>
                ))}
            </div>
        ) : rows.length === 0 ? (
            <div className="ofi-mail-empty">
                {!connected && folder === 'inbox' ? (
                    <>
                        <div className="ofi-mail-empty__title">{t('mail.page.emptyNotConnectedTitle')}</div>
                        <p className="ofi-mail-empty__text">{configured ? t('mail.page.emptyCaptureOff') : t('mail.page.emptyNotConnectedText')}</p>
                    </>
                ) : (
                    <>
                        <div className="ofi-mail-empty__title">{t(`mail.page.empty_${folder}`)}</div>
                        <p className="ofi-mail-empty__text">{t('mail.page.emptyHint')}</p>
                    </>
                )}
            </div>
        ) : (
            <div className={`ofi-mail-list__rows ${loading ? 'is-loading' : ''}`}>
                {rows.map((row) => (
                    <Row
                        key={row.id}
                        row={row}
                        active={row.id === selectedId}
                        assignCategory={assignCategory}
                        onSelect={onSelect}
                        onToggleAssign={onToggleAssign}
                    />
                ))}
            </div>
        )}
    </div>
);
