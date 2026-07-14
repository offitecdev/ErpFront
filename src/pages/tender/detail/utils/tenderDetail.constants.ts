import type { TenderChatterSummary } from '../../../../types/tender';
import type { TenderLineColumnKey } from '../types/tenderDetail.types';

export const DEFAULT_VAT = 8.1;
export const SECTION_SCHEMA_STORAGE_KEY = 'offitec:tender-detail:section-schema-open';
export const EMPTY_CHATTER_SUMMARY: TenderChatterSummary = { noteCount: 0, documentCount: 0, logCount: 0 };
export const DEFAULT_TENDER_LINE_COLUMN_WIDTHS: Record<TenderLineColumnKey, number> = {
    select: 34,
    description: 720,
    quantity: 88,
    unit: 88,
    unitPrice: 96,
    discount: 84,
    taxRate: 84,
    total: 104,
};

export const LINE_PAGE_SIZE = 10;
export const PRODUCT_PICKER_PAGE_SIZE = 15;
export const lineActionButtonClass = '!border-slate-200 !bg-white !text-slate-700 transition-colors hover:!border-[#1f2654] hover:!bg-slate-50 hover:!text-[#1f2654]';


export const INLINE_NUMBER_INPUT_CLASS =
    'w-full min-w-0 rounded-md border border-transparent bg-transparent transition-colors hover:border-slate-300 hover:bg-white focus-within:border-[#1f2654] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1f2654]/10 [&_.ant-input-number-input]:h-auto [&_.ant-input-number-input]:px-1.5 [&_.ant-input-number-input]:py-1 [&_.ant-input-number-input]:text-right [&_.ant-input-number-input]:font-mono [&_.ant-input-number-input]:text-[11.5px] [&_.ant-input-number-input]:leading-tight [&_.ant-input-number-input]:text-slate-700';
export const INLINE_TEXT_INPUT_BASE =
    'w-full rounded-md border border-transparent bg-transparent transition-colors hover:border-slate-200 hover:bg-slate-50 focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10';
export const INLINE_TITLE_INPUT_CLASS = `${INLINE_TEXT_INPUT_BASE} text-[14px] font-semibold text-slate-900`;
export const INLINE_NAME_INPUT_CLASS = `${INLINE_TEXT_INPUT_BASE} text-[13px] font-medium text-slate-900`;
