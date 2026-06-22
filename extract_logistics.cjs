const fs = require('fs');
const path = require('path');

const dir = 'c:/ERP/ErpFront/offitec-frontend/src/pages/logistics';
const files = ['ShipmentCreate.tsx', 'Shipments.tsx'];

let autoKeys = new Set();
const autoRegex = /t\('auto\.([^']+)'\)/g;

files.forEach(file => {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    let match;
    while ((match = autoRegex.exec(content)) !== null) {
        autoKeys.add(match[1]);
    }
});

console.log("Found auto keys:", autoKeys.size);
console.log(Array.from(autoKeys).join('\n'));
