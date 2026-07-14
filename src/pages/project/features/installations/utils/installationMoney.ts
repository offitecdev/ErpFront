// Constructing an Intl.NumberFormat is relatively expensive and these run in tight
// render loops (material/expense/overtime rows), so keep one shared instance each at
// module scope instead of rebuilding one per call.
const currencyFormatter = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 });
const decimalFormatter = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 });

export const money = (value?: number | null) => currencyFormatter.format(Number(value || 0));

export const numberFmt = (value?: number | null) => decimalFormatter.format(Number(value || 0));
