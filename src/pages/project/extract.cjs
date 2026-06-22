const fs = require('fs');
const path = require('path');

const dir = 'c:/ERP/ErpFront/offitec-frontend/src/pages/project';
const files = ['ProjectDetail.tsx', 'ProjectInstallation.tsx', 'Projects.tsx'];

let allKeys = new Set();

files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (!fs.existsSync(fullPath)) return;
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Find all t('auto.xxx')
    const regex = /t\('auto\.([^']+)'\)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        allKeys.add(match[1]);
    }
});

const sortedKeys = Array.from(allKeys).sort();
console.log(JSON.stringify(sortedKeys, null, 2));
