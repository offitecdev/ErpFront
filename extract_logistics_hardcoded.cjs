const fs = require('fs');
const path = require('path');

const dir = 'c:/ERP/ErpFront/offitec-frontend/src/pages/logistics';
const files = ['ShipmentCreate.tsx', 'Shipments.tsx'];

files.forEach(file => {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const textNodes = [];
    const regex = />([^<{}]+)</g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const text = match[1].trim();
        if (text && text.length > 1 && !/^[0-9\W]+$/.test(text) && !text.startsWith('import ') && !text.startsWith('export ') && !text.startsWith('const ')) {
            textNodes.push(text);
        }
    }
    console.log(`\n--- Hardcoded strings in ${file} ---`);
    console.log(Array.from(new Set(textNodes)).join('\n'));
});
