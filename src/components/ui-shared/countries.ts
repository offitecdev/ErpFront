/**
 * ── LÄNDER UND VORWAHLEN ────────────────────────────────────────────────────
 *
 * Eine Zeile pro Land: ISO-Code, Telefonvorwahl, englischer Name. Die ANZEIGE
 * kommt nicht aus dieser Tabelle, sondern zur Laufzeit aus `Intl.DisplayNames`
 * in der eingestellten Oberflächensprache — so heisst die Schweiz auf Deutsch
 * "Schweiz", auf Türkisch "İsviçre", ohne dass hier drei Namenslisten gepflegt
 * werden müssen. Der englische Name bleibt als Rückfall (und als zusätzlicher
 * Suchbegriff) stehen.
 *
 * GESPEICHERT wird der Ländername als Text, nicht der Code: `country` ist im
 * ganzen Haus ein freies Textfeld (Adressblöcke, PDF-Empfänger), und ein "CH"
 * im Adressblock wäre eine sichtbare Verhaltensänderung. `findCountry()` führt
 * den gespeicherten Text bei Bedarf wieder auf den Datensatz zurück — auch
 * wenn er in einer anderen Sprache erfasst wurde.
 */

import i18n from '@/i18n';

export interface CountryEntry {
    /** ISO-3166-1 alpha-2. */
    code: string;
    /** Telefonvorwahl mit Pluszeichen, z. B. "+41". */
    dial: string;
    /** Englischer Name — Rückfall und Suchbegriff. */
    english: string;
}

/** Die am häufigsten gebrauchten Länder stehen in dieser Reihenfolge oben. */
export const PRIORITY_CODES = ['CH', 'DE', 'AT', 'FR', 'IT', 'LI', 'TR', 'RO', 'NL', 'BE', 'ES', 'PT', 'PL', 'GB', 'US'] as const;

const RAW = `AD|376|Andorra
AE|971|United Arab Emirates
AF|93|Afghanistan
AG|1268|Antigua and Barbuda
AI|1264|Anguilla
AL|355|Albania
AM|374|Armenia
AO|244|Angola
AR|54|Argentina
AS|1684|American Samoa
AT|43|Austria
AU|61|Australia
AW|297|Aruba
AX|358|Aland Islands
AZ|994|Azerbaijan
BA|387|Bosnia and Herzegovina
BB|1246|Barbados
BD|880|Bangladesh
BE|32|Belgium
BF|226|Burkina Faso
BG|359|Bulgaria
BH|973|Bahrain
BI|257|Burundi
BJ|229|Benin
BL|590|Saint Barthelemy
BM|1441|Bermuda
BN|673|Brunei
BO|591|Bolivia
BQ|599|Caribbean Netherlands
BR|55|Brazil
BS|1242|Bahamas
BT|975|Bhutan
BW|267|Botswana
BY|375|Belarus
BZ|501|Belize
CA|1|Canada
CD|243|Congo - Kinshasa
CF|236|Central African Republic
CG|242|Congo - Brazzaville
CH|41|Switzerland
CI|225|Cote d'Ivoire
CK|682|Cook Islands
CL|56|Chile
CM|237|Cameroon
CN|86|China
CO|57|Colombia
CR|506|Costa Rica
CU|53|Cuba
CV|238|Cape Verde
CW|599|Curacao
CY|357|Cyprus
CZ|420|Czechia
DE|49|Germany
DJ|253|Djibouti
DK|45|Denmark
DM|1767|Dominica
DO|1809|Dominican Republic
DZ|213|Algeria
EC|593|Ecuador
EE|372|Estonia
EG|20|Egypt
ER|291|Eritrea
ES|34|Spain
ET|251|Ethiopia
FI|358|Finland
FJ|679|Fiji
FK|500|Falkland Islands
FM|691|Micronesia
FO|298|Faroe Islands
FR|33|France
GA|241|Gabon
GB|44|United Kingdom
GD|1473|Grenada
GE|995|Georgia
GF|594|French Guiana
GG|44|Guernsey
GH|233|Ghana
GI|350|Gibraltar
GL|299|Greenland
GM|220|Gambia
GN|224|Guinea
GP|590|Guadeloupe
GQ|240|Equatorial Guinea
GR|30|Greece
GT|502|Guatemala
GU|1671|Guam
GW|245|Guinea-Bissau
GY|592|Guyana
HK|852|Hong Kong
HN|504|Honduras
HR|385|Croatia
HT|509|Haiti
HU|36|Hungary
ID|62|Indonesia
IE|353|Ireland
IL|972|Israel
IM|44|Isle of Man
IN|91|India
IQ|964|Iraq
IR|98|Iran
IS|354|Iceland
IT|39|Italy
JE|44|Jersey
JM|1876|Jamaica
JO|962|Jordan
JP|81|Japan
KE|254|Kenya
KG|996|Kyrgyzstan
KH|855|Cambodia
KI|686|Kiribati
KM|269|Comoros
KN|1869|Saint Kitts and Nevis
KP|850|North Korea
KR|82|South Korea
KW|965|Kuwait
KY|1345|Cayman Islands
KZ|7|Kazakhstan
LA|856|Laos
LB|961|Lebanon
LC|1758|Saint Lucia
LI|423|Liechtenstein
LK|94|Sri Lanka
LR|231|Liberia
LS|266|Lesotho
LT|370|Lithuania
LU|352|Luxembourg
LV|371|Latvia
LY|218|Libya
MA|212|Morocco
MC|377|Monaco
MD|373|Moldova
ME|382|Montenegro
MF|590|Saint Martin
MG|261|Madagascar
MH|692|Marshall Islands
MK|389|North Macedonia
ML|223|Mali
MM|95|Myanmar
MN|976|Mongolia
MO|853|Macao
MP|1670|Northern Mariana Islands
MQ|596|Martinique
MR|222|Mauritania
MS|1664|Montserrat
MT|356|Malta
MU|230|Mauritius
MV|960|Maldives
MW|265|Malawi
MX|52|Mexico
MY|60|Malaysia
MZ|258|Mozambique
NA|264|Namibia
NC|687|New Caledonia
NE|227|Niger
NF|672|Norfolk Island
NG|234|Nigeria
NI|505|Nicaragua
NL|31|Netherlands
NO|47|Norway
NP|977|Nepal
NR|674|Nauru
NU|683|Niue
NZ|64|New Zealand
OM|968|Oman
PA|507|Panama
PE|51|Peru
PF|689|French Polynesia
PG|675|Papua New Guinea
PH|63|Philippines
PK|92|Pakistan
PL|48|Poland
PM|508|Saint Pierre and Miquelon
PR|1787|Puerto Rico
PS|970|Palestine
PT|351|Portugal
PW|680|Palau
PY|595|Paraguay
QA|974|Qatar
RE|262|Reunion
RO|40|Romania
RS|381|Serbia
RU|7|Russia
RW|250|Rwanda
SA|966|Saudi Arabia
SB|677|Solomon Islands
SC|248|Seychelles
SD|249|Sudan
SE|46|Sweden
SG|65|Singapore
SH|290|Saint Helena
SI|386|Slovenia
SJ|47|Svalbard and Jan Mayen
SK|421|Slovakia
SL|232|Sierra Leone
SM|378|San Marino
SN|221|Senegal
SO|252|Somalia
SR|597|Suriname
SS|211|South Sudan
ST|239|Sao Tome and Principe
SV|503|El Salvador
SX|1721|Sint Maarten
SY|963|Syria
SZ|268|Eswatini
TC|1649|Turks and Caicos Islands
TD|235|Chad
TG|228|Togo
TH|66|Thailand
TJ|992|Tajikistan
TK|690|Tokelau
TL|670|Timor-Leste
TM|993|Turkmenistan
TN|216|Tunisia
TO|676|Tonga
TR|90|Turkiye
TT|1868|Trinidad and Tobago
TV|688|Tuvalu
TW|886|Taiwan
TZ|255|Tanzania
UA|380|Ukraine
UG|256|Uganda
US|1|United States
UY|598|Uruguay
UZ|998|Uzbekistan
VA|39|Vatican City
VC|1784|Saint Vincent and the Grenadines
VE|58|Venezuela
VG|1284|British Virgin Islands
VI|1340|U.S. Virgin Islands
VN|84|Vietnam
VU|678|Vanuatu
WF|681|Wallis and Futuna
WS|685|Samoa
XK|383|Kosovo
YE|967|Yemen
YT|262|Mayotte
ZA|27|South Africa
ZM|260|Zambia
ZW|263|Zimbabwe`;

export const COUNTRIES: CountryEntry[] = RAW.split('\n').map((line) => {
    const [code, dial, english] = line.split('|');
    return { code, dial: `+${dial}`, english };
});

const BY_CODE = new Map(COUNTRIES.map((entry) => [entry.code, entry]));

/* ─────────────────────────── Namen und Suche ─────────────────────────── */

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

const displayNames = (lang: string): Intl.DisplayNames | null => {
    if (!displayNamesCache.has(lang)) {
        try {
            displayNamesCache.set(lang, new Intl.DisplayNames([lang], { type: 'region' }));
        } catch {
            // Sehr alte Laufzeit ohne Intl.DisplayNames — dann bleibt es beim Englischen.
            displayNamesCache.set(lang, null);
        }
    }
    return displayNamesCache.get(lang) ?? null;
};

export const currentLanguage = (): string => (i18n.resolvedLanguage || i18n.language || 'de').split('-')[0];

/** Ländername in der gewünschten Sprache; ohne Treffer der englische Name. */
export const countryName = (entry: CountryEntry, lang = currentLanguage()): string => {
    try {
        return displayNames(lang)?.of(entry.code) || entry.english;
    } catch {
        return entry.english;
    }
};

/**
 * Vergleichsform: Kleinbuchstaben ohne Akzente. Türkische Sonderzeichen werden
 * mitgefaltet, damit "turkiye" auch "Türkiye" findet und umgekehrt.
 */
const fold = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ş/g, 's')
        .replace(/ß/g, 'ss')
        .replace(/ø/g, 'o')
        .replace(/æ/g, 'ae')
        .replace(/[^a-z0-9+]/g, '');

/** Alle Sprachen der Oberfläche — ein gespeicherter Name kann aus jeder stammen. */
const UI_LANGUAGES = ['de', 'en', 'tr'];

/**
 * Suchbegriffe eines Landes, EINMAL berechnet. Ohne diesen Zwischenspeicher
 * liefe pro Tastendruck ein `Intl.DisplayNames.of()` über 230 Länder × 3
 * Sprachen — die Begriffe hängen aber an keiner Anzeige­sprache, also reicht
 * eine einmalige Berechnung für die ganze Sitzung.
 */
const termsCache = new Map<string, string[]>();

const searchTerms = (entry: CountryEntry): string[] => {
    const cached = termsCache.get(entry.code);
    if (cached) return cached;
    const terms = [
        ...UI_LANGUAGES.map((lang) => countryName(entry, lang)),
        entry.english,
        entry.code,
        entry.dial,
    ].map(fold);
    termsCache.set(entry.code, terms);
    return terms;
};

export interface CountryOption extends CountryEntry {
    /** Name in der aktuellen Oberflächensprache. */
    name: string;
    /** Steht das Land in der Kurzliste der häufigen Länder? */
    common: boolean;
}

const optionsCache = new Map<string, CountryOption[]>();

/** Alle Länder: erst die häufigen in fester Reihenfolge, dann der Rest alphabetisch. */
export const getCountryOptions = (lang = currentLanguage()): CountryOption[] => {
    const cached = optionsCache.get(lang);
    if (cached) return cached;

    const priority = PRIORITY_CODES
        .map((code) => BY_CODE.get(code))
        .filter((entry): entry is CountryEntry => Boolean(entry))
        .map((entry) => ({ ...entry, name: countryName(entry, lang), common: true }));

    const collator = new Intl.Collator(lang);
    const rest = COUNTRIES
        .filter((entry) => !PRIORITY_CODES.includes(entry.code as (typeof PRIORITY_CODES)[number]))
        .map((entry) => ({ ...entry, name: countryName(entry, lang), common: false }))
        .sort((a, b) => collator.compare(a.name, b.name));

    const all = [...priority, ...rest];
    optionsCache.set(lang, all);
    return all;
};

/**
 * Tippsuche. Ohne Eingabe kommt die volle Liste (häufige Länder zuerst). Mit
 * Eingabe wird über Name (alle drei Sprachen), englischen Namen, ISO-Code und
 * Vorwahl gesucht; Treffer am Wortanfang stehen vor Treffern in der Mitte, und
 * innerhalb derselben Güte bleiben die häufigen Länder vorne.
 */
export const searchCountries = (query: string, lang = currentLanguage()): CountryOption[] => {
    const all = getCountryOptions(lang);
    const needle = fold(query);
    if (!needle) return all;

    const scored: Array<{ option: CountryOption; rank: number }> = [];
    all.forEach((option) => {
        const terms = searchTerms(option);
        if (terms.some((term) => term.startsWith(needle))) {
            scored.push({ option, rank: option.common ? 0 : 1 });
            return;
        }
        if (terms.some((term) => term.includes(needle))) {
            scored.push({ option, rank: option.common ? 2 : 3 });
        }
    });
    return scored.sort((a, b) => a.rank - b.rank).map((item) => item.option);
};

/**
 * Gespeicherter Text → Datensatz. Erkennt den Namen in jeder Oberflächensprache,
 * den englischen Namen, den ISO-Code und die Vorwahl. Ohne Treffer `null` — das
 * Feld bleibt frei beschreibbar, ein handgetippter Name ist kein Fehler.
 */
export const findCountry = (value: string | null | undefined): CountryEntry | null => {
    const needle = fold(value ?? '');
    if (!needle) return null;
    return COUNTRIES.find((entry) => searchTerms(entry).some((term) => term === needle)) ?? null;
};

/* ─────────────────────────── Telefonvorwahl ─────────────────────────── */

/** Alle bekannten Vorwahlen, längste zuerst — damit "+1268" vor "+1" greift. */
const DIALS_BY_LENGTH = [...new Set(COUNTRIES.map((entry) => entry.dial))].sort((a, b) => b.length - a.length);

/**
 * Zerlegt eine Nummer in Vorwahl und nationalen Teil. Erkannt werden NUR echte
 * Vorwahlen aus der Länderliste: ein blosses `^\+\d+` würde bei "+90532…" gierig
 * zu viel schlucken und die Nummer zerschneiden.
 */
export const splitPhone = (phone: string): { dial: string | null; national: string } => {
    const trimmed = phone.trim();
    const dial = DIALS_BY_LENGTH.find((candidate) => trimmed.startsWith(candidate)) ?? null;
    if (!dial) return { dial: null, national: trimmed };
    return { dial, national: trimmed.slice(dial.length).trim() };
};

/**
 * Setzt die Vorwahl einer Nummer auf `dial` — bedingungslos.
 *
 * Früher wurde die Vorwahl relativ zum ZULETZT gewählten Land ersetzt. Liess
 * sich dieses Land nicht mehr auflösen (freihändig getippt, leer, zwischendurch
 * geändert), passierte gar nichts und die alte Vorwahl blieb stehen — das war
 * das „Hängenbleiben“. Jetzt zählt nur noch das aktuell gewählte Land: der
 * nationale Teil bleibt, die Vorwahl wird neu gesetzt, egal was vorher dastand.
 *
 * Die nationale Verkehrsausscheidungsziffer (die führende 0) fällt dabei weg,
 * wie international üblich: 079 … wird zu +41 79 …
 */
/**
 * Entfernt eine Vorwahl, die NICHT in der Länderliste steht — von Hand getippt
 * ("+99 …") oder schlicht falsch. Ohne das stünde nach einem Länderwechsel die
 * neue Vorwahl vor der alten ("+49 +99 532 …").
 */
const stripUnknownDial = (value: string): string => {
    if (!value.startsWith('+')) return value;
    // Mit Trenner ist klar, wo die Vorwahl endet ("+99 532 …", auch "+ 532 …").
    const separated = value.match(/^\+\d*[\s-]+(.*)$/);
    if (separated) return separated[1];
    // Ohne Trenner ist es NICHT ablesbar. Dann fällt nur das Pluszeichen weg:
    // eine sichtbar falsche Ziffernfolge lässt sich von Hand richten, still
    // gelöschte Ziffern merkt dagegen niemand.
    return value.slice(1);
};

export const setDialCode = (phone: string, dial: string): string => {
    const known = splitPhone(phone);
    const rest = known.dial ? known.national : stripUnknownDial(phone.trim());
    const national = rest.trim().replace(/^0(?=\d)/, '');
    return national ? `${dial} ${national}` : `${dial} `;
};
