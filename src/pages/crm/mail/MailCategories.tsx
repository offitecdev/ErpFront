import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    LuBuilding2, LuClipboardList, LuFileText, LuFolderOpen, LuInbox, LuPlus, LuReceipt, LuTrash2, LuUser, LuUserPlus,
} from 'react-icons/lu';

import { SearchLg } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { PopupCard, PopupDialog, PopupButton, PopupEmpty } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import {
    mailApiError, mailCategoriesApi,
    type MailCategoryDto, type MailCategoryKind, type MailCategoryOption,
} from '@/lib/api/mail';
import { categoryLabel } from './mailShared';

/* DIE KATEGORIEN-LEISTE (08.09.2026) — die persönliche Ordnung des Postfachs,
   links unter Posteingang/Postausgang/Papierkorb.

     +          Der RUNDE Knopf sitzt in der Überschrift, AUSSERHALB der Liste
                (Vorgabe 08.09.2026). Er öffnet die Wahl der Art — Personal,
                Kunde, Angebot, Auftrag, Projekt, Rechnung — und danach das
                Fenster (PopupCard, dasselbe Kleid wie im Kalender), in dem der
                Datensatz gesucht und angeklickt wird. Der Klick LEGT AN.
     Liste      rollt bei vielen Kategorien; die Reihenfolge wird mit der Maus
                gezogen (eine Zeile auf eine andere fallen lassen).
     Zeile      Farbpunkt, Name, Zahl. Beim Überfahren: Sammelmodus-Knopf
                (E-Mails per Klick hinzufügen) und Papierkorb. «Anfragen»
                (REQUESTS) ist fest eingebaut und hat keinen Papierkorb.
     Ziehen     Eine Nachricht aus der Liste auf eine Zeile fallen lassen
                ordnet sie zu (MailPage setzt den Datentyp `x-ofi-mail`).

   ACHTUNG beim Kleid: Art-Menü und Fenster hängen im PORTAL an
   `document.body` — Regeln dafür brauchen ihren `body > :not(#root)`-Zwilling. */

const MAIL_DRAG_TYPE = 'application/x-ofi-mail';
const CAT_DRAG_TYPE = 'application/x-ofi-cat';

const CATEGORY_KIND_LIST: MailCategoryKind[] = ['STAFF', 'CUSTOMER', 'TENDER', 'ORDER', 'PROJECT', 'INVOICE'];

const kindIcon = (kind: MailCategoryKind, size = 15) => {
    switch (kind) {
        case 'STAFF': return <LuUser size={size} />;
        case 'CUSTOMER': return <LuBuilding2 size={size} />;
        case 'TENDER': return <LuFileText size={size} />;
        case 'ORDER': return <LuClipboardList size={size} />;
        case 'PROJECT': return <LuFolderOpen size={size} />;
        case 'INVOICE': return <LuReceipt size={size} />;
        default: return <LuInbox size={size} />;
    }
};

/* ── Das Anlegen-Fenster: Datensatz der gewählten Art suchen und anklicken ── */

const CreatePopup = ({
    kind,
    onClose,
    onCreated,
}: {
    kind: MailCategoryKind;
    onClose: () => void;
    onCreated: (category: MailCategoryDto) => void;
}) => {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [options, setOptions] = useState<MailCategoryOption[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => setDebounced(search.trim()), 250);
        return () => window.clearTimeout(id);
    }, [search]);

    useEffect(() => {
        let cancelled = false;
        mailCategoriesApi.options(kind, debounced || undefined)
            .then((result) => { if (!cancelled) setOptions(result.options); })
            .catch(() => { if (!cancelled) setOptions([]); });
        return () => { cancelled = true; };
    }, [kind, debounced]);

    const pick = async (option: MailCategoryOption) => {
        setBusyId(option.id);
        try {
            const created = await mailCategoriesApi.create(kind, option.id);
            /* Kunde und Personal sammeln beim Anlegen die schon gespeicherte
               Post ein (der Server etikettiert rückwirkend) — die Zahl gehört
               in die Meldung, sonst wirkt die Zeile wie von Zauberhand gefüllt. */
            toast.success(created.count
                ? t('mail.categories.createdWithMails', { name: created.name, count: created.count })
                : t('mail.categories.created', { name: created.name }));
            onCreated(created);
            onClose();
        } catch (error: unknown) {
            const status = (error as { response?: { status?: number } } | null)?.response?.status;
            toast.error(status === 409 ? t('mail.categories.exists') : (mailApiError(error).message || t('mail.categories.createFailed')));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <PopupCard
            open
            onClose={onClose}
            title={t('mail.categories.pickTitle', { kind: t(`mail.categories.kind_${kind}`) })}
            width={420}
            closeOnEscape
        >
            <div className="ofi-mail-catpick">
                <label className="ofi-cal-search ofi-mail-catpick__search">
                    <SearchLg size={14} className="shrink-0 text-slate-400" />
                    <input
                        autoFocus
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('mail.categories.searchPlaceholder')}
                    />
                </label>
                <div className="ofi-mail-catpick__list">
                    {options === null && <PopupEmpty>{t('common.loading')}</PopupEmpty>}
                    {options !== null && options.length === 0 && <PopupEmpty>{t('mail.categories.empty')}</PopupEmpty>}
                    {options?.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className="ofi-option-row ofi-mail-catpick__row"
                            disabled={busyId !== null}
                            onClick={() => void pick(option)}
                        >
                            <span className="ofi-mail-catpick__icon">{kindIcon(kind, 14)}</span>
                            <span className="ofi-mail-catpick__main">
                                <span className="ofi-mail-catpick__label">{option.label}</span>
                                {option.sublabel && <span className="ofi-mail-catpick__sub">{option.sublabel}</span>}
                            </span>
                            {busyId === option.id && <span aria-hidden className="ofi-tp-spinner" />}
                        </button>
                    ))}
                </div>
            </div>
        </PopupCard>
    );
};

/* ── Die Leiste selbst ─────────────────────────────────────────────────── */

export const MailCategories = ({
    categories,
    activeId,
    assignCategoryId,
    onSelect,
    onReorder,
    onDropMail,
    onStartAssign,
    onCreated,
    onDeleted,
}: {
    categories: MailCategoryDto[];
    activeId: string | null;
    assignCategoryId: string | null;
    onSelect: (category: MailCategoryDto) => void;
    onReorder: (ids: string[]) => void;
    onDropMail: (categoryId: string, mailId: string) => void;
    onStartAssign: (category: MailCategoryDto) => void;
    onCreated: (category: MailCategoryDto) => void;
    onDeleted: (id: string) => void;
}) => {
    const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
    const [createKind, setCreateKind] = useState<MailCategoryKind | null>(null);
    const [pendingDelete, setPendingDelete] = useState<MailCategoryDto | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const draggedId = useRef<string | null>(null);

    const removeCategory = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await mailCategoriesApi.remove(pendingDelete.id);
            toast.success(t('mail.categories.deleted'));
            onDeleted(pendingDelete.id);
            setPendingDelete(null);
        } catch (error: unknown) {
            toast.error(mailApiError(error).message || t('mail.categories.deleteFailed'));
        } finally {
            setDeleting(false);
        }
    };

    /** Die gezogene Zeile VOR der Zielzeile einreihen. */
    const reorderTo = (targetId: string) => {
        const from = draggedId.current;
        draggedId.current = null;
        if (!from || from === targetId) return;
        const ids = categories.map((category) => category.id).filter((id) => id !== from);
        const at = ids.indexOf(targetId);
        ids.splice(at < 0 ? ids.length : at, 0, from);
        onReorder(ids);
    };

    return (
        <div className="ofi-mail-catsection">
            <div className="ofi-mail-catsection__head">
                <span className="ofi-mail-catsection__title">{t('mail.categories.title')}</span>
                {/* Der RUNDE Hinzufügen-Knopf — in der Überschrift, ausserhalb der Liste. */}
                <button
                    type="button"
                    className="ofi-mail-catadd"
                    aria-label={t('mail.categories.add')}
                    title={t('mail.categories.add')}
                    onClick={(event) => {
                        const el = event.currentTarget;
                        setMenuAnchor((current) => (current === el ? null : el));
                    }}
                >
                    <LuPlus size={16} />
                </button>
            </div>

            <div className="ofi-mail-cats">
                {categories.map((category) => {
                    const active = category.id === activeId;
                    const assigning = category.id === assignCategoryId;
                    return (
                        <div
                            key={category.id}
                            className={`ofi-mail-cat ${active ? 'is-active' : ''} ${assigning ? 'is-assigning' : ''} ${dropTarget === category.id ? 'is-dropover' : ''}`}
                            draggable
                            onDragStart={(event) => {
                                draggedId.current = category.id;
                                event.dataTransfer.setData(CAT_DRAG_TYPE, category.id);
                                event.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => { draggedId.current = null; setDropTarget(null); }}
                            onDragOver={(event) => {
                                const types = Array.from(event.dataTransfer.types);
                                if (!types.includes(MAIL_DRAG_TYPE) && !types.includes(CAT_DRAG_TYPE)) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                setDropTarget(category.id);
                            }}
                            onDragLeave={() => setDropTarget((current) => (current === category.id ? null : current))}
                            onDrop={(event) => {
                                event.preventDefault();
                                setDropTarget(null);
                                const mailId = event.dataTransfer.getData(MAIL_DRAG_TYPE);
                                if (mailId) { onDropMail(category.id, mailId); return; }
                                if (event.dataTransfer.getData(CAT_DRAG_TYPE)) reorderTo(category.id);
                            }}
                        >
                            <button type="button" className="ofi-mail-cat__main" onClick={() => onSelect(category)}>
                                <span className="ofi-mail-cat__dot" style={{ background: category.color }} />
                                <span className="ofi-mail-cat__label" title={categoryLabel(category)}>{categoryLabel(category)}</span>
                                {category.count > 0 && <span className="ofi-mail-cat__count">{category.count}</span>}
                            </button>
                            <span className="ofi-mail-cat__actions">
                                <button
                                    type="button"
                                    className="ofi-mail-cat__action"
                                    title={t('mail.categories.assignTo', { name: categoryLabel(category) })}
                                    aria-label={t('mail.categories.assignTo', { name: categoryLabel(category) })}
                                    onClick={() => onStartAssign(category)}
                                >
                                    <LuUserPlus size={14} />
                                </button>
                                {category.kind !== 'REQUESTS' && (
                                    <button
                                        type="button"
                                        className="ofi-mail-cat__action is-danger"
                                        title={t('common.delete')}
                                        aria-label={t('common.delete')}
                                        onClick={() => setPendingDelete(category)}
                                    >
                                        <LuTrash2 size={14} />
                                    </button>
                                )}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Die Wahl der Art — das kleine Fenster am +. */}
            <AnchoredPicker
                anchorEl={menuAnchor}
                onClose={() => setMenuAnchor(null)}
                width={220}
                maxHeight={300}
                panelClassName="ofi-mail-filterpop"
            >
                <div className="ofi-mail-catmenu">
                    {CATEGORY_KIND_LIST.map((kind) => (
                        <button
                            key={kind}
                            type="button"
                            className="ofi-option-row ofi-mail-catmenu__row"
                            onClick={() => { setMenuAnchor(null); setCreateKind(kind); }}
                        >
                            {kindIcon(kind)}
                            <span>{t(`mail.categories.kind_${kind}`)}</span>
                        </button>
                    ))}
                </div>
            </AnchoredPicker>

            {createKind && (
                <CreatePopup
                    kind={createKind}
                    onClose={() => setCreateKind(null)}
                    onCreated={onCreated}
                />
            )}

            <PopupDialog
                open={Boolean(pendingDelete)}
                onClose={() => setPendingDelete(null)}
                title={t('mail.categories.deleteTitle')}
                subtitle={pendingDelete ? t('mail.categories.deleteHint', { name: categoryLabel(pendingDelete) }) : undefined}
                tone="danger"
                icon={<LuTrash2 size={18} />}
                footer={(
                    <div className="ofi-tp-actions">
                        <div className="ofi-tp-actions__start" />
                        <div className="ofi-tp-actions__end">
                            <PopupButton onClick={() => setPendingDelete(null)}>{t('common.cancel')}</PopupButton>
                            <PopupButton variant="danger" loading={deleting} onClick={() => void removeCategory()}>{t('common.delete')}</PopupButton>
                        </div>
                    </div>
                )}
            />
        </div>
    );
};
