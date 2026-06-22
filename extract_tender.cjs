const fs = require('fs');
const path = require('path');

const dirs = [
    'c:/ERP/ErpFront/offitec-frontend/src/pages/tender',
    'c:/ERP/ErpFront/offitec-frontend/src/pages/tender/detail'
];

let autoKeys = new Set();
const autoRegex = /t\('auto\.([^']+)'\)/g;

dirs.forEach(dir => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        if (file.endsWith('.tsx')) {
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            let match;
            while ((match = autoRegex.exec(content)) !== null) {
                autoKeys.add(match[1]);
            }
        }
    });
});

console.log("Found auto keys:", autoKeys.size);
console.log(Array.from(autoKeys).join('\n'));
