import dayjs, { type Dayjs } from 'dayjs';

export type CalendarQuickTextResult = {
    title: string;
    date: Dayjs | null;
    startMinutes: number | null;
    endMinutes: number | null;
    foundDate: boolean;
    foundTime: boolean;
    spans: Array<{ start: number; end: number; type: 'date' | 'time' }>;
};

const fold = (value: string) => value.toLocaleLowerCase('tr-TR');

const WEEKDAYS: Record<string, number> = {
    sunday: 0, sun: 0, sonntag: 0, so: 0, pazar: 0,
    monday: 1, mon: 1, montag: 1, mo: 1, pazartesi: 1,
    tuesday: 2, tue: 2, dienstag: 2, di: 2, salı: 2, sali: 2,
    wednesday: 3, wed: 3, mittwoch: 3, mi: 3, çarşamba: 3, carsamba: 3,
    thursday: 4, thu: 4, donnerstag: 4, do: 4, perşembe: 4, persembe: 4,
    friday: 5, fri: 5, freitag: 5, fr: 5, cuma: 5,
    saturday: 6, sat: 6, samstag: 6, sa: 6, cumartesi: 6,
};

const MONTHS: Record<string, number> = {
    january: 0, jan: 0, januar: 0, ocak: 0,
    february: 1, feb: 1, februar: 1, şubat: 1, subat: 1,
    march: 2, mar: 2, märz: 2, maerz: 2, mart: 2,
    april: 3, apr: 3, nisan: 3,
    may: 4, mai: 4, mayıs: 4, mayis: 4,
    june: 5, jun: 5, juni: 5, haziran: 5,
    july: 6, jul: 6, juli: 6, temmuz: 6,
    august: 7, aug: 7, ağustos: 7, agustos: 7,
    september: 8, sep: 8, eylül: 8, eylul: 8,
    october: 9, oct: 9, oktober: 9, ekim: 9,
    november: 10, nov: 10, kasım: 10, kasim: 10,
    december: 11, dec: 11, dezember: 11, dez: 11, aralık: 11, aralik: 11,
};

const validDate = (year: number, month: number, day: number): Dayjs | null => {
    const candidate = dayjs(new Date(year, month, day)).startOf('day');
    return candidate.year() === year && candidate.month() === month && candidate.date() === day ? candidate : null;
};

const clockMinutes = (token: string): number | null => {
    const normalized = fold(token).trim().replace(/\s+/g, ' ');
    const marker = normalized.match(/(am|pm)\b/)?.[1];
    const numbers = normalized.match(/\d{1,2}/g)?.map(Number) ?? [];
    if (!numbers.length) return null;
    let hour = numbers[0];
    const minute = numbers[1] ?? 0;
    if (marker === 'pm' && hour < 12) hour += 12;
    if (marker === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
};

const cleanTitle = (value: string) => value
    .replace(/(?<![\p{L}\p{N}])(?:today|tomorrow|day after tomorrow|heute|morgen|übermorgen|uebermorgen|bugün|bugun|yarın|yarin|öbür gün|obur gun)(?![\p{L}\p{N}])/giu, ' ')
    .replace(/(?<![\p{L}\p{N}])(?:at|on|um|uhr|saat|tarihinde|günü|gunu|am|pm|bis|to|from|between|von|zwischen|arası|arasi|arasında|arasinda)(?![\p{L}\p{N}])/giu, ' ')
    .replace(/\s*(?:-|–|—)\s*/g, ' ')
    .replace(/\s*[/\\]\s*/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * Small, deterministic counterpart of Calendar's natural-language field.
 * It intentionally recognises the expressions people use most often while
 * leaving unknown words untouched as the event title.
 */
export const parseCalendarQuickText = (input: string, reference: Dayjs): CalendarQuickTextResult => {
    let working = input;
    let parsedDate: Dayjs | null = null;
    let foundDate = false;
    const spans: CalendarQuickTextResult['spans'] = [];
    let spanType: 'date' | 'time' = 'date';

    const consume = (start: number, length: number) => {
        spans.push({ start, end: start + length, type: spanType });
        // Preserve original offsets so the editor can underline the exact
        // recognised words without changing the text or moving the caret.
        working = `${working.slice(0, start)}${' '.repeat(length)}${working.slice(start + length)}`;
    };

    const lowered = fold(working);
    const relativePatterns: Array<[RegExp, number]> = [
        [/(?<![\p{L}\p{N}])(?:day after tomorrow|übermorgen|uebermorgen|öbür gün|obur gun)(?![\p{L}\p{N}])/iu, 2],
        [/(?<![\p{L}\p{N}])(?:tomorrow|morgen|yarın|yarin)(?![\p{L}\p{N}])/iu, 1],
        [/(?<![\p{L}\p{N}])(?:today|heute|bugün|bugun)(?![\p{L}\p{N}])/iu, 0],
    ];
    for (const [pattern, offset] of relativePatterns) {
        const match = lowered.match(pattern);
        if (!match || match.index === undefined) continue;
        parsedDate = reference.add(offset, 'day').startOf('day');
        foundDate = true;
        consume(match.index, match[0].length);
        break;
    }

    if (!foundDate) {
        const iso = working.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
        if (iso && iso.index !== undefined) {
            parsedDate = validDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
            if (parsedDate) {
                foundDate = true;
                consume(iso.index, iso[0].length);
            }
        }
    }

    if (!foundDate) {
        const numeric = working.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
        if (numeric && numeric.index !== undefined) {
            const explicitYear = Boolean(numeric[3]);
            const rawYear = numeric[3] ? Number(numeric[3]) : reference.year();
            const year = rawYear < 100 ? 2000 + rawYear : rawYear;
            parsedDate = validDate(year, Number(numeric[2]) - 1, Number(numeric[1]));
            if (parsedDate && !explicitYear && parsedDate.isBefore(reference.startOf('day'))) {
                parsedDate = validDate(reference.year() + 1, Number(numeric[2]) - 1, Number(numeric[1]));
            }
            if (parsedDate) {
                foundDate = true;
                consume(numeric.index, numeric[0].length);
            }
        }
    }

    if (!foundDate) {
        const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
        const named = working.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})(?:\\s+(\\d{4}))?(?:['’](?:de|da|te|ta))?\\b`, 'iu'));
        if (named && named.index !== undefined) {
            const explicitYear = Boolean(named[3]);
            parsedDate = validDate(Number(named[3] || reference.year()), MONTHS[fold(named[2])], Number(named[1]));
            // Like Calendar, a date without a year always means its next
            // occurrence. "3 Ocak" written in September is therefore next year.
            if (parsedDate && !explicitYear && parsedDate.isBefore(reference.startOf('day'))) {
                parsedDate = validDate(reference.year() + 1, MONTHS[fold(named[2])], Number(named[1]));
            }
            if (parsedDate) {
                foundDate = true;
                consume(named.index, named[0].length);
            }
        }
    }

    if (!foundDate) {
        const weekdayNames = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
        const weekday = working.match(new RegExp(`(?<![\\p{L}\\p{N}])(${weekdayNames})(?![\\p{L}\\p{N}])`, 'iu'));
        if (weekday && weekday.index !== undefined) {
            const wanted = WEEKDAYS[fold(weekday[1])];
            // A weekday means the next occurrence within the coming seven
            // days. If today is Monday, "Monday" means the following Monday.
            const rawDelta = (wanted - reference.day() + 7) % 7;
            const delta = rawDelta === 0 ? 7 : rawDelta;
            parsedDate = reference.add(delta, 'day').startOf('day');
            foundDate = true;
            consume(weekday.index, weekday[0].length);
        }
    }

    // Read a whole range before individual clock values, including bare hours
    // and mixed precision (9–14, 9:30–14, zwischen 9 und 14).
    spanType = 'time';
    const hour = '(?:[01]?\\d|2[0-3])(?:[:.][0-5]\\d)?';
    const range = working.match(new RegExp(
        `(?<![\\p{L}\\p{N}:./-])(${hour})\\s*(?:uhr\\s*)?(?:[-–—]|to|bis|ile|und|and)\\s*(${hour})(?![\\p{L}\\p{N}:./-])(?:\\s*uhr)?`, 'iu',
    )) ?? working.match(new RegExp(
        `(?<![\\p{L}\\p{N}:./-])(${hour})\\s+(${hour})\\s+(?:arası|arasi|arasında|arasinda)(?![\\p{L}\\p{N}])`, 'iu',
    ));
    let startMinutes: number | null = null;
    let endMinutes: number | null = null;
    if (range && range.index !== undefined) {
        startMinutes = clockMinutes(range[1]);
        endMinutes = clockMinutes(range[2]);
        consume(range.index, range[0].length);
    }

    const timeToken = /\b(?:[01]?\d|2[0-3])[:.][0-5]\d\s*(?:am|pm|uhr)?(?:['’](?:de|da|te|ta))?\b|\b(?:1[0-2]|0?[1-9])\s*(?:am|pm)\b|\b(?:[01]?\d|2[0-3])\s*uhr\b/giu;
    const timeMatches = Array.from(working.matchAll(timeToken));

    if (!range && timeMatches.length) {
        startMinutes = clockMinutes(timeMatches[0][0]);
        if (timeMatches.length > 1) {
            const firstEnd = (timeMatches[0].index ?? 0) + timeMatches[0][0].length;
            const secondStart = timeMatches[1].index ?? firstEnd;
            const between = fold(working.slice(firstEnd, secondStart));
            const secondEnd = secondStart + timeMatches[1][0].length;
            const afterSecond = fold(working.slice(secondEnd, secondEnd + 18));
            const beforeFirst = fold(working.slice(Math.max(0, (timeMatches[0].index ?? 0) - 18), timeMatches[0].index ?? 0));
            const hasRangeWords = /(?:-|–|—|to|bis|ile|arası|arasi|arasında|arasinda|zwischen)/u.test(between)
                || /(?:arası|arasi|arasında|arasinda)\b/u.test(afterSecond)
                || /(?:saat|from|between|von|zwischen)\s*$/u.test(beforeFirst);
            // Two clock values in one quick-entry sentence are treated as a
            // range even without punctuation: "Saat 18:00 22:00 arası".
            if (hasRangeWords || timeMatches.length === 2) endMinutes = clockMinutes(timeMatches[1][0]);
        }
        for (const match of [...timeMatches].reverse()) {
            if (match.index !== undefined) consume(match.index, match[0].length);
        }
    } else if (!range) {
        const markedHour = working.match(/\b(?:saat|at|um)\s+([01]?\d|2[0-3])\b/iu);
        if (markedHour && markedHour.index !== undefined) {
            startMinutes = Number(markedHour[1]) * 60;
            consume(markedHour.index, markedHour[0].length);
        }
    }

    const foundTime = startMinutes !== null;
    if (foundTime && endMinutes === null) endMinutes = (startMinutes as number) + 60;

    return {
        title: cleanTitle(working),
        date: parsedDate,
        startMinutes,
        endMinutes,
        foundDate,
        foundTime,
        spans: spans.sort((a, b) => a.start - b.start),
    };
};
