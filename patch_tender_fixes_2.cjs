const fs = require('fs');

const tenderReportPath = 'c:/ERP/ErpFront/offitec-frontend/src/pages/tender/TenderReport.tsx';
let trContent = fs.readFileSync(tenderReportPath, 'utf8');

// Fix redeclared useLanguageRefresh
trContent = trContent.replace(/const useLanguageRefresh = \(\) => \{\n    const \{ i18n \} = useTranslation\(\);\n    const \[, setTick\] = useState\(0\);\n    useEffect\(\(\) => \{\n        const handler = \(\) => setTick\(\(t: number\) => t \+ 1\);\n        i18n\.on\('languageChanged', handler\);\n        return \(\) => i18n\.off\('languageChanged', handler\);\n    \}, \[i18n\]\);\n\};\n/g, '');

const reactivityCode = `\nconst useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick((t: number) => t + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};\n`;

const lastImportIndex = trContent.lastIndexOf("import ");
const nextNewline = trContent.indexOf('\n', lastImportIndex);
trContent = trContent.substring(0, nextNewline + 1) + reactivityCode + trContent.substring(nextNewline + 1);

fs.writeFileSync(tenderReportPath, trContent, 'utf8');


const componentsPath = 'c:/ERP/ErpFront/offitec-frontend/src/pages/tender/detail/TenderDetailComponents.tsx';
let cContent = fs.readFileSync(componentsPath, 'utf8');

const exportList = [
    'RichTextMarkdownEditor', 'TenderLogsSheet', 'TreeRow', 'PositionDetailPanel',
    'SummaryStat', 'TenderArticleFormModal', 'NewArticleModal', 'TenderSettingsModal', 'ExportModal'
];

exportList.forEach(exp => {
    const regex = new RegExp(`(export const ${exp}[^=]+= [^{]+\\{)`, 'g');
    cContent = cContent.replace(regex, `$1\n    useLanguageRefresh();\n`);
});

fs.writeFileSync(componentsPath, cContent, 'utf8');
console.log('Fixed');
