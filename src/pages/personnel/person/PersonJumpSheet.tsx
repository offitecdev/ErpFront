import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { BottomSheet } from '@/components/ui-shared/BottomSheet';
import { isPathAllowed } from '@/lib/pageAccess';
import { useAuthStore } from '@/store/authStore';
import { EMPTY_CELL } from '../utils/format';

/**
 * ── DAS SPRUNGFENSTER ────────────────────────────────────────────────────────
 *
 * Vorgabe 17.08.2026: „Auf einen Termin klicken soll ein Fenster öffnen, und
 * was man darin wählt, führt in den zugehörigen Bereich."
 *
 * Also EIN Bauteil für alle drei Listen der Personenseite (Termine,
 * Besprechungen, Urlaub): oben die Einzelheiten des angeklickten Eintrags,
 * darunter die Wege, die von hier wegführen. Es liegt bewusst hier und nicht
 * dreimal in den Reitern — sonst wüchsen die drei Fenster auseinander.
 *
 * Ein Sprung SCHLIESST das Fenster, bevor er navigiert: sonst bliebe die
 * Bildlaufsperre des Fensters auf der Zielseite liegen.
 */

export interface JumpDetail {
    label: string;
    value: ReactNode;
}

export interface JumpTarget {
    key: string;
    label: string;
    hint?: string;
    to: string;
}

export const PersonJumpSheet = ({
    open,
    title,
    description,
    details,
    targets,
    onClose,
}: {
    open: boolean;
    title: string;
    description?: string;
    details: JumpDetail[];
    targets: JumpTarget[];
    onClose: () => void;
}) => {
    const navigate = useNavigate();
    const pageAccess = useAuthStore((state) => state.pageAccess);

    /* Nur Wege anbieten, die diese Person auch gehen darf: MainLayout wirft
       eine gesperrte Adresse auf die Startseite zurück, und ein Knopf, der dort
       endet, ist schlimmer als ein fehlender. */
    const allowed = targets.filter((target) => isPathAllowed(pageAccess, target.to));

    const jump = (to: string) => {
        onClose();
        navigate(to);
    };

    return (
        <BottomSheet open={open} title={title} description={description} size={620} closeOnBackdrop onClose={onClose}>
            <div className="flex flex-col gap-5">
                <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
                    {details.map((detail) => (
                        <div key={detail.label} className="min-w-0">
                            <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                                {detail.label}
                            </dt>
                            <dd className="mt-0.5 text-[13px] text-slate-800 dark:text-white/85">
                                {detail.value || EMPTY_CELL}
                            </dd>
                        </div>
                    ))}
                </dl>

                <div>
                    <span className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                        {t('personnel.person.jumpTitle')}
                    </span>
                    {allowed.length === 0 ? (
                        <p className="text-[12.5px] text-slate-400 dark:text-white/40">
                            {t('personnel.person.jumpNone')}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {allowed.map((target) => (
                                <button
                                    key={target.key}
                                    type="button"
                                    onClick={() => jump(target.to)}
                                    className="group flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5 text-left transition-colors hover:border-[#272f67] hover:bg-slate-50 dark:border-white/15 dark:hover:border-white/40 dark:hover:bg-white/5"
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-white">
                                            {target.label}
                                        </span>
                                        {target.hint && (
                                            <span className="block truncate text-[11.5px] text-slate-500 dark:text-white/55">
                                                {target.hint}
                                            </span>
                                        )}
                                    </span>
                                    <ArrowRight
                                        size={15}
                                        className="shrink-0 text-slate-300 transition-colors group-hover:text-[#272f67] dark:text-white/30 dark:group-hover:text-white"
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </BottomSheet>
    );
};
