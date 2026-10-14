import { GRID_COLS, GRID_ROWS } from '../types';
import type { Cell } from '../types';
import { colToLabel, parseKey, toKey } from './address';

/**
 * Characters a spreadsheet app treats as the start of a formula. Text cells
 * beginning with one of these could execute when the CSV is opened elsewhere
 * (CSV formula injection / "CSV injection").
 */
const INJECTION_PREFIX = /^[=+\-@\t\r]/;

/**
 * Neutralise a value that a spreadsheet app might execute by prefixing an
 * apostrophe (the conventional "treat as text" escape). Values that are not
 * dangerous are returned unchanged.
 */
export function neutralizeFormula(value: string): string {
  return INJECTION_PREFIX.test(value) ? `'${value}` : value;
}

export interface CsvExportOptions {
  neutralize?: boolean;
}

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function cellsToCsv(cells: Record<string, Cell>, options: CsvExportOptions = {}): string {
  const neutralize = options.neutralize ?? true;
  let maxRow = -1;
  let maxCol = -1;
  for (const key of Object.keys(cells)) {
    const pos = parseKey(key);
    if (!pos) continue;
    maxRow = Math.max(maxRow, pos.row);
    maxCol = Math.max(maxCol, pos.col);
  }
  const rows = maxRow + 1;
  const cols = maxCol + 1;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const fields: string[] = [];
    for (let c = 0; c < cols; c++) {
      const raw = cells[toKey(r, c)]?.raw ?? '';
      fields.push(escapeCsvField(neutralize ? neutralizeFormula(raw) : raw));
    }
    lines.push(fields.join(','));
  }
  return lines.join('\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || row.length > 0) {
    pushRow();
  }
  return rows;
}

export function parseDelimitedText(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = normalized.replace(/\n+$/, '');
  if (trimmed.includes('\t')) {
    return trimmed.split('\n').map((line) => line.split('\t'));
  }
  if (trimmed.includes(',') && !trimmed.includes('\n')) {
    return parseCsv(trimmed);
  }
  if (trimmed.includes(',')) {
    return parseCsv(trimmed);
  }
  return trimmed.split('\n').map((line) => [line]);
}

export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.join('\t')).join('\n');
}

export function rawAt(cells: Record<string, Cell>, row: number, col: number): string | null {
  if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return null;
  return cells[toKey(row, col)]?.raw ?? '';
}

export function columnLabel(index: number): string {
  return colToLabel(index);
}
