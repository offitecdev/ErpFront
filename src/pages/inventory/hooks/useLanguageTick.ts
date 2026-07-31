import { useEffect, useReducer } from 'react';
import i18n from '@/i18n';

/**
 * `t()` imperatif çağrıldığı için dil değişince bileşenler kendiliğinden
 * yeniden çizilmez; bu kanca languageChanged olayına abone olup zorlar.
 */
export const useLanguageTick = (): void => {
    const [, force] = useReducer((tick: number) => tick + 1, 0);
    useEffect(() => {
        const handler = () => force();
        i18n.on('languageChanged', handler);
        return () => { i18n.off('languageChanged', handler); };
    }, []);
};
