/**
 * Formula reference shifting for fill-handle / drag-to-copy operations.
 *
 * SheetFlow stores formulas as literal text, so a fill must rewrite the A1-style
 * references by the (row, col) delta between the source cell and its target.
 * Out-of-grid results are left unchanged (documented behaviour rather than a
 * silently wrong reference).
 */
import { GRID_COLS, GRID_ROWS } from '../types';
import { labelToCol, toKey } from '../utils/address';

const REF_RE = /([A-Za-z]{1,3})([1-9][0-9]*)/g;

export function shiftFormulaRefs(raw: string, dRow: number, dCol: number): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('=')) return raw;
  if (dRow === 0 && dCol === 0) return raw;
  const body = trimmed.slice(1);
  const shifted = body.replace(REF_RE, (match, letters: string, digits: string) => {
    const col = labelToCol(letters);
    if (col < 0) return match;
    const row = Number(digits) - 1;
    const nextRow = row + dRow;
    const nextCol = col + dCol;
    if (nextRow < 0 || nextRow >= GRID_ROWS || nextCol < 0 || nextCol >= GRID_COLS) return match;
    return toKey(nextRow, nextCol);
  });
  return `=${shifted}`;
}
