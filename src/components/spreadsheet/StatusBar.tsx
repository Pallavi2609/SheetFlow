import { useMemo } from 'react';

import { useSheetStore } from '../../store/sheetStore';
import type { Cell, EvalResult, Selection } from '../../types';
import { GRID_COLS, GRID_ROWS } from '../../types';
import { normalizeRange, toKey } from '../../utils/address';
import { roundNumber } from '../../utils/display';

interface Summary {
  address: string;
  cellCount: number;
  nonEmpty: number;
  sum: number;
  numericCount: number;
}

function computeSummary(
  selection: Selection,
  cells: Record<string, Cell>,
  computed: Record<string, EvalResult>,
): Summary {
  const { anchor, focus } = selection;
  const range = normalizeRange(anchor, focus);
  let nonEmpty = 0;
  let sum = 0;
  let numericCount = 0;
  for (let row = range.minRow; row <= range.maxRow; row++) {
    for (let col = range.minCol; col <= range.maxCol; col++) {
      const key = toKey(row, col);
      const raw = cells[key]?.raw;
      if (raw !== undefined && raw !== '') nonEmpty += 1;
      const result = computed[key];
      if (result && !result.error && typeof result.value === 'number') {
        sum += result.value;
        numericCount += 1;
      }
    }
  }
  return {
    address: toKey(focus.row, focus.col),
    cellCount: (range.maxRow - range.minRow + 1) * (range.maxCol - range.minCol + 1),
    nonEmpty,
    sum: roundNumber(sum),
    numericCount,
  };
}

export default function StatusBar() {
  const selection = useSheetStore((s) => s.selection);
  const cells = useSheetStore((s) => s.cells);
  const computed = useSheetStore((s) => s.computed);
  const summary = useMemo(
    () => computeSummary(selection, cells, computed),
    [selection, cells, computed],
  );
  const isRange = summary.cellCount > 1;

  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-600">
      <span>
        <span className="font-semibold text-slate-800" data-testid="active-cell">
          {summary.address}
        </span>
      </span>
      <span data-testid="grid-dimensions">
        {GRID_ROWS} rows × {GRID_COLS} columns
      </span>
      {isRange && (
        <span data-testid="selection-summary">
          Selected: {summary.cellCount} cells · Non-empty: {summary.nonEmpty}
          {summary.numericCount > 0 && (
            <>
              {' '}
              · Sum: {summary.sum} · Average: {roundNumber(summary.sum / summary.numericCount)} ·
              Count: {summary.numericCount}
            </>
          )}
        </span>
      )}
      <span className="ml-auto hidden text-slate-400 sm:inline">
        SheetFlow — data saved in your browser
      </span>
    </footer>
  );
}
