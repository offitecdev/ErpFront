import { jsPDF } from 'jspdf';

import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import type { SignatureSnapshot } from '../../lib/api/project';

let fontFiles: { regular: string; bold: string } | null = null;

const toBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
    return btoa(binary);
};

const registerFonts = async (doc: jsPDF) => {
    if (!fontFiles) {
        const [regular, bold] = await Promise.all([
            fetch(arialRegularUrl).then((response) => response.arrayBuffer()),
            fetch(arialBoldUrl).then((response) => response.arrayBuffer()),
        ]);
        fontFiles = { regular: toBase64(regular), bold: toBase64(bold) };
    }
    doc.addFileToVFS('Arial-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('Arial-Bold.ttf', fontFiles.bold);
    doc.addFont('Arial-Regular.ttf', 'Arial', 'normal');
    doc.addFont('Arial-Bold.ttf', 'Arial', 'bold');
    doc.setFont('Arial', 'normal');
};

/** Creates a real PDF Blob for the in-panel browser PDF viewer. */
export const createSnapshotPdfBlob = async (
    snapshot: SignatureSnapshot,
    signature?: string | null,
): Promise<Blob> => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);

    const left = 16;
    const right = 194;
    const width = right - left;
    const bottom = 280;
    let y = 18;

    const newPage = () => {
        doc.addPage();
        y = 18;
    };
    const ensure = (height: number) => {
        if (y + height > bottom) newPage();
    };
    const textLines = (value: unknown, maxWidth: number, size = 9) => {
        doc.setFontSize(size);
        return doc.splitTextToSize(String(value ?? '-'), maxWidth) as string[];
    };

    doc.setFillColor(31, 38, 84);
    doc.roundedRect(left, y, width, 22, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('Arial', 'bold');
    doc.setFontSize(14);
    doc.text(snapshot.title || 'Rapor', left + 5, y + 8);
    doc.setFont('Arial', 'normal');
    doc.setFontSize(9);
    doc.text([snapshot.customerName, snapshot.projectName].filter(Boolean).join(' · ') || '-', left + 5, y + 15);
    y += 28;

    const meta = snapshot.meta || [];
    for (let index = 0; index < meta.length; index += 3) {
        const group = meta.slice(index, index + 3);
        const cellWidth = width / 3;
        ensure(18);
        group.forEach((item, cell) => {
            const x = left + cell * cellWidth;
            doc.setDrawColor(216, 220, 228);
            doc.setFillColor(250, 250, 251);
            doc.roundedRect(x, y, cellWidth - 2, 16, 1, 1, 'FD');
            doc.setFont('Arial', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 107, 120);
            doc.text(item.label.toUpperCase(), x + 3, y + 5);
            doc.setFont('Arial', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(25, 25, 25);
            doc.text(textLines(item.value, cellWidth - 8, 9).slice(0, 2), x + 3, y + 10);
        });
        y += 19;
    }

    for (const section of snapshot.sections || []) {
        ensure(15);
        doc.setFillColor(238, 241, 248);
        doc.rect(left, y, width, 8, 'F');
        doc.setFont('Arial', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(31, 38, 84);
        doc.text(section.heading || 'Detay', left + 3, y + 5.3);
        y += 8;

        for (const row of section.rows) {
            const value = row.value ? String(row.value) : '';
            const labelWidth = value ? width * 0.68 : width - 6;
            const labelLines = textLines(row.label, labelWidth - 6);
            const valueLines = value ? textLines(value, width - labelWidth - 7) : [];
            const rowHeight = Math.max(8, Math.max(labelLines.length, valueLines.length) * 4.2 + 3);
            ensure(rowHeight);
            doc.setDrawColor(228, 230, 234);
            doc.line(left, y + rowHeight, right, y + rowHeight);
            doc.setFont('Arial', 'normal');
            doc.setFontSize(8.8);
            doc.setTextColor(35, 35, 35);
            doc.text(labelLines, left + 3, y + 5);
            if (value) {
                doc.setTextColor(95, 95, 95);
                doc.text(valueLines, right - 3, y + 5, { align: 'right' });
            }
            if (row.status) {
                doc.setFont('Arial', 'bold');
                doc.setTextColor(row.status === 'YES' ? 20 : row.status === 'NO' ? 190 : 95, row.status === 'YES' ? 130 : 75, row.status === 'YES' ? 80 : 75);
                doc.text(row.status, right - 3, y + 5, { align: 'right' });
            }
            y += rowHeight;
        }
        y += 5;
    }

    if (snapshot.notes) {
        const lines = textLines(snapshot.notes, width - 8);
        ensure(lines.length * 4.2 + 10);
        doc.setFillColor(248, 248, 248);
        doc.roundedRect(left, y, width, lines.length * 4.2 + 7, 1, 1, 'F');
        doc.setTextColor(65, 65, 65);
        doc.text(lines, left + 4, y + 5);
        y += lines.length * 4.2 + 12;
    }

    if (snapshot.images?.length) {
        ensure(12);
        doc.setFont('Arial', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(95, 95, 95);
        doc.text('GÖRSELLER', left, y);
        y += 4;
        const imageWidth = 54;
        const imageHeight = 38;
        for (let index = 0; index < snapshot.images.length; index += 1) {
            if (index > 0 && index % 3 === 0) y += imageHeight + 4;
            ensure(imageHeight + 4);
            const x = left + (index % 3) * (imageWidth + 5);
            try {
                const image = snapshot.images[index];
                doc.addImage(image, image.includes('png') ? 'PNG' : 'JPEG', x, y, imageWidth, imageHeight, undefined, 'FAST');
            } catch {
                doc.setDrawColor(220, 220, 220);
                doc.rect(x, y, imageWidth, imageHeight);
            }
        }
        y += imageHeight + 8;
    }

    if (signature) {
        ensure(38);
        doc.setFont('Arial', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(95, 95, 95);
        doc.text('İMZA', left, y);
        try {
            doc.addImage(signature, signature.includes('png') ? 'PNG' : 'JPEG', left, y + 3, 55, 25, undefined, 'FAST');
        } catch {
            doc.setFont('Arial', 'normal');
            doc.text('İmza kaydedildi.', left, y + 9);
        }
    }

    return doc.output('blob');
};
