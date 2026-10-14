import { memo } from 'react';

import type { Cell } from '../../types';
import { GRID_ID } from '../../types';
import { useSheetStore } from '../../store/sheetStore';
import { normalizeRange, parseKey, toKey } from '../../utils/address';
import { alignmentClass, cellDisplayText, fontStyleClass } from '../../utils/display';

interface CellViewProps {
  row: number;
  col: number;
}

const BASE_CELL_CLASS =
  'relative select-none border-b border-r border-slate-200 px-2 align-middle text-[13px] leading-7';

function CellView({ row, col }: CellViewProps) {
  const key = toKey(row, col);
  const cell: Cell | undefined = useSheetStore((s) => s.cells[key]);
  const result = useSheetStore((s) => s.computed[key]);

  // 0 = plain, 1 = active, 2 = in selection, 3 = in fill preview.
  // +10 marks the bottom-right anchor cell of the selection (fill handle).
  const stateCode = useSheetStore((s) => {
    const { anchor, focus } = s.selection;
    const isActive = focus.row === row && focus.col === col;
    const minRow = Math.min(anchor.row, focus.row);
    const maxRow = Math.max(anchor.row, focus.row);
    const minCol = Math.min(anchor.col, focus.col);
    const maxCol = Math.max(anchor.col, focus.col);
    const isRange = anchor.row !== focus.row || anchor.col !== focus.col;
    const inSelection = isRange && row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
    const fill = s.fillPreview;
    const inFill = fill
      ? row >= fill.minRow && row <= fill.maxRow && col >= fill.minCol && col <= fill.maxCol
      : false;
    let code = 0;
    if (isActive) code = 1;
    else if (inSelection) code = 2;
    else if (inFill) code = 3;
    return maxRow === row && maxCol === col ? code + 10 : code;
  });
  const selectionState = stateCode % 10;
  const isFillAnchor = stateCode >= 10;

  const editing = useSheetStore((s) => (s.editing && s.editing.key === key ? s.editing : null));

  const display = cellDisplayText(cell?.raw, result);
  const isNumeric = typeof result?.value === 'number' && !result.error;
  const editingInCell = editing && editing.source === 'cell' ? editing : null;
  const liveDraft = editing && editing.source === 'formulaBar' ? editing.draft : null;

  const classes = [
    BASE_CELL_CLASS,
    // Literal class names (not template strings) so Tailwind can see them.
    alignmentClass(cell, isNumeric),
    fontStyleClass(cell),
    selectionState === 1 ? 'z-10 bg-white ring-2 ring-inset ring-[#2563EB]' : '',
    selectionState === 2 ? 'bg-[#EFF6FF]' : '',
    selectionState === 3 ? 'bg-amber-100/70' : '',
    'hover:bg-slate-50',
  ]
    .filter(Boolean)
    .join(' ');

  const handleFillMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const store = useSheetStore.getState();
    const { anchor, focus } = store.selection;
    const source = normalizeRange(anchor, focus);

    const handleMove = (moveEvent: MouseEvent) => {
      if (typeof document.elementFromPoint !== 'function') return;
      const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null;
      const cellEl = el?.closest('[data-cell]') as HTMLElement | null;
      const address = cellEl?.getAttribute('data-cell');
      const pos = address ? parseKey(address) : null;
      if (!pos) return;
      useSheetStore.getState().setFillPreview({
        minRow: Math.min(source.minRow, pos.row),
        maxRow: Math.max(source.maxRow, pos.row),
        minCol: Math.min(source.minCol, pos.col),
        maxCol: Math.max(source.maxCol, pos.col),
      });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      const state = useSheetStore.getState();
      const target = state.fillPreview;
      if (!target) return;
      state.fillRange(source, target);
      state.select({ row: source.minRow, col: source.minCol });
      state.extendTo({ row: target.maxRow, col: target.maxCol });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <td
      id={`cell-${key}`}
      data-cell={key}
      role="gridcell"
      aria-selected={selectionState === 1 || selectionState === 2}
      className={classes}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        if (event.target instanceof HTMLInputElement) return;
        const store = useSheetStore.getState();
        if (store.editing) store.commitEdit(null);
        store.select({ row, col }, event.shiftKey);
        document.getElementById(GRID_ID)?.focus();
      }}
      onMouseEnter={(event) => {
        if (event.buttons === 1) useSheetStore.getState().extendTo({ row, col });
      }}
      onDoubleClick={(event) => {
        if (event.target instanceof HTMLInputElement) return;
        useSheetStore.getState().beginEdit('cell');
      }}
    >
      {!editingInCell && liveDraft === null && (
        <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap">{display}</div>
      )}
      {liveDraft !== null && (
        <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[#1d4ed8]">
          {liveDraft}
        </div>
      )}
      {editingInCell && (
        <input
          aria-label={`Edit cell ${key}`}
          className="absolute inset-0 h-full w-full border-2 border-[#2563EB] bg-white px-1.5 text-[13px] outline-none"
          value={editingInCell.draft}
          autoFocus
          onFocus={(event) => {
            const el = event.target;
            // Editing existing content (F2 / double-click) selects it so the
            // first keystroke replaces it. A draft seeded by direct typing must
            // keep its text: select-all would let the *second* character
            // overwrite the first, so place the caret at the end instead.
            if (editingInCell.draft === (cell?.raw ?? '')) {
              el.select();
            } else {
              const end = el.value.length;
              el.setSelectionRange(end, end);
            }
          }}
          onChange={(event) => useSheetStore.getState().changeDraft(event.target.value)}
          onBlur={() => {
            const store = useSheetStore.getState();
            if (store.editing && store.editing.key === key) store.commitEdit(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              useSheetStore
                .getState()
                .commitEdit({ row: event.shiftKey ? -1 : 1, col: 0 });
            } else if (event.key === 'Tab') {
              event.preventDefault();
              useSheetStore.getState().commitEdit({ row: 0, col: event.shiftKey ? -1 : 1 });
            } else if (event.key === 'Escape') {
              event.preventDefault();
              useSheetStore.getState().cancelEdit();
            }
          }}
        />
      )}
      {isFillAnchor && !editingInCell && (
        <span
          role="presentation"
          data-testid={`fill-handle-${key}`}
          title="Drag to fill"
          onMouseDown={handleFillMouseDown}
          className="absolute -bottom-0.5 -right-0.5 z-20 h-2 w-2 cursor-crosshair border border-white bg-[#2563EB]"
        />
      )}
    </td>
  );
}

export default memo(CellView);
