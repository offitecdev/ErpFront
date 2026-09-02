/**
 * Spürbare Rückmeldung beim Drücken (01.09.2026)
 *
 * Vorgabe Samet: «Der Knopf soll beim Klicken eine Rückmeldung geben.»
 * Das Sichtbare — der Knopf gibt kurz nach — steht in `styles/buttons.css`
 * (Abschnitt 5). Hier steht das FÜHLBARE: ein sehr kurzer Impuls des
 * Vibrationsmotors, wie ihn die Tastatur des Geräts gibt.
 *
 * Drei Entscheidungen, und warum:
 *
 *  · NUR bei Finger und Stift (`pointerType`). Mit der Maus am Schreibtisch
 *    gibt es nichts zu spüren, und ein Gerät, das dort trotzdem brummt
 *    (manche Laptops mit Touchpad-Motor), wäre nur lästig.
 *
 *  · Bei `pointerdown`, nicht bei `click`. Die Rückmeldung gehört an den
 *    Moment des Drückens — wer den Finger danach wegzieht und den Klick
 *    abbricht, hat trotzdem gedrückt und soll das gemerkt haben.
 *
 *  · EIN Zuhörer am Dokument statt einer Behandlung pro Knopf. Bei rund
 *    850 Knopf-Fundstellen ist das der einzige Weg, der nichts vergisst und
 *    nichts kostet — dieselbe Bauart wie `installAutoColumnResize` und
 *    `installTableChrome`.
 *
 * Wo `navigator.vibrate` fehlt (iPhone, iPad, Desktop-Safari) passiert
 * schlicht nichts — die Kette bricht am optionalen Aufruf ab.
 */

/** So kurz, dass es als Klick durchgeht und nicht als Alarm. */
const PRESS_PULSE_MS = 10

/** Was als Knopf gilt. Bewusst weiter gefasst als die Grössenregel in
 *  buttons.css: ein Reiter oder eine Menüzeile darf ruhig antworten. */
const PRESSABLE =
    'button, [role="button"], [role="menuitem"], [role="tab"], [role="option"], [role="switch"], summary, a[href], label[for]'

let installed = false

export function installButtonFeedback(): void {
    if (installed || typeof document === 'undefined') return
    installed = true

    document.addEventListener(
        'pointerdown',
        (event) => {
            const pointer = event as PointerEvent
            if (pointer.pointerType !== 'touch' && pointer.pointerType !== 'pen') return

            const target = pointer.target
            if (!(target instanceof Element)) return

            const pressed = target.closest(PRESSABLE)
            if (!pressed) return
            // Ein abgeschalteter Knopf tut nichts — dann soll er sich auch
            // nicht anfühlen, als hätte er etwas getan.
            if (
                pressed.matches(':disabled, [disabled], [aria-disabled="true"]')
            ) {
                return
            }

            navigator.vibrate?.(PRESS_PULSE_MS)
        },
        // `passive`: der Zuhörer bricht nichts ab, der Browser muss also nicht
        // auf ihn warten, bevor er scrollt.
        // `capture`: er läuft, bevor irgendein Knopf sein eigenes
        // `stopPropagation()` setzen kann.
        { passive: true, capture: true },
    )
}
