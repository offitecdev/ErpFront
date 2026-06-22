const fs = require('fs');
const path = require('path');

const dir = 'c:/ERP/ErpFront/offitec-frontend/src/pages/logistics';
const files = ['ShipmentCreate.tsx', 'Shipments.tsx'];

files.forEach(file => {
    const filepath = path.join(dir, file);
    let content = fs.readFileSync(filepath, 'utf8');
    
    // Replace auto with logistics
    content = content.replace(/t\('auto\./g, "t('logistics.");
    
    if (!content.includes('useLanguageRefresh')) {
        const reactivityCode = `import { useTranslation } from 'react-i18next';\n\nconst useLanguageRefresh = () => {\n    const { i18n } = useTranslation();\n    const [, setTick] = useState(0);\n    useEffect(() => {\n        const handler = () => setTick(t => t + 1);\n        i18n.on('languageChanged', handler);\n        return () => i18n.off('languageChanged', handler);\n    }, [i18n]);\n};`;
        content = content.replace("import { t } from '@/i18n/translate';", "import { t } from '@/i18n/translate';\n" + reactivityCode);
    }

    if (file === 'ShipmentCreate.tsx') {
        if (!content.includes('useLanguageRefresh();')) {
            content = content.replace("export const ShipmentCreate = ({", "export const ShipmentCreate = ({\n    useLanguageRefresh();");
            content = content.replace("export const ShipmentCreate = () => {", "export const ShipmentCreate = () => {\n    useLanguageRefresh();");
        }
        if (content.includes("const STATUS_LABEL: Record<ShipmentStatus, string> = {")) {
            content = content.replace("const STATUS_LABEL: Record<ShipmentStatus, string> = {", "const getStatusLabel = (): Record<ShipmentStatus, string> => ({");
            content = content.replace(/CANCELLED:t\('logistics\.shipments\.statusCancelled'\),\n};/, "CANCELLED:t('logistics.shipments.statusCancelled'),\n});");
            content = content.replace(/STATUS_LABEL\[/g, "getStatusLabel()[");
            content = content.replace(/Object\.entries\(STATUS_LABEL\)/g, "Object.entries(getStatusLabel())");
        }
    } else if (file === 'Shipments.tsx') {
        if (!content.includes('useLanguageRefresh();')) {
            content = content.replace("export const Shipments = ({", "export const Shipments = ({\n    useLanguageRefresh();");
            content = content.replace("export const Shipments = () => {", "export const Shipments = () => {\n    useLanguageRefresh();");
        }
        if (content.includes("const STATUS_LABEL: Record<ShipmentStatus, string> = {")) {
            content = content.replace("const STATUS_LABEL: Record<ShipmentStatus, string> = {", "const getStatusLabel = (): Record<ShipmentStatus, string> => ({");
            content = content.replace(/BILLED:t\('logistics\.faturali'\),\n};/, "BILLED:t('logistics.faturali'),\n});");
            content = content.replace(/CANCELLED:t\('logistics\.shipments\.statusCancelled'\),\n};/, "CANCELLED:t('logistics.shipments.statusCancelled'),\n});");
            content = content.replace(/STATUS_LABEL\[/g, "getStatusLabel()[");
            content = content.replace(/Object\.entries\(STATUS_LABEL\)/g, "Object.entries(getStatusLabel())");
        }
    }

    fs.writeFileSync(filepath, content, 'utf8');
});

console.log("Done updating TSX files");
