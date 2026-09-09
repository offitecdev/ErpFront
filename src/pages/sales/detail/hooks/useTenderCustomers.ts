import { useEffect, useMemo, useRef, useState } from 'react';

import { apiClient } from '@/lib/axios';

import type { CustomerOption } from '../types/tenderDetail.types';

const normalizeRows = <T,>(value: any): T[] => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.customers)) return value.customers;
    if (Array.isArray(value?.data)) return value.data;
    return [];
};

const loadCustomerOptions = async () => {
    const res = await apiClient.get('/customers?page=1&pageSize=200');
    return normalizeRows<CustomerOption>(res.data);
};

type UseTenderCustomersParams = {
    canManage: boolean;
    isCreatingTender: boolean;
    detailCustomerName?: string | null;
};

// Owns the tender's customer-picker list state: the query/open UI state, the
// on-demand customer fetch, keeping the query synced to the saved
// customer, and the client-side filtered list shown in the dropdown.
export const useTenderCustomers = ({ canManage, isCreatingTender, detailCustomerName }: UseTenderCustomersParams) => {
    const [newTenderCustomerQuery, setNewTenderCustomerQuery] = useState('');
    const [newTenderCustomerOpen, setNewTenderCustomerOpen] = useState(false);
    const [newTenderCustomers, setNewTenderCustomers] = useState<CustomerOption[]>([]);
    const [newTenderCustomersLoading, setNewTenderCustomersLoading] = useState(false);
    /** Läuft gerade eine Anfrage? Ersetzt den früheren Abbruch (siehe unten). */
    const customersInFlight = useRef(false);

    useEffect(() => {
        if (!canManage || !newTenderCustomerOpen || newTenderCustomers.length > 0) return;
        if (customersInFlight.current) return;
        // The customer list is only fetched once the picker is opened. Keeping it
        // off the initial detail path avoids an unnecessary request and parse.
        //
        // Die Anfrage gehört der SEITE, nicht dem geöffneten Menü: Sie wird
        // bewusst NICHT abgebrochen, wenn das Feld den Fokus verliert. Vorher
        // hing an diesem Effekt ein `cancelled`-Wächter — verliess der Cursor
        // das Feld, während die Liste noch lud (der Blur schliesst das Menü nach
        // 120 ms, der Effekt lief danach mit `open === false` erneut), warfen
        // `then` UND `finally` ihr Ergebnis weg: die Zeilen kamen nie an und
        // `loading` blieb für immer stehen. Das Feld war damit dauerhaft
        // ausgegraut, schluckte jeden weiteren Klick, und die Kundenliste
        // erschien bis zum Neuladen der Seite nicht mehr.
        setNewTenderCustomersLoading(true);
        customersInFlight.current = true;
        void loadCustomerOptions()
            .then((rows) => setNewTenderCustomers(rows))
            // Fehlgeschlagen (offline, fehlendes Recht): Die Liste bleibt leer,
            // der nächste Klick ins Feld versucht es erneut.
            .catch(() => undefined)
            .finally(() => {
                customersInFlight.current = false;
                setNewTenderCustomersLoading(false);
            });
    }, [canManage, newTenderCustomerOpen, newTenderCustomers.length]);

    useEffect(() => {
        if (isCreatingTender || newTenderCustomerOpen) return;
        setNewTenderCustomerQuery(detailCustomerName || '');
    }, [detailCustomerName, isCreatingTender, newTenderCustomerOpen]);

    const currentTenderCustomerName = String(detailCustomerName || '').trim().toLocaleLowerCase('tr-TR');
    const filteredNewTenderCustomers = useMemo(() => {
        const query = newTenderCustomerQuery.trim().toLocaleLowerCase('tr-TR');
        const shouldFilter = query && query !== currentTenderCustomerName;
        const rows = shouldFilter
            ? newTenderCustomers.filter((customer) => [
                customer.companyName,
                customer.segment,
                customer.address,
                customer.mainEmail,
                customer.mainPhone,
            ].some((value) => String(value || '').toLocaleLowerCase('tr-TR').includes(query)))
            : newTenderCustomers;
        return rows.slice(0, 30);
    }, [currentTenderCustomerName, newTenderCustomerQuery, newTenderCustomers]);

    return {
        newTenderCustomerQuery,
        setNewTenderCustomerQuery,
        newTenderCustomerOpen,
        setNewTenderCustomerOpen,
        newTenderCustomers,
        setNewTenderCustomers,
        newTenderCustomersLoading,
        filteredNewTenderCustomers,
    };
};
