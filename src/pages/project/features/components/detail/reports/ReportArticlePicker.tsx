import { useEffect, useMemo, useRef, useState } from 'react';

import { Plus, SearchLg } from '@/components/icons/antIconCompat';
import { PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { ProjectMaterial } from '@/types/project';

import { money, numberFmt } from '../../../utils/projectFormatters';

/**
 * ══ ARTIKELWAHL ALS FENSTER (Vorgabe Samet, 02.09.2026) ═════════════════════
 * «Die Wahl soll modern sein und als Fenster aufgehen — und dasselbe Stück
 * darf man NICHT ein zweites Mal wählen: was schon im Rapport steht, soll gar
 * nicht mehr in der Liste erscheinen.»
 *
 * Darum zwei Dinge:
 *   1. Die Liste zeigt NUR, was noch nicht im Rapport steht (`pickedIds`).
 *      Ein Treffer verschwindet in dem Augenblick, in dem er gewählt wird —
 *      damit ist eine doppelte Zeile nicht «verboten», sondern unmöglich.
 *   2. Das Fenster bleibt nach einem Treffer OFFEN: der Monteur sammelt
 *      mehrere Positionen hintereinander ein und schliesst am Ende mit
 *      «Fertig».
 *
 * Freier Text bleibt möglich: was der Katalog nicht kennt, wandert über die
 * unterste Zeile als «Externe Kosten» in den Rapport — genau wie vorher beim
 * direkten Eintippen in die Tabelle.
 */

/** Wie viele Treffer die Liste höchstens zeichnet — sie scrollt darin. */
const LIST_LIMIT = 60;

type ArticlePickerProps = {
    open: boolean;
    materials: ProjectMaterial[];
    /** Schon im Rapport stehende Artikel — sie fallen aus der Liste heraus. */
    pickedIds: Set<string>;
    onPick: (material: ProjectMaterial) => void;
    /** Freier Text → eine Zeile «Externe Kosten». */
    onAddText: (text: string) => void;
    onClose: () => void;
};

/* Geschlossen gibt es das Fenster GAR NICHT — und damit fängt jedes Öffnen von
   selbst leer an: Suche und Zähler sind Zustand dieses Bauteils, und das
   entsteht mit dem Öffnen neu. Ein Rücksetzer im Effekt wäre derselbe Vorgang
   auf dem Umweg über eine zweite Zeichnung. */
export const ReportArticlePicker = (props: ArticlePickerProps) => (props.open ? <ArticlePicker {...props} /> : null);

const ArticlePicker = ({
    open,
    materials,
    pickedIds,
    onPick,
    onAddText,
    onClose,
}: ArticlePickerProps) => {
    const [query, setQuery] = useState('');
    const [added, setAdded] = useState(0);
    const searchRef = useRef<HTMLInputElement | null>(null);

    /* Der Zeiger steht sofort in der Suche: der Monteur tippt los, ohne erst
       zu zielen. */
    useEffect(() => {
        const id = window.requestAnimationFrame(() => searchRef.current?.focus());
        return () => window.cancelAnimationFrame(id);
    }, []);

    const needle = query.trim().toLowerCase();
    const matches = useMemo(() => materials
        .filter((material) => !pickedIds.has(material.id))
        .filter((material) => (material.isActive !== false || needle.length > 0))
        .filter((material) => (needle
            ? material.name.toLowerCase().includes(needle) || (material.serialId || '').toLowerCase().includes(needle)
            : true))
        .slice(0, LIST_LIMIT),
    [materials, pickedIds, needle]);

    const addText = () => {
        const text = query.trim();
        if (!text) return;
        onAddText(text);
        setAdded((count) => count + 1);
        setQuery('');
        searchRef.current?.focus();
    };

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={t('projects.reportsHub.pickArticleTitle')}
            subtitle={t('projects.reportsHub.pickArticleHint')}
            width={620}
            bodyClassName="ofi-artpick"
            footer={(
                <div className="ofi-artpick__foot">
                    <span className="ofi-artpick__count">
                        {added > 0 ? t('projects.reportsHub.pickArticleAdded', { count: added }) : ''}
                    </span>
                    <button type="button" className="ofi-cal-btn is-primary" onClick={onClose}>
                        {t('common.done')}
                    </button>
                </div>
            )}
        >
            <div className="ofi-artpick__search">
                <SearchLg size={16} aria-hidden />
                <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        // Enter nimmt den einzigen Treffer — sonst den freien Text.
                        if (matches.length === 1) { onPick(matches[0]); setAdded((count) => count + 1); setQuery(''); return; }
                        addText();
                    }}
                    placeholder={t('projects.reportsHub.pickArticleSearch')}
                    aria-label={t('projects.reportsHub.pickArticleSearch')}
                />
            </div>

            <div role="listbox" aria-label={t('projects.reportsHub.pickArticleTitle')} className="ofi-artpick__list">
                {matches.map((material) => (
                    <button
                        key={material.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => { onPick(material); setAdded((count) => count + 1); }}
                        className="ofi-option-row ofi-artpick__row"
                    >
                        <span className="ofi-artpick__name">{material.name}</span>
                        <span className="ofi-artpick__meta">
                            {material.serialId ? <span>{material.serialId}</span> : null}
                            <span>{numberFmt(material.stockQuantity)}{material.unit ? ` ${material.unit}` : ''}</span>
                            <span>{money(Number(material.unitCost) || 0)}</span>
                        </span>
                    </button>
                ))}
                {matches.length === 0 && (
                    <p className="ofi-artpick__empty">
                        {needle ? t('projects.reportsHub.pickArticleNoHit') : t('projects.reportsHub.pickArticleAllUsed')}
                    </p>
                )}
            </div>

            {/* Was der Katalog nicht kennt, ist damit nicht verloren: dieselbe
                Eingabe wird zur Zeile «Externe Kosten». */}
            {needle.length > 0 && (
                <button type="button" className="ofi-artpick__free" onClick={addText}>
                    <span aria-hidden className="ofi-artpick__freering"><Plus size={13} /></span>
                    {t('projects.reportsHub.pickArticleAsCost', { text: query.trim() })}
                </button>
            )}
        </PopupDialog>
    );
};
