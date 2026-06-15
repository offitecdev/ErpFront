# Untitled UI → Ant Design Tam Geçiş Planı

Tüm tasarım bileşenlerini (sidebar, header, butonlar, inputlar, selectler, tarih seçiciler, tablolar, modaller, badge/tag, alert, checkbox, radio, toggle, tabs, pagination vb.) **Untitled UI / react-aria** tabanlı özel bileşenlerden **Ant Design (antd)** bileşenlerine geçirme planı. Yazı tipi **Segoe UI** olarak değiştirilecek.

## Mevcut Durum

| Katman | Açıklama |
|---|---|
| **Untitled UI base** (`components/base/`) | Button, Input, Select, Checkbox, Radio, Toggle, Slider, Tags, Badge, Textarea, Tooltip – tamamı `react-aria` / `react-aria-components` üzerine kurulu |
| **Untitled UI application** (`components/application/`) | DatePicker, Modal, Table, Tabs, Pagination, Carousel, Sidebar Navigation |
| **ui-shared** (`components/ui-shared/`) | Button, Field (Input/Select/Textarea/DatePicker), Modal, StatusBadge, Card, EmptyState, Skeleton, BarcodeScannerModal – bunlar Untitled base'i sarmalıyor |
| **Pages** (~30 sayfa) | Doğrudan `@untitledui/icons` importları ve bazıları `ui-shared` bileşenlerini kullanıyor |
| **CSS** | `theme.css` (Untitled UI token sistemi), `typography.css`, `globals.css`, `index.css` – font Inter |

## User Review Required

> [!IMPORTANT]
> **İkonlar hakkında karar**: `@untitledui/icons` paketi ~50+ dosyada kullanılıyor. Her birini `@ant-design/icons` karşılığına eşleyeceğiz. Ant Design'da birebir karşılığı olmayan ikonlar için Ant Design'ın mevcut en yakın ikonu kullanılacak. Bu yaklaşım uygun mu?

> [!WARNING]
> **Untitled UI base & application klasörleri**: Geçiş tamamlandıktan sonra `components/base/` ve `components/application/` klasörleri artık kullanılmayacak. Bu klasörleri silmek ister misiniz yoksa yedek olarak kalsın mı?

> [!IMPORTANT]
> **react-aria / react-aria-components paketleri**: Geçiş sonrası `react-aria`, `react-aria-components`, `@internationalized/date`, `@react-stately/utils` paketleri kaldırılabilir. `package.json`'dan temizlensin mi?

## Open Questions

> [!IMPORTANT]
> Ant Design **v6** (`antd: ^6.3.7`) zaten kurulu. Bu sürüm üzerinden devam ediyoruz – doğru mu?

> [!IMPORTANT]
> **Sidebar**: Mevcut sidebar özel yazılmış, collapsible ve hover-expand destekliyor. Ant Design `Layout.Sider` + `Menu` bileşenine geçiş yaparsak aynı davranış (hover'da genişle, pin'le sabitle) korunacak mı yoksa basit bir collapsible sidebar yeterli mi?

---

## Proposed Changes

### Faz 1: Font & Tema Altyapısı

#### [MODIFY] [theme.css](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/styles/theme.css)
- `--font-body` ve `--font-display` değerlerini `"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif` olarak değiştir
- Untitled UI token sistemi korunacak (renk tokenleri Ant Design theme ile senkronize)

#### [MODIFY] [globals.css](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/styles/globals.css)
- `font-family` referanslarını `"Segoe UI"` olarak güncelle
- `tailwindcss-react-aria-components` plugin'ini kaldır

#### [MODIFY] [index.css](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/index.css)
- `@fontsource/inter` importlarını kaldır (Segoe UI sistem fontu, import gerekmez)
- Tüm `font-family: "Inter"` referanslarını `"Segoe UI"` ile değiştir
- `@theme inline` bloğundaki `--font-heading` ve `--font-sans` güncellenecek
- Ant Design override CSS'lerindeki font referansları güncellenecek

#### [MODIFY] [App.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/App.tsx)
- `ConfigProvider` theme token'ına `fontFamily: '"Segoe UI", system-ui, sans-serif'` ekle
- `@untitledui/icons` importlarını `@ant-design/icons` ile değiştir
- Sonner toast ikonlarını Ant Design ikonlarına geçir

---

### Faz 2: ui-shared Katmanını Ant Design'a Geçirme

Bu katman tüm sayfaların kullandığı ortak bileşenleri içerir. Burayı değiştirmek sayfaları otomatik olarak etkiler.

#### [MODIFY] [Button.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/ui-shared/Button.tsx)
- `UntitledButton` yerine `antd/Button` kullan
- Variant → Ant Design type mapping: `primary` → `primary`, `secondary` → `default`, `ghost` → `text`, `danger` → `primary danger`, `subtle` → `default`
- Icon prop'ları Ant Design `icon` prop'una maplenecek

#### [MODIFY] [Field.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/ui-shared/Field.tsx)
- `InputBase` → `antd/Input`
- `TextAreaBase` → `antd/Input.TextArea`
- `BaseSelect` → `antd/Select`
- `DatePicker` → `antd/DatePicker` (dayjs ile)
- `@internationalized/date` bağımlılığı kaldırılacak
- Field wrapper → `antd/Form.Item` benzeri yapı (veya mevcut label wrapper korunur)

#### [MODIFY] [Modal.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/ui-shared/Modal.tsx)
- `UntitledModal` / `ModalOverlay` / `Dialog` → `antd/Modal` veya `antd/Drawer` (placement='drawer' için)
- `CloseButton` → Ant Design Modal'ın built-in close butonu

#### [MODIFY] [StatusBadge.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/ui-shared/StatusBadge.tsx)
- `BadgeWithDot` → `antd/Badge` + `antd/Tag` kombinasyonu
- Renk mapping'i korunacak

#### [MODIFY] [Card.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/ui-shared/Card.tsx)
- Mevcut card wrapper → `antd/Card` ile değiştirilecek

#### [MODIFY] [EmptyState.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/ui-shared/EmptyState.tsx)
- `antd/Empty` bileşeni kullanılacak

#### [MODIFY] [Skeleton.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/ui-shared/Skeleton.tsx)
- `antd/Skeleton` bileşeni kullanılacak

#### [MODIFY] [BlockingDialog.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/ui-shared/BlockingDialog.tsx)
- Ant Design Modal confirm yapısına geçirilecek

#### [MODIFY] [BarcodeScannerModal.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/ui-shared/BarcodeScannerModal.tsx)
- `@untitledui/icons` → `@ant-design/icons`
- Modal wrapper → `antd/Modal`

---

### Faz 3: Layout & Navigation

#### [MODIFY] [MainLayout.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/layout/MainLayout.tsx)
- `@untitledui/icons` importlarını (~25 ikon) `@ant-design/icons` ile değiştir
- `SidebarNavigationSectionDividers` → Ant Design `Menu` (inline mode, collapsible) ile yeniden yaz
- `BadgeWithDot` → `antd/Badge`
- `Button` (base) → `antd/Button`
- `Select as SharedSelect` → `antd/Select`
- Header dropdown menüler → `antd/Dropdown` + `antd/Menu`
- Profil dropdown → `antd/Dropdown`
- Bildirim paneli → `antd/Drawer`
- Arama overlay → `antd/Modal` veya mevcut yapı (CSS ile)

#### [MODIFY] [SlidePanel.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/layout/SlidePanel.tsx)
- `antd/Drawer` ile değiştirilecek

#### [MODIFY] [PageHeader.tsx](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/layout/PageHeader.tsx)
- Ant Design typography ve spacing ile güncellenecek

#### [MODIFY] [MainLayout.css](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/src/components/layout/MainLayout.css)
- Ant Design Sider/Menu stillerine uygun güncellemeler

---

### Faz 4: Tüm Sayfalardaki İkon ve Bileşen Geçişleri

Aşağıdaki dosyalarda `@untitledui/icons` → `@ant-design/icons` değişikliği ve kalan Untitled UI bileşen referansları güncellenecek:

| Modül | Dosyalar |
|---|---|
| **Dashboard** | Dashboard.tsx |
| **Login** | Login.tsx |
| **Attendance** | AttendanceRecords.tsx, AttendanceSettings.tsx, SystemEntry.tsx |
| **CRM** | CustomerDashboard.tsx, CustomerList.tsx, SalesOrderList.tsx |
| **IAM** | Employee.tsx, Employees.tsx, Roles.tsx |
| **Inventory** | Articles.tsx, ExtraMaterials.tsx, InventoryDashboard.tsx, Locations.tsx, Movements.tsx, Proposals.tsx, Suppliers.tsx |
| **Logistics** | ShipmentCreate.tsx, Shipments.tsx |
| **Maintenance** | MaintenanceBookingPage.tsx, MaintenanceContracts.tsx, MaintenanceDashboard.tsx, MaintenanceReports.tsx, MaintenanceShared.tsx, MaintenanceTasks.tsx, MaintenanceTechnician.tsx, RegieOperations.tsx |
| **Project** | BookingPage.tsx, ProjectDetail.tsx, ProjectInstallation.tsx, Projects.tsx |
| **Settings** | MailSettings.tsx, PdfSettings.tsx |
| **Tender** | TenderDetail.tsx, TenderList.tsx, TenderReport.tsx, TenderDetailComponents.tsx |

Her dosya için:
1. `@untitledui/icons` import → `@ant-design/icons` karşılıkları
2. Kalan Untitled UI base bileşen kullanımları → Ant Design bileşenlerine

---

### Faz 5: Temizlik & Paket Yönetimi

#### [MODIFY] [package.json](file:///c:/Users/Lenovo/Downloads/yeni_deneme/offitec-frontend/package.json)
- Kaldırılacak paketler (onay sonrası):
  - `@untitledui/icons`, `@untitledui/file-icons`
  - `@fontsource/inter`, `@fontsource-variable/geist`, `@fontsource/nunito-sans`
  - `react-aria`, `react-aria-components`
  - `@internationalized/date`, `@react-stately/utils`
  - `tailwindcss-react-aria-components`
  - `class-variance-authority` (Untitled UI bileşenleri kullanıyordu)

#### Artık kullanılmayan klasörler (onay sonrası silinecek):
- `components/base/` (15 alt klasör)
- `components/application/` (10 alt klasör)
- `components/foundations/` (kullanılmıyorsa)
- `styles/typography.css` (Untitled UI typography sistemi)

---

## İkon Eşleme Tablosu (Temel)

| Untitled UI İkon | Ant Design Karşılığı |
|---|---|
| `Bell01` | `BellOutlined` |
| `Briefcase01` | `FundProjectionScreenOutlined` |
| `Building02` | `BankOutlined` |
| `Building05` | `ContactsOutlined` |
| `Calendar` | `CalendarOutlined` |
| `Check` | `CheckOutlined` |
| `Clock` | `ClockCircleOutlined` |
| `Columns02` | `SplitCellsOutlined` |
| `HelpCircle` | `QuestionCircleOutlined` |
| `LogOut01` | `LogoutOutlined` |
| `Menu02` | `MenuOutlined` |
| `Package` | `InboxOutlined` |
| `Plus` | `PlusOutlined` |
| `SearchLg` | `SearchOutlined` |
| `Settings01` | `SettingOutlined` |
| `Truck01` | `CarOutlined` |
| `UserCircle` | `UserOutlined` |
| `Users01` | `TeamOutlined` |
| `X` / `XClose` | `CloseOutlined` |
| `AlertCircle` | `ExclamationCircleOutlined` |
| `CheckCircle` | `CheckCircleOutlined` |
| `ChevronDown` | `DownOutlined` |
| `ChevronRight` | `RightOutlined` |
| `Edit02` / `Edit05` | `EditOutlined` |
| `Trash01` | `DeleteOutlined` |
| `Download01` | `DownloadOutlined` |
| `Upload01` | `UploadOutlined` |
| `Eye` | `EyeOutlined` |
| `Copy01` | `CopyOutlined` |
| `Mail01` | `MailOutlined` |
| `Phone` | `PhoneOutlined` |
| `FilterLines` | `FilterOutlined` |
| `RefreshCw01` | `ReloadOutlined` |
| `ArrowLeft` | `ArrowLeftOutlined` |
| `ArrowRight` | `ArrowRightOutlined` |
| `File06` | `FileOutlined` |
| `Star01` | `StarOutlined` |
| `Hash02` | `NumberOutlined` |
| `LinkExternal01` | `LinkOutlined` |
| `Printer` | `PrinterOutlined` |
| `DotsVertical` | `MoreOutlined` |

---

## Verification Plan

### Automated Tests
```bash
npm run build
```
Build'in hatasız geçmesi tüm import ve tip uyumluluğunun sağlandığını doğrular.

### Manual Verification
- Login sayfası test edilecek
- Dashboard yüklenecek
- Sidebar navigasyonu (collapse/expand) test edilecek
- Herhangi bir modülde tablo, modal, form açılacak
- Tarih seçici, select, input, textarea bileşenleri test edilecek
- Toast bildirimleri test edilecek
- Font'un tüm yüzeylerde "Segoe UI" olduğu doğrulanacak
