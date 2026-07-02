import { useEffect, useMemo, useState } from 'react';

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
// (deferred) full customer fetch, keeping the query synced to the saved
// customer, and the client-side filtered list shown in the dropdown.
export const useTenderCustomers = ({ canManage, isCreatingTender, detailCustomerName }: UseTenderCustomersParams) => {
    const [newTenderCustomerQuery, setNewTenderCustomerQuery] = useState('');
    const [newTenderCustomerOpen, setNewTenderCustomerOpen] = useState(false);
    const [newTenderCustomers, setNewTenderCustomers] = useState<CustomerOption[]>([]);
    const [newTenderCustomersLoading, setNewTenderCustomersLoading] = useState(false);

    useEffect(() => {
        if (!canManage) return;
        let cancelled = false;
        // Defer massive unpaginated fetch so it doesn't block LCP
        const timer = window.setTimeout(() => {
            if (cancelled) return;
            setNewTenderCustomersLoading(true);
            loadCustomerOptions()
                .then((rows) => {
                    if (!cancelled) setNewTenderCustomers(rows);
                })
                .catch(() => {
                    if (!cancelled) setNewTenderCustomers([]);
                })
                .finally(() => {
                    if (!cancelled) setNewTenderCustomersLoading(false);
                });
        }, 500);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [canManage]);

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
