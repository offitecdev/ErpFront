import dayjs from 'dayjs';

// Default "valid until" for a tender: one month out, formatted as YYYY-MM-DD.
export const defaultTenderValidUntil = () => dayjs().add(1, 'month').format('YYYY-MM-DD');
