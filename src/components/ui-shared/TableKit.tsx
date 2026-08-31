import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, SearchLg, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { SkeletonTableRows } from './Loader';

/** Tablo filtre satırındaki input sınıfı — ferah ve yumuşak köşeli. */
export const FILTER_INPUT_CLASS =
    'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] font-normal normal-case tracking-normal text-slate-700 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-700/10 dark:border-white/15 dark:bg-transparent dark:text-white';

/** Satır içi (hücre) düzenleme inputu — toplu ekleme tabloları. */
export const CELL_INPUT_CLASS =
    'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13.5px] text-slate-800 placeholder:text-slate-300 transition-colors hover:border-slate-300 focus:border-[#1f2654] focus:outline-none dark:border-white/15 dark:bg-transparent dark:text-white';

/** Bölüm çerçevesi — yumuşak köşeler, hafif gölge, ferah başlık şeridi. */
/* `data-table-scroll`: tablet/telefon genişliğinde (lg altı) gövde yatay
   kaydırma alanına dönüşür — tablo kolonlarını okunmaz şeritlere sıkıştırmak
   yerine en az genişliğini koruyup yana kayar. Kart başlığı ile alttaki
   sayfalama şeridi yerinde durur (bkz. index.css "RESPONSIVE TABLES"). */
/**
 * `collapsible`: başlık şeridi açılıp kapanan bir düğmeye dönüşür — uzun
 * tablolar (faturalama, saha raporu kaynakları) katlanıp yer açabilsin diye.
 * Katlanan kartta yalnızca başlık kalır; `action` düğmeleri erişilebilir
 * kalsın diye başlıkta durmayı sürdürür.
 */
export const SectionCard = ({ title, action, children, collapsible = false, defaultOpen = true }: {
    /** Ohne Titel: kopfloser Rahmen — die Überschrift trägt die Ebene darüber. */
    title?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    collapsible?: boolean;
    defaultOpen?: boolean;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const headless = title === undefined;
    const expanded = headless || !collapsible || open;
    return (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-white/15 dark:bg-transparent dark:shadow-none">
            {!headless && (
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
                {collapsible ? (
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        aria-expanded={open}
                        title={open ? t('common.collapse') : t('common.expand')}
                        className="flex min-w-0 items-center gap-1.5 text-left"
                    >
                        <ChevronDown
                            size={14}
                            className={`shrink-0 text-slate-400 transition-transform dark:text-white/50 ${open ? '' : '-rotate-90'}`}
                        />
                        <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-white">{title}</span>
                    </button>
                ) : (
                    <span className="text-[13px] font-semibold text-slate-800 dark:text-white">{title}</span>
                )}
                {action}
            </header>
            )}
            {expanded && <div data-table-scroll>{children}</div>}
        </section>
    );
};

/** Genel arama kutusu — etiket sarmalı, odaklanınca çerçeve koyulaşır. */
export const SearchBox = ({
    value,
    onChange,
    placeholder,
    className = '',
    autoFocus,
    onFocus,
    onBlur,
    onKeyDown,
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
    onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) => (
    <label className={`flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 focus-within:border-[#1f2654] dark:border-white/20 dark:bg-transparent dark:shadow-none ${className}`}>
        <SearchLg size={15} className="shrink-0 text-slate-400" />
        <input
            autoFocus={autoFocus}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent text-[13.5px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
        />
        {value && (
            <button
                type="button"
                aria-label={t('common.clear')}
                onClick={() => onChange('')}
                className="shrink-0 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-white"
            >
                <X size={13} />
            </button>
        )}
    </label>
);

/** Sayfalama alt bloğu: "12-24 / 96" + ok butonları. */
export const Pager = ({
    page,
    totalPages,
    total,
    pageSize,
    onPage,
}: {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    onPage: (next: number) => void;
}) => {
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">{from}-{to} / {total}</span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label={t('common.back')}
                    disabled={page <= 1}
                    onClick={() => onPage(page - 1)}
                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                >
                    <ChevronLeft size={15} />
                </button>
                <span className="ofi-page-number min-w-14 text-center font-mono text-slate-600 dark:text-white/70">{page} / {totalPages}</span>
                <button
                    type="button"
                    aria-label={t('common.next')}
                    disabled={page >= totalPages}
                    onClick={() => onPage(page + 1)}
                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                >
                    <ChevronRight size={15} />
                </button>
            </div>
        </div>
    );
};

/** Giriş/Çıkış gibi ikili seçim için hap grubu (SubTabs deseni). */
export const ToggleGroup = <T extends string>({
    options,
    value,
    onChange,
}: {
    options: Array<{ key: T; label: string }>;
    value: T;
    onChange: (next: T) => void;
}) => (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-white/15 dark:bg-white/5">
        {options.map((option) => (
            <button
                key={option.key}
                type="button"
                onClick={() => onChange(option.key)}
                className={`rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    value === option.key
                        ? 'bg-[#272f67] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-950 dark:text-white/70 dark:hover:text-white'
                }`}
            >
                {option.label}
            </button>
        ))}
    </div>
);

/**
 * Tablo gövdesinde yükleniyor/boş durum satırı.
 *
 * Yükleniyorken "Yükleniyor…" yazısı yerine kolon sayısı kadar parıltılı
 * iskelet satırı çizer (ui-shared/Loader). Bu bileşen uygulamadaki bütün
 * tabloların ortak durum satırı olduğundan, yükleme animasyonu tek yerden
 * gelir — çağıranların ayrıca bir şey eklemesi gerekmez.
 */
export const TableStateRow = ({
    colSpan,
    loading,
    emptyText,
    skeletonRows = 5,
}: {
    colSpan: number;
    loading: boolean;
    emptyText: string;
    /** İskelet satır sayısı — kısa tablolarda azaltılabilir. */
    skeletonRows?: number;
}) => {
    if (loading) return <SkeletonTableRows rows={skeletonRows} columns={colSpan} />;
    return (
        <tr>
            <td colSpan={colSpan} className="py-12 text-center text-[13px] text-slate-400 dark:text-white/50">
                {emptyText}
            </td>
        </tr>
    );
};

/**
 * Ayarlanabilir kolon başlığı: ALTI ÇİZİLİ ve tıklanabilir — kolonun kendi
 * ayar penceresini açar (ör. indirim sütunlarını çoğaltmak, KDV oranı seçmek).
 * Alt çizgi, başlığın salt etiket değil düğme olduğunu gösteren tek işarettir;
 * ayar etkinse (`active`) başlık vurgulanır ve `hint` ipucu olarak gösterilir.
 */
export const ActionTh = ({
    label,
    onClick,
    active = false,
    hint,
    className = '',
}: {
    label: ReactNode;
    onClick: () => void;
    active?: boolean;
    hint?: string;
    className?: string;
}) => (
    <th className={className}>
        <button
            type="button"
            onClick={onClick}
            title={hint}
            aria-haspopup="dialog"
            className={`inline-flex items-center gap-1 underline decoration-dotted decoration-from-font underline-offset-[3px] transition-colors hover:text-[#1f2654] dark:hover:text-white ${
                active ? 'text-[#1f2654] dark:text-white' : ''
            }`}
        >
            {label}
        </button>
    </th>
);

/**
 * Genişletilebilir sütunların `<col>` etiketleri. Genişliği yazılmayan sütunlar
 * için tabloda ayrıca düz bir `<col />` bulunur; onları uygulama geneli katman
 * (`lib/autoColumnResize`) ölçüp dondurur ve kendi tutamacını takar — sütun
 * sırası artık serbesttir (bkz. `lib/columnLayout`).
 */
export const ResizableCols = <K extends string>({
    keys,
    grid,
}: {
    keys: readonly K[];
    grid: { widths: Record<K, number>; setColRef: (key: string) => (el: HTMLTableColElement | null) => void };
}) => (
    <>
        {keys.map((key) => (
            <col key={key} ref={grid.setColRef(key)} style={{ width: grid.widths[key] }} />
        ))}
    </>
);

/**
 * Sütun genişletme tutamacı iki sütunun arasındaki sınırda oturur. Sağa çekince
 * soldaki sütun genişler ve sağdaki aynı miktarda daralır; tablo toplamı sabit
 * kaldığı için kartın sağında boşluk oluşmaz (kural: `lib/columnLayout`). Çift
 * tıklama sınırı varsayılan orana döndürür. Bulunduğu `<th>`
 * `relative` olmalıdır ve tablo `table-layout: fixed` + `<colgroup>`
 * kullanmalıdır (bkz. `useColumnWidths`).
 *
 * Görünüm `.ofi-col-grip` sınıfından gelir (index.css): kalın gri bir tutamaç.
 * AYNI sınıfı, elle bağlanmamış tablolara tutamaç ekleyen uygulama geneli
 * katman da kullanır (`lib/autoColumnResize`) — iki yol da birebir aynı görünür.
 */
export const ColResizeHandle = ({
    onResizeStart,
    onResizeReset,
}: {
    onResizeStart: (event: React.PointerEvent) => void;
    onResizeReset?: () => void;
}) => (
    <span
        role="separator"
        aria-orientation="vertical"
        data-col-resizer="react"
        title={t('tenders.column_resize')}
        onPointerDown={onResizeStart}
        onDoubleClick={onResizeReset}
        onClick={(event) => event.stopPropagation()}
        className="ofi-col-grip ofi-col-grip--right"
    />
);

/** Sıralanabilir başlık: tıklandıkça asc/desc döner, aktif yön küçük okla görünür. */
export const SortableTh = <K extends string>({
    label,
    sortKey,
    activeKey,
    direction,
    onSort,
    className = '',
    onResizeStart,
    onResizeReset,
}: {
    label: ReactNode;
    sortKey: K;
    activeKey: K;
    direction: 'asc' | 'desc';
    onSort: (key: K) => void;
    className?: string;
    /** Verilirse başlığın SAĞ kenarı sütunu genişletme tutamacı olur. */
    onResizeStart?: (event: React.PointerEvent) => void;
    onResizeReset?: () => void;
}) => (
    <th className={`relative ${className}`}>
        <button
            type="button"
            onClick={() => onSort(sortKey)}
            className="inline-flex items-center gap-1 transition-colors hover:text-[#1f2654] dark:hover:text-white"
        >
            {label}
            {activeKey === sortKey && (direction === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
        </button>
        {onResizeStart && <ColResizeHandle onResizeStart={onResizeStart} onResizeReset={onResizeReset} />}
    </th>
);
