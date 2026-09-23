import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { type CustomerLite } from '../calendarShared';
import { fetchCustomers } from './CustomerPicker';

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
const noise = new Set('saat arasi arasinda ile icin musteri musterisi randevu toplanti siparis siparisi hatirlatici ziyaret toplantisi meeting appointment reminder order customer with for from between and bis von zwischen und kunde kunden termin besprechung bestellung uhr'.split(' '));

export function useQuickCustomerSuggestions(text: string, enabled: boolean) {
    const tenantId = useAuthStore((state) => state.selectedTenantId ?? state.user?.tenantId);
    const [result, setResult] = useState<{ query: string; rows: CustomerLite[]; failed: boolean } | null>(null);
    const tokens = [...new Set((text.match(/[\p{L}\p{N}]+/gu) ?? [])
        .filter((word) => word.length >= 2 && /\p{L}/u.test(word) && !noise.has(normalize(word))))].slice(0, 4);
    const query = JSON.stringify([tenantId, tokens]);
    useEffect(() => {
        if (!enabled || !tokens.length) return;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            const searches = await Promise.allSettled(tokens.map(async (token) => {
                const found = await fetchCustomers(token, 1, 12, controller.signal);
                // A short prefix also offers names while typing or with a typo
                // later in the word. Never download the whole customer directory.
                return found.items.length || token.length < 4
                    ? found.items
                    : (await fetchCustomers(token.slice(0, 3), 1, 12, controller.signal)).items;
            }));
            if (controller.signal.aborted) return;
            const pool = new Map<string, CustomerLite>();
            for (const search of searches) {
                if (search.status === 'fulfilled') search.value.forEach((row) => pool.set(row.id, row));
            }
            const score = (row: CustomerLite) => {
                const name = normalize(row.companyName);
                return tokens.reduce((total, token) => {
                    const word = normalize(token);
                    return total + (name.includes(word) ? 10 : name.includes(word.slice(0, 3)) ? 1 : 0);
                }, 0);
            };
            setResult({ query, failed: searches.every((search) => search.status === 'rejected'), rows: [...pool.values()]
                .filter((row) => score(row) > 0)
                .sort((a, b) => score(b) - score(a) || a.companyName.localeCompare(b.companyName))
                .slice(0, 5) });
        }, 300);
        return () => { window.clearTimeout(timer); controller.abort(); };
        // query contains the complete, tenant-scoped token list.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, enabled]);

    const current = result?.query === query ? result : null;
    return { rows: enabled ? current?.rows ?? [] : [], loading: enabled && tokens.length > 0 && !current, failed: Boolean(current?.failed) };
}
