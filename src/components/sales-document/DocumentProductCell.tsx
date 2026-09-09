import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import { t } from '@/i18n/translate';
import type { ArticleQuickPick } from '@/types/inventory';

const LazyProductDropdown = lazy(() => import('@/pages/sales/detail/components/product/TenderProductSearchDropdown')
    .then((module) => ({ default: module.TenderProductSearchDropdown })));

/**
 * ── DIE PRODUKTZELLE DES BELEGS ──────────────────────────────────────────────
 *
 * Vorgabe Samet (05.09.2026): «In Rechnung und Nachtrag soll sich das Feld
 * genauso verhalten wie in den Offertdetails» — dieselbe Liste unter der Zelle,
 * dieselbe Zeile «„xyz" hinzufügen», und die Beschreibung folgt dem Produkt:
 * sie kommt mit, wenn eines gewählt wird, und geht, wenn es getauscht oder
 * entfernt wird.
 *
 * Darum steht hier KEINE zweite Suche, sondern dieselbe Liste wie in der
 * Offerte (`TenderProductSearchDropdown`). Die Zelle liefert ihr nur den Anker
 * und den getippten Text; alles Weitere — Pfeiltasten, Enter, die Aktionszeilen
 * — gehört der Liste (siehe deren Kopfkommentar).
 *
 * Die Regeln beim Verlassen der Zelle sind die der Offerte, mit EINER Ausnahme:
 *
 *  • Zeile MIT Artikel: nur Enter oder ein Klick tauschen das Produkt. Wer
 *    etwas anderes tippt und wegklickt, bekommt den alten Namen zurück — sonst
 *    trüge die Zeile einen Namen, der nicht zum Artikel gehört.
 *  • Zelle GELEERT: das ist das Entfernen des Produkts — Name, Artikelbezug und
 *    die Beschreibung des Artikels gehen zusammen.
 *  • Zeile OHNE Artikel (frei getippte Position): der Text wird beim Verlassen
 *    übernommen. Auf einer Rechnung ist die handgeschriebene Zeile der
 *    Normalfall; sie erst nach Enter zu behalten, hiesse Getipptes wegzuwerfen.
 */
export const DocumentProductCell = ({
    value,
    hasArticle,
    onPickArticle,
    onCommitText,
    autoFocus,
    readOnly,
}: {
    value: string;
    /** Die Zeile hängt an einem Artikel — dann gilt die strengere Regel. */
    hasArticle: boolean;
    onPickArticle: (article: ArticleQuickPick) => void;
    /** Übernommener Text: leer = Produkt entfernen. */
    onCommitText: (next: string) => void;
    autoFocus?: boolean;
    readOnly?: boolean;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
    const [open, setOpen] = useState(false);
    // `null` = die Zelle zeigt den Wert der Zeile; sonst den Entwurf im Feld.
    const [draft, setDraft] = useState<string | null>(null);
    // Eine Wahl aus der Liste hat den Entwurf bereits erledigt — das folgende
    // Verlassen der Zelle darf ihn nicht noch einmal schreiben.
    const takenRef = useRef(false);

    const text = draft ?? value;

    // Eine neue, leere Zeile bekommt den Blinker UND die Liste (wie in der
    // Offerte: man tippt sofort los).
    useEffect(() => {
        if (!autoFocus || readOnly) return;
        inputRef.current?.focus();
        setOpen(true);
    }, [autoFocus, readOnly]);

    const revert = () => setDraft(null);

    const commit = () => {
        if (takenRef.current) { takenRef.current = false; setDraft(null); return; }
        if (draft === null) return;
        const next = draft.trim();
        setDraft(null);
        if (next === value.trim()) return;
        // Leeren nimmt das Produkt von der Zeile — immer erlaubt.
        if (!next) { onCommitText(''); return; }
        // Ein Artikel wird nur bewusst getauscht (Enter oder Klick in der Liste).
        if (hasArticle) return;
        onCommitText(draft);
    };

    return (
        <>
            <input
                ref={(element) => { inputRef.current = element; setAnchor(element); }}
                className="document-cell is-text"
                value={text}
                readOnly={readOnly}
                placeholder={t('invoices.descriptionPlaceholder')}
                aria-label={t('invoices.descriptionPlaceholder')}
                onChange={(event) => { setDraft(event.target.value); if (!open) setOpen(true); }}
                /* Schon der ERSTE Klick öffnet die Liste (Offerte). */
                onMouseDown={() => { if (!readOnly) setOpen(true); }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') { revert(); setOpen(false); return; }
                    // Enter gehört der Liste, solange sie offen ist; ist sie zu,
                    // schliesst Enter die Eingabe ab.
                    if (event.key === 'Enter' && !open) { commit(); inputRef.current?.blur(); }
                }}
                onBlur={commit}
            />
            {open && anchor && !readOnly && (
                <Suspense fallback={null}>
                    <LazyProductDropdown
                        anchorEl={anchor}
                        search={text}
                        currentName={value}
                        onClose={() => setOpen(false)}
                        onSelectArticle={(article) => {
                            takenRef.current = true;
                            setDraft(null);
                            setOpen(false);
                            onPickArticle(article);
                        }}
                        onCreateFreeLine={(name) => {
                            // «„xyz" hinzufügen»: der getippte Name wird die Zeile —
                            // ohne Artikel dahinter, und die Beschreibung des
                            // vorherigen Artikels geht mit ihm.
                            takenRef.current = true;
                            setDraft(null);
                            setOpen(false);
                            if (name.trim() !== value.trim()) onCommitText(name);
                        }}
                        /* Der Beleg hat keinen grossen Produktwähler — die Zeile
                           «Alle Produkte …» bliebe hier ohne Ziel. */
                        hideAllProducts
                        onOpenAllProducts={() => setOpen(false)}
                    />
                </Suspense>
            )}
        </>
    );
};
