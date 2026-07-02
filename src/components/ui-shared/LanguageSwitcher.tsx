import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LuGlobe as MdLanguage } from '@/components/icons/lucideLocal';
import { Check } from '../icons/antIconCompat';

import { t } from '@/i18n/translate';

const LANGUAGES = [
    { code: 'tr', flag: '🇹🇷', nativeName:t('language.tr') },
    { code: 'en', flag: '🇬🇧', nativeName:t('language.en') },
    { code: 'de', flag: '🇩🇪', nativeName:t('language.de') },
] as const;

export const LanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { i18n, t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const currentLanguageCode = i18n.resolvedLanguage || i18n.language;
    const current = LANGUAGES.find((l) => currentLanguageCode.startsWith(l.code)) ?? LANGUAGES[0];

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const change = (code: string) => {
        i18n.changeLanguage(code);
        setOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={ref}>
            <button
                type="button"
                title={`${t('language.changeLanguage')}: ${current.nativeName}`}
                aria-label={t('language.changeLanguage')}
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={`flex size-9 items-center justify-center rounded-full transition-colors ${
                    open ?t('auto.bg_272f67_text_white') :t('auto.text_slate_600_hover_bg_d3e3fd')
                }`}
            >
                <MdLanguage size={17} />
            </button>

            {open && (
                <div className="absolute top-11 right-0 z-50 min-w-[160px] rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200 animate-in fade-in slide-in-from-top-2">
                    <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {t('language.title')}
                    </div>
                    {LANGUAGES.map((lang) => (
                        <button
                            key={lang.code}
                            type="button"
                            onClick={() => change(lang.code)}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                                current.code === lang.code
                                    ?t('auto.bg_eef4ff_text_272f67')
                                    :t('auto.text_slate_700_hover_bg_slate_50')
                            }`}
                        >
                            <span className="text-base leading-none">{lang.flag}</span>
                            <span className="flex-1 text-left">{lang.nativeName}</span>
                            {current.code === lang.code && (
                                <Check size={11} color="#272f67" />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
