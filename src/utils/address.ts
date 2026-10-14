import type { GridPos, NormalizedRange } from '../types';
import { GRID_COLS, GRID_ROWS } from '../types';

export function colToLabel(col: number): string {
  if (col < 0) return '';
  let label = '';
  let c = col;
  while (c >= 0) {
    label = String.fromCharCode(65 + (c % 26)) + label;
    c = Math.floor(c / 26) - 1;
  }
  return label;
}

export function labelToCol(label: string): number {
  if (!/^[A-Za-z]+$/.test(label)) return -1;
  let col = 0;
  for (const ch of label.toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return col - 1;
}

export function toKey(row: number, col: number): string {
  return `${colToLabel(col)}${row + 1}`;
}

export function parseKey(key: string): GridPos | null {
  const match = /^([A-Za-z]{1,3})([1-9][0-9]{0,6})$/.exec(key.trim());
  if (!match) return null;
  const col = labelToCol(match[1]);
  const row = Number(match[2]) - 1;
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
  return { row, col };
}

export function isValidKey(key: string): boolean {
  return parseKey(key) !== null;
}

export function posToKey(pos: GridPos): string | null {
  if (pos.row < 0 || pos.row >= GRID_ROWS || pos.col < 0 || pos.col >= GRID_COLS) return null;
  return toKey(pos.row, pos.col);
}

export function normalizeRange(a: GridPos, b: GridPos): NormalizedRange {
  return {
    minRow: Math.min(a.row, b.row),
    maxRow: Math.max(a.row, b.row),
    minCol: Math.min(a.col, b.col),
    maxCol: Math.max(a.col, b.col),
  };
}

export function selectionRange(anchor: GridPos, focus: GridPos): NormalizedRange {
  return normalizeRange(anchor, focus);
}

export function* rangePositions(range: NormalizedRange): Generator<GridPos> {
  for (let row = range.minRow; row <= range.maxRow; row++) {
    for (let col = range.minCol; col <= range.maxCol; col++) {
      yield { row, col };
    }
  }
}

export function rangeKeys(range: NormalizedRange): string[] {
  const keys: string[] = [];
  for (const pos of rangePositions(range)) {
    keys.push(toKey(pos.row, pos.col));
  }
  return keys;
}

export function posInRange(pos: GridPos, range: NormalizedRange): boolean {
  return (
    pos.row >= range.minRow &&
    pos.row <= range.maxRow &&
    pos.col >= range.minCol &&
    pos.col <= range.maxCol
  );
}

export function rangeSize(range: NormalizedRange): number {
  return (range.maxRow - range.minRow + 1) * (range.maxCol - range.minCol + 1);
}
