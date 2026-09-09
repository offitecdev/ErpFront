/**
 * DIE NACHDENK-SCHICHT über der Texterkennung (Vorgabe Samet, 02.09.2026:
 * «etwas Klügeres, das das System nicht belastet — es soll richtig erraten,
 * was dasteht, ein bisschen wie Google Lens»).
 *
 * Gelesen wird von Google Cloud Vision (`lib/ocr/ocrEngine.ts`). Diese Schicht
 * liegt DARÜBER und kostet kein Modell, keinen Dienst und kein Byte mehr über
 * die Leitung — sie steckt in drei billigen Schritten NACH dem Lesen.
 *
 *   1. `refineLines` — im aufgezogenen Rechteck steht selten nur der Name.
 *      Wer eine Verpackung umrahmt, fängt Kleingedrucktes, Preise und Masse
 *      mit ein. Behalten wird deshalb nur, was zur GRÖSSTEN Schrift im
 *      Rechteck gehört (eine zweizeilige Marke überlebt, die Fussnote nicht),
 *      und was überhaupt nach Text aussieht.
 *   2. `repairName` — Verwechslungen, die jeder Erkenner macht, aber nur dort,
 *      wo sie sicher sind: eine Ziffer in einem sonst reinen Buchstabenwort
 *      («0FFITEC») ist ein Buchstabe, ein Buchstabe in einer sonst reinen
 *      Zahl («30OO») ist eine Ziffer. Ein «PRO 3000» bleibt unangetastet.
 *   3. `snapToKnown` — der gelesene Text ist unscharf, der Produktkatalog ist
 *      es nicht. Wo beide bis auf ein paar verwechselbare Zeichen gleich
 *      sind, gewinnt der Katalog. Das ist die eigentliche Vorhersage: aus
 *      einem schlecht belichteten Etikett wird der Name, der im Lager steht.
 *      Die Trefferliste dafür holt das Fenster ohnehin schon — es kostet
 *      keine einzige zusätzliche Anfrage.
 */

export interface SenseLine {
    text: string;
    confidence: number;
    box: { x0: number; y0: number; x1: number; y1: number };
}

/** Preise, Gewichte, Daten, Chargen: nie der Produktname. */
const NOISE = /^(chf|eur|usd|€|\$)\b|^\W*\d[\d.,:/\- ]*\W*$|\d{1,2}[./]\d{1,2}[./]\d{2,4}|^(art|nr|no|ean|ref)\W/i;
/** Zeichen, die sich in JEDER Schrift ähneln — beim Vergleichen dasselbe Zeichen. */
const FOLD: Record<string, string> = {
    o: '0', q: '0', d: '0',
    i: '1', l: '1', j: '1', '|': '1',
    s: '5', z: '2', b: '8', g: '6', t: '7', a: '4', e: '3',
};
/** Sichere Reparaturen in einem Wort, das sonst nur aus Buchstaben besteht. */
const DIGIT_TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '6': 'G', '2': 'Z' };
/* … und umgekehrt. Diese Richtung ist ENGER gefasst: nur O und I/l sind von
   0 und 1 wirklich nicht zu unterscheiden. S↔5 oder B↔8 würden echte
   Bestellnummern wie «A2B3» zerschreiben. */
const LETTER_TO_DIGIT: Record<string, string> = { O: '0', o: '0', I: '1', l: '1', i: '1' };

const height = (line: SenseLine) => line.box.y1 - line.box.y0;
const letters = (text: string) => (text.match(/\p{L}/gu) ?? []).length;
const digits = (text: string) => (text.match(/\p{N}/gu) ?? []).length;

/**
 * Wie sehr eine Zeile nach einem Produktnamen aussieht (0 = gar nicht).
 * Buchstaben zählen, Ziffern nicht; sehr unsichere und sehr kurze Zeilen
 * fallen ganz heraus.
 */
const nameScore = (line: SenseLine): number => {
    const text = line.text.trim();
    if (text.length < 2 || letters(text) < 2) return 0;
    if (line.confidence < 30) return 0;
    if (NOISE.test(text)) return 0;
    const share = letters(text) / Math.max(1, letters(text) + digits(text));
    return share * 6 + (line.confidence / 100) * 3 + Math.min(text.length, 20) / 20 * 2;
};

/**
 * Aus allem, was im Rechteck steht, die Zeilen behalten, die zusammen den
 * Namen ergeben: die grösste Schrift und was ihr ebenbürtig ist.
 */
export const refineLines = <T extends SenseLine>(lines: T[]): T[] => {
    const usable = lines.filter((line) => nameScore(line) > 0);
    if (usable.length <= 1) return usable;
    const tallest = Math.max(...usable.map(height));
    // 0.62 lässt eine zweite Zeile derselben Marke durch und wirft das
    // Kleingedruckte weg, das auf Verpackungen halb so hoch gesetzt ist.
    const kept = usable.filter((line) => height(line) >= tallest * 0.62);
    return kept.length ? kept : usable;
};

/**
 * Ein Wort reparieren — aber NUR an Stellen, an denen die Verwechslung
 * eindeutig ist. Entscheidend ist die POSITION, nicht die Mehrheit:
 *
 *   · Eine Ziffer AM ANFANG oder MITTEN in einem buchstabenreichen Wort ist
 *     ein verlesener Buchstabe («0FFITEC», «M0DELL»). Am ENDE ist sie es
 *     nicht — «MX5» und «A4» heissen wirklich so.
 *   · Ein Buchstabe ZWISCHEN Ziffern ist eine verlesene Ziffer («3OO0», «1O0»).
 *     Am Ende ist er eine Einheit und bleibt: «230V», «50Hz», «12V».
 */
const repairWord = (word: string): string => {
    const letterCount = letters(word);
    const digitCount = digits(word);
    // In Läufen denken, nicht in einzelnen Zeichen: «3OO0» sind zwei
    // Buchstaben zwischen zwei Ziffern, und nur zusammen sind sie eindeutig.
    const runs = word.match(/\p{L}+|\p{N}+|[^\p{L}\p{N}]+/gu) ?? [];
    const kind = (index: number) => {
        const run = runs[index];
        if (!run) return 'none';
        if (/\p{L}/u.test(run[0])) return 'letters';
        if (/\p{N}/u.test(run[0])) return 'digits';
        return 'other';
    };

    return runs
        .map((run, index) => {
            const before = kind(index - 1);
            const after = kind(index + 1);
            // Nur eine EINZELNE Ziffer ist ein verlesener Buchstabe. Ein Lauf
            // von zweien ist eine Zahl: «50Hz» und «M12X50» bleiben, wie sie sind.
            if (kind(index) === 'digits' && letterCount >= 2 && run.length === 1) {
                const leading = index === 0 && after === 'letters';
                const inside = before === 'letters' && after === 'letters';
                if (leading || inside) return run.replace(/\p{N}/gu, (digit) => DIGIT_TO_LETTER[digit] ?? digit);
            }
            if (kind(index) === 'letters' && digitCount >= 2 && before === 'digits' && after === 'digits') {
                return run.replace(/\p{L}/gu, (letter) => LETTER_TO_DIGIT[letter] ?? letter);
            }
            return run;
        })
        .join('');
};

/** Den zusammengesetzten Text glätten und die sicheren Verwechslungen heilen. */
export const repairName = (text: string): string =>
    text
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(repairWord)
        .join(' ')
        .trim();

/** Beide Seiten auf dieselbe, verwechslungsfreie Schreibweise bringen. */
const fold = (text: string): string =>
    text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '')
        .split('')
        .map((character) => FOLD[character] ?? character)
        .join('');

/** Levenshtein-Abstand, zwei Zeilen Speicher — die Wörter sind kurz. */
const distance = (a: string, b: string): number => {
    if (a === b) return 0;
    if (!a.length || !b.length) return Math.max(a.length, b.length);
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
        previous = current;
    }
    return previous[b.length];
};

/** 0…1 — 1 heisst «bis auf verwechselbare Zeichen dasselbe». */
export const similarity = (a: string, b: string): number => {
    const left = fold(a);
    const right = fold(b);
    if (!left || !right) return 0;
    const longest = Math.max(left.length, right.length);
    return 1 - distance(left, right) / longest;
};

/** Ab hier ist der Katalogname sicher genug, um den gelesenen zu ersetzen. */
const SNAP_THRESHOLD = 0.82;

/**
 * Den gelesenen Text an einen bekannten Produktnamen anlegen, wenn beide
 * praktisch gleich sind. `null`, wenn keiner nahe genug ist — dann bleibt
 * stehen, was gelesen wurde.
 */
export const snapToKnown = (text: string, known: readonly string[]): string | null => {
    const trimmed = text.trim();
    if (trimmed.length < 3) return null;
    let best: { name: string; score: number } | null = null;
    for (const name of known) {
        const score = similarity(trimmed, name);
        if (score >= SNAP_THRESHOLD && (!best || score > best.score)) best = { name, score };
    }
    return best && best.name !== trimmed ? best.name : null;
};
