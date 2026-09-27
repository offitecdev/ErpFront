import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/i18n/translate';

/**
 * ── DER NAVIGATIONSSTAPEL DER BOM (27.09.2026, Vorgabe Samet) ───────────────
 *
 * «Her şey ÇOK ÖNEMLİ macOS SwiftUI Apple — BOM modülde Apple geri mavi oku
 *  ve hani başka pencerelerde hep açılsın; daima tek bir yerde kalmayalım,
 *  farklı süreçler ve prosesler için ileri geri butonlu olsun, hep alta inmek
 *  zorunda kalmayalım.»
 *
 * Wie `NavigationStack` in SwiftUI: jeder Vorgang (BOM, Bestellung anlegen,
 * Bestellungen, Wareneingang, Dokumente) öffnet seine EIGENE Ansicht und
 * schiebt sich von rechts herein; oben links steht der blaue Zurück-Pfeil mit
 * dem Namen der vorigen Ansicht, daneben — wie im Finder — «›», solange es
 * einen Weg vorwärts gibt. ⌘[ / ⌘] (Alt+←/→) gehen dieselben Schritte.
 *
 * Der Stapel ist ein Verlauf: zurück behält die Ansichten davor UND dahinter;
 * wer nach dem Zurückgehen etwas Neues öffnet, schneidet den Weg vorwärts ab.
 */

export interface NavEntry<V> {
    /** Eindeutig je Ansicht (z. B. `bom:abc`) — der Schlüssel der Animation. */
    key: string;
    view: V;
    /** Fester Titel (Daten: «ELK-PANO-00001») … */
    title?: string;
    /** … oder ein i18n-Schlüssel (folgt der Sprache). */
    titleKey?: string;
}

export type NavDirection = 'push' | 'pop' | 'none';

export interface NavStackHandle<V> {
    entries: NavEntry<V>[];
    index: number;
    current: NavEntry<V>;
    previous: NavEntry<V> | null;
    direction: NavDirection;
    canBack: boolean;
    canForward: boolean;
    push: (entry: NavEntry<V>) => void;
    /** Die oberste Ansicht ersetzen (kein neuer Schritt). */
    replace: (entry: NavEntry<V>) => void;
    back: () => void;
    forward: () => void;
    /** Zurück bis zu dieser Ansicht (oder zur Wurzel). */
    popTo: (key: string) => void;
    reset: (entries: NavEntry<V>[]) => void;
}

export const entryTitle = (entry: NavEntry<unknown> | null | undefined): string =>
    entry ? entry.title ?? (entry.titleKey ? t(entry.titleKey) : '') : '';

export const useNavStack = <V,>(initial: () => NavEntry<V>[]): NavStackHandle<V> => {
    const [state, setState] = useState(() => {
        const entries = initial();
        return { entries, index: Math.max(0, entries.length - 1), direction: 'none' as NavDirection };
    });

    const push = useCallback((entry: NavEntry<V>) => setState((current) => {
        const top = current.entries[current.index];
        if (top?.key === entry.key) return current;
        const entries = [...current.entries.slice(0, current.index + 1), entry];
        return { entries, index: entries.length - 1, direction: 'push' };
    }), []);

    const replace = useCallback((entry: NavEntry<V>) => setState((current) => {
        const entries = [...current.entries.slice(0, current.index), entry];
        return { entries, index: entries.length - 1, direction: 'none' };
    }), []);

    const back = useCallback(() => setState((current) => (
        current.index > 0 ? { ...current, index: current.index - 1, direction: 'pop' } : current
    )), []);

    const forward = useCallback(() => setState((current) => (
        current.index < current.entries.length - 1 ? { ...current, index: current.index + 1, direction: 'push' } : current
    )), []);

    const popTo = useCallback((key: string) => setState((current) => {
        const at = current.entries.slice(0, current.index + 1).findIndex((entry) => entry.key === key);
        const index = at >= 0 ? at : 0;
        return index === current.index ? current : { ...current, index, direction: 'pop' };
    }), []);

    const reset = useCallback((entries: NavEntry<V>[]) => setState({
        entries,
        index: Math.max(0, entries.length - 1),
        direction: 'none',
    }), []);

    const current = state.entries[state.index] ?? state.entries[0]!;
    return {
        entries: state.entries,
        index: state.index,
        current,
        previous: state.index > 0 ? state.entries[state.index - 1] ?? null : null,
        direction: state.direction,
        canBack: state.index > 0,
        canForward: state.index < state.entries.length - 1,
        push,
        replace,
        back,
        forward,
        popTo,
        reset,
    };
};

const isTypingTarget = (target: EventTarget | null): boolean => {
    const element = target as HTMLElement | null;
    if (!element) return false;
    const tag = element.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
};

/** ⌘[ / ⌘] und Alt+←/→ — nie, während jemand tippt oder ein Fenster offen ist. */
export const useNavKeys = (nav: Pick<NavStackHandle<unknown>, 'back' | 'forward' | 'canBack' | 'canForward'>, enabled = true) => {
    const ref = useRef(nav);
    useEffect(() => { ref.current = nav; });
    useEffect(() => {
        if (!enabled) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.defaultPrevented || isTypingTarget(event.target)) return;
            if (document.querySelector('[aria-modal="true"]')) return;
            const meta = event.metaKey || event.ctrlKey;
            const backKey = (meta && event.key === '[') || (event.altKey && event.key === 'ArrowLeft');
            const forwardKey = (meta && event.key === ']') || (event.altKey && event.key === 'ArrowRight');
            if (backKey && ref.current.canBack) {
                event.preventDefault();
                ref.current.back();
            } else if (forwardKey && ref.current.canForward) {
                event.preventDefault();
                ref.current.forward();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [enabled]);
};
