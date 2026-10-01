/**
 * LIEFERANTEN-PDF FÜR DEN SERVER BÜNDELN (30.09.2026)
 *
 * «Fiyat talepleri artık otomatik gönderiliyor» — der Server verschickt
 * Preisanfragen und Bestellungen selbst und braucht dafür GENAU das PDF der
 * Seite «PDF». Dieses Skript bündelt `src/utils/pdf/node/supplierPdfNode.ts`
 * (Bestellung + Preisanfrage, samt Schriften, Logo und Kopfwelle als
 * data:-URLs) zu EINER CommonJS-Datei:
 *
 *     dist-node/supplierPdf.cjs
 *
 * Der Server lädt sie (Erp_Backend/src/infrastructure/services/supplierPdfRenderer.ts);
 * im Docker-Bild kopiert der Build sie nach /app/backend/pdf-node/. `npm run
 * build` ruft dieses Skript am Ende auf — das Bündel ist nie älter als das
 * Layout.
 *
 * Aufruf: node scripts/build-supplier-pdf-node.mjs
 */
import { rolldown } from 'rolldown';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const src = path.join(root, 'src');
const outDir = path.join(root, 'dist-node');
const outFile = path.join(outDir, 'supplierPdf.cjs');

const MIME = {
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};
const ASSET = /\.(ttf|otf|png|jpe?g|svg|woff2?)$/i;

/** Eine Datei, wie Vite sie findet: mit Endung, als Ordner mit index. */
const resolveFile = (base) => {
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
    return candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) ?? null;
};

/** Windows kennt keine Gross-/Kleinschreibung, Linux schon (ARIAL.TTF ↔ ARIAL.ttf). */
const existingAsset = (file) => {
    if (fs.existsSync(file)) return file;
    const dir = path.dirname(file);
    const wanted = path.basename(file).toLowerCase();
    const hit = fs.existsSync(dir) ? fs.readdirSync(dir).find((name) => name.toLowerCase() === wanted) : null;
    return hit ? path.join(dir, hit) : null;
};

const vitePaths = {
    name: 'offitec-vite-paths',
    resolveId(source, importer) {
        const [bare, query] = source.split('?');
        if (query === 'url' || query === 'raw' || ASSET.test(bare)) {
            const base = bare.startsWith('@/') ? path.join(src, bare.slice(2)) : path.resolve(path.dirname(importer ?? src), bare);
            const file = existingAsset(base);
            if (!file) throw new Error(`Asset nicht gefunden: ${source} (aus ${importer})`);
            return `\0asset:${file}${query === 'raw' ? '?raw' : ''}`;
        }
        if (source.startsWith('@/')) {
            const file = resolveFile(path.join(src, source.slice(2)));
            if (!file) throw new Error(`Modul nicht gefunden: ${source}`);
            return file;
        }
        return null;
    },
    load(id) {
        if (!id.startsWith('\0asset:')) return null;
        const [file, query] = id.slice('\0asset:'.length).split('?');
        const bytes = fs.readFileSync(file);
        if (query === 'raw') return `export default ${JSON.stringify(bytes.toString('utf8'))};`;
        const mime = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
        return `export default ${JSON.stringify(`data:${mime};base64,${bytes.toString('base64')}`)};`;
    },
};

const started = Date.now();
const bundle = await rolldown({
    input: path.join(src, 'utils/pdf/node/supplierPdfNode.ts'),
    plugins: [vitePaths],
    platform: 'node',
    // Optionale Teile von jsPDF (html(), SVG) — die Lieferanten-PDFs brauchen sie nicht.
    external: ['canvg', 'html2canvas', 'dompurify'],
    logLevel: 'warn',
});
const { output } = await bundle.generate({ format: 'cjs', codeSplitting: false });
await bundle.close();
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, output[0].code, 'utf8');
console.log(`[supplier-pdf] ${path.relative(root, outFile)} · ${Math.round(output[0].code.length / 1024)} KB · ${Date.now() - started} ms`);
