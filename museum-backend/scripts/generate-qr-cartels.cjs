#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseArgs(argv) {
  const out = {};
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) {
      out[raw.slice(2)] = true;
      continue;
    }
    out[raw.slice(2, eq)] = raw.slice(eq + 1);
  }
  return out;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new Error(`empty CSV: ${filePath}`);
  const header = lines[0].split(',').map((s) => s.trim());
  const wantedCols = ['artworkId', 'title', 'roomId'];
  for (const col of wantedCols) {
    if (!header.includes(col)) {
      throw new Error(`CSV missing column "${col}" (header: ${header.join(',')})`);
    }
  }
  const idx = {
    artworkId: header.indexOf('artworkId'),
    title: header.indexOf('title'),
    roomId: header.indexOf('roomId'),
  };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((s) => s.trim());
    rows.push({
      artworkId: cells[idx.artworkId] ?? '',
      title: cells[idx.title] ?? '',
      roomId: cells[idx.roomId] ?? '',
    });
  }
  return rows;
}

function validateRow(row, lineNum) {
  if (!UUID_V4_RE.test(row.artworkId)) {
    throw new Error(`row ${lineNum}: artworkId "${row.artworkId}" is not a v4 UUID`);
  }
  if (row.title.length === 0) {
    throw new Error(`row ${lineNum}: title is empty`);
  }
  if (row.roomId.length > 0 && !UUID_V4_RE.test(row.roomId)) {
    throw new Error(`row ${lineNum}: roomId "${row.roomId}" is not a v4 UUID`);
  }
}

function buildDeeplink(museumId, artworkId, roomId) {
  const base = `musaium://museum/${museumId}/artwork/${artworkId}`;
  return roomId.length > 0 ? `${base}?room=${roomId}` : base;
}

async function renderQrPng(text) {
  return await QRCode.toBuffer(text, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const museumId = args['museum-id'];
  const inputPath = args.input;
  const outPath = args.out;
  if (!museumId || !inputPath || !outPath) {
    console.error(
      'Usage: node scripts/generate-qr-cartels.cjs --museum-id=<uuid> --input=<csv> --out=<pdf>',
    );
    process.exit(2);
  }
  if (!UUID_V4_RE.test(museumId)) {
    console.error(`museum-id "${museumId}" is not a v4 UUID`);
    process.exit(2);
  }
  const absInput = path.resolve(inputPath);
  const absOut = path.resolve(outPath);
  const rows = readCsv(absInput);
  rows.forEach((row, i) => validateRow(row, i + 2));

  const PAGE_MARGIN = 30;
  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const COLS = 3;
  const ROWS = 4;
  const PER_PAGE = COLS * ROWS;
  const CELL_W = (PAGE_WIDTH - 2 * PAGE_MARGIN) / COLS;
  const CELL_H = (PAGE_HEIGHT - 2 * PAGE_MARGIN) / ROWS;
  const QR_SIZE = Math.min(CELL_W, CELL_H) - 50;

  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
  doc.pipe(fs.createWriteStream(absOut));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const pageIdx = Math.floor(i / PER_PAGE);
    const slot = i % PER_PAGE;
    if (slot === 0 && pageIdx > 0) doc.addPage();
    const col = slot % COLS;
    const rowIdx = Math.floor(slot / COLS);
    const cellX = PAGE_MARGIN + col * CELL_W;
    const cellY = PAGE_MARGIN + rowIdx * CELL_H;

    const deeplink = buildDeeplink(museumId, row.artworkId, row.roomId);
    const png = await renderQrPng(deeplink);

    const qrX = cellX + (CELL_W - QR_SIZE) / 2;
    const qrY = cellY + 10;
    doc.image(png, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

    const labelY = qrY + QR_SIZE + 6;
    doc.fontSize(9).text(row.title, cellX + 4, labelY, {
      width: CELL_W - 8,
      align: 'center',
      ellipsis: true,
    });
    if (row.roomId.length > 0) {
      doc
        .fontSize(7)
        .fillColor('#555555')
        .text(`Salle ${row.roomId.slice(0, 8)}`, cellX + 4, labelY + 22, {
          width: CELL_W - 8,
          align: 'center',
        });
      doc.fillColor('#000000');
    }
  }

  doc.end();
  console.log(`wrote ${rows.length} cartels to ${absOut}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
