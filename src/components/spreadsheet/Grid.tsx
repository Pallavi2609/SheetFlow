import { useEffect } from 'react';

import { useSheetStore } from '../../store/sheetStore';
import { colToLabel, toKey } from '../../utils/address';
import { GRID_COLS, GRID_ID, GRID_ROWS } from '../../types';
import CellView from './CellView';

export const DEFAULT_COL_WIDTH = 96;
export const DEFAULT_ROW_HEIGHT = 28;
export const ROW_HEADER_WIDTH = 48;

const COLUMN_HEADER_CLASS =
  'sticky top-0 z-20 relative h-7 border-b border-r border-slate-300 bg-slate-100 text-center align-middle text-xs font-semibold text-slate-600';
const ROW_HEADER_CLASS =
  'sticky left-0 z-10 relative border-b border-r border-slate-300 bg-slate-100 text-center align-middle text-xs font-medium text-slate-500';

export default function Grid() {
  const focusRow = useSheetStore((s) => s.selection.focus.row);
  const focusCol = useSheetStore((s) => s.selection.focus.col);
  const select = useSheetStore((s) => s.select);
  const extendTo = useSheetStore((s) => s.extendTo);
  const colWidths = useSheetStore((s) => s.colWidths);
  const rowHeights = useSheetStore((s) => s.rowHeights);

  useEffect(() => {
    const element = document.querySelector(`[data-cell="${toKey(focusRow, focusCol)}"]`);
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [focusRow, focusCol]);

  const columns = Array.from({ length: GRID_COLS }, (_, index) => index);
  const rows = Array.from({ length: GRID_ROWS }, (_, index) => index);

  const widthOf = (col: number) => colWidths[col] ?? DEFAULT_COL_WIDTH;
  const heightOf = (row: number) => rowHeights[row] ?? DEFAULT_ROW_HEIGHT;
  const totalWidth = ROW_HEADER_WIDTH + columns.reduce((sum, col) => sum + widthOf(col), 0);

  const handleSelectAll = () => {
    select({ row: 0, col: 0 });
    extendTo({ row: GRID_ROWS - 1, col: GRID_COLS - 1 });
  };

  const startColResize = (event: React.MouseEvent, col: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = useSheetStore.getState().colWidths[col] ?? DEFAULT_COL_WIDTH;
    const onMove = (moveEvent: MouseEvent) => {
      useSheetStore.getState().setColWidth(col, startWidth + (moveEvent.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startRowResize = (event: React.MouseEvent, row: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = useSheetStore.getState().rowHeights[row] ?? DEFAULT_ROW_HEIGHT;
    const onMove = (moveEvent: MouseEvent) => {
      useSheetStore.getState().setRowHeight(row, startHeight + (moveEvent.clientY - startY));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className="relative min-h-0 flex-1 overflow-auto border-b border-slate-200 bg-white"
      data-testid="grid-scroll"
      role="region"
      aria-label="Spreadsheet"
    >
      <table
        id={GRID_ID}
        role="grid"
        aria-label="Spreadsheet grid"
        aria-rowcount={GRID_ROWS}
        aria-colcount={GRID_COLS}
        aria-activedescendant={`cell-${toKey(focusRow, focusCol)}`}
        tabIndex={0}
        className="w-max border-separate border-spacing-0 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]"
        style={{ tableLayout: 'fixed', width: totalWidth }}
      >
        <colgroup>
          <col style={{ width: ROW_HEADER_WIDTH }} />
          {columns.map((col) => (
            <col key={col} style={{ width: widthOf(col) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              onClick={handleSelectAll}
              title="Select all cells"
              aria-label="Select all cells"
              className={`${COLUMN_HEADER_CLASS} sticky left-0 z-30 cursor-pointer text-slate-400`}
            >
              ◫
            </th>
            {columns.map((col) => (
              <th key={col} scope="col" className={COLUMN_HEADER_CLASS}>
                {colToLabel(col)}
                <span
                  role="separator"
                  aria-label={`Resize column ${colToLabel(col)}`}
                  aria-orientation="vertical"
                  data-testid={`col-resize-${col}`}
                  onMouseDown={(event) => startColResize(event, col)}
                  className="absolute -right-[3px] top-0 z-40 h-full w-1.5 cursor-col-resize hover:bg-[#2563EB]/40"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row} style={{ height: heightOf(row) }}>
              <th scope="row" className={ROW_HEADER_CLASS}>
                {row + 1}
                <span
                  role="separator"
                  aria-label={`Resize row ${row + 1}`}
                  aria-orientation="horizontal"
                  data-testid={`row-resize-${row}`}
                  onMouseDown={(event) => startRowResize(event, row)}
                  className="absolute -bottom-[3px] left-0 z-40 h-1.5 w-full cursor-row-resize hover:bg-[#2563EB]/40"
                />
              </th>
              {columns.map((col) => (
                <CellView key={col} row={row} col={col} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
