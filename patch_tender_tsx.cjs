const fs = require('fs');
const path = require('path');

const dirs = [
    'c:/ERP/ErpFront/offitec-frontend/src/pages/tender',
    'c:/ERP/ErpFront/offitec-frontend/src/pages/tender/detail'
];

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        if (!file.endsWith('.tsx')) return;
        const filepath = path.join(dir, file);
        let content = fs.readFileSync(filepath, 'utf8');
        
        let changed = false;

        // confirm replacements
        if (content.includes("if (!confirm(`${t.tenderNumber} teklifi silinsin mi?`)) return;")) {
            content = content.replace("if (!confirm(`${t.tenderNumber} teklifi silinsin mi?`)) return;", "if (!confirm(t('tenders.teklifi_silinsin_mi', { number: t.tenderNumber }))) return;");
            changed = true;
        }
        if (content.includes("if (!confirm(`\"${position.shortDescription}\" ǬrǬnǬ tekliften kaldrlsn \nm?`)) return;")) {
            content = content.replace("if (!confirm(`\"${position.shortDescription}\" ǬrǬnǬ tekliften kaldrlsn \nm?`)) return;", "if (!confirm(t('tenders.urunu_tekliften_kaldirilsin_mi', { name: position.shortDescription }))) return;");
            changed = true;
        }
        // There might be variations of the broken chars in the regex
        content = content.replace(/if \(!confirm\(`"\$\{position\.shortDescription\}" [^`]+`\)\) return;/g, "if (!confirm(t('tenders.urunu_tekliften_kaldirilsin_mi', { name: position.shortDescription }))) return;");
        
        content = content.replace(/if \(!confirm\(`\$\{label\} silinsin mi\?`\)\) return;/g, "if (!confirm(t('tenders.silinsin_mi', { label }))) return;");
        
        // toast replacements
        content = content.replace(/toast\.success\(`Yeni versiyon \(v\$\{next\.version\}\) oluYturuldu\.`\);/g, "toast.success(t('tenders.yeni_versiyon_olusturuldu', { version: next.version }));");
        content = content.replace(/toast\.success\(`Yeni versiyon \(v\$\{next\.version\}\) [^`]+`\);/g, "toast.success(t('tenders.yeni_versiyon_olusturuldu', { version: next.version }));");
        
        content = content.replace(/toast\.success\(`\$\{format\} verisi indirildi\.`\);/g, "toast.success(t('tenders.verisi_indirildi', { format }));");
        
        content = content.replace(/toast\.error\(`\$\{failedIds\.size\} sat.r silinemedi, geri al.nd.`\);/g, "toast.error(t('tenders.satir_silinemedi_geri_alindi', { count: failedIds.size }));");
        
        content = content.replace(/toast\.error\(`\$\{file\.name\} desteklenmiyor\. PDF, PNG veya JPG [^`]+`\);/g, "toast.error(t('tenders.desteklenmiyor_pdf_png_veya_jpg_yukleyin', { name: file.name }));");
        
        // breadcrumb replacements
        content = content.replace(/breadcrumb="CRM [^"]+ Teklif [^"]+ Yeni"/g, "breadcrumb={t('tenders.crm_teklif_yeni')}");
        content = content.replace(/breadcrumb=\{`CRM [^`]+ Teklif [^`]+ \$\{tender\.tenderNumber\}`\}/g, "breadcrumb={t('tenders.crm_teklif_number', { number: tender.tenderNumber })}");
        content = content.replace(/breadcrumb="CRM [^"]+ Teklif Y.netimi"/g, "breadcrumb={t('tenders.crm_teklif_yonetimi')}");
        content = content.replace(/breadcrumb=\{`CRM [^`]+ Teklif [^`]+ \$\{summary\.tenderInfo\.tenderNumber\} [^`]+ Rapor`\}/g, "breadcrumb={t('tenders.crm_teklif_rapor', { number: summary.tenderInfo.tenderNumber })}");
        
        // logs replacements
        content = content.replace(/return `\$\{subject\} tekliften kald.r.ld.`;/g, "return t('tenders.tekliften_kaldirildi', { subject });");
        content = content.replace(/return `\$\{subject\} teklif [^`]+ g.ncellendi`;/g, "return t('tenders.teklif_urunu_guncellendi', { subject });");
        
        // Reactivity injection
        if (!content.includes('useLanguageRefresh')) {
            const reactivityCode = `import { useTranslation } from 'react-i18next';\n\nconst useLanguageRefresh = () => {\n    const { i18n } = useTranslation();\n    const [, setTick] = useState(0);\n    useEffect(() => {\n        const handler = () => setTick(t => t + 1);\n        i18n.on('languageChanged', handler);\n        return () => i18n.off('languageChanged', handler);\n    }, [i18n]);\n};`;
            if (content.includes("import { t } from '@/i18n/translate';")) {
                content = content.replace("import { t } from '@/i18n/translate';", "import { t } from '@/i18n/translate';\n" + reactivityCode);
            } else {
                content = content.replace("import React", "import React\n" + reactivityCode);
            }
        }

        // Add useLanguageRefresh() to components
        const componentRegex = /export const (Tender[A-Za-z0-9_]+) = \([^)]*\) => \{/g;
        let match;
        while ((match = componentRegex.exec(content)) !== null) {
            const compStart = match[0];
            if (!content.includes(`${compStart}\n    useLanguageRefresh();`)) {
                content = content.replace(compStart, `${compStart}\n    useLanguageRefresh();`);
            }
        }

        if (file === 'TenderDetailComponents.tsx') {
            const internalComponents = ['TenderTopTabs', 'OverviewTab', 'CostTab', 'ProductsTab', 'AddProductDrawer', 'ManualProductDrawer', 'SettingsTab'];
            internalComponents.forEach(comp => {
                const regex = new RegExp(`const ${comp} = \\([^)]*\\) => \\{`, 'g');
                content = content.replace(regex, `$& \n    useLanguageRefresh();`);
            });
        }
        
        fs.writeFileSync(filepath, content, 'utf8');
        console.log(`Updated ${file}`);
    });
});
