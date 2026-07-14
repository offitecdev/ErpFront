import { memo } from 'react';
import type React from 'react';

import { Check } from '@/components/icons/antIconCompat';

// Shared signature row: a label with a check once signed, and caller-supplied actions
// (a get-signature button, or capture + send buttons) on the right.
export const InstallationSignatureSection = memo(({
    label,
    signed,
    children,
}: {
    label: string;
    signed: boolean;
    children: React.ReactNode;
}) => (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-800">
            {label}
            {signed && <Check size={15} className="text-emerald-600" />}
        </div>
        {children}
    </div>
));
