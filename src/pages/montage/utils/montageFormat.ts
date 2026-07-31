import { dateFmt, timeFmt } from '@/pages/project/features/installations/utils/installationFormatters';

export { dateFmt, timeFmt };
export { personName, durationFmt } from '@/pages/project/features/installations/utils/installationFormatters';

/** `09:00 - 17:00` for an appointment window. */
export const timeRange = (start?: string | null, end?: string | null) => `${timeFmt(start)} - ${timeFmt(end)}`;

/** `29.06.2026 · 09:00 - 17:00` */
export const dateTimeRange = (start?: string | null, end?: string | null) => `${dateFmt(start)} · ${timeRange(start, end)}`;
