/**
 * ── DER NAME DES PROGRAMMS ──────────────────────────────────────────────────
 *
 * «OFFITEC CONTROL CENTER · OCC» — derselbe Name, den die Eröffnung über ihre
 * drei Tafeln buchstabiert (LoginIntro: OFFITEC · CONTROL · CENTER), hier
 * ausgeschrieben mit dem Kürzel daneben.
 *
 * Er steht UNTER dem Zeichen und ÜBER den Feldern, auf beiden Schritten der
 * Anmeldung an derselben Stelle: erst das Zeichen, dann der Name, dann die
 * Arbeit. In der Kopfzeile stand er zuerst — dort war er eine Bildunterschrift
 * am Rand; in der Mitte ist er der Titel der Seite.
 *
 * Markenschrift: sie steht in jeder Sprache gleich da (wie das Logo selbst)
 * und geht deshalb nicht durch die Sprachdateien — dieselbe Ausnahme, die
 * schon für die Tafeln der Eröffnung gilt.
 */
export const LoginWordmark = () => (
    <span className="ofi-login__wordmark">
        Offitec Control Center
        <span className="ofi-login__wordmark-abbr">OCC</span>
    </span>
);
