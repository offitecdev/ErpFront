/* Neutral surface ramp tuned to the brand navy #07145c (hue ≈ 231°): cool grays
   that carry a faint navy undertone so panels and tables sit naturally next to
   brand-colored elements. Shared by the CRM overview and the calendar. */
export const BRAND_NAVY = '#07145c';

/** Page / section background behind white cards. */
export const SURFACE_GRAY = '#F2F4F9';
/** Row / table / cell background on top of white cards. */
export const SURFACE_GRAY_SOFT = '#F7F8FC';
/** Table header / grid heading band. */
export const SURFACE_GRAY_HEADER = '#EEF1F7';
/** Hairline borders on the gray surfaces. */
export const SURFACE_BORDER = '#E3E7F0';

/* Tailwind arbitrary-value class fragments for the same ramp (kept next to the
   hex values so both stay in sync). */
export const CLS_ROW_BG = 'bg-[#F7F8FC] dark:bg-white/4';
export const CLS_HEADER_BG = 'bg-[#EEF1F7] dark:bg-white/6';
export const CLS_BORDER = 'border-[#E3E7F0] dark:border-white/8';

/* Light glass: frosted, shadow-free panel — the only "glass" treatment; deep
   navy fills and drop shadows read as artificial and are deliberately avoided. */
export const CLS_LIGHT_GLASS =
    'border border-[#E3E7F0] bg-white/65 backdrop-blur-md dark:border-white/10 dark:bg-white/6';
