import { t } from '@/i18n/translate';

export type MaterialMode = 'used' | 'extra';

export const getMaterialSubTabs = (): Array<{ key: MaterialMode; label: string }> => [
    { key: 'used', label: t('auto.kullanilan_malzemeler') },
    { key: 'extra', label: t('auto.ek_malzemeler') },
];
