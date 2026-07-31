// Sayı/tarih biçimlendirme — eski envanter sayfalarıyla aynı yerel ayarlar (de-CH / CHF).

export const fmtMoney = (value?: number | null): string =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(Number(value) || 0);

/** Para birimi kolonlu kayıtlar (ör. siparişler) için — geçersiz kodda CHF'ye düşer. */
export const fmtMoneyIn = (value: number | null | undefined, currency?: string | null): string => {
    try {
        return new Intl.NumberFormat('de-CH', { style: 'currency', currency: currency || 'CHF', maximumFractionDigits: 2 }).format(Number(value) || 0);
    } catch {
        return fmtMoney(value);
    }
};

export const fmtQty = (value?: number | null): string =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(Number(value) || 0);

export const fmtDate = (value?: string | Date | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('de-CH');
};

export const fmtDateTime = (value?: string | Date | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleDateString('de-CH')} ${date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`;
};

/** "12,5" / "12.5" / 12.5 → sayı; boş/geçersiz → null. */
export const parseNum = (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const normalized = String(value).trim().replace(/\s/g, '').replace(/'/g, '').replace(',', '.');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};
