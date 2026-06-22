const fs = require('fs');
const path = require('path');

const tsxFiles = [
    'c:/ERP/ErpFront/offitec-frontend/src/pages/tender/TenderDetail.tsx',
    'c:/ERP/ErpFront/offitec-frontend/src/pages/tender/TenderList.tsx',
    'c:/ERP/ErpFront/offitec-frontend/src/pages/tender/TenderReport.tsx',
    'c:/ERP/ErpFront/offitec-frontend/src/pages/tender/detail/TenderDetailComponents.tsx'
];

const reactivityCode = `\nconst useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick((t: number) => t + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};\n`;

tsxFiles.forEach(filepath => {
    let content = fs.readFileSync(filepath, 'utf8');
    
    // Remove previously injected buggy code
    content = content.replace(/import \{ useTranslation \} from 'react-i18next';\n\nconst useLanguageRefresh = \(\) => \{\n    const \{ i18n \} = useTranslation\(\);\n    const \[, setTick\] = useState\(0\);\n    useEffect\(\(\) => \{\n        const handler = \(\) => setTick\(t => t \+ 1\);\n        i18n\.on\('languageChanged', handler\);\n        return \(\) => i18n\.off\('languageChanged', handler\);\n    \}, \[i18n\]\);\n\};\n?/g, '');
    content = content.replace(/const useLanguageRefresh = \(\) => \{\n    const \{ i18n \} = useTranslation\(\);\n    const \[, setTick\] = useState\(0\);\n    useEffect\(\(\) => \{\n        const handler = \(\) => setTick\(t => t \+ 1\);\n        i18n\.on\('languageChanged', handler\);\n        return \(\) => i18n\.off\('languageChanged', handler\);\n    \}, \[i18n\]\);\n\};\n?/g, '');
    
    content = content.replace(/    useLanguageRefresh\(\);\n/g, '');
    
    // Ensure correct imports
    if (!content.includes("import { useTranslation }")) {
        content = `import { useTranslation } from 'react-i18next';\n` + content;
    }
    
    if (!content.match(/import .*useState.* from 'react'/)) {
        if (content.match(/import React/)) {
             content = content.replace(/import React(?:, \{([^}]+)\})? from 'react';/, (match, group) => {
                 return group ? `import React, { ${group}, useState, useEffect } from 'react';` : `import React, { useState, useEffect } from 'react';`;
             });
        } else {
             content = `import { useState, useEffect } from 'react';\n` + content;
        }
    }
    
    // Add useLanguageRefresh definition after imports
    const lastImportIndex = content.lastIndexOf("import ");
    const nextNewline = content.indexOf('\n', lastImportIndex);
    content = content.substring(0, nextNewline + 1) + reactivityCode + content.substring(nextNewline + 1);
    
    // Add useLanguageRefresh calls into components
    const componentRegex = /export const (Tender[A-Za-z0-9_]+) = \([^)]*\) => \{/g;
    let match;
    while ((match = componentRegex.exec(content)) !== null) {
        const compStart = match[0];
        if (!content.includes(`${compStart}\n    useLanguageRefresh();`)) {
            content = content.replace(compStart, `${compStart}\n    useLanguageRefresh();`);
        }
    }

    if (filepath.endsWith('TenderDetailComponents.tsx')) {
        const internalComponents = ['TenderTopTabs', 'OverviewTab', 'CostTab', 'ProductsTab', 'AddProductDrawer', 'ManualProductDrawer', 'SettingsTab'];
        internalComponents.forEach(comp => {
            const regex = new RegExp(`const ${comp} = \\([^)]*\\) => \\{`, 'g');
            content = content.replace(regex, `$& \n    useLanguageRefresh();`);
        });
    }

    if (filepath.endsWith('TenderList.tsx')) {
        // Fix the `t` parameter shadowing in TenderList.tsx
        content = content.replace(/t\('tenders/g, "i18nT('tenders");
        content = content.replace(/breadcrumb=\{t\('tenders/g, "breadcrumb={i18nT('tenders");
        // Also fix the confirm popup parameter `t` vs `i18nT`
        content = content.replace(/if \(!confirm\(t\('tenders\.teklifi_silinsin_mi', \{ number: t\.tenderNumber \}\)\)\) return;/g, "if (!confirm(i18nT('tenders.teklifi_silinsin_mi', { number: t.tenderNumber }))) return;");
    }

    fs.writeFileSync(filepath, content, 'utf8');
    console.log('Fixed', path.basename(filepath));
});
