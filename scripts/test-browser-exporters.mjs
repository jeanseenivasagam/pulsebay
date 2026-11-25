import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve('apps/pulsebay');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(repoRoot, 'apps/web-ui/node_modules/esbuild'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsebay-export-test-'));
const outFile = path.join(tmpDir, 'exporters.mjs');

await esbuild.build({
  stdin: {
    contents: `
      export { buildCsvBytes, buildXlsxBytes, buildPdfBytes } from './apps/web-ui/src/lib/browserExport.ts';
      export { buildSampleBookings } from './apps/web-ui/src/data/catalog.ts';
    `,
    resolveDir: repoRoot,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: outFile,
});

const { buildCsvBytes, buildXlsxBytes, buildPdfBytes, buildSampleBookings } = await import(
  `file:///${outFile.replace(/\\/g, '/')}`
);

const sample = buildSampleBookings('2026-11-26');
sample[0].visitorName = 'Sam (Jr.) "Test"';
sample[0].protocolNotes = 'Check-in, "fast lane" — Bay A';

// 1. CSV verification (UTF-8 BOM + escaped quotes/commas + empty state)
const csvBytes = buildCsvBytes(sample);
assert.equal(csvBytes[0], 0xef);
assert.equal(csvBytes[1], 0xbb);
assert.equal(csvBytes[2], 0xbf);
const csvText = new TextDecoder().decode(csvBytes.slice(3));
assert.ok(csvText.startsWith('Reference,Date,Time,'));
assert.ok(csvText.includes('"Sam (Jr.) ""Test"""'));
const emptyCsv = new TextDecoder().decode(buildCsvBytes([]).slice(3));
assert.equal(emptyCsv.trim().split(/\r?\n/).length, 1);

// 2. XLSX verification (PK\x03\x04 ZIP header, End of Central Directory, Schedule & Summary XML sheets)
const xlsxBytes = buildXlsxBytes(sample, 'QA Scope');
assert.deepEqual(Array.from(xlsxBytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
const xlsxAscii = new TextDecoder('latin1').decode(xlsxBytes);
assert.ok(xlsxAscii.includes('xl/workbook.xml'));
assert.ok(xlsxAscii.includes('xl/worksheets/sheet1.xml'));
assert.ok(xlsxAscii.includes('xl/worksheets/sheet2.xml'));
assert.ok(xlsxAscii.includes('Sam (Jr.) &quot;Test&quot;'));
assert.ok(xlsxAscii.includes('PK\x05\x06'), 'ZIP EOCD marker missing');

// 3. PDF verification (multi-page pagination + special character escaping + empty state)
const many = [];
for (let i = 0; i < 4; i += 1) {
  for (const b of sample) {
    many.push({ ...b, referenceCode: `${b.referenceCode}-${i}` });
  }
}
const pdfBytes = buildPdfBytes(many, 'Multi-Page QA Scope');
const pdfText = new TextDecoder('latin1').decode(pdfBytes);
assert.ok(pdfText.startsWith('%PDF-1.4\n'));
assert.ok(pdfText.trimEnd().endsWith('%%EOF'));
assert.ok(pdfText.includes('/Count 3'));
assert.ok(pdfText.includes('Page 3 of 3'));
assert.ok(pdfText.includes('\\(Jr.\\)'));
assert.ok(pdfText.includes('Checklist / Notes:'));
assert.ok(pdfText.includes('Check-in, "fast lane" - Bay A'));

const emptyPdfText = new TextDecoder('latin1').decode(buildPdfBytes([], 'Empty Scope'));
assert.ok(emptyPdfText.includes('No scheduled bookings matched'));
assert.ok(emptyPdfText.includes('Page 1 of 1'));

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('PASS: Browser CSV, XLSX (OOXML ZIP), and multi-page PDF exporter assertions all succeeded.');
