import { useEffect, useState } from 'react';

/** Değeri `delay` ms sonra yansıtır — arama kutuları ve kolon filtreleri için. */
export const useDebouncedValue = <T,>(value: T, delay = 300): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return debounced;
};
