import { apiClient } from '../axios';

export interface CustomerContactDto {
    id: string;
    customerId?: string;
    firstName: string;
    lastName: string;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    isPrimaryContact: boolean;
}

export interface CustomerLocationDto {
    id: string;
    customerId?: string;
    name: string;
    kind?: string;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    contactPerson?: string | null;
    isPrimary: boolean;
    notes?: string | null;
}

export interface CustomerOrderDto {
    id: string;
    orderNumber: string;
    orderType: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    customerId?: string | null;
    projectId?: string | null;
    parentSalesOrderId?: string | null;
    tender?: { id: string; tenderNumber: string; status: string } | null;
    project?: { id: string; projectName: string; status: string } | null;
}

export const customerApi = {
    // Contact persons (Kontaktpersonen)
    addContact: (customerId: string, body: Partial<CustomerContactDto>) =>
        apiClient.post(`/customers/${customerId}/contacts`, body).then(r => r.data),
    updateContact: (customerId: string, contactId: string, body: Partial<CustomerContactDto>) =>
        apiClient.patch(`/customers/${customerId}/contacts/${contactId}`, body).then(r => r.data),
    deleteContact: (customerId: string, contactId: string) =>
        apiClient.delete(`/customers/${customerId}/contacts/${contactId}`),

    // Locations (Standorte)
    listLocations: (customerId: string): Promise<CustomerLocationDto[]> =>
        apiClient.get(`/customers/${customerId}/locations`).then(r => r.data),
    addLocation: (customerId: string, body: Partial<CustomerLocationDto>) =>
        apiClient.post(`/customers/${customerId}/locations`, body).then(r => r.data),
    updateLocation: (customerId: string, locationId: string, body: Partial<CustomerLocationDto>) =>
        apiClient.patch(`/customers/${customerId}/locations/${locationId}`, body).then(r => r.data),
    deleteLocation: (customerId: string, locationId: string) =>
        apiClient.delete(`/customers/${customerId}/locations/${locationId}`),

    // Notes edit/delete
    updateNote: (customerId: string, noteId: string, body: { noteText?: string; noteType?: string; isHighlight?: boolean }) =>
        apiClient.patch(`/customers/${customerId}/notes/${noteId}`, body).then(r => r.data),
    deleteNote: (customerId: string, noteId: string) =>
        apiClient.delete(`/customers/${customerId}/notes/${noteId}`),

    // Activities / logs edit/delete
    updateActivity: (customerId: string, activityId: string, body: { activityType?: string; description?: string; activityDate?: string }) =>
        apiClient.patch(`/customers/${customerId}/activities/${activityId}`, body).then(r => r.data),
    deleteActivity: (customerId: string, activityId: string) =>
        apiClient.delete(`/customers/${customerId}/activities/${activityId}`),

    // Orders (Aufträge) placed by this customer — all sales orders incl. addons
    listOrders: (customerId: string): Promise<CustomerOrderDto[]> =>
        apiClient.get(`/sales-orders?customerId=${customerId}`).then(r => r.data),
};
