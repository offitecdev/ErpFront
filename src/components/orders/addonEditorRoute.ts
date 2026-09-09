import { useLocation, useNavigate } from 'react-router-dom';

/**
 * ── WO DER NACHTRAG ERFASST WIRD ─────────────────────────────────────────────
 *
 * Vorgabe Samet (05.09.2026, letzte Fassung): «Alles soll INNERHALB dieses
 * Rechtecks geschehen — der neue Zusatzauftrag darf keine eigene Seite öffnen.
 * Dort gehört ein Zurück, das an dieselbe Stelle führt.»
 *
 * Also trägt die Adresse nur einen Vermerk (`?addonEditor=…`), und die
 * FLÄCHE, die ihn gesetzt hat, zeigt die Erfassung an ihrer eigenen Stelle:
 * im Zusatzauftrags-Bereich des Projekts, in der Registerkarte des Auftrags,
 * in der Nachtragsliste. Der Rahmen ringsum — Projektkopf, Reiter, Liste —
 * bleibt dabei stehen; «Zurück» nimmt den Vermerk wieder heraus, und die
 * Fläche steht wie vorher da.
 *
 *   `addonEditor`         'new' oder die Id des Nachtrags
 *   `editorParent(Number)` der Hauptauftrag, damit die Maske nicht fragt
 *
 * Die drei Vermerke sind das GANZE Protokoll: keine Route, kein Zustand
 * ausserhalb der Adresse — damit ein Neuladen dieselbe Erfassung wieder
 * aufmacht und der Zurück-Griff des Browsers sie schliesst.
 */

export interface AddonEditorParent {
    id: string;
    orderNumber: string;
    projectId?: string | null;
}

const PARAMS = ['addonEditor', 'editorParent', 'editorParentNumber'] as const;

const editorPath = (editor: string, parent: AddonEditorParent | null, from?: string | null) => {
    const url = new URL(from || `${window.location.pathname}${window.location.search}`, window.location.origin);
    url.searchParams.set('addonEditor', editor);
    if (parent) {
        url.searchParams.set('editorParent', parent.id);
        url.searchParams.set('editorParentNumber', parent.orderNumber);
    } else {
        url.searchParams.delete('editorParent');
        url.searchParams.delete('editorParentNumber');
    }
    return url.pathname + url.search + url.hash;
};

/** Neuen Nachtrag erfassen — an der Stelle, an der man gerade steht. */
export const addonCreatePath = (parent: AddonEditorParent | null, from?: string | null) => editorPath('new', parent, from);

/** Einen bestehenden Nachtrag öffnen. */
export const addonEditPath = (addonId: string, from?: string | null) => editorPath(addonId, null, from);

export interface AddonEditorState {
    /** Die Erfassung ist offen. */
    open: boolean;
    /** Gesetzt = bestehenden Nachtrag bearbeiten; leer = neuer. */
    addonId?: string;
    parent: AddonEditorParent | null;
    /** Die Adresse OHNE die Vermerke — dorthin führt «Zurück». */
    returnTo: string;
    close: () => void;
}

/**
 * Liest die Vermerke der Adresse. Jede Fläche, die einen Nachtrag erfassen
 * lässt, fragt hier nach und zeigt die Maske an ihrer eigenen Stelle.
 */
export const useAddonEditor = (): AddonEditorState => {
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const editor = params.get('addonEditor');
    const parentId = params.get('editorParent');
    const parentNumber = params.get('editorParentNumber') || '';
    PARAMS.forEach((key) => params.delete(key));
    const query = params.toString();
    const returnTo = location.pathname + (query ? `?${query}` : '') + location.hash;
    return {
        open: Boolean(editor),
        addonId: editor && editor !== 'new' ? editor : undefined,
        parent: parentId ? { id: parentId, orderNumber: parentNumber } : null,
        returnTo,
        // `replace`: die Erfassung ist kein eigener Halt im Verlauf — der
        // Zurück-Griff des Browsers soll nicht durch sie hindurchstolpern.
        close: () => navigate(returnTo, { replace: true }),
    };
};
