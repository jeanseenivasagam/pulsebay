import {
  DEPARTMENTS,
  formatSlotLabel,
  getDepartment,
  getSpecialist,
  priorityLabel,
  statusLabel,
  summarizeBookings,
} from '../data/catalog';
import type { Booking, ExportResult } from '../types';

const encoder = new TextEncoder();

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvBytes(bookings: readonly Booking[]): Uint8Array {
  const headers = [
    'Reference',
    'Date',
    'Time',
    'Duration (min)',
    'Visitor',
    'Email',
    'Phone',
    'Department',
    'Room',
    'Specialist',
    'Priority',
    'Status',
    'Protocol Notes',
  ];

  const lines: string[] = [headers.map(csvEscape).join(',')];
  for (const b of bookings) {
    const dept = getDepartment(b.departmentId);
    const spec = getSpecialist(b.specialistId);
    lines.push(
      [
        b.referenceCode,
        b.date,
        formatSlotLabel(b.startTime),
        b.durationMins,
        b.visitorName,
        b.visitorEmail,
        b.visitorPhone,
        dept.name,
        dept.roomLabel,
        spec.name,
        priorityLabel(b.priority),
        statusLabel(b.status),
        b.protocolNotes,
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  const body = encoder.encode(lines.join('\r\n') + '\r\n');
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const out = new Uint8Array(bom.length + body.length);
  out.set(bom, 0);
  out.set(body, bom.length);
  return out;
}

// --- Zero-dependency OOXML .xlsx builder (ZIP STORE + CRC32) ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function xmlEscape(input: string | number): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colLetter(colIndex: number): string {
  let n = colIndex + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function makeInlineStringCell(ref: string, text: string, styleId: number): string {
  return `<c r="${ref}" t="inlineStr" s="${styleId}"><is><t>${xmlEscape(text)}</t></is></c>`;
}

function makeNumberCell(ref: string, num: number, styleId: number): string {
  return `<c r="${ref}" s="${styleId}"><v>${num}</v></c>`;
}

function buildZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const checksum = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

export function buildXlsxBytes(bookings: readonly Booking[], scopeLabel: string): Uint8Array {
  const headers = [
    'Reference',
    'Date',
    'Time',
    'Duration (min)',
    'Visitor',
    'Email',
    'Phone',
    'Department',
    'Room',
    'Specialist',
    'Priority',
    'Status',
    'Protocol Notes',
  ];

  const colWidths = [16, 13, 12, 14, 22, 26, 16, 20, 12, 22, 12, 13, 40];
  const colsXml = colWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const scheduleRows: string[] = [];
  scheduleRows.push(
    `<row r="1" ht="24" customHeight="1">${headers
      .map((h, i) => makeInlineStringCell(`${colLetter(i)}1`, h, 1))
      .join('')}</row>`
  );

  bookings.forEach((b, idx) => {
    const r = idx + 2;
    const dept = getDepartment(b.departmentId);
    const spec = getSpecialist(b.specialistId);
    const styleId = idx % 2 === 1 ? 3 : 2;
    const cells = [
      makeInlineStringCell(`A${r}`, b.referenceCode, styleId),
      makeInlineStringCell(`B${r}`, b.date, styleId),
      makeInlineStringCell(`C${r}`, formatSlotLabel(b.startTime), styleId),
      makeNumberCell(`D${r}`, b.durationMins, styleId),
      makeInlineStringCell(`E${r}`, b.visitorName, styleId),
      makeInlineStringCell(`F${r}`, b.visitorEmail, styleId),
      makeInlineStringCell(`G${r}`, b.visitorPhone, styleId),
      makeInlineStringCell(`H${r}`, dept.name, styleId),
      makeInlineStringCell(`I${r}`, dept.roomLabel, styleId),
      makeInlineStringCell(`J${r}`, spec.name, styleId),
      makeInlineStringCell(`K${r}`, priorityLabel(b.priority), styleId),
      makeInlineStringCell(`L${r}`, statusLabel(b.status), styleId),
      makeInlineStringCell(`M${r}`, b.protocolNotes, styleId),
    ];
    scheduleRows.push(`<row r="${r}" ht="20" customHeight="1">${cells.join('')}</row>`);
  });

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>${scheduleRows.join('')}</sheetData>
</worksheet>`;

  const stats = summarizeBookings(bookings);
  const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const summaryRows: string[] = [
    `<row r="1">${makeInlineStringCell('A1', 'PulseBay Operations Schedule Summary', 4)}</row>`,
    `<row r="2">${makeInlineStringCell('A2', `Scope: ${scopeLabel} | Generated: ${generatedAt}`, 2)}</row>`,
    `<row r="3">${makeInlineStringCell('A3', 'Built by Jean Seenivasagam — https://github.com/jeanseenivasagam/', 2)}</row>`,
    `<row r="5">${makeInlineStringCell('A5', 'Metric', 1)}${makeInlineStringCell('B5', 'Count', 1)}</row>`,
    `<row r="6">${makeInlineStringCell('A6', 'Total Bookings', 2)}${makeNumberCell('B6', stats.total, 2)}</row>`,
    `<row r="7">${makeInlineStringCell('A7', 'Confirmed', 3)}${makeNumberCell('B7', stats.confirmed, 3)}</row>`,
    `<row r="8">${makeInlineStringCell('A8', 'Checked In', 2)}${makeNumberCell('B8', stats.checkedIn, 2)}</row>`,
    `<row r="9">${makeInlineStringCell('A9', 'Completed', 3)}${makeNumberCell('B9', stats.completed, 3)}</row>`,
    `<row r="10">${makeInlineStringCell('A10', 'Cancelled', 2)}${makeNumberCell('B10', stats.cancelled, 2)}</row>`,
    `<row r="11">${makeInlineStringCell('A11', 'Active Urgent', 3)}${makeNumberCell('B11', stats.urgent, 3)}</row>`,
    `<row r="13">${makeInlineStringCell('A13', 'Department', 1)}${makeInlineStringCell('B13', 'Bay', 1)}${makeInlineStringCell('C13', 'Bookings', 1)}</row>`,
  ];

  DEPARTMENTS.forEach((dept, idx) => {
    const r = 14 + idx;
    const count = bookings.filter((b) => b.departmentId === dept.id).length;
    const st = idx % 2 === 1 ? 3 : 2;
    summaryRows.push(
      `<row r="${r}">${makeInlineStringCell(`A${r}`, dept.name, st)}${makeInlineStringCell(
        `B${r}`,
        dept.roomLabel,
        st
      )}${makeNumberCell(`C${r}`, count, st)}</row>`
    );
  });

  const sheet2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/></cols>
  <sheetData>${summaryRows.join('')}</sheetData>
</worksheet>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><color rgb="FF16263B"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FF16263B"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1B6CE5"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F8FB"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD3E1EA"/></left>
      <right style="thin"><color rgb="FFD3E1EA"/></right>
      <top style="thin"><color rgb="FFD3E1EA"/></top>
      <bottom style="thin"><color rgb="FFD3E1EA"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Schedule" sheetId="1" r:id="rId1"/>
    <sheet name="Summary" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  return buildZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet1Xml) },
    { name: 'xl/worksheets/sheet2.xml', data: encoder.encode(sheet2Xml) },
  ]);
}

// --- Zero-dependency PDF 1.4 Landscape Report Builder (mirrors Rust pulsebay-export) ---

function pdfEscape(input: string): string {
  return input
    .replace(/[—–·•]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function compactNotes(notes: string): string {
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ');
}

function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, Math.max(1, max - 3))}...`;
}

export function buildPdfBytes(bookings: readonly Booking[], scopeLabel: string): Uint8Array {
  const pageW = 792;
  const pageH = 612;
  const margin = 36;
  const contentW = pageW - margin * 2;
  const footerLimitY = 46;
  const baseRowH = 22;
  const noteExtraH = 13;
  const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const rowHeightFor = (b: Booking): number =>
    compactNotes(b.protocolNotes).length > 0 ? baseRowH + noteExtraH : baseRowH;

  const pagesRows: Booking[][] = [];
  if (bookings.length === 0) {
    pagesRows.push([]);
  } else {
    const page1Capacity = pageH - margin - 54 - 14 - 44 - 16 - 24 - footerLimitY;
    const nextCapacity = pageH - margin - 54 - 18 - 24 - footerLimitY;
    let current: Booking[] = [];
    let remaining = page1Capacity;
    for (const b of bookings) {
      const h = rowHeightFor(b);
      if (current.length > 0 && h > remaining) {
        pagesRows.push(current);
        current = [];
        remaining = nextCapacity;
      }
      current.push(b);
      remaining -= h;
    }
    if (current.length > 0) {
      pagesRows.push(current);
    }
  }

  const totalPages = pagesRows.length;
  const stats = summarizeBookings(bookings);

  const renderPage = (rows: Booking[], pageNum: number): string => {
    const out: string[] = [];
    const rect = (x: number, y: number, w: number, h: number, r: number, g: number, b: number) => {
      out.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
    };
    const text = (
      font: string,
      size: number,
      x: number,
      y: number,
      r: number,
      g: number,
      b: number,
      str: string
    ) => {
      out.push(
        `BT /${font} ${size.toFixed(1)} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfEscape(str)}) Tj ET`
      );
    };

    const bannerH = 54;
    const bannerY = pageH - margin - bannerH;
    rect(margin, bannerY, contentW, bannerH, 0.106, 0.424, 0.898);
    text('F2', 18, margin + 16, bannerY + 30, 1, 1, 1, 'PulseBay Operations Schedule');
    text(
      'F1',
      9.5,
      margin + 16,
      bannerY + 13,
      0.86,
      0.92,
      1,
      `Scope: ${scopeLabel}   |   Generated: ${generatedAt}`
    );
    text('F2', 10, pageW - margin - 115, bannerY + 24, 1, 1, 1, 'PULSEBAY DESK');

    let tableTopY = bannerY - 18;
    if (pageNum === 1) {
      const cards: Array<[string, number, [number, number, number]]> = [
        ['TOTAL', stats.total, [0.086, 0.149, 0.231]],
        ['CONFIRMED', stats.confirmed, [0.059, 0.616, 0.541]],
        ['CHECKED IN', stats.checkedIn, [0.106, 0.424, 0.898]],
        ['COMPLETED', stats.completed, [0.29, 0.376, 0.478]],
        ['URGENT', stats.urgent, [0.878, 0.282, 0.353]],
      ];
      const gap = 10;
      const cardW = (contentW - gap * 4) / 5;
      const cardH = 44;
      const cardY = bannerY - 14 - cardH;
      cards.forEach(([label, val, [cr, cg, cb]], idx) => {
        const cx = margin + (cardW + gap) * idx;
        rect(cx, cardY, cardW, cardH, 0.945, 0.965, 0.973);
        rect(cx, cardY, 5, cardH, cr, cg, cb);
        text('F2', 8, cx + 12, cardY + 29, 0.29, 0.38, 0.48, label);
        text('F2', 16, cx + 12, cardY + 10, 0.086, 0.149, 0.231, String(val));
      });
      tableTopY = cardY - 16;
    }

    const headerH = 24;
    const headerY = tableTopY - headerH;
    rect(margin, headerY, contentW, headerH, 0.086, 0.149, 0.231);

    const cols: Array<[string, number]> = [
      ['REF', margin + 8],
      ['DATE / TIME', margin + 92],
      ['VISITOR', margin + 206],
      ['DEPARTMENT', margin + 336],
      ['SPECIALIST', margin + 448],
      ['PRIORITY', margin + 566],
      ['STATUS', margin + 632],
    ];
    for (const [label, cx] of cols) {
      text('F2', 8.5, cx, headerY + 8, 1, 1, 1, label);
    }

    if (rows.length === 0) {
      text(
        'F1',
        10.5,
        margin + 12,
        headerY - 26,
        0.35,
        0.44,
        0.53,
        'No scheduled bookings matched the selected export filter.'
      );
    } else {
      let cursorY = headerY;
      rows.forEach((b, idx) => {
        const notesClean = compactNotes(b.protocolNotes);
        const hasNotes = notesClean.length > 0;
        const rowH = hasNotes ? baseRowH + noteExtraH : baseRowH;
        const ry = cursorY - rowH;
        if (idx % 2 === 1) {
          rect(margin, ry, contentW, rowH, 0.957, 0.973, 0.984);
        }
        rect(margin, ry, contentW, 0.6, 0.827, 0.882, 0.918);
        const dept = getDepartment(b.departmentId);
        const spec = getSpecialist(b.specialistId);
        const ty = hasNotes ? ry + 19.5 : ry + 7.5;
        text('F3', 8, cols[0][1], ty, 0.086, 0.149, 0.231, truncate(b.referenceCode, 14));
        text('F1', 8.5, cols[1][1], ty, 0.12, 0.2, 0.3, truncate(`${b.date} ${formatSlotLabel(b.startTime)}`, 20));
        text('F2', 8.8, cols[2][1], ty, 0.086, 0.149, 0.231, truncate(b.visitorName, 22));
        text('F1', 8.5, cols[3][1], ty, 0.18, 0.28, 0.39, truncate(`[${dept.shortCode}] ${dept.name}`, 21));
        text('F1', 8.5, cols[4][1], ty, 0.18, 0.28, 0.39, truncate(spec.name, 20));
        text('F2', 8.2, cols[5][1], ty, 0.55, 0.32, 0.05, priorityLabel(b.priority));
        text('F2', 8.2, cols[6][1], ty, 0.059, 0.48, 0.42, statusLabel(b.status));

        if (hasNotes) {
          text('F2', 7.5, cols[0][1], ry + 6, 0.24, 0.36, 0.48, 'Checklist / Notes:');
          text('F1', 7.6, cols[1][1], ry + 6, 0.28, 0.38, 0.48, truncate(notesClean, 118));
        }

        cursorY = ry;
      });
    }

    rect(margin, 34, contentW, 0.8, 0.8, 0.86, 0.9);
    text(
      'F1',
      8,
      margin,
      21,
      0.38,
      0.46,
      0.55,
      'PulseBay Operations Console  |  Built by Jean Seenivasagam  |  github.com/jeanseenivasagam'
    );
    text('F2', 8, pageW - margin - 62, 21, 0.25, 0.35, 0.46, `Page ${pageNum} of ${totalPages}`);

    return out.join('\n');
  };

  const objects: Array<{ id: number; body: string }> = [];
  const kids = pagesRows.map((_, i) => `${6 + i * 2} 0 R`).join(' ');
  objects.push({ id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });
  objects.push({ id: 2, body: `<< /Type /Pages /Kids [ ${kids} ] /Count ${totalPages} >>` });
  objects.push({ id: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' });
  objects.push({ id: 4, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>' });
  objects.push({ id: 5, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>' });

  pagesRows.forEach((rows, idx) => {
    const pageId = 6 + idx * 2;
    const contentId = 7 + idx * 2;
    const stream = renderPage(rows, idx + 1);
    const streamLen = encoder.encode(stream).length;
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    objects.push({
      id: contentId,
      body: `<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`,
    });
  });

  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n%PulseBay\n')];
  const offsets: number[] = new Array(objects.length + 1).fill(0);
  let byteOffset = chunks[0].length;

  for (const obj of objects) {
    offsets[obj.id] = byteOffset;
    const piece = encoder.encode(`${obj.id} 0 obj\n${obj.body}\nendobj\n`);
    chunks.push(piece);
    byteOffset += piece.length;
  }

  const xrefOffset = byteOffset;
  const count = objects.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));

  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    result.set(c, pos);
    pos += c.length;
  }
  return result;
}

export function exportInBrowser(
  format: 'xlsx' | 'csv' | 'pdf',
  bookings: readonly Booking[],
  scopeLabel: string
): ExportResult {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `pulsebay-schedule-${stamp}.${format}`;
  let bytes: Uint8Array;
  let mime: string;

  if (format === 'xlsx') {
    bytes = buildXlsxBytes(bookings, scopeLabel);
    mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (format === 'csv') {
    bytes = buildCsvBytes(bookings);
    mime = 'text/csv;charset=utf-8';
  } else {
    bytes = buildPdfBytes(bookings, scopeLabel);
    mime = 'application/pdf';
  }

  triggerBrowserDownload(new Blob([bytes.buffer as ArrayBuffer], { type: mime }), filename);
  return {
    format,
    filename,
    bytesWritten: bytes.length,
    recordCount: bookings.length,
  };
}
