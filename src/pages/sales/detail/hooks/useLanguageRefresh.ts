import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Force a re-render when the active language changes, so components that read
// translations at render time (via t()) refresh their text on language switch.
export const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick((t: number) => t + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};
