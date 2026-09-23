/** Teknik sınıfın model numarasındaki kısa yazımı. */
export const panelRatingUnitLabel = (unit: string): string => {
    switch (String(unit || '').toUpperCase()) {
        case 'KW': return 'kW';
        case 'A': return 'A';
        case 'KVAR': return 'kvar';
        default: return '';
    }
};
