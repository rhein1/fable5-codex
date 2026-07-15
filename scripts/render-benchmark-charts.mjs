#!/usr/bin/env node
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WIDTH = 1600;
const HEIGHT = 900;
const COLORS = {
  background: '#0c1222',
  panel: '#182033',
  grid: '#283247',
  white: '#f8fafc',
  muted: '#94a3b8',
  baseline: '#64748b',
  plugin: '#e8613a',
  accent: '#f4c95d',
};

const FONT_RAW = {
  ' ': '00000/00000/00000/00000/00000/00000/00000',
  '?': '01110/10001/00001/00010/00100/00000/00100',
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111',
  J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/10101/01010',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  0: '01110/10001/10011/10101/11001/10001/01110',
  1: '00100/01100/00100/00100/00100/00100/01110',
  2: '01110/10001/00001/00010/00100/01000/11111',
  3: '11110/00001/00001/01110/00001/00001/11110',
  4: '00010/00110/01010/10010/11111/00010/00010',
  5: '11111/10000/10000/11110/00001/00001/11110',
  6: '01110/10000/10000/11110/10001/10001/01110',
  7: '11111/00001/00010/00100/01000/01000/01000',
  8: '01110/10001/10001/01110/10001/10001/01110',
  9: '01110/10001/10001/01111/00001/00001/01110',
  '-': '00000/00000/00000/11111/00000/00000/00000',
  '.': '00000/00000/00000/00000/00000/01100/01100',
  ':': '00000/01100/01100/00000/01100/01100/00000',
  '+': '00000/00100/00100/11111/00100/00100/00000',
  '>': '10000/01000/00100/00010/00100/01000/10000',
  '/': '00001/00010/00100/01000/10000/00000/00000',
  '(': '00010/00100/01000/01000/01000/00100/00010',
  ')': '01000/00100/00010/00010/00010/00100/01000',
  '%': '11001/11010/00100/01000/10110/00110/00000',
};
const FONT = Object.fromEntries(
  Object.entries(FONT_RAW).map(([character, rows]) => [character, rows.split('/')]),
);

function parseColor(value) {
  const hex = value.replace('#', '');
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    255,
  ];
}

function createCanvas() {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  function fillRect(x, y, width, height, color) {
    const rgba = parseColor(color);
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    const right = Math.min(WIDTH, Math.round(x + width));
    const bottom = Math.min(HEIGHT, Math.round(y + height));
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const offset = (py * WIDTH + px) * 4;
        pixels[offset] = rgba[0];
        pixels[offset + 1] = rgba[1];
        pixels[offset + 2] = rgba[2];
        pixels[offset + 3] = rgba[3];
      }
    }
  }
  function textWidth(value, scale) {
    return Math.max(0, value.length * 6 * scale - scale);
  }
  function drawText(value, x, y, scale, color, maxWidth = WIDTH - x) {
    const normalized = String(value).toUpperCase();
    let cursor = Math.round(x);
    for (const character of normalized) {
      if (cursor + 5 * scale > x + maxWidth) break;
      const glyph = FONT[character] ?? FONT['?'];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let column = 0; column < glyph[row].length; column += 1) {
          if (glyph[row][column] === '1') {
            fillRect(cursor + column * scale, y + row * scale, scale, scale, color);
          }
        }
      }
      cursor += 6 * scale;
    }
    return textWidth(normalized, scale);
  }
  fillRect(0, 0, WIDTH, HEIGHT, COLORS.background);
  return { pixels, fillRect, drawText, textWidth };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function writePng(path, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    const target = y * (WIDTH * 4 + 1);
    scanlines[target] = 0;
    pixels.copy(scanlines, target + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function average(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field]), 0) / Math.max(1, rows.length);
}

function pairRows(rows) {
  return [...new Set(rows.map((row) => row.case_id))].map((caseId) => ({
    caseId,
    baseline: rows.find((row) => row.case_id === caseId && row.mode === 'baseline'),
    plugin: rows.find((row) => row.case_id === caseId && row.mode === 'plugin'),
  }));
}

function drawHeader(canvas, title, subtitle, model) {
  const titleScale = canvas.textWidth(title, 6) <= 980 ? 6 : 5;
  canvas.drawText(title, 72, 48, titleScale, COLORS.white, 980);
  canvas.drawText(subtitle, 76, 112, 3, COLORS.muted, 1420);
  canvas.fillRect(1110, 55, 26, 18, COLORS.baseline);
  canvas.drawText(`NORMAL ${model}`, 1150, 54, 3, COLORS.white, 400);
  canvas.fillRect(1110, 92, 26, 18, COLORS.plugin);
  canvas.drawText(`${model} + FABLE-5`, 1150, 91, 3, COLORS.white, 400);
}

function renderSummary(rows, model, outputPath) {
  const canvas = createCanvas();
  drawHeader(canvas, 'FABLE-5 BENCHMARK SNAPSHOT', 'COMPOSITE SCORE BY FIXTURE. ISOLATED CODEX HOMES.', model);
  const pairs = pairRows(rows);
  const left = 120;
  const top = 210;
  const chartHeight = 500;
  const chartWidth = 1360;
  for (let tick = 0; tick <= 5; tick += 1) {
    const y = top + chartHeight - (chartHeight * tick) / 5;
    canvas.fillRect(left, y, chartWidth, 2, COLORS.grid);
    canvas.drawText(String(tick * 20), 68, y - 10, 3, COLORS.muted);
  }
  const groupWidth = chartWidth / pairs.length;
  pairs.forEach((pair, index) => {
    const center = left + groupWidth * index + groupWidth / 2;
    const bars = [
      { row: pair.baseline, x: center - 100, color: COLORS.baseline },
      { row: pair.plugin, x: center + 20, color: COLORS.plugin },
    ];
    for (const item of bars) {
      const value = Number(item.row.composite_pct);
      const height = chartHeight * value / 100;
      canvas.fillRect(item.x, top + chartHeight - height, 80, height, item.color);
      canvas.drawText(value.toFixed(0), item.x + 18, top + chartHeight - height - 30, 4, COLORS.white);
    }
    const label = pair.caseId.toUpperCase();
    const width = canvas.textWidth(label, 2);
    canvas.drawText(label, center - width / 2, top + chartHeight + 35, 2, COLORS.white, groupWidth - 20);
  });
  const baselineAverage = average(rows.filter((row) => row.mode === 'baseline'), 'composite_pct');
  const pluginAverage = average(rows.filter((row) => row.mode === 'plugin'), 'composite_pct');
  const delta = pluginAverage - baselineAverage;
  canvas.drawText(
    `AVERAGE COMPOSITE: ${baselineAverage.toFixed(1)} -> ${pluginAverage.toFixed(1)} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} PTS)`,
    120,
    815,
    4,
    COLORS.accent,
    1370,
  );
  writePng(outputPath, canvas.pixels);
}

function renderMetrics(rows, model, outputPath) {
  const canvas = createCanvas();
  drawHeader(canvas, 'WHERE THE PLUGIN CHANGES OUTPUT', 'AVERAGE RUBRIC SUBSCORES ACROSS ALL FIXTURES.', model);
  const metrics = [
    ['EXPECTED ISSUE RECALL', 'recall_pct'],
    ['EVIDENCE MARKERS', 'evidence_pct'],
    ['UNKNOWNS NOTED', 'unknowns_pct'],
    ['STRUCTURED REPORT', 'structure_pct'],
    ['COMPOSITE', 'composite_pct'],
  ];
  const baselineRows = rows.filter((row) => row.mode === 'baseline');
  const pluginRows = rows.filter((row) => row.mode === 'plugin');
  let y = 205;
  for (const [label, field] of metrics) {
    const baseline = average(baselineRows, field);
    const plugin = average(pluginRows, field);
    canvas.drawText(label, 90, y + 18, 3, COLORS.white, 360);
    canvas.fillRect(470, y, 820, 24, COLORS.panel);
    canvas.fillRect(470, y, 820 * baseline / 100, 24, COLORS.baseline);
    canvas.fillRect(470, y + 44, 820, 24, COLORS.panel);
    canvas.fillRect(470, y + 44, 820 * plugin / 100, 24, COLORS.plugin);
    canvas.drawText(baseline.toFixed(1), 1320, y, 3, COLORS.muted);
    canvas.drawText(plugin.toFixed(1), 1320, y + 44, 3, COLORS.white);
    y += 125;
  }
  canvas.drawText('SCALE: 0-100', 470, 835, 3, COLORS.muted);
  writePng(outputPath, canvas.pixels);
}

function renderLatency(rows, model, outputPath) {
  const canvas = createCanvas();
  drawHeader(canvas, 'QUALITY GAIN HAS A LATENCY COST', 'WALL TIME BY FIXTURE. IDENTICAL MODEL AND EFFORT.', model);
  const pairs = pairRows(rows).map((pair) => ({
    label: pair.caseId,
    baseline: Number(pair.baseline.seconds),
    plugin: Number(pair.plugin.seconds),
  }));
  pairs.push({
    label: 'AVERAGE',
    baseline: average(rows.filter((row) => row.mode === 'baseline'), 'seconds'),
    plugin: average(rows.filter((row) => row.mode === 'plugin'), 'seconds'),
  });
  const maximum = Math.max(60, ...pairs.flatMap((pair) => [pair.baseline, pair.plugin]));
  const scale = Math.max(60, Math.ceil(maximum * 1.1 / 60) * 60);
  let y = 205;
  for (const pair of pairs) {
    const labelScale = canvas.textWidth(pair.label, 3) <= 390 ? 3 : 2;
    canvas.drawText(pair.label, 80, y + 18, labelScale, COLORS.white, 390);
    canvas.fillRect(480, y, 760, 24, COLORS.panel);
    canvas.fillRect(480, y, 760 * pair.baseline / scale, 24, COLORS.baseline);
    canvas.fillRect(480, y + 44, 760, 24, COLORS.panel);
    canvas.fillRect(480, y + 44, 760 * pair.plugin / scale, 24, COLORS.plugin);
    canvas.drawText(`${pair.baseline.toFixed(1)}S`, 1270, y, 3, COLORS.muted);
    canvas.drawText(`${pair.plugin.toFixed(1)}S`, 1270, y + 44, 3, COLORS.white);
    y += 145;
  }
  canvas.drawText(`SCALE: 0-${scale} SECONDS`, 480, 835, 3, COLORS.muted);
  writePng(outputPath, canvas.pixels);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--input', '--output-dir', '--model'].includes(key) || value === undefined) {
      throw new Error(`invalid renderer argument: ${key ?? '<missing>'}`);
    }
    if (Object.hasOwn(values, key)) throw new Error(`duplicate renderer argument: ${key}`);
    values[key] = value;
  }
  for (const required of ['--input', '--output-dir']) {
    if (!values[required]) throw new Error(`missing renderer argument: ${required}`);
  }
  return values;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const parsed = JSON.parse(readFileSync(resolve(args['--input']), 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  if (rows.length === 0) throw new Error('benchmark chart input is empty');
  const runIds = [...new Set(rows.map((row) => row.run_id))];
  if (runIds.length !== 1 || !/^\d{8}T\d{6}Z$/.test(runIds[0])) {
    throw new Error('benchmark chart input requires one valid run id');
  }
  const model = args['--model'] || rows[0].model;
  const outputDir = resolve(args['--output-dir']);
  mkdirSync(outputDir, { recursive: true });
  renderSummary(rows, model, join(outputDir, 'fable5-benchmark-summary.png'));
  renderMetrics(rows, model, join(outputDir, 'fable5-benchmark-metrics.png'));
  renderLatency(rows, model, join(outputDir, 'fable5-benchmark-latency.png'));
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
