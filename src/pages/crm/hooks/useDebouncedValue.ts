import { useEffect, useState } from 'react';

/**
 * Tastatureingaben entprellen, bevor sie in eine Serveranfrage laufen.
 * Die CRM-Listen suchen serverseitig — ohne das schickt jeder Tastendruck
 * eine eigene Runde los.
 */
export const useDebouncedValue = <T>(value: T, delayMs = 250): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(id);
    }, [value, delayMs]);
    return debounced;
};
