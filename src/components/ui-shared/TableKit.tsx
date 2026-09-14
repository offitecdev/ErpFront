import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, SearchLg, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { SkeletonTableRows } from './Loader';

/**
 * Tablo filtre satırındaki input sınıfı.
 *
 * Ölçü, kenar ve köşe artık `styles/controls.css` § 7'de (`.ofi-filter-input`):
 * arama kutusu ve filtre ile AYNI 44px yükseklik, AYNI 2px lacivert kenar,
 * AYNI odak halkası (09.09.2026, Samet: «tablo içindeki filtre kutularının
 * kenarları da lacivert olsun»). Burada yalnızca tablo başlığından gelen
 * büyük harf/harf aralığını sıfırlayan yardımcı sınıflar kalır — onlar
 * `th` üzerinden miras alınır, CSS'te de sıfırlanır ama iki yerde durması
 * zararsızdır ve sınıfın tek başına da doğru görünmesini sağlar.
 */
export const FILTER_INPUT_CLASS = 'ofi-filter-input w-full font-normal normal-case tracking-normal';

/** Satır içi (hücre) düzenleme inputu — toplu ekleme tabloları. Aynı kenar,
 *  aynı ölçü; istisnalar Tailwind'in `!` önekiyle yazılır (`!h-10`,
 *  `!border-red-400`) — katmanlı `!important` katmansızı yener. */
export const CELL_INPUT_CLASS = 'ofi-cell-input w-full font-normal normal-case tracking-normal';

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
        <section className="ofi-section-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-white/15 dark:bg-transparent dark:shadow-none">
            {!headless && (
            <header className="ofi-section-card__head flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
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

/**
 * Das Suchfeld der ganzen Anwendung — EIN Mass, EIN Ort, EINE Bewegung.
 *
 * Aussehen und Masse stehen in `styles/controls.css` (`.ofi-search`); hier
 * steht nur, WANN sich die Lupe bewegt:
 *
 *   · Lupe und Platzhalter stehen in der Ruhe MITTIG im Feld und rutschen an
 *     die linke Kante, sobald das Feld den Zeiger bekommt oder etwas darin
 *     steht (Apple-Muster, Safari/iOS). Das macht das Stylesheet allein über
 *     `:focus-within` und `data-filled`.
 *   · Beim BEGINN einer Suche — der Übergang von leer zu nicht leer — schlägt
 *     die Lupe einmal kurz aus. Ein `key`-Wechsel auf dem Symbol hängt das
 *     Element neu ein; nur so läuft dieselbe Bewegung auch beim zweiten Mal
 *     wieder von vorn (eine Klasse allein würde beim erneuten Setzen nichts
 *     auslösen).
 *   · `busy` — solange der Server antwortet — lässt sie ruhig pendeln.
 *
 * Der sichtbare Platzhalter ist bewusst ein eigenes `<span>` und nicht das
 * `placeholder`-Attribut: nur ein echtes Element lässt sich zusammen mit der
 * Lupe verschieben. Das Attribut bleibt trotzdem gesetzt (durchsichtig
 * gefärbt), damit Vorlesehilfen und die Browsersuche es weiter finden.
 */
export const SearchBox = ({
    value,
    onChange,
    placeholder,
    className = '',
    autoFocus,
    busy = false,
    onFocus,
    onBlur,
    onKeyDown,
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    className?: string;
    /** Zusatzklassen — `is-grow`, wenn das Feld die Zeile füllen soll. */
    autoFocus?: boolean;
    /** Läuft gerade eine Abfrage? Dann pendelt die Lupe. */
    busy?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
    onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) => {
    const filled = value.length > 0;
    // Zählt die Suchbeginne. Der Wert selbst ist gleichgültig — er dient nur
    // als `key`, damit das Symbol neu eingehängt wird und die Bewegung neu
    // startet.
    const [scanTick, setScanTick] = useState(0);
    const wasFilled = useRef(false);

    useEffect(() => {
        if (filled && !wasFilled.current) setScanTick((n) => n + 1);
        wasFilled.current = filled;
    }, [filled]);

    return (
        <label
            className={`ofi-search ${className}`.trim()}
            data-filled={filled ? 'true' : 'false'}
            data-busy={busy ? 'true' : 'false'}
        >
            <span className="ofi-search__lead" aria-hidden="true">
                <span key={scanTick} className="ofi-search__icon" data-scan={scanTick > 0 ? 'on' : 'off'}>
                    <SearchLg size={16} />
                </span>
                {placeholder && <span className="ofi-search__ph">{placeholder}</span>}
            </span>
            <input
                type="search"
                autoFocus={autoFocus}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                aria-label={placeholder}
                className="ofi-search__input"
            />
            {filled && (
                <button
                    type="button"
                    aria-label={t('common.clear')}
                    onClick={() => onChange('')}
                    className="ofi-search__clear ofi-btn-plain ofi-nosize"
                >
                    <X size={13} />
                </button>
            )}
        </label>
    );
};

/**
 * Die Werkzeugzeile einer Listenseite: Suche zuerst, Filter dahinter, alles
 * im selben Abstand und auf derselben Linie. Handlungen, die rechts stehen
 * sollen, kommen in `end`.
 *
 * Sie ersetzt das seitenweise `flex flex-wrap items-center gap-2`, damit
 * Abstand und Umbruchverhalten nicht mehr pro Seite driften.
 */
export const FilterBar = ({ children, end, className = '' }: {
    children: ReactNode;
    end?: ReactNode;
    className?: string;
}) => (
    <div className={`ofi-filterbar ${className}`.trim()}>
        {children}
        {end && <div className="ofi-filterbar__end">{end}</div>}
    </div>
);

/**
 * Der Filter neben der Suche («Alle anzeigen», «Alle Status»). Dasselbe Mass
 * und dieselbe Kante wie das Suchfeld — das ganze Aussehen kommt aus
 * `styles/controls.css` (`.ofi-filter`), damit keine Seite mehr ihre eigene
 * Höhe mitbringt.
 *
 * `width`: `fixed` ist der Normalfall (184px, überall gleich), `auto` für
 * kurze Listen wie ein Jahr, `wide` für Kundennamen und Zeiträume.
 */
export const FilterSelect = ({
    value,
    onChange,
    children,
    label,
    width = 'fixed',
    disabled,
    className = '',
}: {
    value: string;
    onChange: (next: string) => void;
    children: ReactNode;
    /** Was der Filter auswählt — steht als `aria-label` am Feld. */
    label: string;
    width?: 'fixed' | 'auto' | 'wide';
    disabled?: boolean;
    className?: string;
}) => (
    <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        title={label}
        disabled={disabled}
        className={`ofi-filter ${width === 'auto' ? 'is-auto' : width === 'wide' ? 'is-wide' : ''} ${className}`.trim()}
    >
        {children}
    </select>
);

/**
 * Ein fremdes Bedienelement (Kundenwähler, Mehrfachauswahl) in der
 * Werkzeugzeile: die Hülle gibt ihm Breite und Höhe der übrigen Filter, ohne
 * dass sein Inneres angefasst werden muss.
 */
export const FilterSlot = ({ children, width = 'fixed', className = '' }: {
    children: ReactNode;
    width?: 'fixed' | 'wide';
    className?: string;
}) => (
    <div className={`ofi-filter-slot ${width === 'wide' ? 'is-wide' : ''} ${className}`.trim()}>
        {children}
    </div>
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
        <div className="ofi-pager flex items-center justify-between gap-3 px-4 py-3">
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
    <div className="ofi-togglegroup inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-white/15 dark:bg-white/5">
        {options.map((option) => (
            <button
                key={option.key}
                type="button"
                onClick={() => onChange(option.key)}
                aria-pressed={value === option.key}
                className={`ofi-togglegroup__btn ${value === option.key ? 'is-on' : ''} rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    value === option.key
                        ? 'bg-[#0a7aff] text-white shadow-sm'
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
            className={`inline-flex items-center gap-1 underline decoration-dotted decoration-from-font underline-offset-[3px] transition-colors hover:text-[#0066e0] dark:hover:text-white ${
                active ? 'text-[#0066e0] dark:text-white' : ''
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
            className="inline-flex items-center gap-1 transition-colors hover:text-[#0066e0] dark:hover:text-white"
        >
            {label}
            {activeKey === sortKey && (direction === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
        </button>
        {onResizeStart && <ColResizeHandle onResizeStart={onResizeStart} onResizeReset={onResizeReset} />}
    </th>
);
