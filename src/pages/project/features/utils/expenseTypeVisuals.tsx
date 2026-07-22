import type React from 'react';

import {
    Building02,
    Package,
    Receipt as ReceiptText,
    Truck01,
    Wrench,
} from '@/components/icons/antIconCompat';

// Every external-cost type gets its own icon + tint so a list of expenses is
// scannable at a glance instead of five identical grey rows. Keys are matched
// against the stored Turkish type strings (case/diacritic tolerant).
type ExpenseVisual = { icon: React.ReactNode; chip: string };

const VISUALS: Record<string, ExpenseVisual> = {
    transport: { icon: <Truck01 size={13} />, chip: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300' },
    equipment: { icon: <Wrench size={13} />, chip: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300' },
    external: { icon: <Building02 size={13} />, chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' },
    subcontractor: { icon: <Package size={13} />, chip: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300' },
    other: { icon: <ReceiptText size={13} />, chip: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70' },
};

const normalize = (value?: string | null) =>
    String(value || '')
        .toLocaleLowerCase('tr')
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');

export const expenseTypeVisual = (expenseType?: string | null): ExpenseVisual => {
    const key = normalize(expenseType);
    if (key.includes('nakliye') || key.includes('transport')) return VISUALS.transport;
    if (key.includes('ekipman') || key.includes('equipment') || key.includes('gerate') || key.includes('miete')) return VISUALS.equipment;
    if (key.includes('hizmet') || key.includes('service') || key.includes('dienst')) return VISUALS.external;
    if (key.includes('taseron') || key.includes('subcontract') || key.includes('subunternehm')) return VISUALS.subcontractor;
    return VISUALS.other;
};
