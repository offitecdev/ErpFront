/** Heute/Morgen … zu einer vollen Stunde, als ISO (Görevly: Ende = 18:00, Erinnerung = 09:00). */
export const dayAtHour = (daysFromToday: number, hour: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromToday);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
};

/** «1 saat sonra». */
export const inOneHour = (): string => new Date(Date.now() + 3_600_000).toISOString();
