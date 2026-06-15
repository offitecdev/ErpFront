const HASH_SUFFIX_RE = /_([a-f0-9]{8})(?:_\d+)?$/i;
const DUPLICATE_SUFFIX_RE = /_\d+$/;

const TECHNICAL_PREFIXES = new Set([
    'absolute',
    'after',
    'bg',
    'block',
    'border',
    'cursor',
    'duration',
    'flex',
    'font',
    'gap',
    'grid',
    'group',
    'h',
    'hidden',
    'hover',
    'inline',
    'items',
    'justify',
    'leading',
    'line',
    'max',
    'min',
    'ml',
    'mr',
    'mt',
    'opacity',
    'overflow',
    'p',
    'px',
    'py',
    'relative',
    'rounded',
    'shadow',
    'shrink',
    'size',
    'text',
    'transition',
    'w',
]);

const TECHNICAL_MARKERS = [
    '_after_',
    '_bg_',
    '_border_',
    '_cursor_',
    '_duration_',
    '_font_',
    '_gap_',
    '_group_',
    '_hover_',
    '_items_',
    '_justify_',
    '_leading_',
    '_opacity_',
    '_overflow_',
    '_rounded_',
    '_shadow_',
    '_text_',
    '_transition_',
];

const TECHNICAL_UTILITY_STARTS = new Set([
    'after',
    'bg',
    'border',
    'cursor',
    'duration',
    'font',
    'gap',
    'group',
    'hover',
    'items',
    'justify',
    'leading',
    'line',
    'max',
    'min',
    'ml',
    'mr',
    'mt',
    'opacity',
    'overflow',
    'p',
    'px',
    'py',
    'rounded',
    'shadow',
    'text',
    'transition',
    'w',
]);

const WORD_REPLACEMENTS: Record<string, string> = {
    ac: 'Aç',
    acik: 'Açık',
    aciklama: 'Açıklama',
    aciklamalari: 'Açıklamaları',
    adet: 'Adet',
    adi: 'Adı',
    agirlikli: 'Ağırlıklı',
    aksiyon: 'Aksiyon',
    aktif: 'Aktif',
    alis: 'Alış',
    alim: 'Alım',
    ana: 'Ana',
    arama: 'Arama',
    ara: 'Ara',
    aktar: 'Aktar',
    ayarlari: 'Ayarları',
    barkod: 'Barkod',
    barkodlari: 'Barkodları',
    baslangic: 'Başlangıç',
    baslayin: 'Başlayın',
    bilgi: 'Bilgi',
    bilgileri: 'Bilgileri',
    birim: 'Birim',
    bul: 'Bul',
    bulunamadi: 'Bulunamadı',
    buraya: 'Buraya',
    ca: 'Ça',
    cikis: 'Çıkış',
    da: 'Da',
    de: 'De',
    deger: 'Değer',
    degistir: 'Değiştir',
    detay: 'Detay',
    detayli: 'Detaylı',
    detaylari: 'Detayları',
    depo: 'Depo',
    don: 'Dön',
    durumlar: 'Durumlar',
    duzenle: 'Düzenle',
    eklendi: 'Eklendi',
    ekle: 'Ekle',
    eklemek: 'Eklemek',
    eklenecek: 'Eklenecek',
    esik: 'Eşik',
    fiyati: 'Fiyatı',
    fiyat: 'Fiyat',
    filtrele: 'Filtrele',
    filtreyi: 'Filtreyi',
    genel: 'Genel',
    girdi: 'Girdi',
    girildiginde: 'Girildiğinde',
    girin: 'Girin',
    girisi: 'Girişi',
    giris: 'Giriş',
    girecek: 'Girecek',
    gorsel: 'Görsel',
    gorseli: 'Görseli',
    gorselleri: 'Görselleri',
    guncel: 'Güncel',
    guncellendi: 'Güncellendi',
    guncelle: 'Güncelle',
    hareket: 'Hareket',
    hareketi: 'Hareketi',
    her: 'Her',
    hidrolik: 'Hidrolik',
    ile: 'ile',
    icin: 'İçin',
    ilgili: 'İlgili',
    ilk: 'İlk',
    ise: 'İse',
    isareti: 'İşareti',
    islemler: 'İşlemler',
    islem: 'İşlem',
    istege: 'İsteğe',
    kaydi: 'Kaydı',
    kayit: 'Kayıt',
    kayitlari: 'Kayıtları',
    kaydedilemedi: 'Kaydedilemedi',
    kaydedin: 'Kaydedin',
    kaydet: 'Kaydet',
    kaldirildi: 'Kaldırıldı',
    kamera: 'Kamera',
    karti: 'Kartı',
    kartlari: 'Kartları',
    kategori: 'Kategori',
    kritik: 'Kritik',
    kod: 'Kod',
    kodu: 'Kodu',
    liste: 'Liste',
    listeye: 'Listeye',
    lokasyon: 'Lokasyon',
    maliyet: 'Maliyet',
    maliyeti: 'Maliyeti',
    maksimum: 'Maksimum',
    manuel: 'Manuel',
    madde: 'Madde',
    mevcut: 'Mevcut',
    miktar: 'Miktar',
    min: 'Min',
    minimum: 'Minimum',
    no: 'No',
    not: 'Not',
    okutur: 'Okutur',
    okutun: 'Okutun',
    olamaz: 'Olamaz',
    olmalidir: 'Olmalıdır',
    olustur: 'Oluştur',
    olusturuldu: 'Oluşturuldu',
    olusturun: 'Oluşturun',
    once: 'Önce',
    opsiyonel: 'Opsiyonel',
    ort: 'Ort.',
    ortalama: 'Ortalama',
    ozgu: 'Özgü',
    satis: 'Satış',
    secin: 'Seçin',
    secimi: 'Seçimi',
    seviye: 'Seviye',
    silindi: 'Silindi',
    silinemedi: 'Silinemedi',
    seri: 'Seri',
    servis: 'Servis',
    sirket: 'Şirket',
    son: 'Son',
    stoga: 'Stoğa',
    stogu: 'Stoğu',
    stogunun: 'Stoğunun',
    stok: 'Stok',
    stoku: 'Stoku',
    tara: 'Tara',
    tarama: 'Tarama',
    tarihi: 'Tarihi',
    tedarik: 'Tedarik',
    tedarikten: 'Tedarikten',
    tedarikci: 'Tedarikçi',
    temel: 'Temel',
    temizle: 'Temizle',
    tipi: 'Tipi',
    toplam: 'Toplam',
    tum: 'Tüm',
    turu: 'Türü',
    urun: 'Ürün',
    urune: 'Ürüne',
    urunu: 'Ürünü',
    urununuzu: 'Ürününüzü',
    urunleri: 'Ürünleri',
    ve: 've',
    veya: 'veya',
    yazin: 'Yazın',
    yaza: 'Yazın',
    yeni: 'Yeni',
    yok: 'Yok',
    yukle: 'Yükle',
    zorunlu: 'Zorunlu',
};

const EXACT_REPLACEMENTS: Record<string, string> = {
    chf: 'CHF',
    crm: 'CRM',
    csv: 'CSV',
    erp: 'ERP',
    fo: 'FO',
    kg: 'kg',
    m2: 'm2',
    m3: 'm3',
    pdf: 'PDF',
    qr: 'QR',
    sia: 'SIA',
    stk: 'STK',
    uid: 'UID',
    xml: 'XML',
};

const stripAutoKey = (key: string) =>
    key.replace(/^auto\./, '').replace(DUPLICATE_SUFFIX_RE, '').replace(HASH_SUFFIX_RE, '');

const isTechnicalAutoKey = (slug: string) => {
    const [first] = slug.split('_');
    return TECHNICAL_PREFIXES.has(first) || TECHNICAL_MARKERS.some((marker) => slug.includes(marker));
};

const normalizeUtility = (parts: string[]) => {
    if (parts.length === 0) return '';

    const [utility, ...values] = parts;
    if (utility === 'inline' && values[0] === 'flex') return 'inline-flex';
    if (utility === 'line' && values[0] === 'clamp') return `line-clamp-${values.slice(1).join('-')}`;
    if (utility === 'transition') return values.includes('duration') ? 'transition-colors' : `transition-${values.join('-')}`;
    if (utility === 'shadow' && values.length > 0) return values[0] === 'xs' ? 'shadow-xs' : 'shadow-lg';
    if (utility === 'text' && values[0]?.includes('px')) return `text-[${values.join('.').replace(/-/g, '.')}]`;
    if ((utility === 'bg' || utility === 'text' || utility === 'border') && /^[0-9a-f]{6}$/i.test(values[0] || '')) {
        return `${utility}-[#${values[0]}]`;
    }
    if ((utility === 'bg' || utility === 'text' || utility === 'border') && values.length >= 2 && /^\d+$/.test(values.at(-1) || '')) {
        return `${utility}-${values.slice(0, -1).join('-')}/${values.at(-1)}`;
    }
    if (values.length === 2 && /^\d+$/.test(values[0]) && /^\d+$/.test(values[1])) return `${utility}-${values[0]}.${values[1]}`;

    return [utility, ...values].join('-');
};

const formatTechnicalSlug = (slug: string) => {
    const rawTokens = slug.split('_').filter(Boolean);
    const classes: string[] = [];
    let current: string[] = [];
    let variant: string | null = null;

    rawTokens.forEach((token) => {
        if (token === 'after' || token === 'hover' || token === 'focus' || token === 'disabled') {
            if (current.length > 0) {
                const utility = normalizeUtility(current);
                if (utility) classes.push(variant ? `${variant}:${utility}` : utility);
            }
            current = [];
            variant = token;
            return;
        }

        if (current.length > 0 && TECHNICAL_UTILITY_STARTS.has(token)) {
            const utility = normalizeUtility(current);
            if (utility) classes.push(variant ? `${variant}:${utility}` : utility);
            current = [token];
            variant = null;
            return;
        }

        current.push(token);
    });

    if (current.length > 0) {
        const utility = normalizeUtility(current);
        if (utility) classes.push(variant ? `${variant}:${utility}` : utility);
    }

    return classes.join(' ').trim();
};

const toReadableText = (slug: string) =>
    slug
        .split('_')
        .filter(Boolean)
        .map((part) => {
            const lower = part.toLowerCase();
            if (EXACT_REPLACEMENTS[lower]) return EXACT_REPLACEMENTS[lower];
            if (WORD_REPLACEMENTS[lower]) return WORD_REPLACEMENTS[lower];
            if (/^\d+$/.test(part)) return part;
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ')
        .replace(/\s+([.,:;!?])/g, '$1')
        .trim();

export const formatMissingTranslationKey = (key: string): string => {
    if (!key.startsWith('auto.')) return key;

    const slug = stripAutoKey(key);
    if (!slug) return key;

    return isTechnicalAutoKey(slug) ? formatTechnicalSlug(slug) : toReadableText(slug);
};
