import type { ReactNode } from 'react';
import type { PositionDto, TenderDocumentDto } from '../../../../types/tender';

export type TextField = 'shortDescription' | 'unit';
export type NumberField = 'quantity' | 'unitPrice' | 'discount' | 'taxRate';

export type InlinePositionPatch = Pick<
    Partial<PositionDto>,
    'quantity' | 'unit' | 'unitPrice' | 'discount' | 'taxRate' | 'shortDescription' | 'longDescription' | 'rowType' | 'imageUrl' | 'displayOrder'
>;

export type ProductSource = {
    id?: string | null;
    articleCode?: string | null;
    name?: string | null;
    description?: string | null;
    unit?: string | null;
    baseCost?: number | null;
    salePrice?: number | null;
    weightedAverageCost?: number | null;
    costBasisQuantity?: number | null;
    supplierCostQuantity?: number | null;
    manualCostQuantity?: number | null;
    imageUrl?: string | null;
};

export type ManualProductForm = {
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    discount: number;
    taxRate: number;
    description: string;
    imageUrl: string;
};

export type SimpleTenderLine = {
    id: string;
    label: string;
    kind: 'TITLE' | 'DESCRIPTION' | 'PRODUCT';
    position: PositionDto;
    total: number;
};

export type ChatterTimelineItem = {
    id: string;
    date: string;
    actor: string;
    tone: string;
    title: string;
    body: string;
    document?: TenderDocumentDto;
};

export type DetailInfoRow = {
    label: string;
    lines?: Array<string | null | undefined>;
    content?: ReactNode;
};

export type CustomerOption = {
    id: string;
    companyName: string;
    segment?: string | null;
    mainEmail?: string | null;
    mainPhone?: string | null;
    addressName?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    taxNumber?: string | null;
};

export type TenderLineColumnKey = 'select' | 'description' | 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'taxRate' | 'total';

export type TenderSettingsTabKey = 'mail' | 'schedule' | 'overtime' | 'materials';
export type TenderWorkspaceTabKey = 'lines' | TenderSettingsTabKey | 'technician' | 'assets';
