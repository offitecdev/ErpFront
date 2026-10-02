import type { OrderPdfLang } from '@/utils/pdf/orderPdf';
import { DOC_LANGS } from '../utils/docLang';

/** DE · TR · EN — dieselbe Leiste im PDF- und im Mail-Reiter. */
export const DocLangSwitch = ({ value, onChange, disabled = false }: {
    value: OrderPdfLang;
    onChange: (lang: OrderPdfLang) => void;
    disabled?: boolean;
}) => (
    <div className="ofi-lager-tabs flex items-center gap-1 rounded-md border border-slate-200 p-0.5 dark:border-white/15">
        {DOC_LANGS.map((entry) => (
            <button
                key={entry}
                type="button"
                disabled={disabled}
                onClick={() => onChange(entry)}
                aria-current={value === entry ? 'page' : undefined}
                className={`rounded px-2.5 py-1 text-[11.5px] font-semibold uppercase transition-colors ${
                    value === entry
                        ? 'bg-[#0a7aff]/10 text-[#0a7aff] dark:bg-[#3b8dff]/25 dark:text-[#5c9fff]'
                        : 'text-slate-500 hover:bg-[#0a7aff]/[0.06] hover:text-[#0066e0] dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
            >
                {entry}
            </button>
        ))}
    </div>
);
