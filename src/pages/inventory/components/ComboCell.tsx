import { Fragment, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnchoredPicker } from './AnchoredPicker';
import { CELL_INPUT_CLASS } from './primitives';

/** Listede gösterilen tek seçenek. */
export interface ComboOption {
    id: string;
    label: string;
    /** Etiketin sağında küçük gri bilgi (kod, stok, telefon…). */
    meta?: string;
    /** Grup başlığı: ardışık aynı gruplar tek başlık altında toplanır. */
    group?: string;
}

/** Listenin altındaki eylem satırları ("… ürün olarak ekle", "Tüm ürünler …"). */
export interface ComboAction {
    key: string;
    label: string;
    icon?: ReactNode;
    onSelect: () => void;
    disabled?: boolean;
}

/**
 * Satır içi arama hücresi: kutunun kendisi arama alanıdır (ayrı arama kutusu
 * yok), altına hücreye tutunan kısa bir liste açılır — teklif satırındaki ürün
 * açılırının aynısı. Liste 7 satırla sınırlıdır, altında eylem satırları durur.
 *
 * Eşleşme bulunmasa bile yazılan metin hücrede kalır: çağıran taraf bunu yeni
 * kayıt açmak için kullanır.
 */
export const ComboCell = ({
    open,
    onOpenChange,
    value,
    onChange,
    options,
    loading,
    onSelect,
    actions = [],
    placeholder,
    subtitle,
    invalid,
    emptyText,
    autoFocus,
    inputClassName = '',
    keepOpenOnSelect = false,
}: {
    /** Açık/kapalı durum çağıranda durur: veri çekmeyi de o kapatır. */
    open: boolean;
    onOpenChange: (next: boolean) => void;
    value: string;
    onChange: (next: string) => void;
    options: ComboOption[];
    loading: boolean;
    onSelect: (option: ComboOption) => void;
    actions?: ComboAction[];
    placeholder?: string;
    /** Hücrenin altında gösterilen küçük satır (seçilen kaydın kodu gibi). */
    subtitle?: ReactNode;
    invalid?: boolean;
    emptyText?: string;
    autoFocus?: boolean;
    inputClassName?: string;
    /** Çoklu seçim alanları (CC gibi): seçim listeyi KAPATMAZ, art arda
        seçilebilsin diye açık kalır. Odak da input'ta durur. */
    keepOpenOnSelect?: boolean;
}) => {
    // Vurgulanan satır index yerine ID ile tutulur: liste her yazışta yeniden
    // kurulduğu için index kayardı; kayıt listeden düşerse vurgu kendiliğinden söner.
    const [activeId, setActiveId] = useState<string | null>(null);
    // Ref yerine state: çapa elemanı render sırasında okunuyor, ref okumak
    // ilk açılışta boş kalırdı.
    const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const enabledActions = actions.filter((action) => !action.disabled);
    const activeIdx = activeId ? options.findIndex((option) => option.id === activeId) : -1;

    const move = (direction: 1 | -1) => {
        if (!options.length) return;
        const next = Math.min(options.length - 1, Math.max(0, (activeIdx < 0 ? -1 : activeIdx) + direction));
        setActiveId(options[next].id);
        listRef.current?.querySelector(`[data-item-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    };

    const pick = (option: ComboOption) => {
        onSelect(option);
        // Çoklu seçimde liste açık kalır (art arda seçim); odak input'ta durur.
        if (keepOpenOnSelect) return;
        onOpenChange(false);
        setActiveId(null);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!open) { onOpenChange(true); return; }
            event.preventDefault();
            event.stopPropagation();
            move(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (event.key === 'Enter') {
            // Vurgu varsa o, yoksa ilk eşleşme seçilir. Hiç eşleşme yoksa Enter
            // ilk eylemi çalıştırır — yani yazılan metin yeni kayda dönüşür.
            const target = activeIdx >= 0 ? options[activeIdx] : options[0];
            if (target) {
                event.preventDefault();
                pick(target);
                return;
            }
            if (open && enabledActions.length) {
                event.preventDefault();
                enabledActions[0].onSelect();
                onOpenChange(false);
            }
            return;
        }
        if (event.key === 'Escape') {
            event.stopPropagation();
            onOpenChange(false);
        }
    };

    return (
        <>
            <input
                ref={setInputEl}
                value={value}
                onChange={(event) => { onChange(event.target.value); onOpenChange(true); }}
                onFocus={() => onOpenChange(true)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoFocus={autoFocus}
                autoComplete="off"
                className={`${CELL_INPUT_CLASS} ${invalid ? '!border-dashed !border-slate-300' : ''} ${inputClassName}`}
            />
            {subtitle}

            <AnchoredPicker
                anchorEl={open ? inputEl : null}
                onClose={() => onOpenChange(false)}
                width={260}
                maxHeight={320}
                footer={enabledActions.length ? (
                    <div className="py-0.5">
                        {actions.filter((action) => !action.disabled).map((action) => (
                            <button
                                key={action.key}
                                type="button"
                                // pointerdown: input'un blur'undan önce çalışsın.
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    action.onSelect();
                                    onOpenChange(false);
                                }}
                                className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[12px] font-medium text-[#1f2654] transition-colors hover:bg-[#1f2654] hover:!text-white dark:text-white/80"
                            >
                                {action.icon}
                                <span className="truncate">{action.label}</span>
                            </button>
                        ))}
                    </div>
                ) : undefined}
            >
                <div ref={listRef} aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto py-0.5">
                    {loading && options.length === 0 && (
                        <div className="px-2 py-3 text-center text-[12px] text-slate-400 dark:text-white/50">…</div>
                    )}
                    {!loading && options.length === 0 && emptyText && (
                        <div className="px-2 py-3 text-center text-[12px] text-slate-400 dark:text-white/50">{emptyText}</div>
                    )}
                    {options.map((option, index) => (
                        <Fragment key={option.id}>
                        {option.group && option.group !== options[index - 1]?.group && (
                            <>
                                {index > 0 && <div className="mx-2 mt-1 h-px bg-[#07145c] dark:bg-[#d48f16]" />}
                                <div className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                                    {option.group}
                                </div>
                            </>
                        )}
                        <button
                            type="button"
                            data-item-index={index}
                            title={option.label}
                            onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                event.preventDefault();
                                pick(option);
                            }}
                            className={`ofi-option-row group flex w-full items-center gap-2 px-2 py-1 text-left transition-colors hover:bg-[#1f2654] ${
                                index === activeIdx ? 'bg-amber-100 ring-1 ring-inset ring-amber-400' : ''
                            }`}
                        >
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-900 group-hover:!text-white dark:text-white">
                                {option.label}
                            </span>
                            {option.meta && (
                                <span className="shrink-0 font-mono text-[11px] text-slate-400 group-hover:!text-white/70">
                                    {option.meta}
                                </span>
                            )}
                        </button>
                        </Fragment>
                    ))}
                </div>
            </AnchoredPicker>
        </>
    );
};
