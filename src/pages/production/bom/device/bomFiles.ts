import { toast } from 'sonner';

import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';

/** Ein Blob in einem neuen Tab (das Fenster öffnet sofort — sonst hält der Browser es für ein Popup). */
export const openBlob = async (
    load: () => Promise<Blob>,
    errorText: (error: unknown) => string = productionBomErrorText,
): Promise<void> => {
    const opened = window.open('', '_blank');
    try {
        const url = URL.createObjectURL(await load());
        if (opened) opened.location.href = url;
        else window.open(url, '_blank');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
        opened?.close();
        toast.error(errorText(error));
    }
};

/** Eine Datei aus dem Speicher des Servers in einem neuen Tab zeigen. */
export const openQuoteFile = (purchaseOrderId: string): Promise<void> =>
    openBlob(() => productionBomApi.quoteFile(purchaseOrderId));

/** Die Bestätigung des Lieferanten zur Fassung VOR der Revision `number` der Bestellung. */
export const openArchivedQuote = (purchaseOrderId: string, number: number): Promise<void> =>
    openBlob(() => productionBomApi.purchaseRevisionQuote(purchaseOrderId, number));
